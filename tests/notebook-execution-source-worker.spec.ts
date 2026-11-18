import { expect, test } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";

const tenantId = "tenant-a";
const workerToken = "notebook-execution-worker-token-2026";
const notebookId = "00000000-0000-4000-8000-000000000001";
const sourceId = "00000000-0000-4000-8000-000000000002";
const expiredSourceId = "00000000-0000-4000-8000-000000000003";
const jobId = "00000000-0000-4000-8000-000000000004";
const queuedJobId = "00000000-0000-4000-8000-000000000005";

async function fixture() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema extensions; create extension pgcrypto with schema extensions;
    create table public.client_tenants (slug text primary key, status text, retention_days integer, worker_token_hash text);
    create table public.client_notebooks (id uuid primary key, tenant_slug text, status text);
    create table public.client_runtime_jobs (id uuid primary key, tenant_slug text, capability text, status text, input_metadata jsonb);
    create table public.client_runtime_records (
      id uuid primary key, tenant_slug text, kind text, status text, notebook_id uuid,
      title text, content text, metadata jsonb, created_at timestamptz
    );
    insert into public.client_tenants values
      ('tenant-a', 'active', 28, encode(extensions.digest('${workerToken}', 'sha256'), 'hex')),
      ('tenant-b', 'active', 28, encode(extensions.digest('second-notebook-worker-token-2026', 'sha256'), 'hex'));
    insert into public.client_notebooks values ('${notebookId}', 'tenant-a', 'active');
    insert into public.client_runtime_records values
      ('${sourceId}', 'tenant-a', 'notebook', 'active', '${notebookId}', 'Current source', 'Approved client evidence', '{"source_url":"https://example.org/source"}', now()),
      ('${expiredSourceId}', 'tenant-a', 'notebook', 'active', '${notebookId}', 'Expired source', 'Old evidence', '{}', now() - interval '29 days');
    insert into public.client_runtime_jobs values
      ('${jobId}', 'tenant-a', 'workspace-execution', 'running', jsonb_build_object(
        'surface', 'notebook', 'notebookScope', '${notebookId}', 'sourceIds', jsonb_build_array('${sourceId}'),
        'sourceReferences', jsonb_build_array(jsonb_build_object('id', '${sourceId}', 'contentSha256', repeat('a', 64)))
      )),
      ('${queuedJobId}', 'tenant-a', 'workspace-execution', 'queued', jsonb_build_object(
        'surface', 'notebook', 'notebookScope', '${notebookId}', 'sourceIds', jsonb_build_array('${sourceId}'),
        'sourceReferences', jsonb_build_array(jsonb_build_object('id', '${sourceId}', 'contentSha256', repeat('a', 64)))
      ));
  `);
  await db.exec(readFileSync("product-experience/supabase-client-notebook-execution-sources.sql", "utf8"));
  return db;
}

test("worker source RPC returns only active, unexpired sources for a running tenant job", async () => {
  const db = await fixture();
  try {
    const result = await db.query<{ load_client_notebook_execution_sources_worker: { sources: Array<Record<string, unknown>> } }>(
      "select public.load_client_notebook_execution_sources_worker($1, $2, $3)", [tenantId, jobId, workerToken],
    );
    expect(result.rows[0].load_client_notebook_execution_sources_worker.sources).toEqual([{
      id: sourceId,
      title: "Current source",
      content: "Approved client evidence",
      metadata: { source_url: "https://example.org/source" },
      createdAt: expect.any(String),
      notebookId,
    }]);
  } finally {
    await db.close();
  }
});

test("worker source RPC fails closed for wrong token, unclaimed jobs, stale sources, and cross-notebook scope", async () => {
  const db = await fixture();
  try {
    const call = (tenant: string, job: string, token: string) => db.query<{ value: unknown }>(
      "select public.load_client_notebook_execution_sources_worker($1, $2, $3) as value", [tenant, job, token],
    );
    expect((await call(tenantId, jobId, "wrong-worker-token-that-is-long-enough")).rows[0].value).toBeNull();
    expect((await call(tenantId, queuedJobId, workerToken)).rows[0].value).toBeNull();
    await db.exec(`update public.client_runtime_jobs set input_metadata = jsonb_set(input_metadata, '{sourceIds}', '["${expiredSourceId}"]'::jsonb) where id='${jobId}'`);
    await db.exec(`update public.client_runtime_jobs set input_metadata = jsonb_set(input_metadata, '{sourceReferences}', '[{"id":"${expiredSourceId}","contentSha256":"${"a".repeat(64)}"}]'::jsonb) where id='${jobId}'`);
    expect((await call(tenantId, jobId, workerToken)).rows[0].value).toBeNull();
    await db.exec(`update public.client_runtime_jobs set input_metadata = jsonb_set(jsonb_set(input_metadata, '{sourceIds}', '["${sourceId}"]'::jsonb), '{notebookScope}', '"00000000-0000-4000-8000-000000000099"'::jsonb) where id='${jobId}'`);
    await db.exec(`update public.client_runtime_jobs set input_metadata = jsonb_set(input_metadata, '{sourceReferences}', '[{"id":"${sourceId}","contentSha256":"${"a".repeat(64)}"}]'::jsonb) where id='${jobId}'`);
    expect((await call(tenantId, jobId, workerToken)).rows[0].value).toBeNull();
  } finally {
    await db.close();
  }
});

test("only the service role can call the worker source RPC", async () => {
  const db = await fixture();
  try {
    const result = await db.query<{ authenticated_can_execute: boolean; service_can_execute: boolean }>(`
      select has_function_privilege('authenticated', 'public.load_client_notebook_execution_sources_worker(text,uuid,text)', 'EXECUTE') as authenticated_can_execute,
        has_function_privilege('service_role', 'public.load_client_notebook_execution_sources_worker(text,uuid,text)', 'EXECUTE') as service_can_execute
    `);
    expect(result.rows[0]).toEqual({ authenticated_can_execute: false, service_can_execute: true });
    await db.exec("set role authenticated");
    await expect(db.query("select public.load_client_notebook_execution_sources_worker($1,$2,$3)", [tenantId, jobId, workerToken]))
      .rejects.toThrow(/permission denied/);
  } finally {
    await db.close();
  }
});
