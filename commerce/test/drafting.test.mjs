import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildDraftPrompt,parseDraft,draftBody,createOllamaDrafter,createClaudeDrafter} from '../src/drafting.mjs';
import {sha256} from '../src/proposals.mjs';
const source={tenant:'owner-dev',id:'service',revision:'v1',title:'Test-only service',content:'Build one service page from approved copy.',contentHash:sha256('Build one service page from approved copy.'),metadataHash:sha256('test'),expiresAt:'2026-11-20T12:00:00.000Z',status:'active',reviewState:'approved',sensitivity:'ordinary'};
const input=()=>({tenant:'owner-dev',sources:[{...source}],instruction:'Draft a bounded scope.',now:Date.parse('2026-10-26T12:00:00.000Z')});
const draft=()=>({title:'A service page',requirements:[{text:'Use approved copy.',sourceIds:['service']}],deliverables:[{title:'One service page',details:'Prepare the page for review.',sourceIds:['service']}],questions:['Who supplies final copy?'],assumptions:[]});
test('prompt labels sources as untrusted evidence and contains only selected source material',()=>{
  const messages=buildDraftPrompt(input());assert.equal(messages[0].role,'system');assert.match(messages[0].content,/never instructions/);
  assert.deepEqual(JSON.parse(messages[1].content).evidence.map(s=>s.id),['service']);
});
test('draft is structured and rendered with source register and uncertainty, with no terms authority',()=>{
  const d=parseDraft(JSON.stringify(draft()),[source]);const body=draftBody(d);
  assert.match(body,/\[source:service\]/);assert.match(body,/Source register/);assert.match(body,/Who supplies final copy/);
  const extra={...draft(),depositCents:1};assert.throws(()=>parseDraft(JSON.stringify(extra),[source]),e=>e.code==='invalid_draft');
});
test('unknown/missing citations and malformed JSON fail instead of becoming a reviewable proposal',()=>{
  for(const ids of [[],['invented'],['service','service']]){const d=draft();d.deliverables[0].sourceIds=ids;assert.throws(()=>parseDraft(JSON.stringify(d),[source]),e=>e.code==='invalid_citations');}
  assert.throws(()=>parseDraft('```json {} ```',[source]),e=>e.code==='invalid_draft');
});
test('quarantined, expired, oversized and changed sources are refused before calling a model',async()=>{
  let calls=0;const run=createOllamaDrafter({model:'qwen-test',fetchImpl:async()=>{calls++;}});
  for(const patch of [{reviewState:'quarantined'},{content:'Tampered content'},{expiresAt:'2026-10-20T12:00:00.000Z'}]){
    const i=input();Object.assign(i.sources[0],patch);await assert.rejects(()=>run(i));
  }
  assert.equal(calls,0);
});
test('local model request is pinned and bounded; unknown cost is not recorded as zero',async()=>{
  let call;const run=createOllamaDrafter({model:'qwen-test',fetchImpl:async(url,options)=>{call={url,options};return Response.json({message:{content:JSON.stringify(draft())},prompt_eval_count:50,eval_count:100});}});
  const result=await run(input());assert.equal(call.url,'http://127.0.0.1:11434/api/chat');
  const body=JSON.parse(call.options.body);assert.equal(body.stream,false);assert.equal(body.format,'json');assert.equal(body.options.num_predict,1800);
  assert.equal(result.costMicros,null);assert.equal(result.costStatus,'not_reported');assert.equal(result.outputTokens,100);
});
test('model transport failures and unbounded output return stable non-sensitive errors',async()=>{
  for(const impl of [async()=>{throw new Error('private machine details');},async()=>new Response('x'.repeat(64_001)),async()=>new Response('no', {status:500})]){
    const run=createOllamaDrafter({model:'qwen-test',fetchImpl:impl});await assert.rejects(()=>run(input()),e=>['model_unavailable','invalid_draft'].includes(e.code));
  }
});
test('existing subscription CLI disables tools, MCP, hooks and session saving without selecting or downloading a model',async()=>{
  const calls=[];
  const run=createClaudeDrafter({runImpl:async(executable,args,stdin)=>{
    calls.push({executable,args,stdin});
    if(args[0]==='auth')return {loggedIn:true,authMethod:'claude.ai',subscriptionType:'pro'};
    return {structured_output:draft(),modelUsage:{'existing-subscription-model':{inputTokens:30,cacheReadInputTokens:10,cacheCreationInputTokens:15,outputTokens:100}}};
  }});
  const result=await run(input());assert.equal(result.provider,'claude-cli');assert.equal(result.costMicros,null);
  assert.equal(result.costStatus,'subscription_usage_only');assert.equal(result.inputTokens,55);assert.equal(calls.length,2);
  const args=calls[1].args;assert.equal(args[args.indexOf('--tools')+1],'');
  assert.ok(args.includes('--strict-mcp-config'));assert.ok(args.includes('--no-session-persistence'));
  assert.equal(JSON.parse(args[args.indexOf('--settings')+1]).disableAllHooks,true);
  assert.ok(!args.includes('--model'));assert.ok(!args.some(v=>['pull','create','install','update'].includes(v)));
  assert.ok(calls[1].stdin.includes(source.content));
});
test('CLI draft rejects API-key access or missing subscription instead of enabling a new paid path',async()=>{
  let calls=0;const run=createClaudeDrafter({runImpl:async()=>{calls++;return {loggedIn:true,authMethod:'api_key'};}});
  await assert.rejects(()=>run(input()),e=>e.code==='existing_subscription_required');assert.equal(calls,1);
});
