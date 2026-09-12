import { test, expect } from '@playwright/test';
import { loadReviewModule } from './helpers/load-review-module';
import { runEccAdapter, eccHash, parseEccInput } from '../src/lib/eccAdapter';
import { parseEccLesson, readEccBody } from '../src/lib/eccLearning';
import { eccAdapter } from '../src/lib/eccCatalog';
import { readFileSync } from 'node:fs';

const lesson = { summary:'Attach evidence.',trigger:'Before review.',action:'Compare the actual test output against the release checklist.',evidenceReferences:['record:1'],sourceHashes:['a'.repeat(64)] };
const snapshot = {id:'00000000-0000-4000-8000-000000000001',contentHash:'b'.repeat(64),content:lesson};
test('runtime packaging and provisioning expose authenticated ECC routes without enabling tenant policy', () => {
  for (const file of ['Dockerfile.client','scripts/provision-gcp-client.mjs','scripts/run-client-runtime-local.mjs','client-blueprints/gcp-client-runtime.example.json']) {
    const source=readFileSync(file,'utf8');
    for (const route of ['/api/client-runtime/skills','/api/client-runtime/learning','/api/client-runtime/ecc']) expect(source,`${file} missing ${route}`).toContain(route);
  }
});
test('worker checks policy and exact active lessons before producing an artifact', async () => {
  let enabled=true; let allowed=true; let rpcCalls=0;
  const {executeEccJob}=loadReviewModule('src/lib/eccJob.ts',{
    '@/lib/eccAdapter':{runEccAdapter,eccHash}, '@/lib/eccLearning':{parseEccLesson},
    '@/lib/clientRuntimePolicy':{clientCapabilityEnabled:()=>enabled},
    '@/lib/clientDataPlane':{workerRpc:async(fn:string)=>{rpcCalls++;return {ok:true,value:fn==='admit_client_ecc_job'?'member':allowed};}},
  });
  const input={eccInput:{adapterId:'ecc-engineering-handoff',brief:'Prepare the handoff.'},reviewedLessons:[snapshot]};
  const result=await executeEccJob('tenant-a','job-id','worker-token',input);
  expect(result.ok).toBe(true); expect(result.artifact.checklist.at(-1).action).toBe(lesson.action);
  expect(result.artifactHash).toBe(eccHash(JSON.stringify(result.artifact)));
  expect(result.evaluation.inferenceCalls).toBe(0);
  allowed=false; expect(await executeEccJob('tenant-a','job-id','worker-token',input)).toEqual({ok:false,error:'ecc_lesson_not_active'});
  const before=rpcCalls; enabled=false;
  expect(await executeEccJob('tenant-a','job-id','worker-token',input)).toEqual({ok:false,error:'ecc_capability_not_enabled'}); expect(rpcCalls).toBe(before);
});

test('workflow API rejects unauthorized execution and safely retries queued dispatch', async () => {
  let role='viewer'; let policy=true; let runtimeEnabled=true; let dispatches=0; let stored: Record<string,unknown>|null=null;
  const {POST}=loadReviewModule('src/app/api/client-runtime/ecc/route.ts',{
    '@/lib/eccAuth':{eccSession:async()=>({role,userId:'user-a',tenantSlug:'tenant-a'})},
    '@/lib/eccAdapter':{eccHash,parseEccInput},'@/lib/eccCatalog':{eccAdapter},'@/lib/eccLearning':{readEccBody},
    '@/lib/clientRuntimePolicy':{clientCapabilityEnabled:()=>runtimeEnabled},
    '@/lib/cloudTasks':{enqueueClientRuntimeTask:async()=>({ok:++dispatches>1})},
    '@/lib/clientDataPlane':{
      checkClientRuntimeRateLimit:async()=>({ok:true,allowed:true}), clientRpc:async()=>({ok:true,value:[]}),
      enqueueClientRuntimeJob:async(input:Record<string,unknown>)=>{stored??=input;return 'job-id';},
      selectClientRecords:async(table:string)=>({ok:true,records:table==='client_ecc_policy'?[{enabled:policy}]:[{status:'queued',input_metadata:stored?.inputMetadata}]}),
    },
  });
  const body={input:{adapterId:'ecc-research-plan',brief:'Compare the primary sources.'},idempotencyKey:'request-fixture'};
  const request=(value:unknown=body)=>new Request('https://tenant.invalid/api/client-runtime/ecc',{method:'POST',body:JSON.stringify(value)});
  expect((await POST(request())).status).toBe(403); expect(stored).toBeNull();
  role='member'; policy=false; expect((await POST(request())).status).toBe(403);
  policy=true; runtimeEnabled=false; expect((await POST(request())).status).toBe(403);
  runtimeEnabled=true;
  expect((await POST(request({...body,tenantSlug:'tenant-b'}))).status).toBe(400);
  expect((await POST(request({...body,input:{...body.input,adapterId:'unknown-paid-adapter'}}))).status).toBe(422);
  expect((await POST(request({...body,learningRevisions:[{id:snapshot.id,contentHash:snapshot.contentHash}]}))).status).toBe(409);
  expect((await POST(request())).status).toBe(503); // first dispatch failure retains the queued job
  expect((await POST(request())).status).toBe(202);
  expect((stored as any).idempotencyKey).toBe('ecc:user-a:request-fixture');
  expect((await POST(request({...body,input:{...body.input,brief:'Different work with the same request key.'}}))).status).toBe(409);
  expect(dispatches).toBe(2);
});
