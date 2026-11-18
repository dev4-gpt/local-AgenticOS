import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { loadReviewModule } from "./helpers/load-review-module";
import { clientRetentionSecondsRemaining } from "../src/lib/clientRetention";

const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
const userC = "00000000-0000-4000-8000-000000000003";
const uploadA = "00000000-0000-4000-8000-000000000011";
const uploadB = "00000000-0000-4000-8000-000000000012";
const expiredA = "00000000-0000-4000-8000-000000000013";
const jobOutput = "00000000-0000-4000-8000-000000000014";
const jobId = "00000000-0000-4000-8000-000000000021";
const requestA = "00000000-0000-4000-8000-000000000031";
const requestB = "00000000-0000-4000-8000-000000000032";

test("artifact RPCs reject another member and expired confirmation while allowing owner and job requester deletion", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table client_tenants(slug text primary key);
      create table client_memberships(tenant_slug text, user_id uuid, status text);
      create function client_member(p_tenant_slug text) returns boolean language sql as $$
        select exists(select 1 from client_memberships where tenant_slug=p_tenant_slug and user_id=auth.uid() and status='active')
      $$;
      create table client_runtime_jobs(id uuid primary key, tenant_slug text, requested_by uuid);
      create table client_runtime_requests(id uuid primary key, tenant_slug text, request_type text, submitted_by uuid);
      create table client_runtime_artifacts(
        id uuid primary key, tenant_slug text, created_by uuid, job_id uuid,
        status text, retention_expires_at timestamptz, uploaded_at timestamptz,
        byte_size bigint, content_type text
      );
      create table client_runtime_delivery_actions(
        id uuid primary key default gen_random_uuid(), tenant_slug text, request_id uuid,
        requested_by uuid, action text, destination text, artifact_ids jsonb,
        idempotency_key text, updated_at timestamptz default now(), unique(tenant_slug, idempotency_key)
      );
      insert into client_tenants values ('tenant-a'), ('tenant-b');
      insert into client_memberships values ('tenant-a','${userA}','active'), ('tenant-a','${userB}','active'), ('tenant-b','${userC}','active');
      insert into client_runtime_jobs values ('${jobId}','tenant-a','${userA}');
      insert into client_runtime_requests values ('${requestA}','tenant-a','deliver','${userA}'),('${requestB}','tenant-a','deliver','${userB}');
      insert into client_runtime_artifacts values
        ('${uploadA}','tenant-a','${userA}',null,'pending',now()+interval '1 day',null,1,'text/plain'),
        ('${uploadB}','tenant-a','${userB}',null,'pending',now()+interval '1 day',null,1,'text/plain'),
        ('${expiredA}','tenant-a','${userA}',null,'pending',now()-interval '1 day',null,1,'text/plain'),
        ('${jobOutput}','tenant-a',null,'${jobId}','ready',now()+interval '1 day',now(),1,'text/plain');
    `);
    const sql = readFileSync("product-experience/supabase-client-runtime-artifact-owner-guard.sql", "utf8");
    await db.exec(sql);
    await db.exec(sql);
    const privileges = await db.query<{ unauthenticated: boolean; member: boolean; confirmUnauthenticated: boolean }>(`
      select has_function_privilege('anon','public.delete_client_runtime_artifact(text,uuid)','EXECUTE') as unauthenticated,
        has_function_privilege('authenticated','public.delete_client_runtime_artifact(text,uuid)','EXECUTE') as member,
        has_function_privilege('anon','public.confirm_client_runtime_artifact(text,uuid,bigint,text)','EXECUTE') as "confirmUnauthenticated"
    `);
    expect(privileges.rows[0]).toEqual({ unauthenticated: false, member: true, confirmUnauthenticated: false });
    const delivery = async (requestId: string, artifactId: string, key: string) => (await db.query<{ id: string | null }>(
      "select create_client_delivery_action('tenant-a',$1,'record',null,$2::jsonb,$3) as id",
      [requestId, JSON.stringify([artifactId]), key],
    )).rows[0].id;
    await db.exec(`select set_config('request.jwt.claim.sub','${userB}',false)`);
    const scalar = async (sql: string) => (await db.query<{ allowed: boolean }>(`select ${sql} as allowed`)).rows[0].allowed;
    expect(await delivery(requestB, jobOutput, "member-b-job-output")).toBeNull();
    expect(await delivery(requestB, uploadA, "member-b-other-upload")).toBeNull();
    expect(await scalar(`confirm_client_runtime_artifact('tenant-a','${uploadA}',4,'text/plain')`)).toBe(false);
    expect(await scalar(`delete_client_runtime_artifact('tenant-a','${uploadA}')`)).toBe(false);
    expect(await scalar(`delete_client_runtime_artifact('tenant-a','${jobOutput}')`)).toBe(false);
    expect(await scalar(`confirm_client_runtime_artifact('tenant-a','${uploadB}',4,'text/plain')`)).toBe(true);
    expect(await delivery(requestB, uploadB, "member-b-own-upload")).toMatch(/^[0-9a-f-]{36}$/);
    await db.exec(`select set_config('request.jwt.claim.sub','${userA}',false)`);
    expect(await delivery(requestA, expiredA, "member-a-expired-upload")).toBeNull();
    expect(await delivery(requestA, jobOutput, "member-a-job-output")).toMatch(/^[0-9a-f-]{36}$/);
    expect(await delivery(requestA, uploadB, "member-b-own-upload")).toBeNull();
    expect(await scalar(`confirm_client_runtime_artifact('tenant-a','${expiredA}',4,'text/plain')`)).toBe(false);
    expect(await scalar(`delete_client_runtime_artifact('tenant-a','${uploadB}')`)).toBe(false);
    expect(await scalar(`delete_client_runtime_artifact('tenant-a','${jobOutput}')`)).toBe(true);
    expect(await scalar(`delete_client_runtime_artifact('tenant-a','${uploadA}')`)).toBe(true);
    await db.exec(`select set_config('request.jwt.claim.sub','${userC}',false)`);
    expect(await scalar(`delete_client_runtime_artifact('tenant-a','${expiredA}')`)).toBe(false);
    expect((await db.query("select id from client_runtime_artifacts order by id")).rows).toHaveLength(2);
  } finally {
    await db.close();
  }
});

const response = { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } };
const active = () => new Date(Date.now() + 60_000).toISOString();

test("artifact completion and deletion deny another member before touching storage", async () => {
  const originalEnv = { ...process.env };
  Object.assign(process.env, { CLIENT_SLUG: "tenant-a", CLIENT_STORAGE_BUCKET: "fixture", CLIENT_STORAGE_NAMESPACE: "tenant-a" });
  let storageCalls = 0;
  let rpcCalls = 0;
  let owner = userB;
  let artifact: Record<string, unknown> = { id: uploadA, tenant_slug: "tenant-a", created_by: userA, status: "pending", object_key: "tenant-a/private/file", retention_expires_at: active(), content_type: "text/plain" };
  const mocks = {
    "next/server": response,
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: owner }), currentClientMember: async () => true },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
      selectClientRecords: async (table: string, filters: Record<string, string>) => ({ ok: true, records: table === "client_runtime_artifacts" ? [artifact] : table === "client_runtime_jobs" && filters.requested_by === `eq.${userA}` ? [{ id: jobId, tenant_slug: "tenant-a", requested_by: userA }] : [] }),
      clientRpc: async () => { rpcCalls++; return { ok: true, value: true }; },
      recordClientAudit: async () => undefined,
    },
    "@/lib/clientRuntimePolicy": { clientCapabilityEnabled: () => true },
    "@/lib/clientRetention": { clientRetentionSecondsRemaining },
    "@/lib/clientStorage": {
      clientStorageConfig: () => ({ bucket: "fixture", namespace: "tenant-a" }),
      safeClientObjectKey: (key: string) => key.startsWith("tenant-a/"),
      clientGcpAccessToken: async () => { storageCalls++; return "token"; },
      clientStorageObjectMetadata: async () => { storageCalls++; return { size: 4, contentType: "text/plain" }; },
      deleteClientStorageObject: async () => { storageCalls++; return true; },
    },
  };
  try {
    const complete = loadReviewModule("src/app/api/client-runtime/artifacts/[id]/complete/route.ts", mocks);
    const remove = loadReviewModule("src/app/api/client-runtime/artifacts/[id]/route.ts", mocks);
    const params = { params: Promise.resolve({ id: uploadA }) };
    expect((await complete.POST(new Request("https://tenant.invalid/complete", { method: "POST" }), params)).status).toBe(404);
    expect((await remove.DELETE(new Request("https://tenant.invalid/artifact", { method: "DELETE" }), params)).status).toBe(404);
    expect(storageCalls).toBe(0);
    expect(rpcCalls).toBe(0);
    owner = userA;
    expect((await complete.POST(new Request("https://tenant.invalid/complete", { method: "POST" }), params)).status).toBe(200);
    expect(storageCalls).toBeGreaterThan(0);
    artifact = { ...artifact, retention_expires_at: new Date(Date.now() - 1_000).toISOString() };
    const before = storageCalls;
    expect((await complete.POST(new Request("https://tenant.invalid/complete", { method: "POST" }), params)).status).toBe(404);
    expect(storageCalls).toBe(before);
    artifact = { ...artifact, created_by: null, job_id: jobId, status: "ready" };
    owner = userB;
    expect((await remove.DELETE(new Request("https://tenant.invalid/artifact", { method: "DELETE" }), params)).status).toBe(404);
    expect(storageCalls).toBe(before);
    owner = userA;
    expect((await remove.DELETE(new Request("https://tenant.invalid/artifact", { method: "DELETE" }), params)).status).toBe(200);
    expect(storageCalls).toBeGreaterThan(before);
  } finally {
    process.env = originalEnv;
  }
});

test("Markdown import and Visual QA reject foreign or expired artifact inputs before writes", async () => {
  const originalEnv = { ...process.env };
  process.env.CLIENT_SLUG = "tenant-a";
  let actor = userB;
  let artifact: Record<string, unknown> = {
    id: uploadA, tenant_slug: "tenant-a", created_by: userA, status: "ready",
    original_name: "memo.md", content_type: "text/markdown", retention_expires_at: active(),
  };
  let writes = 0;
  const mocks = {
    "next/server": response,
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: actor }), currentClientMember: async () => true },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
      selectClientRecords: async (table: string) => ({ ok: true, records: table === "client_runtime_artifacts" ? [artifact] : [] }),
      insertClientRecord: async () => { writes++; return { ok: true }; },
      recordClientAudit: async () => undefined,
      enqueueClientRuntimeJob: async () => { writes++; return jobId; },
    },
    "@/lib/clientInputSafety": { containsClientSecretLike: () => false },
    "@/lib/clientRuntimePolicy": { clientCapabilityEnabled: () => true },
    "@/lib/clientRetention": { clientRetentionSecondsRemaining },
    "@/lib/clientStorage": { safeClientFileName: (name: string) => name },
    "@/lib/clientCloudRunJobs": { clientVisualQaJobConfigured: () => false },
    "@/lib/cloudTasks": { enqueueClientRuntimeTask: async () => ({ ok: true }) },
    "@/lib/clientVisualQaAdapter": { validateClientVisualQaInput: () => [] },
  };
  try {
    const memory = loadReviewModule("src/app/api/client-runtime/memory-import/route.ts", mocks);
    const visual = loadReviewModule("src/app/api/client-runtime/visual-qa/route.ts", mocks);
    const importPost = () => memory.POST(new Request("https://tenant.invalid/api/client-runtime/memory-import", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileName: "memo.md", content: "Customer note", artifactId: uploadA }),
    }));
    const visualPost = () => visual.POST(new Request("https://tenant.invalid/api/client-runtime/visual-qa", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ artifactId: uploadA }),
    }));
    expect((await importPost()).status).toBe(409);
    expect((await visualPost()).status).toBe(404);
    expect(writes).toBe(0);
    actor = userA;
    artifact = { ...artifact, retention_expires_at: new Date(Date.now() - 1_000).toISOString() };
    expect((await importPost()).status).toBe(409);
    expect((await visualPost()).status).toBe(404);
    expect(writes).toBe(0);
    artifact = { ...artifact, retention_expires_at: active() };
    expect((await importPost()).status).toBe(201);
    expect((await visualPost()).status).toBe(202);
    expect(writes).toBe(2);
  } finally {
    process.env = originalEnv;
  }
});
