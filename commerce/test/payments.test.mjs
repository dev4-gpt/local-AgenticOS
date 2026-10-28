import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CommerceStore } from '../src/store.mjs';
import { createPaymentService } from '../src/payments.mjs';
import { sha256 } from '../src/proposals.mjs';

function setup(path=':memory:') {
  let now=Date.parse('2026-10-26T12:00:00.000Z');
  const store=new CommerceStore(path,{clock:()=>now});
  store.configureWorkspace({tenant:'owner-dev',policyVersion:'v1',merchantId:'merchant-test'});
  for(const [subject,role] of [['writer','member'],['reviewer','admin'],['unrelated','member']]) store.setMember({tenant:'owner-dev',subject,role});
  const source={tenant:'owner-dev',id:'rates',revision:'v1',content:'Test scope only.',contentHash:sha256('Test scope only.'),metadataHash:sha256('test metadata'),expiresAt:'2026-11-20T12:00:00.000Z',status:'active',reviewState:'approved',sensitivity:'ordinary'};
  store.putSource(source);
  const proposal=store.saveProposal('writer',{schema:1,environment:'sandbox',tenant:'owner-dev',id:'proposal-1',revision:'v1',title:'Test scope',body:'Test deliverable [source:rates]',policyVersion:'v1',sources:[source],terms:{currency:'USD',depositCents:10000,totalCents:50000,merchantId:'merchant-test',description:'Test deposit'},createdAt:'2026-10-26T12:00:00.000Z',expiresAt:'2026-11-02T12:00:00.000Z'});
  const approval=store.reviewProposal('reviewer','owner-dev',proposal.id,'v1',{expectedDigest:proposal.digest,evidenceReviewed:true,termsReviewed:true,expiresAt:'2026-10-27T12:00:00.000Z'});
  const intent=store.beginIntent('writer','owner-dev',approval.id);
  const observation=(status='CREATED',capture=null)=>({environment:'sandbox',intentId:intent.id,merchantId:'merchant-test',depositCents:10000,orderId:'ORDER123',status,capture,approvalUrl:'https://www.sandbox.paypal.com/checkoutnow?token=ORDER123'});
  const event=(id='WH-1',type='PAYMENT.CAPTURE.COMPLETED')=>({id,event_type:type,resource:{id:'CAPTURE123',final_capture:true,status:type==='PAYMENT.CAPTURE.COMPLETED'?'COMPLETED':'PENDING',payee:{merchant_id:'merchant-test'},amount:{currency_code:'USD',value:'100.00'},supplementary_data:{related_ids:{order_id:'ORDER123'}}}});
  const verified=raw=>({environment:'sandbox',eventId:JSON.parse(raw).id,eventType:JSON.parse(raw).event_type,payloadHash:sha256(raw)});
  const webhook=e=>{const raw=JSON.stringify(e);return store.acceptVerifiedWebhook(raw,verified(raw));};
  const created=()=>{const claim=store.claimOperation('writer','owner-dev',intent.id,'create');return store.completeOperation(claim.operationId,claim.claim,observation());};
  return {store,source,proposal,intent,observation,event,verified,webhook,created,advance:ms=>{now+=ms;}};
}
const rejects=(fn,code)=>assert.throws(fn,e=>e.code===code);

