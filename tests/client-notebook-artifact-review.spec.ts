import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { artifactContentSha256, notebookArtifactReleased, readArtifactReviewBytes } from "../src/lib/clientArtifactReview";

const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const job = "00000000-0000-4000-8000-000000000003";
const artifact = "00000000-0000-4000-8000-000000000004";

test("review migration persists owner decisions, denies foreign/expired/stale metadata, and grants only the member RPC", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      insert into auth.users values ('${owner}'), ('${other}');
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      create table client_memberships(tenant_slug text, user_id uuid, status text);
      insert into client_memberships values ('tenant-a','${owner}','active'),('tenant-a','${other}','active');
      create function client_member(tenant text) returns boolean language sql as $$
        select exists(select 1 from client_memberships where tenant_slug=tenant and user_id=auth.uid() and status='active')
      $$;
      create table client_runtime_jobs(id uuid primary key, tenant_slug text, requested_by uuid, capability text, input_metadata jsonb, status text, error_code text, output_metadata jsonb);
      insert into client_runtime_jobs values ('${job}','tenant-a','${owner}','workspace-execution','{"surface":"notebook"}','succeeded',null,'{"artifactId":"${artifact}","citationAudit":{"ok":true}}');
      create table client_runtime_artifacts(id uuid primary key, tenant_slug text, job_id uuid, object_key text, byte_size bigint, content_type text, status text, retention_expires_at timestamptz);
      insert into client_runtime_artifacts values ('${artifact}','tenant-a','${job}','tenant-a/draft.md',5,'text/markdown','ready',now()+interval '28 days');
    `);
    const migration = readFileSync("product-experience/supabase-client-notebook-artifact-review.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);
    const signature = "public.review_client_notebook_artifact(text,uuid,text,bigint,text,text,text)";
    expect((await db.query<{ allowed: boolean }>(`select has_function_privilege('anon','${signature}','EXECUTE') as allowed`)).rows[0].allowed).toBe(false);
    expect((await db.query<{ allowed: boolean }>(`select has_table_privilege('authenticated','client_runtime_artifacts','UPDATE') as allowed`)).rows[0].allowed).toBe(false);
    const decide = async (actor: string, { tenant = "tenant-a", key = "tenant-a/draft.md", bytes = 5, type = "text/markdown", hash = "a".repeat(64), decision = "approved" } = {}) => {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
      await db.exec("set role authenticated");
      try {
        return (await db.query<{ allowed: boolean }>("select review_client_notebook_artifact($1,$2,$3,$4,$5,$6,$7) as allowed", [tenant, artifact, key, bytes, type, hash, decision])).rows[0].allowed;
      } finally { await db.exec("reset role"); }
    };
    expect(await decide(other)).toBe(false);
    expect(await decide("")).toBe(false);
    expect(await decide(owner, { tenant: "tenant-b" })).toBe(false);
    expect(await decide(owner, { key: "tenant-a/replaced.md" })).toBe(false);
    expect(await decide(owner, { bytes: 6 })).toBe(false);
    expect(await decide(owner, { type: "text/plain" })).toBe(false);
    expect(await decide(owner, { hash: "invalid" })).toBe(false);
    expect(await decide(owner, { decision: "unknown" })).toBe(false);
    for (const status of ["queued", "running", "failed", "cancelled"]) {
      await db.query("update client_runtime_jobs set status=$1", [status]);
      expect(await decide(owner), `deny ${status} even when stored bytes are ready`).toBe(false);
    }
    await db.exec("update client_runtime_jobs set status='succeeded',error_code='budget_settlement_failed'");
    expect(await decide(owner)).toBe(false);
    await db.exec("update client_runtime_jobs set error_code=null");
    for (const output of [null, {}, { artifactId: other, citationAudit: { ok: true } }, { artifactId: artifact, citationAudit: { ok: false } }, { artifactId: artifact, citationAudit: { ok: "true" } }, { artifactId: artifact, citationAudit: { ok: true }, failureDisposition: "blocked" }]) {
      await db.query("update client_runtime_jobs set output_metadata=$1::jsonb", [JSON.stringify(output)]);
      expect(await decide(owner)).toBe(false);
    }
    await db.query("update client_runtime_jobs set output_metadata=$1::jsonb", [JSON.stringify({ artifactId: artifact, citationAudit: { ok: true } })]);
    expect(await decide(owner)).toBe(true);
    expect((await db.query("select review_decision,review_sha256,reviewed_by,reviewed_at is not null as dated from client_runtime_artifacts")).rows[0]).toEqual({ review_decision: "approved", review_sha256: "a".repeat(64), reviewed_by: owner, dated: true });
    expect(await decide(owner, { decision: "rejected" })).toBe(true);
    expect((await db.query("select review_decision from client_runtime_artifacts")).rows[0]).toEqual({ review_decision: "rejected" });
    await db.exec("update client_runtime_artifacts set retention_expires_at=now()-interval '1 second'");
    expect(await decide(owner)).toBe(false);
    await db.exec("update client_runtime_artifacts set retention_expires_at=now()+interval '1 day', status='pending'");
    expect(await decide(owner)).toBe(false);
    await db.exec("update client_runtime_artifacts set status='ready'; update client_runtime_jobs set input_metadata='{}'");
    expect(await decide(owner)).toBe(false);
    await db.exec(`update client_runtime_jobs set input_metadata='{"surface":"notebook"}'; update client_memberships set status='inactive' where user_id='${owner}'`);
    expect(await decide(owner)).toBe(false);
    await expect(db.exec("update client_runtime_artifacts set review_sha256=null")).rejects.toThrow(/client_artifact_review_valid/);
  } finally { await db.close(); }
});

test("Notebook publication requires durable success, matching artifact identity and a passing citation audit", () => {
  const completed = { capability: "workspace-execution", input_metadata: { surface: "notebook" }, status: "succeeded", error_code: null, output_metadata: { artifactId: artifact, citationAudit: { ok: true } } };
  expect(notebookArtifactReleased(completed, artifact)).toBe(true);
  for (const changes of [{ status: "running" }, { status: "failed" }, { error_code: "budget_settlement_failed" }, { output_metadata: null }, { output_metadata: { artifactId: other, citationAudit: { ok: true } } }, { output_metadata: { artifactId: artifact, citationAudit: { ok: "true" } } }, { output_metadata: { ...completed.output_metadata, failureDisposition: "blocked" } }]) {
    expect(notebookArtifactReleased({ ...completed, ...changes }, artifact)).toBe(false);
  }
});

test("review byte reader rejects truncated, oversized, and failed streams before returning bytes", async () => {
  const stream = (value: string) => new Response(value).body!;
  expect(artifactContentSha256((await readArtifactReviewBytes(stream("draft"), 5))!)).toMatch(/^[a-f0-9]{64}$/);
  expect(await readArtifactReviewBytes(stream("draft"), 6)).toBeNull();
  expect(await readArtifactReviewBytes(stream("draft"), 4)).toBeNull();
  expect(await readArtifactReviewBytes(stream("draft"), 200001)).toBeNull();
  expect(await readArtifactReviewBytes(new ReadableStream({ start(controller) { controller.error(new Error("storage interrupted")); } }), 5)).toBeNull();
});
