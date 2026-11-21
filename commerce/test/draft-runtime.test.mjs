import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync,chmodSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {CommerceDraftJournal} from '../src/draft-journal.mjs';
import {createCommerceDraftRuntime} from '../src/draft-runtime.mjs';
import {hostRequestHash,createHostTokenVerifier} from '../src/host-tokens.mjs';
import {sha256} from '../src/proposals.mjs';
const DAY=86400000,begin=Date.parse('2026-10-26T12:00:00Z'),tenant='runtime-test';
async function setup(t,{drafter}={}){
 const dir=mkdtempSync(join(tmpdir(),'commerce-draft-runtime-')),path=join(dir,'runtime.sqlite'),keys=generateKeyPairSync('ed25519');let now=begin,calls=0;
 const source={tenant,id:'11111111-1111-4111-8111-111111111111',revision:'review-1',title:'Fictional public service',type:'source',content:'Prepare one reviewed page.',contentHash:sha256('Prepare one reviewed page.'),metadataHash:sha256('synthetic metadata'),createdAt:new Date(begin-DAY).toISOString(),expiresAt:new Date(begin+DAY).toISOString(),status:'active',reviewState:'approved',sensitivity:'ordinary'};
 const payload={tenantSlug:tenant,adapterId:'veloce-commerce',task:'proposal.draft',idempotencyKey:'test-runtime-draft-1',budgetMaxMicros:5000,sideEffect:'draft',input:{taskId:'22222222-2222-4222-8222-222222222222',sources:[source],instruction:'Draft a reviewed page.',provider:'test-existing-provider',model:'test-existing-model'}};
 const result={draft:{title:'One service page'},body:`## Requirements\nOne page [source:${source.id}]\n## Source register\n[source:${source.id}]`,provider:'test-existing-provider',model:'test-existing-model',costMicros:null,costStatus:'subscription_usage_only'};
 let journal,server,origin;
 async function start(){journal=new CommerceDraftJournal(path,{clock:()=>now});server=createCommerceDraftRuntime({tenant,publicKeys:[keys.publicKey],journal,provider:result.provider,model:result.model,maxBudgetMicros:5000,clock:()=>now,drafter:async input=>{calls++;return drafter?drafter(input,result):result;}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;}
 await start();
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));journal.close();rmSync(dir,{recursive:true,force:true});});
 function mint(method,path,raw,operation,changes={}){
  const claims={v:'h1',iss:'veloce-host',tenant,aud:'veloce-commerce',scope:[operation],handles:[source.id],jti:randomUUID(),iat:Math.floor(now/1000),exp:Math.floor(now/1000)+60,requestSha256:hostRequestHash(method,path,raw),...changes};
  const body=Buffer.from(JSON.stringify(claims)).toString('base64url');return `${body}.${sign(null,Buffer.from(body),keys.privateKey).toString('base64url')}`;
 }
 async function request({method='POST',path='/h1/task.run',value=payload,operation='task.run',token,claims,anonymous=false}={}){
  const raw=method==='GET'?'':JSON.stringify(value),signed=token??mint(method,path,raw,operation,claims);
  const response=await fetch(origin+path,{method,headers:{...(anonymous?{}:{authorization:`Bearer ${signed}` }),'content-type':'application/json'},...(method==='POST'?{body:raw}:{})});return {response,data:await response.json(),token:signed};
 }
 return {source,payload,result,request,mint,calls:()=>calls,journal:()=>journal,path,setTime:t=>{now=t;},async restart(){await new Promise(resolve=>server.close(resolve));journal.close();await start();}};
}
test('request-bound tokens, source handles and draft-only routes refuse tampering before a provider call',async t=>{
 const f=await setup(t),raw=JSON.stringify(f.payload),token=f.mint('POST','/h1/task.run',raw,'task.run');
 const changed=structuredClone(f.payload);changed.input.instruction='Changed after signing';
 assert.equal((await f.request({value:changed,token})).response.status,401);
 for(const claims of [{tenant:'other-tenant'},{aud:'other-adapter'},{scope:['task.run','task.cancel']},{handles:[]},{requestSha256:'a'.repeat(64)},{exp:Math.floor(begin/1000)}])assert.equal((await f.request({claims})).response.status,401);
 assert.equal((await f.request({value:{...f.payload,input:{...f.payload.input,instruction:'x'.repeat(128001)}}})).response.status,413);
 assert.equal((await f.request({value:{...f.payload,sideEffect:'publish'}})).response.status,409);
 for(const path of ['/','/api/login','/api/payments/capture'])assert.equal((await f.request({path})).response.status,404);
 assert.equal(f.calls(),0);
 const ok=await f.request({token});assert.equal(ok.response.status,200);assert.equal(ok.data.result.costMicros,null);assert.equal(f.calls(),1);
 assert.equal((await f.request({token})).data.error,'host_token_replayed');assert.equal(f.calls(),1);
});
test('completed task and token replay survive restart; changed idempotent input cannot run again',async t=>{
 const f=await setup(t),first=await f.request();assert.equal(first.data.task.status,'succeeded');
 await f.restart();const retry=await f.request();assert.equal(retry.data.result.body,f.result.body);assert.equal(f.calls(),1);
 assert.equal((await f.request({token:first.token})).data.error,'host_token_replayed');
 const changed=structuredClone(f.payload);changed.input.instruction='Different scope';assert.equal((await f.request({value:changed})).data.error,'runtime_task_conflict');assert.equal(f.calls(),1);
 const read=await f.request({method:'GET',path:`/h1/task.result?id=${f.payload.input.taskId}`,operation:'task.result'});assert.equal(read.data.result.body,f.result.body);
});
test('ambiguous model result is durable uncertainty and never automatically repeated',async t=>{
 const f=await setup(t,{drafter:async()=>{throw new Error('PRIVATE_PROVIDER_DIAGNOSTIC');}});
 const first=await f.request();assert.equal(first.response.status,503);assert.equal(JSON.stringify(first.data).includes('PRIVATE_PROVIDER'),false);
 const next=await f.request();assert.equal(next.response.status,202);assert.equal(next.data.task.status,'uncertain');assert.equal(f.calls(),1);
});
test('cancel holds the task without claiming provider termination; late completion cannot resurrect it',async t=>{
 let entered,release;const started=new Promise(resolve=>{entered=resolve;}),wait=new Promise(resolve=>{release=resolve;});
 const f=await setup(t,{drafter:async(_input,result)=>{entered();await wait;return result;}});
 const running=f.request();await started;
 const duplicate=await f.request();assert.equal(duplicate.response.status,202);assert.equal(duplicate.data.task.status,'running');assert.equal(f.calls(),1);
 const cancel=await f.request({path:'/h1/task.cancel',operation:'task.cancel',value:{id:f.payload.input.taskId}});assert.equal(cancel.data.providerCancellationConfirmed,false);assert.equal(cancel.data.task.status,'uncertain');
 release();assert.equal((await running).response.status,503);assert.equal((await f.request()).data.task.status,'uncertain');assert.equal(f.calls(),1);
});
test('output expires at the source clock and is redacted after seven recovery days without releasing replay identity',async t=>{
 const f=await setup(t);await f.request();
 const other=f.journal().claim({tenant:'other-tenant',jti:randomUUID(),exp:Math.floor(begin/1000)+60},{id:randomUUID(),idempotencyKey:'other-tenant-task',requestHash:sha256('other fixture'),sourceIds:[f.source.id],expiresAt:f.source.expiresAt});
 f.journal().complete('other-tenant',other.task.id,other.claim,{body:'OTHER_TENANT_FIXTURE'});
 f.setTime(begin+DAY);
 const read=await f.request({method:'GET',path:`/h1/task.result?id=${f.payload.input.taskId}`,operation:'task.result'});assert.equal(read.response.status,404);
 f.setTime(begin+8*DAY-1);assert.equal(f.journal().purge(tenant,{apply:true}).tasksRedacted,0);
 f.setTime(begin+8*DAY);const preview=f.journal().purge(tenant);assert.equal(preview.tasksRedacted,1);assert.equal(preview.applied,false);
 assert.equal(f.journal().purge(tenant,{apply:true}).tasksRedacted,1);
 assert.equal(f.journal().compact().localCompaction,'completed');assert.equal(readFileSync(f.path).includes(Buffer.from('## Requirements')),false);
 const db=new DatabaseSync(f.path);try{const row=db.prepare('SELECT * FROM commerce_runtime_tasks WHERE tenant=?').get(tenant);assert.equal(row.payload,'{}');assert.ok(row.request_hash);assert.equal(db.prepare('SELECT count(*) AS n FROM commerce_runtime_tasks WHERE tenant=?').get(tenant).n,1);assert.match(db.prepare('SELECT payload FROM commerce_runtime_tasks WHERE tenant=?').get('other-tenant').payload,/OTHER_TENANT_FIXTURE/);}finally{db.close();}
 assert.equal(f.calls(),1);
});
test('runtime journal refuses a shared application database',()=>{
 const dir=mkdtempSync(join(tmpdir(),'commerce-runtime-dedicated-')),path=join(dir,'runtime.sqlite');
 const db=new DatabaseSync(path);db.exec('CREATE TABLE other_application_table(id TEXT)');db.close();
 chmodSync(path,0o600);
 try{assert.throws(()=>new CommerceDraftJournal(path),error=>error.code==='dedicated_runtime_database_required');}finally{rmSync(dir,{recursive:true,force:true});}
});


