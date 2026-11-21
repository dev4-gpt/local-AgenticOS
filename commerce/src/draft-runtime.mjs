/** Optional h1 draft-only runtime. Constructor opens no network; no UI, PayPal, host worker key or model downloads. */
import {createServer} from 'node:http';
import {CommerceError,assertSourcesEligible} from './proposals.mjs';
import {buildDraftPrompt} from './drafting.mjs';
import {createHostTokenVerifier,hostRequestHash} from './host-tokens.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const fail=code=>{throw new CommerceError(code);};
const exact=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))fail('invalid_runtime_task');};
export const COMMERCE_DRAFT_MANIFEST=Object.freeze({contractVersion:'h1',adapterId:'veloce-commerce',displayName:'Veloce Commerce drafts',adapterVersion:'0.1.0',publisher:'Veloce',license:'MIT',operations:['manifest','health','task.run','task.get','task.result','task.cancel'],tasks:[{name:'proposal.draft',sideEffect:'draft'}],sideEffectCeiling:'draft',deletionGuarantee:'none'});
const routeMap=new Map([['GET /h1/manifest','manifest'],['GET /h1/health','health'],['POST /h1/task.run','task.run'],['GET /h1/task.get','task.get'],['GET /h1/task.result','task.result'],['POST /h1/task.cancel','task.cancel']]);
export function createCommerceDraftRuntime({tenant,publicKeys,journal,drafter=null,provider,model,maxBudgetMicros,clock=Date.now,maxConcurrent=2,allowVolatileJournalForTests=false}){
 if(!journal||(journal.durable!==true&&allowVolatileJournalForTests!==true)||typeof clock!=='function'||typeof provider!=='string'||!provider||provider.length>120||typeof model!=='string'||!model||model.length>180||!Number.isSafeInteger(maxBudgetMicros)||maxBudgetMicros<1||!Number.isSafeInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>8||(drafter!==null&&typeof drafter!=='function'))fail('invalid_runtime_configuration');
 const verify=createHostTokenVerifier({tenant,publicKeys});let active=0;
 const server=createServer({maxHeaderSize:16384},async(request,response)=>{
  const send=(status,value)=>{if(!response.headersSent){response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(JSON.stringify(value));}};
  let claimed=null,slot=false;
  try{
   if(typeof request.url!=='string'||!request.url.startsWith('/')){request.resume();send(404,{ok:false,error:'not_found'});return;}
   const url=new URL(request.url,'http://127.0.0.1'),operation=routeMap.get(`${request.method} ${url.pathname}`);
   if(!operation){request.resume();send(404,{ok:false,error:'not_found'});return;}
   if((['task.get','task.result'].includes(operation)&&(!UUID.test(url.searchParams.get('id')??'')||[...url.searchParams.keys()].join('|')!=='id'))||(!['task.get','task.result'].includes(operation)&&url.search))fail('invalid_runtime_task');
   const auth=request.headers.authorization;if(typeof auth!=='string'||!auth.startsWith('Bearer ')||auth.length>4103)fail('invalid_host_token');
   if(request.method==='POST'&&request.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')fail('invalid_runtime_task');
   const declared=Number(request.headers['content-length']);if(Number.isFinite(declared)&&declared>128000)fail('payload_too_large');
   const chunks=[];let size=0;
   for await(const chunk of request){size+=chunk.length;if(size>128000)fail('payload_too_large');chunks.push(chunk);}
   let raw;try{raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));}catch{fail('invalid_runtime_task');}if(request.method==='GET'&&raw)fail('invalid_runtime_task');
   const fingerprint=hostRequestHash(request.method,request.url,raw),token=auth.slice(7),now=clock();
   let claims=verify({token,operation,requestSha256:fingerprint,now:Math.floor(now/1000)});if(!claims||(operation.startsWith('task.')&&!claims.handles?.length))fail('invalid_host_token');
   if(operation==='manifest'||operation==='health'){
    journal.consume(claims);send(200,operation==='manifest'?{ok:true,manifest:COMMERCE_DRAFT_MANIFEST}:{ok:true,modelConfigured:!!drafter,environment:'draft-only',payments:false});return;
   }
   let value={};if(request.method==='POST'){try{value=JSON.parse(raw);}catch{fail('invalid_runtime_task');}}
   if(operation!=='task.run'){
    if(operation==='task.cancel')exact(value,['id']);
    const id=operation==='task.cancel'?value.id:url.searchParams.get('id');if(typeof id!=='string'||!UUID.test(id))fail('invalid_runtime_task');
    const sourceIds=journal.handles(tenant,id);
    claims=verify({token,operation,requestSha256:fingerprint,sourceIds,now:Math.floor(now/1000)});if(!claims)fail('invalid_host_token');
    const task=journal.observe(claims,id,{cancel:operation==='task.cancel'}),result=task.result;delete task.result;delete task.sourceIds;
    send(operation==='task.result'&&task.status!=='succeeded'?202:200,{ok:true,task,...(operation==='task.result'&&result?{result}:{}),...(operation==='task.cancel'?{providerCancellationConfirmed:false}:{} )});return;
   }
   if(!drafter)fail('model_not_configured');
   exact(value,['tenantSlug','adapterId','task','idempotencyKey','budgetMaxMicros','sideEffect','input']);exact(value.input,['taskId','sources','instruction','provider','model']);
   const i=value.input;
   if(value.tenantSlug!==tenant||value.adapterId!=='veloce-commerce'||value.task!=='proposal.draft'||value.sideEffect!=='draft'||!Number.isSafeInteger(value.budgetMaxMicros)||value.budgetMaxMicros<1||value.budgetMaxMicros>maxBudgetMicros||typeof i.taskId!=='string'||!UUID.test(i.taskId)||i.provider!==provider||i.model!==model)fail('invalid_runtime_task');
   buildDraftPrompt({tenant,sources:i.sources,instruction:i.instruction,now});
   if(i.sources.some(source=>typeof source.createdAt!=='string'||!Number.isFinite(Date.parse(source.createdAt))||Date.parse(source.createdAt)>now||Date.parse(source.expiresAt)>Date.parse(source.createdAt)+28*86400000))fail('invalid_runtime_task');
   const sourceIds=i.sources.map(source=>source.id);
   claims=verify({token,operation,requestSha256:fingerprint,sourceIds,now:Math.floor(now/1000)});if(!claims)fail('invalid_host_token');
   if(active>=maxConcurrent)fail('runtime_busy');
   const expiresAt=new Date(Math.min(...i.sources.map(s=>Date.parse(s.expiresAt)))).toISOString();
   const admission=journal.claim(claims,{id:i.taskId,idempotencyKey:value.idempotencyKey,requestHash:fingerprint,sourceIds,expiresAt});
   if(!admission.admitted){const task=admission.task,result=task.result;delete task.result;delete task.sourceIds;send(task.status==='succeeded'?200:202,{ok:true,task,...(result?{result}:{})});return;}
   claimed={id:i.taskId,claim:admission.claim};active++;slot=true;
   const result=await drafter({tenant,sources:i.sources,instruction:i.instruction,now});
   assertSourcesEligible(i.sources,i.sources,tenant,clock());
   if(result?.provider!==provider||result?.model!==model||typeof result.body!=='string'||!result.body.trim()||result.body.length>30000||typeof result.draft?.title!=='string'||!result.draft.title.trim()||result.draft.title.length>200||typeof result.costStatus!=='string'||!result.costStatus.trim()||result.costStatus.length>100||(result.costMicros!==null&&(!Number.isSafeInteger(result.costMicros)||result.costMicros<0||result.costMicros>value.budgetMaxMicros)))fail('invalid_draft');
   const safe={title:result.draft.title,body:result.body,provider,model,costMicros:result.costMicros,costStatus:result.costStatus};
   const task=journal.complete(tenant,i.taskId,claimed.claim,safe);delete task.result;delete task.sourceIds;send(200,{ok:true,task,result:safe});
  }catch(error){
   if(claimed){try{journal.uncertain(tenant,claimed.id,claimed.claim);}catch{/* An existing running claim still blocks redispatch when the journal is unavailable. */}}
   const code=error instanceof CommerceError?error.code:'runtime_unavailable';
   const visible=new Set(['invalid_host_token','host_token_replayed','invalid_runtime_task','runtime_task_conflict','not_found','runtime_busy','model_not_configured','payload_too_large']);
   send(code==='invalid_host_token'?401:code==='not_found'?404:code==='payload_too_large'?413:['runtime_busy','model_not_configured'].includes(code)?503:visible.has(code)?409:503,{ok:false,error:visible.has(code)?code:'runtime_reconciliation_required'});
  }finally{if(slot)active--;}
 });
 server.headersTimeout=10000;server.requestTimeout=110000;server.keepAliveTimeout=1000;return server;
}
