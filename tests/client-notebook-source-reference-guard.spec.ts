import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { loadReviewModule } from "./helpers/load-review-module";
import { clientRetentionSecondsRemaining } from "../src/lib/clientRetention";

const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
const notebookA = "00000000-0000-4000-8000-000000000011";
const notebookB = "00000000-0000-4000-8000-000000000012";
const artifactA = "00000000-0000-4000-8000-000000000021";
const artifactB = "00000000-0000-4000-8000-000000000022";
const artifactExpired = "00000000-0000-4000-8000-000000000023";
const workerArtifact = "00000000-0000-4000-8000-000000000024";
const artifactTenantB = "00000000-0000-4000-8000-000000000025";
const jobA = "00000000-0000-4000-8000-000000000031";

test("notebook source insert policy rejects cross-tenant, foreign, expired, and overlong artifact references", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table client_memberships(tenant_slug text, user_id uuid, status text);
      create function client_member(p_tenant_slug text) returns boolean language sql as $$
        select exists(select 1 from client_memberships where tenant_slug=p_tenant_slug and user_id=auth.uid() and status='active')
      $$;
      create table client_notebooks(id uuid primary key, tenant_slug text);
      create table client_runtime_jobs(id uuid primary key, tenant_slug text, requested_by uuid);
      create table client_runtime_artifacts(id uuid primary key, tenant_slug text, created_by uuid, job_id uuid, status text, retention_expires_at timestamptz);
      create table client_notebook_sources(id uuid primary key, tenant_slug text, created_by uuid, notebook_id uuid, artifact_id uuid, retention_expires_at timestamptz);
      alter table client_notebook_sources enable row level security;
      create policy client_notebook_sources_member_select on client_notebook_sources for select to authenticated using (client_member(tenant_slug));
      grant usage on schema public, auth to authenticated;
      grant select, insert, update on client_notebook_sources to authenticated;
      grant select on client_memberships to authenticated;
      grant execute on function auth.uid() to authenticated;
      grant execute on function client_member(text) to authenticated;
      insert into client_memberships values ('tenant-a','${userA}','active'),('tenant-a','${userB}','active');
      insert into client_notebooks values ('${notebookA}','tenant-a'),('${notebookB}','tenant-b');
      insert into client_runtime_jobs values ('${jobA}','tenant-a','${userA}');
      insert into client_runtime_artifacts values
        ('${artifactA}','tenant-a','${userA}',null,'ready',now()+interval '1 day'),
        ('${artifactB}','tenant-a','${userB}',null,'ready',now()+interval '1 day'),
        ('${artifactExpired}','tenant-a','${userA}',null,'ready',now()-interval '1 day'),
        ('${workerArtifact}','tenant-a',null,'${jobA}','ready',now()+interval '1 day'),
        ('${artifactTenantB}','tenant-b','${userA}',null,'ready',now()+interval '1 day');
    `);
    const sql = readFileSync("product-experience/supabase-client-notebook-source-reference-guard.sql", "utf8");
    await db.exec(sql);
    await db.exec(sql);
    expect((await db.query<{ allowed: boolean }>("select has_function_privilege('anon','public.client_notebook_source_reference_allowed(text,uuid,uuid,timestamptz)','EXECUTE') as allowed")).rows[0].allowed).toBe(false);
    await db.exec(`select set_config('request.jwt.claim.sub','${userA}',false); set role authenticated;`);
    const allowed = async (notebook: string | null, artifact: string | null, expiry: string) => (await db.query<{ allowed: boolean }>(
      "select client_notebook_source_reference_allowed('tenant-a',$1::uuid,$2::uuid,now()+($3::text || ' seconds')::interval) as allowed",
      [notebook, artifact, expiry],
    )).rows[0].allowed;
    expect(await allowed(notebookA, artifactA, "3600")).toBe(true);
    expect(await allowed(notebookB, artifactA, "3600")).toBe(false);
    expect(await allowed(notebookA, artifactB, "3600")).toBe(false);
    expect(await allowed(notebookA, artifactTenantB, "3600")).toBe(false);
    expect(await allowed(notebookA, artifactExpired, "3600")).toBe(false);
    expect(await allowed(notebookA, artifactA, "172800")).toBe(false);
    expect(await allowed(notebookA, workerArtifact, "3600")).toBe(true);
    await db.query("insert into client_notebook_sources values (gen_random_uuid(),'tenant-a',$1,$2,$3,now()+interval '1 hour')", [userA, notebookA, artifactA]);
    await expect(db.query("insert into client_notebook_sources values (gen_random_uuid(),'tenant-a',$1,$2,$3,now()+interval '1 hour')", [userA, notebookA, artifactB])).rejects.toThrow();
    await expect(db.query("update client_notebook_sources set artifact_id=$1 where tenant_slug='tenant-a'", [artifactB])).rejects.toThrow();
    expect((await db.query("select count(*)::int as count from client_notebook_sources")).rows[0]).toEqual({ count: 1 });
  } finally {
    await db.close();
  }
});

test("Notebook registration checks artifact and notebook ownership before writing", async () => {
  const originalEnv = { ...process.env };
  Object.assign(process.env, { CLIENT_SLUG: "tenant-a", CLIENT_RETENTION_DAYS: "45" });
  let actor = userB;
  let artifact: Record<string, unknown> = { id: artifactA, tenant_slug: "tenant-a", created_by: userA, status: "ready", retention_expires_at: new Date(Date.now() + 60_000).toISOString() };
  let notebook: Record<string, unknown> = { id: notebookA, tenant_slug: "tenant-a" };
  const stored: Record<string, unknown>[] = [];
  const mocks = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: actor }), currentClientMember: async () => true },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
      selectClientRecords: async (table: string, filters: Record<string, string>) => ({ ok: true, records: table === "client_notebooks" ? [notebook] : table === "client_runtime_artifacts" ? [artifact] : table === "client_runtime_jobs" && filters.requested_by === `eq.${userA}` ? [{ id: jobA, tenant_slug: "tenant-a", requested_by: userA }] : [] }),
      insertClientRecord: async (_table: string, row: Record<string, unknown>) => { stored.push(row); return { ok: true }; },
      recordClientAudit: async () => undefined,
    },
    "@/lib/clientInputSafety": { containsClientSecretLike: () => false },
    "@/lib/clientRuntimePolicy": { clientCapabilityEnabled: () => true },
    "@/lib/clientRetention": { clientRetentionExpiresAt: () => new Date(Date.now() + 45 * 86400_000).toISOString(), clientRetentionSecondsRemaining },
    "@/lib/v96NotebookContracts": { validateNotebookSource: () => [], validateNotebookDeletionRequest: () => [] },
  };
  try {
    const route = loadReviewModule("src/app/api/client-runtime/notebook-sources/route.ts", mocks);
    const post = () => route.POST(new Request("https://tenant.invalid/api/client-runtime/notebook-sources", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "pdf", title: "Study", notebookId: notebookA, artifactId: artifactA }),
    }));
    expect((await post()).status).toBe(404);
    expect(stored).toHaveLength(0);
    actor = userA;
    artifact = { ...artifact, retention_expires_at: new Date(Date.now() - 1000).toISOString() };
    expect((await post()).status).toBe(404);
    notebook = { ...notebook, tenant_slug: "tenant-b" };
    expect((await post()).status).toBe(404);
    notebook = { ...notebook, tenant_slug: "tenant-a" };
    artifact = { ...artifact, tenant_slug: "tenant-b", retention_expires_at: new Date(Date.now() + 60_000).toISOString() };
    expect((await post()).status).toBe(404);
    artifact = { ...artifact, tenant_slug: "tenant-a" };
    expect((await post()).status).toBe(201);
    expect(stored).toHaveLength(1);
    expect(stored[0].retention_expires_at).toBe(artifact.retention_expires_at);
    artifact = { ...artifact, created_by: null, job_id: jobA };
    expect((await post()).status).toBe(201);
    expect(stored).toHaveLength(2);
  } finally {
    process.env = originalEnv;
  }
});
