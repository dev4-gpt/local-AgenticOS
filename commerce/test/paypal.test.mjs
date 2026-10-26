import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPayPalClient, inspectOrder } from '../src/paypal.mjs';

const expected = { intentId:'intent-test', merchantId:'merchant-test', depositCents:25001, orderId:'ORDER123' };
function order(status='CREATED') {
  return { id:'ORDER123', intent:'CAPTURE', status,
    purchase_units:[{ reference_id:'intent-test', custom_id:'intent-test', payee:{merchant_id:'merchant-test'}, amount:{currency_code:'USD',value:'250.01'},
      ...(status==='COMPLETED' ? {payments:{captures:[{id:'CAPTURE123',status:'COMPLETED',final_capture:true,amount:{currency_code:'USD',value:'250.01'}}]}} : {}),
    }], links:[{rel:'approve',href:'https://www.sandbox.paypal.com/checkoutnow?token=ORDER123'}],
  };
}
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
function setup(responses) {
  const calls=[];
  const client=createPayPalClient({clientId:'test-client',clientSecret:'test-secret',webhookId:'test-webhook',fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if (url.endsWith('/v1/oauth2/token')) return json({access_token:'test-access-token',token_type:'Bearer'});
    const response=responses.shift(); if (response instanceof Error) throw response;
    if (typeof response==='function') return response();
    assert.ok(response,'unexpected provider call'); return response;
  }});
  return {client,calls};
}
const rejects = async(fn,code) => assert.rejects(fn,e=>e.code===code);