test('dedicated runtime schema is completely classified without adding it to the app database inventory',()=>{
 const journal=new CommerceDraftJournal(':memory:');const {publicKey}=generateKeyPairSync('ed25519');
 assert.throws(()=>createCommerceDraftRuntime({tenant,publicKeys:[publicKey],journal,provider:'fixture',model:'fixture',maxBudgetMicros:1000}),error=>error.code==='invalid_runtime_configuration');journal.close();
 const dir=mkdtempSync(join(tmpdir(),'commerce-runtime-inventory-')),path=join(dir,'runtime.sqlite');
 const live=new CommerceDraftJournal(path),db=new DatabaseSync(path);
 try{
  const inventory=JSON.parse(readFileSync(new URL('../draft-runtime-inventory.json',import.meta.url),'utf8'));
  const tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
  assert.deepEqual(Object.keys(inventory.tables).sort(),tables);for(const entry of Object.values(inventory.tables))assert.ok(entry.policy&&entry.class);
 }finally{db.close();live.close();rmSync(dir,{recursive:true,force:true});}
});


test('a journal write failure after provider execution returns uncertainty and still blocks a second run',async t=>{
 const f=await setup(t);
 f.journal().complete=()=>{throw new Error('fixture disk failure');};
 f.journal().uncertain=()=>{throw new Error('fixture disk failure');};
 const response=await f.request();assert.equal(response.response.status,503);assert.equal(response.data.error,'runtime_reconciliation_required');
 const retry=await f.request();assert.equal(retry.response.status,202);assert.equal(retry.data.task.status,'running');assert.equal(f.calls(),1);
});


