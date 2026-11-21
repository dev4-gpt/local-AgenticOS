import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWebhookReceiver} from '../src/webhook-receiver.mjs';
import {CommerceError} from '../src/proposals.mjs';
const headers={'content-type':'application/json','paypal-auth-algo':'SHA256withRSA','paypal-cert-url':'https://api.sandbox.paypal.com/v1/notifications/certs/TEST','paypal-transmission-id':'TEST','paypal-transmission-sig':'FIXTURE','paypal-transmission-time':'2026-10-26T12:00:00Z'};
async function setup(t,{verify=async()=>({environment:'sandbox'}),accept=()=>({duplicate:false}),maxConcurrent=4}={}){
 const server=createWebhookReceiver({store:{acceptVerifiedWebhook:accept},paypal:{verifyWebhook:verify},maxConcurrent});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin=`http://127.0.0.1:${server.address().port}`;
 return (path='/api/paypal/webhook',options={})=>fetch(origin+path,{method:'POST',headers,body:'{"test":"fixture"}',...options});
}
test('dedicated webhook listener exposes no UI or account routes and requires provider verification',async t=>{
 let calls=0,processed=0;
 const request=await setup(t,{verify:async({rawBody,headers:h})=>{calls++;assert.equal(rawBody,'{"tenant":"untrusted"}');assert.equal(h.get('paypal-transmission-id'),'TEST');return {environment:'sandbox'};},accept:()=>{processed++;return {duplicate:false};}});
 for(const path of ['/','/app.mjs','/api/login','/api/workspace','/api/paypal/webhook?token=ignored'])assert.equal((await request(path)).status,404);
 assert.equal((await request(undefined,{method:'GET',body:undefined})).status,405);
 assert.equal((await request(undefined,{headers:{'content-type':'text/plain'}})).status,415);
 assert.equal((await request(undefined,{headers:{'content-type':'application/json'}})).status,400);
 assert.equal(calls,0);assert.equal(processed,0);
 const result=await request(undefined,{body:'{"tenant":"untrusted"}',headers:{...headers,host:'forwarded-webhook.example'}});
 assert.equal(result.status,200);assert.deepEqual(await result.json(),{ok:true});assert.equal(calls,1);assert.equal(processed,1);
 assert.equal(result.headers.get('cache-control'),'no-store');
});
test('signature failure never reaches persistence; provider errors never expose secrets',async t=>{
 let persisted=0;
 const request=await setup(t,{verify:async()=>{throw new CommerceError('invalid_webhook_signature');},accept:()=>persisted++});
 const invalid=await request();assert.equal(invalid.status,400);assert.equal(persisted,0);
 const unavailable=await setup(t,{verify:async()=>{throw new Error('PRIVATE_PROVIDER_VALUE');}});
 const result=await unavailable();assert.equal(result.status,503);assert.equal((await result.text()).includes('PRIVATE_PROVIDER_VALUE'),false);
});
test('receiver bounds body size and verification concurrency and recovers after refusal',async t=>{
 let release,started;const waiting=new Promise(resolve=>{release=resolve;}),begun=new Promise(resolve=>{started=resolve;});
 let calls=0;
 const request=await setup(t,{maxConcurrent:1,verify:async()=>{calls++;started();await waiting;return {};}});
 assert.equal((await request(undefined,{body:'x'.repeat(128001)})).status,413);assert.equal(calls,0);
 const first=request();await begun;
 const busy=await request();assert.equal(busy.status,503);assert.equal(busy.headers.get('retry-after'),'10');assert.equal(calls,1);
 release();assert.equal((await first).status,200);assert.equal((await request()).status,200);assert.equal(calls,2);
});