test('create sends exact cents and merchant, sandbox endpoint and caller-owned stable operation id',async()=>{
  const {client,calls}=setup([json(order())]);
  const result=await client.createOrder({...expected,operationId:'create-operation-001'});
  assert.equal(result.orderId,'ORDER123'); assert.equal(result.environment,'sandbox');
  assert.equal(calls.length,2); assert.ok(calls.every(c=>c.url.startsWith('https://api-m.sandbox.paypal.com/')));
  assert.equal(calls[1].options.headers['PayPal-Request-Id'],'create-operation-001');
  const body=JSON.parse(calls[1].options.body);assert.equal(body.purchase_units[0].amount.value,'250.01');
  assert.equal(body.purchase_units[0].payee.merchant_id,'merchant-test');
  assert.equal(body.purchase_units[0].custom_id,'intent-test');
  assert.equal(calls[1].options.redirect,'error'); assert.ok(calls[1].options.signal);
});
test('capture uses its own stable operation and returns provider-confirmed capture',async()=>{
  const {client,calls}=setup([json(order('COMPLETED'))]);
  const result=await client.captureOrder({...expected,operationId:'capture-operation-001'});
  assert.equal(calls[1].url,'https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER123/capture');
  assert.equal(calls[1].options.headers['PayPal-Request-Id'],'capture-operation-001');
  assert.deepEqual(result.capture,{id:'CAPTURE123',status:'COMPLETED'});
});
test('pending capture is not normalized as paid',()=>{
  const raw=order('COMPLETED');raw.purchase_units[0].payments.captures[0].status='PENDING';
  assert.equal(inspectOrder(raw,expected).capture.status,'PENDING');
});
for (const [label,change] of [
  ['payee',r=>r.purchase_units[0].payee.merchant_id='attacker'],
  ['amount',r=>r.purchase_units[0].amount.value='1.00'],
  ['currency',r=>r.purchase_units[0].amount.currency_code='EUR'],
  ['intent',r=>r.intent='AUTHORIZE'],
  ['order identity',r=>r.id='OTHERORDER'],
  ['intent reference',r=>r.purchase_units[0].custom_id='other-intent'],
  ['multiple units',r=>r.purchase_units.push(r.purchase_units[0])],
]) {
  test(`reject mismatched ${label} without successful local payment`,()=>{
    const raw=order();change(raw);assert.throws(()=>inspectOrder(raw,expected),e=>e.code==='provider_order_mismatch');
  });
}
test('completed order without a capture, wrong capture amount and multiple captures are refused',()=>{
  const raw=order('COMPLETED');raw.purchase_units[0].payments.captures=[];
  assert.throws(()=>inspectOrder(raw,expected),e=>e.code==='provider_capture_mismatch');
  const other=order('COMPLETED');other.purchase_units[0].payments.captures[0].amount.value='250.00';
  assert.throws(()=>inspectOrder(other,expected),e=>e.code==='provider_capture_mismatch');
  const duplicate=order('COMPLETED');duplicate.purchase_units[0].payments.captures.push(duplicate.purchase_units[0].payments.captures[0]);
  assert.throws(()=>inspectOrder(duplicate,expected),e=>e.code==='provider_capture_mismatch');
});
for(const url of ['https://paypal.com/checkoutnow?token=ORDER123','https://www.sandbox.paypal.com.attacker.test/checkoutnow?token=ORDER123','https://user:pass@www.sandbox.paypal.com/checkoutnow?token=ORDER123','https://www.sandbox.paypal.com/checkoutnow?token=OTHER','http://www.sandbox.paypal.com/checkoutnow?token=ORDER123']) {
  test(`unsafe or mismatched approval URL refused: ${url}`,()=>{
    const raw=order();raw.links[0].href=url;
    assert.throws(()=>inspectOrder(raw,expected),e=>e.code==='provider_invalid_response');
  });
}
test('timeout after mutation requests reconciliation, with no automatic retry',async()=>{
  const {client,calls}=setup([new Error('private provider details')]);
  await rejects(()=>client.captureOrder({...expected,operationId:'capture-operation-001'}),'provider_reconciliation_required');
  assert.equal(calls.length,2);
});
for(const response of [()=>new Response('not json'),()=>new Response('x'.repeat(128001)),()=>json({privateError:'sensitive'},500),()=>json({privateError:'sensitive'},422)]) {
  test('uncertain create/capture answer fails closed with generic reconciliation error',async()=>{
    const {client}=setup([response]);
    await rejects(()=>client.createOrder({...expected,operationId:'create-operation-001'}),'provider_reconciliation_required');
  });
}
test('invalid caller-controlled operation ids or path traversal are refused before network',async()=>{
  const {client,calls}=setup([]);
  await rejects(()=>client.captureOrder({...expected,operationId:'short'}),'invalid_operation_id');
  await rejects(()=>client.getOrder({...expected,orderId:'../../token'}),'invalid_provider_reference');
  assert.equal(calls.length,0);
});
test('lookup verifies the same persisted order and merchant',async()=>{
  const {client}=setup([json(order('APPROVED'))]);
  assert.equal((await client.getOrder(expected)).status,'APPROVED');
});
const event={id:'WH-TEST123',event_type:'PAYMENT.CAPTURE.COMPLETED',resource:{id:'CAPTURE123'}};
const webhookHeaders=()=>new Headers({'paypal-auth-algo':'SHA256withRSA','paypal-cert-url':'https://api.paypal.com/v1/notifications/certs/CERT-TEST','paypal-transmission-id':'tx-test','paypal-transmission-sig':'test-signature','paypal-transmission-time':'2026-10-26T12:00:00Z'});
test('verification is sent to pinned PayPal, never the certificate URL; body is bound to the event',async()=>{
  const {client,calls}=setup([json({verification_status:'SUCCESS'})]);
  const result=await client.verifyWebhook({rawBody:JSON.stringify(event),headers:webhookHeaders()});
  assert.deepEqual(result,{environment:'sandbox',eventId:'WH-TEST123',eventType:'PAYMENT.CAPTURE.COMPLETED'});
  assert.equal(calls.length,2);assert.equal(calls[1].url,'https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature');
  assert.deepEqual(JSON.parse(calls[1].options.body).webhook_event,event);
  assert.equal(JSON.parse(calls[1].options.body).webhook_id,'test-webhook');
});
test('failed signature and verification outage never become verified events',async()=>{
  const {client}=setup([json({verification_status:'FAILURE'})]);
  await rejects(()=>client.verifyWebhook({rawBody:JSON.stringify(event),headers:webhookHeaders()}),'invalid_webhook_signature');
  const {client:offline}=setup([new Error('connection details')]);
  await rejects(()=>offline.verifyWebhook({rawBody:JSON.stringify(event),headers:webhookHeaders()}),'provider_unavailable');
});
test('malformed, oversized or unsigned webhook refused before network',async()=>{
  const {client,calls}=setup([]);
  for (const rawBody of ['{', 'x'.repeat(128001), '{}']) await rejects(()=>client.verifyWebhook({rawBody,headers:webhookHeaders()}),'invalid_webhook');
  await rejects(()=>client.verifyWebhook({rawBody:JSON.stringify(event),headers:new Headers()}),'invalid_webhook');
  assert.equal(calls.length,0);
});
test('untrusted certificate locations are rejected without forwarding or fetching',async()=>{
  const {client,calls}=setup([]);
  for(const url of ['https://attacker.test/cert','http://api.paypal.com/v1/notifications/certs/CERT-X','https://api.paypal.com/v1/notifications/certs/CERT-X?redirect=bad']) {
    const headers=webhookHeaders();headers.set('paypal-cert-url',url);
    await rejects(()=>client.verifyWebhook({rawBody:JSON.stringify(event),headers}),'invalid_webhook');
  }
  assert.equal(calls.length,0);
});