test('every runtime operation refuses unauthenticated and wrong-tenant calls',async t=>{
 const f=await setup(t);
 const cases=[['GET','/h1/manifest','manifest',undefined],['GET','/h1/health','health',undefined],['POST','/h1/task.run','task.run',f.payload],['GET',`/h1/task.get?id=${f.payload.input.taskId}`,'task.get',undefined],['GET',`/h1/task.result?id=${f.payload.input.taskId}`,'task.result',undefined],['POST','/h1/task.cancel','task.cancel',{id:f.payload.input.taskId}]];
 for(const [method,path,operation,value] of cases){
  assert.equal((await f.request({method,path,operation,value,anonymous:true})).response.status,401);
  assert.equal((await f.request({method,path,operation,value,token:'invalid.token'})).response.status,401);
  assert.equal((await f.request({method,path,operation,value,claims:{tenant:'other-tenant'}})).response.status,401);
 }
 assert.equal(f.calls(),0);
});


test('runtime configuration accepts public keys only and refuses private PEM as well as private key objects',()=>{
 const keys=generateKeyPairSync('ed25519');
 const publicPem=keys.publicKey.export({type:'spki',format:'pem'}),privatePem=keys.privateKey.export({type:'pkcs8',format:'pem'});
 assert.equal(typeof createHostTokenVerifier({tenant,publicKeys:[publicPem]}),'function');
 for(const key of [keys.privateKey,privatePem,publicPem+privatePem,'invalid'])assert.throws(()=>createHostTokenVerifier({tenant,publicKeys:[key]}),error=>error.code==='invalid_host_configuration');
});
