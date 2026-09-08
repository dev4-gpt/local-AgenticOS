import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Explicit live, disposable DB-only verification. Never calls Stripe or AI providers.
const [expectedRef, evidencePath] = process.argv.slice(2);
const base = process.env.SUPABASE_URL?.replace(/\/$/, '');
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.SUPABASE_ANON_KEY;
assert(expectedRef && evidencePath && base && service && anon, 'Usage: SUPABASE_* node scripts/verify-v40-v42-live.mjs EXPECTED_PROJECT_REF EVIDENCE_PATH');
assert.equal(new URL(base).hostname, `${expectedRef}.supabase.co`);
const prefix = `ga-v4042-${randomBytes(6).toString('hex')}`;
const a = `${prefix}-a`, b = `${prefix}-b`;
const workerA = randomBytes(32).toString('hex'), workerB = randomBytes(32).toString('hex');
const evidence = { projectRef: expectedRef, sourceCommit: execFileSync('git', ['rev-parse','HEAD'], {encoding:'utf8'}).trim(), startedAt: new Date().toISOString(), fixtures: {tenants:[a,b]}, checks: [], cleanup: {}, migrations: {} };
for (const name of ['supabase-v40-credential-execution-gate.sql','supabase-v41-monthly-credit-refunds.sql','supabase-v42-suspended-tenant-access.sql']) {
  evidence.migrations[name] = createHash('sha256').update(readFileSync(`product-experience/${name}`)).digest('hex');
}
let userId;
const createdTenants = [];
async function request(path, {method='GET', body, token=service, apiKey=service, allowError=false}={}) {
  const response = await fetch(`${base}${path}`, {method, headers: {apikey:apiKey, Authorization:`Bearer ${token}`, 'Content-Type':'application/json', Prefer:'return=representation'}, ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:AbortSignal.timeout(30000)});
  const raw = await response.text();
  let data; try { data=JSON.parse(raw); } catch { data=raw; }
  if (!response.ok && !allowError) throw new Error(`${method} ${path.split('?')[0]} failed: HTTP ${response.status}, code ${data?.code ?? 'unknown'}`);
  return {status:response.status,data};
}
const table = (name, options) => request(`/rest/v1/${name}`, options);
const rpc = (name, body, auth={}) => request(`/rest/v1/rpc/${name}`, {method:'POST',body,...auth});
async function check(name, actual, expected) { assert.deepEqual(actual,expected,name); evidence.checks.push({name,passed:true}); }
const gateBody = (slug=a, token=workerA, key='GA_V4042_KEY') => ({p_tenant_slug:slug,p_provider_key:key,p_worker_token:token});
const anonymous = {token:anon, apiKey:anon};
const patch = (name, slug, body) => table(`${name}?tenant_slug=eq.${slug}`,{method:'PATCH',body});
const spend = async slug => (await rpc('client_credit_month_to_date_spend_micros',{p_tenant_slug:slug})).data;
const reserve = async (key, amount) => (await rpc('reserve_client_credit',{p_tenant_slug:a,p_catalog_id:'ga-v4042',p_provider_key:'GA_V4042_KEY',p_idempotency_key:key,p_quoted_amount_micros:amount})).data;
try {
  evidence.preflight = {
    connections:(await table('client_provider_connections?select=credential_mode,status,revoked_at')).data.reduce((counts,row)=>{ const key=`${row.credential_mode}:${row.status}:${row.revoked_at?'revoked':'not_revoked'}`; counts[key]=(counts[key]??0)+1;return counts;},{}),
    tenantStatuses:(await table('client_tenants?select=status')).data.reduce((counts,row)=>{counts[row.status]=(counts[row.status]??0)+1;return counts;},{})
  };
  for (const [slug,worker] of [[a,workerA],[b,workerB]]) {
    await table('client_tenants',{method:'POST',body:{slug,name:'Disposable v40-v42 verification',status:'active',worker_token_hash:createHash('sha256').update(worker).digest('hex')}});
    createdTenants.push(slug);
    await table('client_provider_connections',{method:'POST',body:{tenant_slug:slug,catalog_id:'ga-v4042',provider_key:'GA_V4042_KEY',credential_mode:'byok',status:'connected',validation_metadata:{fixture:true}}});
  }
  const email=`${prefix}@example.invalid`, password=randomBytes(32).toString('base64url');
  userId=(await request('/auth/v1/admin/users',{method:'POST',body:{email,password,email_confirm:true,user_metadata:{fixture:prefix}}})).data.id;
  assert(userId); evidence.fixtures.userId=userId;
  await table('client_memberships',{method:'POST',body:{tenant_slug:a,user_id:userId,role:'owner',status:'active'}});
  await table('client_runtime_requests',{method:'POST',body:{tenant_slug:a,submitted_by:userId,request_type:'command',title:'Disposable RLS probe',details:'Migration verification only; no job enqueued'}});
  const login=(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password},...anonymous})).data;
  assert(login.access_token); const authenticated={token:login.access_token,apiKey:anon};
  for (const [name,body,want] of [
    ['v40 valid worker',gateBody(),true],['v40 foreign worker',gateBody(a,workerB),false],
    ['v40 missing token',gateBody(a,null),false],['v40 short token',gateBody(a,'short'),false],
    ['v40 missing connection',gateBody(a,workerA,'MISSING'),false]
  ]) await check(name,(await rpc('client_provider_execution_allowed',body,anonymous)).data,want);
  await check('v40 authenticated member',(await rpc('client_provider_execution_allowed',gateBody(a,null),authenticated)).data,true);
  await check('v40 foreign member',(await rpc('client_provider_execution_allowed',gateBody(b,null),authenticated)).data,false);
  await check('v42 active membership',(await rpc('client_member',{p_tenant_slug:a},authenticated)).data,true);
  await check('v42 foreign membership',(await rpc('client_member',{p_tenant_slug:b},authenticated)).data,false);
  await check('v42 active RLS request visible',(await table(`client_runtime_requests?tenant_slug=eq.${a}&select=id`,authenticated)).data.length,1);
  await check('v40 owner revoke',(await rpc('revoke_client_provider_connection',{p_tenant_slug:a,p_provider_key:'GA_V4042_KEY'},authenticated)).data,true);
  await check('v40 revoked worker denied',(await rpc('client_provider_execution_allowed',gateBody(),anonymous)).data,false);
  await check('v40 revoked member denied',(await rpc('client_provider_execution_allowed',gateBody(a,null),authenticated)).data,false);
  await patch('client_provider_connections',a,{status:'connected'});
  await check('v40 revoked_at dominates connected',(await rpc('client_provider_execution_allowed',gateBody(),anonymous)).data,false);
  await patch('client_provider_connections',a,{status:'submitted',revoked_at:null});
  await check('v40 submitted denied',(await rpc('client_provider_execution_allowed',gateBody(),anonymous)).data,false);
  await patch('client_provider_connections',a,{status:'connected'});
  await table(`client_tenants?slug=eq.${a}`,{method:'PATCH',body:{status:'suspended'}});
  await check('v42 suspended membership',(await rpc('client_member',{p_tenant_slug:a},authenticated)).data,false);
  await check('v42 suspended RLS request hidden',(await table(`client_runtime_requests?tenant_slug=eq.${a}&select=id`,authenticated)).data.length,0);
  await check('v40 suspended worker denied',(await rpc('client_provider_execution_allowed',gateBody(),anonymous)).data,false);
  await check('v40 suspended member denied',(await rpc('client_provider_execution_allowed',gateBody(a,null),authenticated)).data,false);
  await table(`client_tenants?slug=eq.${a}`,{method:'PATCH',body:{status:'active'}});
  await table('client_credit_budgets',{method:'POST',body:{tenant_slug:a,catalog_id:'ga-v4042',provider_key:'GA_V4042_KEY',purchased_micros:10000000,status:'active',managed_route_enabled:true,funding_status:'wallet_funded',reconciliation_status:'matched'}});
  await rpc('credit_client_managed_wallet',{p_tenant_slug:a,p_amount_micros:10000000,p_stripe_event_id:`${prefix}-seed`,p_metadata:{fixture:true,external_charge:false}});
  const prior=await reserve('prior-month',2000000); assert(prior); evidence.fixtures.priorReservation=prior;
  await check('v41 prior settlement',(await rpc('settle_client_credit',{p_reservation_id:prior,p_actual_amount_micros:2000000})).data,true);
  const priorMonth=new Date(); priorMonth.setUTCDate(1); priorMonth.setUTCHours(0,0,0,0); priorMonth.setUTCDate(0);
  await table(`client_credit_reservations?id=eq.${prior}`,{method:'PATCH',body:{settled_at:priorMonth.toISOString()}});
  await table(`client_credit_transactions?tenant_slug=eq.${a}&kind=eq.settlement`,{method:'PATCH',body:{created_at:priorMonth.toISOString()}});
  await check('v41 prior refund',(await rpc('refund_client_credit',{p_reservation_id:prior,p_reason:'Disposable prior-month refund'})).data,true);
  await patch('client_credit_accounts',a,{monthly_cap_micros:1000000});
  await check('v41 prior refund does not create negative spend',await spend(a),0);
  await check('v41 two dollars refused against one-dollar cap',await reserve('over-cap',2000000),null);
  const boundary=await reserve('at-cap',1000000); assert(boundary); evidence.fixtures.boundaryReservation=boundary;
  await check('v41 exact cap accepted',typeof boundary,'string');
  await check('v41 one micro over reserved cap refused',await reserve('one-micro-over',1),null);
  await check('v41 current settlement',(await rpc('settle_client_credit',{p_reservation_id:boundary,p_actual_amount_micros:700000})).data,true);
  await check('v41 current spend',await spend(a),700000);
  await check('v41 foreign tenant spend',await spend(b),0);
  await check('v41 current refund',(await rpc('refund_client_credit',{p_reservation_id:boundary,p_reason:'Disposable current-month refund'})).data,true);
  await check('v41 refund retry',(await rpc('refund_client_credit',{p_reservation_id:boundary,p_reason:'Disposable retry'})).data,true);
  await check('v41 refund counted once',await spend(a),0);
  for (const [role,auth] of [['anon',anonymous],['authenticated',authenticated]]) {
    const result=await rpc('client_credit_month_to_date_spend_micros',{p_tenant_slug:a},{...auth,allowError:true});
    await check(`v41 ${role} permission denied`,[401,403].includes(result.status),true);
    await check(`v41 ${role} SQL permission code`,result.data.code,'42501');
  }
  const denied=await rpc('client_member',{p_tenant_slug:a},{...anonymous,allowError:true});
  await check('v42 anon permission denied',[401,403].includes(denied.status),true);
  await check('v42 anon SQL permission code',denied.data.code,'42501');
  await table(`client_provider_connections?tenant_slug=eq.${a}`,{method:'DELETE'});
  await check('v40 deleted connection denied',(await rpc('client_provider_execution_allowed',gateBody(),anonymous)).data,false);
  evidence.passed=true;
} catch(error) {
  evidence.passed=false; evidence.error=error.message; process.exitCode=1;
} finally {
  const errors=[];
  for(const slug of createdTenants) {
    try {await table(`client_tenants?slug=eq.${slug}`,{method:'DELETE'});} catch(error) {errors.push(error.message);}
  }
  if(userId) {try {await request(`/auth/v1/admin/users/${userId}`,{method:'DELETE'});} catch(error) {errors.push(error.message);}}
  for(const name of ['client_tenants','client_memberships','client_provider_connections','client_runtime_requests','client_runtime_audit_events','client_credit_accounts','client_credit_budgets','client_credit_transactions','client_credit_reservations','client_credit_reservation_events']) {
    try {const column=name==='client_tenants'?'slug':'tenant_slug'; const result=await table(`${name}?${column}=in.(${a},${b})&select=${column}`); evidence.cleanup[name]=Array.isArray(result.data)&&result.data.length===0;} catch(error) {errors.push(error.message);}
  }
  if(userId) {try {const result=await request(`/auth/v1/admin/users/${userId}`,{allowError:true}); evidence.cleanup.auth_user=result.status===404;} catch(error) {errors.push(error.message);}}
  evidence.cleanup.errors=errors;
  if(errors.length || Object.values(evidence.cleanup).some(value=>value===false)) {evidence.passed=false;process.exitCode=1;}
  evidence.finishedAt=new Date().toISOString();
  writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({passed:evidence.passed,checks:evidence.checks.length,cleanup:evidence.cleanup,error:evidence.error,evidencePath}));
}
