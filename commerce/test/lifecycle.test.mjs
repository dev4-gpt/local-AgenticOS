import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {CommerceStore} from '../src/store.mjs';
import {sha256} from '../src/proposals.mjs';
const DAY=24*60*60*1000,start=Date.parse('2026-10-26T12:00:00.000Z');
const iso=t=>new Date(t).toISOString();
const secret='TEST_ONLY_CONTENT_SENTINEL_DO_NOT_RETAIN';
const rejects=(fn,code)=>assert.throws(fn,error=>error.code===code);
function setup(){
  const directory=mkdtempSync(join(tmpdir(),'commerce-lifecycle-')),path=join(directory,'commerce.sqlite');
  let time=start;const store=new CommerceStore(path,{clock:()=>time}),db=new DatabaseSync(path);chmodSync(path,0o600);
  function seed(tenant='owner-dev',id='source-1'){
    store.configureWorkspace({tenant,policyVersion:'v1',merchantId:'merchant-test'});
    store.setMember({tenant,subject:'writer',role:'member'});store.setMember({tenant,subject:'reviewer',role:'owner'});
    const source={tenant,id,revision:'v1',title:secret,content:secret,contentHash:sha256(secret),metadataHash:sha256('test metadata'),expiresAt:iso(start+28*DAY),status:'active',reviewState:'approved',sensitivity:'ordinary',extraUntrustedField:secret};
    store.putSource(source);
    const proposal=store.saveProposal('writer',{schema:1,environment:'sandbox',tenant,id:`proposal-${id}`,revision:'v1',title:secret,body:secret,terms:{currency:'USD',totalCents:20000,depositCents:10000,merchantId:'merchant-test',description:secret},policyVersion:'v1',sources:[source],createdAt:iso(start),expiresAt:iso(start+28*DAY)});
    return {source,proposal};
  }
  const row=(table,tenant='owner-dev')=>db.prepare(`SELECT * FROM ${table} WHERE tenant=?`).get(tenant);
  const payload=(table,tenant='owner-dev')=>JSON.parse(row(table,tenant).payload);
  return {store,db,path,seed,row,payload,setTime:value=>{time=value;},close(){db.close();store.close();rmSync(directory,{recursive:true,force:true});}};
}
function pay(f,proposal){
  const approval=f.store.reviewProposal('reviewer',proposal.tenant,proposal.id,'v1',{expectedDigest:proposal.digest,evidenceReviewed:true,termsReviewed:true,expiresAt:iso(start+DAY)});
  const intent=f.store.beginIntent('writer',proposal.tenant,approval.id),claim=f.store.claimOperation('writer',proposal.tenant,intent.id,'create');
  f.store.completeOperation(claim.operationId,claim.claim,{environment:'sandbox',intentId:intent.id,merchantId:'merchant-test',depositCents:10000,orderId:'order-test',status:'CREATED',approvalUrl:'https://www.sandbox.paypal.com/checkoutnow?token=order-test'});
  const event={id:'event-test',event_type:'PAYMENT.CAPTURE.COMPLETED',resource:{id:'capture-test',status:'COMPLETED',payee:{merchant_id:'merchant-test'},amount:{currency_code:'USD',value:'100.00'},supplementary_data:{related_ids:{order_id:'order-test'}}}};
  const raw=JSON.stringify(event),verified={environment:'sandbox',eventId:event.id,eventType:event.event_type,payloadHash:sha256(raw)};
  f.store.acceptVerifiedWebhook(raw,verified);const project=f.store.deliverKickoff('writer',proposal.tenant,intent.id);
  return {intent,project,raw,verified};
}
test('expiry blocks content reads immediately; recovery survives until the exact seven-day boundary',()=>{
  const f=setup();try{
    const {proposal}=f.seed();f.store.rejectProposal('reviewer','owner-dev',proposal.id,'v1',secret);
    f.setTime(start+28*DAY);
    assert.equal(f.store.workspace('writer','owner-dev').sources.length,0);
    assert.equal(f.store.workspace('writer','owner-dev').proposals.length,0);
    rejects(()=>f.store.readProposal('writer','owner-dev',proposal.id,'v1'),'not_found');
    rejects(()=>f.store.selectedSources('writer','owner-dev',['source-1']),'source_not_available');
    f.setTime(start+35*DAY-1);
    assert.equal(f.store.purgeContent('owner-dev',{apply:true}).counts.proposals,0);
    assert.match(f.row('commerce_proposals').payload,/TEST_ONLY_CONTENT_SENTINEL/);
    f.setTime(start+35*DAY);
    const preview=f.store.purgeContent('owner-dev');assert.equal(preview.applied,false);assert.equal(preview.counts.sources,1);assert.equal(preview.counts.proposals,1);
    assert.match(f.row('commerce_proposals').payload,/TEST_ONLY_CONTENT_SENTINEL/);
    const result=f.store.purgeContent('owner-dev',{apply:true});assert.deepEqual(result.counts,preview.counts);
    assert.ok(!f.row('commerce_sources').payload.includes(secret));assert.ok(!f.row('commerce_proposals').payload.includes(secret));
    assert.equal(f.row('commerce_proposal_decisions').reason,'');
    assert.equal(f.payload('commerce_proposals').digest,proposal.digest);
    assert.equal(f.payload('commerce_sources').expiresAt,iso(start+28*DAY));
    assert.equal(f.store.purgeContent('owner-dev',{apply:true}).counts.proposals,0);
  }finally{f.close();}
});
test('content purge retains provider facts and replay identity but cannot restart a kickoff',()=>{
  const f=setup();try{
    const {proposal}=f.seed(),paid=pay(f,proposal);
    f.setTime(start+DAY);
    assert.equal(f.store.readIntent('writer','owner-dev',paid.intent.id).approvalUrl,null);
    assert.equal(f.store.readIntent('writer','owner-dev',paid.intent.id).state,'paid');
    assert.equal(f.store.readIntent('writer','owner-dev',paid.intent.id).executionExpired,true);
    assert.equal(f.store.workspace('writer','owner-dev').intents[0].approvalUrl,null);
    f.setTime(start+35*DAY);
    assert.equal(f.store.purgeContent('owner-dev',{apply:true}).counts.projects,1);
    for(const table of ['commerce_sources','commerce_proposals','commerce_projects'])assert.ok(!f.row(table).payload.includes(secret));
    assert.equal(f.payload('commerce_intents').captureId,'capture-test');
    assert.equal(f.payload('commerce_intents').proposalDigest,proposal.digest);
    assert.equal(f.payload('commerce_intents').approvalUrl,undefined);
    assert.equal(f.row('commerce_kickoff_outbox').state,'review_required');
    assert.equal(f.store.acceptVerifiedWebhook(paid.raw,paid.verified).duplicate,true);
    const later=JSON.parse(paid.raw);later.id='later-event';const raw=JSON.stringify(later);
    f.store.acceptVerifiedWebhook(raw,{...paid.verified,eventId:later.id,payloadHash:sha256(raw)});
    assert.equal(f.store.readIntent('writer','owner-dev',paid.intent.id).state,'paid_review_required');
    rejects(()=>f.store.deliverKickoff('writer','owner-dev',paid.intent.id),'kickoff_not_allowed');
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM commerce_projects').get().n,1);
  }finally{f.close();}
});
test('purge is tenant-scoped, independently batched, idempotent and validates operator options',()=>{
  const f=setup();try{
    f.seed();f.seed('owner-dev','source-2');f.seed('other-dev');f.setTime(start+35*DAY);
    rejects(()=>f.store.purgeContent('missing-dev'),'not_found');
    for(const options of [{batch:0},{batch:1001},{batch:1.5},{apply:'yes'}])rejects(()=>f.store.purgeContent('owner-dev',options),'invalid_maintenance_options');
    const first=f.store.purgeContent('owner-dev',{apply:true,batch:1});assert.equal(first.counts.sources,1);assert.equal(first.counts.proposals,1);
    assert.match(f.row('commerce_sources','other-dev').payload,/TEST_ONLY_CONTENT_SENTINEL/);
    assert.match(f.row('commerce_proposals','other-dev').payload,/TEST_ONLY_CONTENT_SENTINEL/);
    const next=f.store.purgeContent('owner-dev',{apply:true,batch:1});assert.equal(next.counts.sources,1);assert.equal(next.counts.proposals,1);
    assert.equal(f.store.purgeContent('owner-dev',{apply:true}).counts.sources,0);
    rejects(()=>f.store.readIntent('outsider','owner-dev','missing-intent'),'not_allowed');
  }finally{f.close();}
});
test('source updates cannot extend original expiry or rehydrate erased content; new retention is bounded',()=>{
  const f=setup();try{
    const {source}=f.seed();
    rejects(()=>f.store.putSource({...source,expiresAt:iso(start+29*DAY)}),'retention_clock_changed');
    rejects(()=>f.store.putSource({...source,id:'too-long',expiresAt:iso(start+29*DAY)}),'invalid_expiry');
    rejects(()=>f.store.putSource({...source,id:'malformed',expiresAt:'not-a-date'}),'invalid_expiry');
    f.store.putSource({...source,revision:'v2'});
    f.setTime(start+35*DAY);f.store.purgeContent('owner-dev',{apply:true});
    rejects(()=>f.store.putSource({...source,revision:'v3'}),'retention_clock_changed');
    assert.ok(!f.row('commerce_sources').payload.includes(secret));
  }finally{f.close();}
});
test('all content redactions roll back if any update fails',()=>{
  const f=setup();try{
    const {proposal}=f.seed();f.store.rejectProposal('reviewer','owner-dev',proposal.id,'v1',secret);f.setTime(start+35*DAY);
    f.db.exec("CREATE TRIGGER fixture_reject_redaction BEFORE UPDATE ON commerce_proposals BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
    assert.throws(()=>f.store.purgeContent('owner-dev',{apply:true}));
    assert.match(f.row('commerce_sources').payload,/TEST_ONLY_CONTENT_SENTINEL/);assert.equal(f.row('commerce_proposal_decisions').reason,secret);
    f.db.exec('DROP TRIGGER fixture_reject_redaction');
    assert.equal(f.store.purgeContent('owner-dev',{apply:true}).counts.proposals,1);
  }finally{f.close();}
});
test('expired draft metadata is scrubbed; local checkpoint/compaction removes fixture text from the database file',()=>{
  const f=setup();try{
    f.seed();const run=f.store.reserveDraft('writer','owner-dev');f.store.finishDraft('writer','owner-dev',run,'succeeded',{provider:'ollama',model:secret});
    f.setTime(start+35*DAY);assert.equal(f.store.purgeContent('owner-dev',{apply:true}).counts.draftMetadata,1);
    assert.deepEqual(f.payload('commerce_draft_runs'),{});
    assert.equal(f.store.compactContentStorage().physicalCompaction,'completed');
    assert.ok(!readFileSync(f.path).includes(Buffer.from(secret)));
    assert.equal(f.store.purgeContent('owner-dev',{apply:true}).counts.draftMetadata,0);
  }finally{f.close();}
});

test('every live Commerce table has a lifecycle classification',async()=>{
  const {CommerceAuth}=await import('../src/auth.mjs');
  const f=setup();const auth=new CommerceAuth(f.path);
  try{
    const inventory=JSON.parse(readFileSync(new URL('../lifecycle-inventory.json',import.meta.url),'utf8'));
    const tables=f.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'commerce_%' ORDER BY name").all().map(r=>r.name);
    assert.deepEqual(Object.keys(inventory.tables).sort(),tables);
    for(const entry of Object.values(inventory.tables)){assert.ok(entry.class);assert.ok(entry.policy);}
  }finally{auth.close();f.close();}
});
test('operator CLI previews without mutation, applies cleanup, and does not provision auth for maintenance',async()=>{
  const {spawnSync}=await import('node:child_process');
  const f=setup();try{
    f.seed();
    // Only a fixture clock mutation; no real runtime database is opened.
    const old=iso(Date.now()-8*DAY);
    f.db.prepare("UPDATE commerce_sources SET payload=json_set(payload,'$.expiresAt',?)").run(old);
    f.db.prepare("UPDATE commerce_proposals SET payload=json_set(payload,'$.expiresAt',?)").run(old);
    const run=args=>spawnSync(process.execPath,[new URL('../src/cli.mjs',import.meta.url).pathname,'retention','--tenant','owner-dev','--data-dir',join(f.path,'..'),...args],{encoding:'utf8',env:{PATH:process.env.PATH},timeout:10000});
    const preview=run([]);assert.equal(preview.status,0,preview.stderr);assert.equal(JSON.parse(preview.stdout).applied,false);assert.equal(JSON.parse(preview.stdout).counts.proposals,1);
    assert.match(f.row('commerce_proposals').payload,/TEST_ONLY_CONTENT_SENTINEL/);
    const applied=run(['--apply']);assert.equal(applied.status,0,applied.stderr);assert.equal(JSON.parse(applied.stdout).applied,true);
    assert.ok(!f.row('commerce_proposals').payload.includes(secret));
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name='commerce_users'").get().n,0);
  }finally{f.close();}
});
