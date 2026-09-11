import { test, expect } from '@playwright/test';
import { loadReviewModule } from './helpers/load-review-module';
import { parseEccLesson, readEccBody } from '../src/lib/eccLearning';

const content = { summary: 'Keep source evidence.', trigger: 'Before review.', action: 'Attach verification output.', evidenceReferences: ['record:1'], sourceHashes: ['a'.repeat(64)] };
const id = '00000000-0000-4000-8000-000000000001';
function route(role: string | null) {
  const calls: any[] = [];
  const module = loadReviewModule('src/app/api/client-runtime/learning/route.ts', {
    '@/lib/eccAuth': { eccSession: async () => role ? { role, userId: id, tenantSlug: 'tenant-a' } : null },
    '@/lib/eccLearning': { parseEccLesson, readEccBody },
    '@/lib/clientDataPlane': {
      checkClientRuntimeRateLimit: async () => ({ok:true,allowed:true}),
      clientRpc: async (fn: string,args: unknown) => { calls.push({fn,args}); return {ok:true,status:200,value:fn==='propose_client_learning'?id:true}; },
      selectClientRecords: async (table: string,filters: unknown) => { calls.push({table,filters});return {ok:true,records:[]}; },
    },
  });
  return { ...module, calls };
}
const request = (method: string, body: unknown) => new Request('https://tenant.invalid/api/client-runtime/learning', {method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});

test('learning API authenticates, enforces roles and derives tenant from the session', async () => {
  expect((await route(null).GET(new Request('https://tenant.invalid/api/client-runtime/learning'))).status).toBe(401);
  const viewer=route('viewer');
  expect((await viewer.POST(request('POST',{content,idempotencyKey:'lesson-fixture'}))).status).toBe(403);
  const member=route('member');
  expect((await member.PATCH(request('PATCH',{action:'review',decision:'approve',id,expectedHash:'a'.repeat(64)}))).status).toBe(403);
  expect((await member.POST(request('POST',{content,idempotencyKey:'lesson-fixture',tenantSlug:'tenant-b'}))).status).toBe(400);
  expect(member.calls).toHaveLength(0);
  expect((await member.POST(request('POST',{content,idempotencyKey:'lesson-fixture'}))).status).toBe(200);
  expect(member.calls[0].args.p_tenant_slug).toBe('tenant-a');
  const owner=route('owner');
  expect((await owner.PATCH(request('PATCH',{action:'review',decision:'approve',id,expectedHash:'b'.repeat(64)}))).status).toBe(200);
  expect(owner.calls[0]).toEqual({fn:'review_client_learning',args:{p_tenant_slug:'tenant-a',p_item_id:id,p_expected_hash:'b'.repeat(64),p_decision:'approve'}});
});

test('lesson proposals reject secret-bearing fields, permission expansion and oversized bodies', async () => {
  expect(parseEccLesson({...content,tools:['shell']})).toBeNull();
  expect(parseEccLesson({...content,summary:'password='+'fixture-secret'})).toBeNull();
  expect(parseEccLesson({...content,sourceHashes:['not-a-hash']})).toBeNull();
  const member=route('member');
  expect((await member.POST(request('POST',{content:{...content,summary:'x'.repeat(17000)},idempotencyKey:'lesson-fixture'}))).status).toBe(400);
  expect(member.calls).toHaveLength(0);
});
