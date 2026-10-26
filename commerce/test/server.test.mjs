import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CommerceStore} from '../src/store.mjs';
import {CommerceAuth} from '../src/auth.mjs';
import {createCommerceServer} from '../src/server.mjs';
import {createOllamaDrafter} from '../src/drafting.mjs';
import {createPayPalClient} from '../src/paypal.mjs';

test('authenticated HTTP journey uses real domain/storage/model/provider adapters with fixture transports',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'veloce-http-')),path=join(dir,'test.sqlite'),store=new CommerceStore(path),auth=new CommerceAuth(path);
  const users={author:await auth.createUser('author-test','test-only author password'),reviewer:await auth.createUser('reviewer-test','test-only reviewer password')};
  const outsider=await auth.createUser('outsider-test','test-only outsider password');
  store.configureWorkspace({tenant:'owner-dev',policyVersion:'v1',merchantId:'MERCHANT123'});
  for(const [key,u] of Object.entries(users))store.setMember({tenant:'owner-dev',subject:u.subject,role:key==='author'?'member':'admin'});
  store.configureWorkspace({tenant:'other-tenant',policyVersion:'v1',merchantId:'OTHER-MERCHANT'});
  store.setMember({tenant:'other-tenant',subject:outsider.subject,role:'owner'});
  let rawOrder=null,captures=0,modelCalls=0;
  const drafter=createOllamaDrafter({model:'test-only-model',fetchImpl:async(_url,options)=>{
    modelCalls++;const evidence=JSON.parse(JSON.parse(options.body).messages[1].content).evidence;
    return Response.json({message:{content:JSON.stringify({title:'Test-only service proposal',requirements:[{text:'Use the approved service material.',sourceIds:[evidence[0].id]}],deliverables:[{title:'A reviewed service brief',details:'Prepare the agreed scope for human review.',sourceIds:[evidence[0].id]}],questions:['What is the final delivery date?'],assumptions:[]})}});
  }});
  const paypal=createPayPalClient({clientId:'test-client',clientSecret:'test-secret',webhookId:'TEST-WEBHOOK',fetchImpl:async(url,options)=>{
    if(url.endsWith('/v1/oauth2/token'))return Response.json({access_token:'test-access-token',token_type:'Bearer'});
    if(url.endsWith('/verify-webhook-signature'))return Response.json({verification_status:JSON.parse(options.body).transmission_sig==='valid'?'SUCCESS':'FAILURE'});
    if(url.endsWith('/v2/checkout/orders')){
      const body=JSON.parse(options.body);rawOrder={...body,id:'ORDER123',status:'CREATED',links:[{rel:'approve',href:'https://www.sandbox.paypal.com/checkoutnow?token=ORDER123'}]};return Response.json(rawOrder);
    }
    if(url.endsWith('/ORDER123/capture')){captures++;rawOrder.status='COMPLETED';rawOrder.purchase_units[0].payments={captures:[{id:'CAPTURE123',status:'COMPLETED',final_capture:true,amount:{currency_code:'USD',value:'100.00'}}]};return Response.json(rawOrder);}
    if(url.endsWith('/ORDER123')&&options.method==='GET')return Response.json(rawOrder);
    throw new Error('Unexpected fixture request');
  }});
  const server=createCommerceServer({store,auth,tenant:'owner-dev',origin:'http://127.0.0.1:0',drafter,paypal});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  const sessions={};
  async function request(path,value,user,headers={}){
    const s=sessions[user];const response=await fetch(origin+path,{method:value===undefined?'GET':'POST',headers:{...(value===undefined?{}:{'Content-Type':'application/json',Origin:origin}),...(s?{Cookie:s.cookie,'X-CSRF-Token':s.csrf}:{}),...headers},...(value===undefined?{}:{body:JSON.stringify(value)})});
    return {response,data:await response.json()};
  }
  try{
    await t.test('static entry has protective headers; anonymous reads and CSRF-free writes are refused',async()=>{
      const response=await fetch(origin);assert.equal(response.status,200);assert.match(await response.text(),/From what you know/);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
      assert.equal((await request('/api/workspace')).response.status,401);
      for(const [user,pw] of [['author','test-only author password'],['reviewer','test-only reviewer password'],['outsider','test-only outsider password']]){
        const {response}=await request('/api/login',{username:`${user}-test`,password:pw});assert.equal(response.status,200);
        const set=response.headers.getSetCookie();sessions[user]={cookie:set.map(v=>v.split(';')[0]).join('; '),csrf:set.find(v=>v.startsWith('veloce_csrf=')).split(';')[0].split('=')[1]};
        assert.ok(set.some(v=>v.includes('HttpOnly')&&v.includes('SameSite=Strict')));
      }
      const noCsrf=await fetch(origin+'/api/sources',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:sessions.author.cookie},body:JSON.stringify({title:'test',content:'test'})});
      assert.equal((await noCsrf.json()).error,'invalid_csrf');
      assert.equal((await request('/api/sources',{title:'test',content:'test'},'author',{Origin:'https://attacker.test'})).data.error,'invalid_origin');
    });
    await t.test('all tenant mutation routes reject missing sessions and users belonging only to another workspace',async()=>{
      const paths=['/api/sources','/api/sources/review','/api/sources/withdraw','/api/drafts','/api/proposals/review','/api/proposals/reject','/api/proposals/revise','/api/intents','/api/payments/create','/api/payments/capture','/api/payments/reconcile','/api/kickoff'];
      const body={id:'does-not-exist',revision:'v1',approvalId:'does-not-exist',sourceIds:['does-not-exist'],depositCents:10000,totalCents:50000,title:'test',content:'test'};
      for(const path of paths){
        assert.equal((await request(path,body,undefined,{'X-CSRF-Token':'a'.repeat(64)})).data.error,'sign_in_required',path);
        assert.equal((await request(path,body,'outsider')).data.error,'not_allowed',path);
      }
      assert.equal((await request('/api/workspace',undefined,'outsider')).data.error,'not_allowed');
    });
    let source,proposal,intent;
    await t.test('sources require separate authorized review before drafting',async()=>{
      source=(await request('/api/sources',{title:'Test-only service material',content:'This test service prepares a bounded brief for review.'},'author')).data.source;
      assert.equal((await request('/api/drafts',{sourceIds:[source.id],instruction:'Draft service scope',depositCents:10000,totalCents:50000,termsDescription:'Test deposit'},'author')).data.error,'source_not_available');assert.equal(modelCalls,0);
      assert.equal((await request('/api/sources/review',{id:source.id,sensitivity:'ordinary'},'author')).data.error,'not_allowed');
      assert.equal((await request('/api/sources/review',{id:source.id,sensitivity:'ordinary'},'reviewer')).response.status,200);
    });
    await t.test('actual configured adapter draft is persisted and exact review authorizes checkout',async()=>{
      const result=await request('/api/drafts',{sourceIds:[source.id],instruction:'Draft service scope',depositCents:10000,totalCents:50000,termsDescription:'Test deposit'},'author');assert.equal(result.response.status,201);proposal=result.data.proposal;assert.equal(modelCalls,1);
      const review={id:proposal.id,revision:proposal.revision,expectedDigest:proposal.digest,evidenceReviewed:true,termsReviewed:true};
      assert.equal((await request('/api/proposals/review',review,'author')).data.error,'not_allowed');
      assert.equal((await request('/api/proposals/review',{...review,requester:'spoofed'},'reviewer')).data.error,'invalid_input');
      const approval=(await request('/api/proposals/review',review,'reviewer')).data.approval;assert.ok(approval.id);
      intent=(await request('/api/intents',{approvalId:approval.id},'author')).data.intent;
      assert.equal((await request('/api/payments/create',{id:intent.id},'author')).data.intent.state,'awaiting_buyer');
      assert.equal((await request('/api/payments/capture',{id:intent.id},'author')).data.intent.state,'awaiting_buyer');assert.equal(captures,0);
    });
    await t.test('provider-confirmed buyer approval and capture unlock one kickoff',async()=>{
      rawOrder.status='APPROVED';
      assert.equal((await request('/api/payments/capture',{id:intent.id},'author')).data.intent.state,'paid');assert.equal(captures,1);
      const a=(await request('/api/kickoff',{id:intent.id},'author')).data.project,b=(await request('/api/kickoff',{id:intent.id},'author')).data.project;assert.equal(a.id,b.id);
      const event={id:'WH-HTTP',event_type:'PAYMENT.CAPTURE.COMPLETED',resource:{id:'CAPTURE123',status:'COMPLETED',payee:{merchant_id:'MERCHANT123'},amount:{currency_code:'USD',value:'100.00'},supplementary_data:{related_ids:{order_id:'ORDER123'}}}};
      const headers={'paypal-auth-algo':'SHA256withRSA','paypal-cert-url':'https://api.paypal.com/v1/notifications/certs/CERT-TEST','paypal-transmission-id':'TX123','paypal-transmission-sig':'valid','paypal-transmission-time':'2026-10-26T12:00:00Z'};
      assert.equal((await request('/api/paypal/webhook',event,undefined,{...headers,'paypal-transmission-sig':'invalid'})).data.error,'invalid_webhook_signature');
      assert.equal((await request('/api/paypal/webhook',event,undefined,headers)).data.duplicate,false);
      assert.equal((await request('/api/paypal/webhook',event,undefined,headers)).data.duplicate,true);
      assert.equal((await request('/api/workspace',undefined,'author')).data.projects.length,1);
    });
    await t.test('reviewer rejection is durable through HTTP and cannot be reversed into an approval',async()=>{
      const draft=(await request('/api/drafts',{sourceIds:[source.id],instruction:'Draft another service scope',depositCents:10000,totalCents:50000,termsDescription:'Test deposit'},'author')).data.proposal;
      assert.equal((await request('/api/proposals/reject',{id:draft.id,revision:draft.revision,reason:'Resolve the missing delivery requirements first.'},'reviewer')).data.decision,'rejected');
      assert.equal((await request('/api/proposals/review',{id:draft.id,revision:draft.revision,expectedDigest:draft.digest,evidenceReviewed:true,termsReviewed:true},'reviewer')).data.error,'proposal_rejected');
      const correction={id:draft.id,revision:draft.revision,expectedDigest:draft.digest,title:'Corrected test scope',body:draft.body+'\nHuman correction: keep this scope limited to a reviewable brief.'};
      assert.equal((await request('/api/proposals/revise',correction,'reviewer')).data.error,'not_allowed');
      assert.equal((await request('/api/proposals/revise',{...correction,depositCents:1},'author')).data.error,'invalid_input');
      const revised=(await request('/api/proposals/revise',correction,'author')).data.proposal;
      assert.ok(revised);assert.notEqual(revised.digest,draft.digest);assert.deepEqual(revised.terms,draft.terms);
      assert.equal((await request('/api/proposals/review',{id:revised.id,revision:revised.revision,expectedDigest:revised.digest,evidenceReviewed:true,termsReviewed:true},'author')).data.error,'not_allowed');
      const reviewed=await request('/api/proposals/review',{id:revised.id,revision:revised.revision,expectedDigest:revised.digest,evidenceReviewed:true,termsReviewed:true},'reviewer');
      assert.equal(reviewed.data.approval.proposalDigest,revised.digest);

    });
    await t.test('withdrawal invalidates dependent paid work and client cannot select a tenant or payee',async()=>{
      assert.equal((await request('/api/payments/create',{id:intent.id,tenant:'other-tenant'},'author')).data.error,'invalid_input');
      assert.equal((await request('/api/sources/withdraw',{id:source.id},'author')).response.status,200);
      const workspace=(await request('/api/workspace',undefined,'author')).data;
      assert.ok(workspace.proposals.every(p=>['source_not_available','proposal_superseded'].includes(p.eligibility)));assert.ok(workspace.proposals.some(p=>p.eligibility==='source_not_available'));assert.equal(workspace.projects[0].state,'review_required');
      assert.equal((await request('/api/kickoff',{id:intent.id},'author')).data.error,'kickoff_not_allowed');
      assert.equal((await request('/api/payments/reconcile',{id:intent.id},'author')).data.intent.captureId,'CAPTURE123');
    });
    await t.test('logout revokes server session, not just browser appearance',async()=>{
      assert.equal((await request('/api/logout',{},'author')).response.status,200);
      assert.equal((await request('/api/workspace',undefined,'author')).response.status,401);
    });
  }finally{await new Promise(resolve=>server.close(resolve));store.close();auth.close();rmSync(dir,{recursive:true,force:true});}
});