test('verified payment, duplicate delivery and different events for one capture create one project',()=>{
  const f=setup();try {
    f.created();assert.deepEqual(f.webhook(f.event()),{duplicate:false,disposition:'processed'});
    const project=f.store.deliverKickoff('writer','owner-dev',f.intent.id);
    assert.deepEqual(f.webhook(f.event()),{duplicate:true,disposition:'processed'});
    f.webhook(f.event('WH-2'));
    assert.deepEqual(f.store.deliverKickoff('writer','owner-dev',f.intent.id),project);
    assert.equal(f.store.readIntent('writer','owner-dev',f.intent.id).state,'paid');
  } finally {f.store.close();}
});
test('pending event after completed capture cannot downgrade payment or recreate kickoff',()=>{
  const f=setup();try {
    f.created();f.webhook(f.event());f.webhook(f.event('WH-PENDING','PAYMENT.CAPTURE.PENDING'));
    assert.equal(f.store.readIntent('writer','owner-dev',f.intent.id).state,'paid');
    assert.ok(f.store.deliverKickoff('writer','owner-dev',f.intent.id).id);
  } finally {f.store.close();}
});
test('pending payment never authorizes kickoff',()=>{
  const f=setup();try {
    f.created();f.webhook(f.event('WH-PENDING','PAYMENT.CAPTURE.PENDING'));
    rejects(()=>f.store.deliverKickoff('writer','owner-dev',f.intent.id),'kickoff_not_allowed');
    assert.equal(f.store.readIntent('writer','owner-dev',f.intent.id).state,'payment_pending');
  } finally {f.store.close();}
});
test('source withdrawal during capture preserves actual payment and holds kickoff',()=>{
  const f=setup();try {
    f.created();const claim=f.store.claimOperation('writer','owner-dev',f.intent.id,'capture');
    f.store.putSource({...f.source,status:'withdrawn'});
    const result=f.store.completeOperation(claim.operationId,claim.claim,f.observation('COMPLETED',{id:'CAPTURE123',status:'COMPLETED'}));
    assert.equal(result.state,'paid_review_required');assert.equal(result.captureId,'CAPTURE123');
    rejects(()=>f.store.deliverKickoff('writer','owner-dev',f.intent.id),'kickoff_not_allowed');
  } finally {f.store.close();}
});
test('source withdrawal after payment but before outbox delivery blocks kickoff',()=>{
  const f=setup();try {
    f.created();f.webhook(f.event());f.store.putSource({...f.source,status:'withdrawn'});
    rejects(()=>f.store.deliverKickoff('writer','owner-dev',f.intent.id),'kickoff_not_allowed');
  } finally {f.store.close();}
});
test('capture claims are exclusive; crashed calls require explicit retry with original id',()=>{
  const f=setup();try {
    f.created();const first=f.store.claimOperation('writer','owner-dev',f.intent.id,'capture');
    rejects(()=>f.store.claimOperation('writer','owner-dev',f.intent.id,'capture'),'operation_in_progress');
    f.advance(61_000);
    rejects(()=>f.store.claimOperation('writer','owner-dev',f.intent.id,'capture'),'reconciliation_required');
    const retry=f.store.claimOperation('writer','owner-dev',f.intent.id,'capture',{retryUncertain:true});
    assert.equal(retry.operationId,first.operationId);assert.notEqual(retry.claim,first.claim);
    rejects(()=>f.store.completeOperation(first.operationId,first.claim,f.observation()),'operation_claim_lost');
    f.store.completeOperation(retry.operationId,retry.claim,f.observation('COMPLETED',{id:'CAPTURE123',status:'COMPLETED'}));
    assert.ok(f.store.deliverKickoff('writer','owner-dev',f.intent.id).id);
  } finally {f.store.close();}
});
test('uncertain retry is blocked after provider idempotency recovery window',()=>{
  const f=setup();try {
    f.created();const claim=f.store.claimOperation('writer','owner-dev',f.intent.id,'capture');
    f.store.operationUncertain(claim.operationId,claim.claim);f.advance(6*60*60*1000);
    rejects(()=>f.store.claimOperation('writer','owner-dev',f.intent.id,'capture',{retryUncertain:true}),'reconciliation_required');
  } finally {f.store.close();}
});
test('event identity collision, unverified body and wrong merchant/currency/amount cannot pay',()=>{
  const f=setup();try {
    f.created();const pending=f.event('WH-COLLISION','PAYMENT.CAPTURE.PENDING');f.webhook(pending);
    rejects(()=>f.webhook(f.event('WH-COLLISION')),'event_identity_conflict');
    const raw=JSON.stringify(f.event());rejects(()=>f.store.acceptVerifiedWebhook(raw,{...f.verified(raw),payloadHash:sha256('different')}),'invalid_webhook');
    for(const change of [e=>{e.resource.payee.merchant_id='attacker';},e=>{e.resource.amount.currency_code='EUR';},e=>{e.resource.amount.value='1.00';}]) {
      const e=f.event();change(e);rejects(()=>f.webhook(e),'payment_mismatch');
    }
    assert.equal(f.store.readIntent('writer','owner-dev',f.intent.id).captureId,undefined);
  } finally {f.store.close();}
});
test('only an explicit final capture can pay through a verified webhook',()=>{
  const f=setup();try {
    f.created();
    for(const value of [false,undefined,null,'true',1]){
      const event=f.event();if(value===undefined)delete event.resource.final_capture;else event.resource.final_capture=value;
      rejects(()=>f.webhook(event),'payment_mismatch');
      assert.equal(f.store.readIntent('writer','owner-dev',f.intent.id).captureId,undefined);
      rejects(()=>f.store.deliverKickoff('writer','owner-dev',f.intent.id),'kickoff_not_allowed');
    }
    // Refused bodies were not committed to the inbox; a valid redelivery is admitted.
    assert.deepEqual(f.webhook(f.event()),{duplicate:false,disposition:'processed'});
    assert.equal(f.store.readIntent('writer','owner-dev',f.intent.id).state,'paid');
    assert.ok(f.store.deliverKickoff('writer','owner-dev',f.intent.id).id);
  } finally {f.store.close();}
});
test('reversal opens review; replay of earlier completed state cannot remove hold',()=>{
  const f=setup();try {
    f.created();f.webhook(f.event());f.webhook(f.event('WH-REVERSED','PAYMENT.CAPTURE.REVERSED'));
    f.webhook(f.event('WH-LATE-COMPLETED'));
    assert.equal(f.store.readIntent('writer','owner-dev',f.intent.id).reviewRequired,true);
    rejects(()=>f.store.deliverKickoff('writer','owner-dev',f.intent.id),'kickoff_not_allowed');
  } finally {f.store.close();}
});
test('unknown signed order does not trust inbound tenant or create financial state',()=>{
  const f=setup();try {
    const e=f.event();e.resource.supplementary_data.related_ids.order_id='UNKNOWN';e.tenant='owner-dev';
    assert.equal(f.webhook(e).disposition,'ignored');
    assert.equal(f.store.readIntent('writer','owner-dev',f.intent.id).state,'ready');
  } finally {f.store.close();}
});
test('payment and kickoff-outbox insertion roll back together, then redelivery repairs once',()=>{
  const dir=mkdtempSync(join(tmpdir(),'veloce-atomic-')),path=join(dir,'test.sqlite');
  const f=setup(path),db=new DatabaseSync(path);
  try {
    f.created();db.exec("CREATE TRIGGER reject_outbox BEFORE INSERT ON commerce_kickoff_outbox BEGIN SELECT RAISE(ABORT,'test_outbox_unavailable'); END;");
    assert.throws(()=>f.webhook(f.event()));
    assert.equal(f.store.readIntent('writer','owner-dev',f.intent.id).captureId,undefined);
    db.exec('DROP TRIGGER reject_outbox;');
    assert.equal(f.webhook(f.event()).duplicate,false);
    const project=f.store.deliverKickoff('writer','owner-dev',f.intent.id);
    assert.deepEqual(f.store.deliverKickoff('writer','owner-dev',f.intent.id),project);
  } finally {db.close();f.store.close();rmSync(dir,{recursive:true,force:true});}
});
test('concurrent service calls yield one capture, then reconciliation returns the same payment',async()=>{
  const f=setup();try {
    f.created();let captures=0,release;const gate=new Promise(resolve=>{release=resolve;});
    let remote=f.observation('APPROVED');
    const provider={getOrder:async()=>remote,captureOrder:async()=>{captures++;await gate;remote=f.observation('COMPLETED',{id:'CAPTURE123',status:'COMPLETED'});return remote;}};
    const service=createPaymentService(f.store,provider);
    const first=service.captureOrder('writer','owner-dev',f.intent.id);
    // Allow the first call's read-only provider check to resolve and durable claim to commit.
    await new Promise(resolve=>setImmediate(resolve));
    await assert.rejects(()=>service.captureOrder('writer','owner-dev',f.intent.id),e=>e.code==='operation_in_progress');
    release();assert.equal((await first).state,'paid');assert.equal(captures,1);
    assert.equal((await service.captureOrder('writer','owner-dev',f.intent.id)).state,'paid');assert.equal(captures,1);
  } finally {f.store.close();}
});
test('unapproved buyer state and unrelated member cannot execute capture',async()=>{
  const f=setup();try {
    f.created();let captures=0;
    const service=createPaymentService(f.store,{getOrder:async()=>f.observation('CREATED'),captureOrder:async()=>{captures++;}});
    assert.equal((await service.captureOrder('writer','owner-dev',f.intent.id)).state,'awaiting_buyer');
    await assert.rejects(()=>service.captureOrder('unrelated','owner-dev',f.intent.id),e=>e.code==='not_allowed');
    assert.equal(captures,0);
  } finally {f.store.close();}
});
test('webhook signature failure never reaches local event processing',async()=>{
  let stored=false;
  const service=createPaymentService({acceptVerifiedWebhook:()=>{stored=true;}},{verifyWebhook:async()=>{throw new Error('test signature failure');}});
  await assert.rejects(()=>service.webhook('{}',new Headers()));assert.equal(stored,false);
});
