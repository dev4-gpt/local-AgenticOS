import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { retentionDatabase } from "./helpers/client-record-retention-database";
import ts from "typescript";
import { eccLifecycleColumns } from "../scripts/lib/ecc-lifecycle.mjs";

const migration = "product-experience/supabase-client-lifecycle-restore.sql";
const recordId = "00000000-0000-4000-8000-000000000090";
const owner = "00000000-0000-4000-8000-000000000010";
const rpc = "select public.restore_client_lifecycle_metadata($1,$2::jsonb) as result";
const day = 86_400_000;

async function database() {
  const db = await retentionDatabase();
  await db.exec("alter table client_tenants add column created_at timestamptz default now(), add column updated_at timestamptz default now()");
  await db.exec(readFileSync(migration, "utf8"));
  await db.exec(readFileSync(migration, "utf8"));
  return db;
}

function batches(ageDays = 20): Array<{ table: string; rows: Record<string, unknown>[] }> {
  const created = new Date(Date.now() - ageDays * day).toISOString();
  return [
    { table: "client_tenants", rows: [{ slug: "restore-test", retention_days: 28, created_at: created, updated_at: created }] },
    { table: "client_runtime_records", rows: [{ id: recordId, tenant_slug: "restore-test", created_by: owner,
      kind: "memory", title: "Restored note", content: "Fixture only", created_at: created, updated_at: created }] },
  ];
}

test("ordinary inserts remain server-dated outside the protected restore transaction", async () => {
  const db = await retentionDatabase();
  try {
    const created = new Date(Date.now() - 20 * day).toISOString();
    await db.query("insert into client_runtime_records(id,tenant_slug,created_by,kind,created_at) values($1,'tenant-a',$2,'memory',$3)", [recordId, owner, created]);
    const row = (await db.query<{ created_at: Date }>("select created_at from client_runtime_records where id=$1", [recordId])).rows[0];
    expect(Date.now() - new Date(row.created_at).getTime()).toBeLessThan(60_000);
  } finally { await db.close(); }
});

test("protected restore preserves original clocks through actual retention triggers", async () => {
  const db = await database();
  try {
    const input = batches();
    await db.exec("set role service_role");
    const result = await db.query<{ result: { atomicMetadata: boolean; restoredRows: number } }>(rpc, ["restore-test", JSON.stringify(input)]);
    expect(result.rows[0].result).toMatchObject({ atomicMetadata: true, restoredRows: 2 });
    await db.exec("reset role");
    const row = (await db.query<{ created_at: Date; updated_at: Date }>("select created_at, updated_at from client_runtime_records where id=$1", [recordId])).rows[0];
    expect(new Date(row.created_at).toISOString()).toBe(input[1].rows[0].created_at);
    expect(new Date(row.updated_at).toISOString()).toBe(input[1].rows[0].updated_at);
    expect((await db.query<{ context: string }>("select current_setting('app.client_lifecycle_restore',true) as context")).rows[0].context).toBe("");
  } finally { await db.close(); }
});

test("a later typed insert failure rolls back the tenant and all earlier metadata", async () => {
  const db = await database();
  try {
    const input = batches();
    input[1].rows.push({ ...input[1].rows[0], id: "invalid-uuid" });
    await db.exec("set role service_role");
    await expect(db.query(rpc, ["restore-test", JSON.stringify(input)])).rejects.toThrow(/uuid/);
    await db.exec("reset role");
    expect((await db.query("select slug from client_tenants where slug='restore-test'")).rows).toHaveLength(0);
    expect((await db.query("select id from client_runtime_records where tenant_slug='restore-test'")).rows).toHaveLength(0);
  } finally { await db.close(); }
});

test("expired, future and missing-clock metadata cannot be reactivated", async () => {
  const db = await database();
  try {
    for (const age of [28, 29, 35, 36, -1]) {
      await db.exec("set role service_role");
      await expect(db.query(rpc, ["restore-test", JSON.stringify(batches(age))])).rejects.toThrow(/client_restore_(active_window_invalid|original_clock_required)/);
      await db.exec("reset role");
      expect((await db.query("select slug from client_tenants where slug='restore-test'")).rows).toHaveLength(0);
    }
    const input = batches();
    delete (input[1].rows[0] as Record<string, unknown>).created_at;
    await db.exec("set role service_role");
    await expect(db.query(rpc, ["restore-test", JSON.stringify(input)])).rejects.toThrow(/original_clock_required/);
  } finally { await db.close(); }
});

test("members cannot call restore or forge the protected clock context", async () => {
  const db = await database();
  try {
    await db.exec("set role authenticated");
    await expect(db.query(rpc, ["restore-test", JSON.stringify(batches())])).rejects.toThrow(/permission denied/);
    const created = new Date(Date.now() - 20 * day).toISOString();
    await db.query("select set_config('app.client_lifecycle_restore',$1,false)", [JSON.stringify({ table: "client_runtime_records", tenant: "tenant-a", id: recordId, clocks: { created_at: created } })]);
    await db.query("insert into client_runtime_records(id,tenant_slug,kind,created_at) values($1,'tenant-a','memory',$2)", [recordId, created]);
    const row = (await db.query<{ created_at: Date }>("select created_at from client_runtime_records where id=$1", [recordId])).rows[0];
    expect(Date.now() - new Date(row.created_at).getTime()).toBeLessThan(60_000);
    await db.exec("reset role");
    await expect(db.query(rpc, ["restore-test", JSON.stringify(batches())])).rejects.toThrow(/service_role_required/);
  } finally { await db.close(); }
});

test("restore rejects cross-tenant rows, unknown columns and out-of-order tables atomically", async () => {
  const db = await database();
  try {
    const crossTenant = batches();
    crossTenant[1].rows[0].tenant_slug = "tenant-b";
    const secretColumn = batches();
    Object.assign(secretColumn[1].rows[0], { worker_token_hash: "not-allowed" });
    for (const input of [crossTenant, secretColumn, batches().reverse(), []]) {
      await db.exec("set role service_role");
      await expect(db.query(rpc, ["restore-test", JSON.stringify(input)])).rejects.toThrow(/client_restore_/);
      await db.exec("reset role");
      expect((await db.query("select slug from client_tenants where slug='restore-test'")).rows).toHaveLength(0);
    }
  } finally { await db.close(); }
});

test("database restore columns match all 55 CLI export projections", async () => {
  const db = await database();
  try {
    const ast = ts.createSourceFile("lifecycle.mjs", readFileSync("scripts/client-lifecycle.mjs", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const declaration = ast.statements.filter(ts.isVariableStatement).flatMap((node) => [...node.declarationList.declarations])
      .find((node) => node.name.getText(ast) === "exportColumns");
    const initializer = declaration!.initializer as ts.CallExpression;
    const object = initializer.arguments[0] as ts.ObjectLiteralExpression;
    const columns = Object.fromEntries(object.properties.flatMap((property) => {
      if (ts.isSpreadAssignment(property)) return Object.entries(eccLifecycleColumns);
      const assignment = property as ts.PropertyAssignment;
      return [[assignment.name.getText(ast), (assignment.initializer as ts.StringLiteral).text]];
    }));
    await db.exec("set role service_role");
    const stored = (await db.query<{ columns: Record<string, string> }>("select client_lifecycle_restore_columns() as columns")).rows[0].columns;
    expect(Object.keys(stored)).toHaveLength(55);
    expect(stored).toEqual(columns);
  } finally { await db.close(); }
});

test("a repeated restore does not overwrite existing tenant records", async () => {
  const db = await database();
  try {
    const input = batches();
    await db.exec("set role service_role");
    await db.query(rpc, ["restore-test", JSON.stringify(input)]);
    input[1].rows[0].title = "Must not overwrite";
    await expect(db.query(rpc, ["restore-test", JSON.stringify(input)])).rejects.toThrow(/duplicate key/);
    await db.exec("reset role");
    const rows = (await db.query<{ title: string }>("select title from client_runtime_records where tenant_slug='restore-test'")).rows;
    expect(rows).toEqual([{ title: "Restored note" }]);
  } finally { await db.close(); }
});

test("501 rows cross transport batches inside one atomic database restore", async () => {
  const db = await database();
  try {
    const input = batches();
    const rows = Array.from({ length: 501 }, (_, index) => ({ ...input[1].rows[0],
      id: `00000000-0000-4000-8000-${String(index + 1000).padStart(12, "0")}` }));
    input[1].rows = rows.slice(0, 500);
    input.push({ table: "client_runtime_records", rows: rows.slice(500) });
    await db.exec("set role service_role");
    const result = (await db.query<{ result: { restoredRows: number } }>(rpc, ["restore-test", JSON.stringify(input)])).rows[0].result;
    expect(result.restoredRows).toBe(502);
    await db.exec("reset role");
    expect((await db.query("select id from client_runtime_records where tenant_slug='restore-test'")).rows).toHaveLength(501);
  } finally { await db.close(); }
});

test("a later trigger changing restored clocks aborts the transaction", async () => {
  const db = await database();
  try {
    await db.exec(`create function change_restored_clock() returns trigger language plpgsql as $$
      begin new.created_at := now(); return new; end $$;
      create trigger zzzzz_changed_clock before insert on client_runtime_records for each row execute function change_restored_clock()`);
    await db.exec("set role service_role");
    await expect(db.query(rpc, ["restore-test", JSON.stringify(batches())])).rejects.toThrow(/client_restore_clock_changed/);
    await db.exec("reset role");
    expect((await db.query("select slug from client_tenants where slug='restore-test'")).rows).toHaveLength(0);
  } finally { await db.close(); }
});

test("restore preserves clocks under the actual Pipeline and Notebook source guards", async () => {
  const db = await database();
  try {
    await db.exec(`
      create function auth.role() returns text language sql as $$ select current_setting('role', true) $$;
      create table client_pipeline_items(id uuid primary key, tenant_slug text references client_tenants(slug), created_by uuid,
        slug text, title text, idea text, build_artifact_id uuid, execution_job_id uuid,
        created_at timestamptz not null, updated_at timestamptz not null);
      create table client_notebook_sources(id uuid primary key, tenant_slug text references client_tenants(slug), created_by uuid,
        created_at timestamptz not null, updated_at timestamptz, retention_expires_at timestamptz, status text);
      create table client_notebook_chunks(id uuid primary key, tenant_slug text, source_id uuid, created_at timestamptz);
    `);
    await db.exec(readFileSync("product-experience/supabase-client-pipeline-retention-28.sql", "utf8"));
    await db.exec(readFileSync("product-experience/supabase-client-notebook-source-retention.sql", "utf8"));
    await db.exec(readFileSync(migration, "utf8"));
    const input = batches();
    const created = String(input[0].rows[0].created_at);
    const expires = new Date(Date.parse(created) + 28 * day).toISOString();
    input.splice(1, 0, { table: "client_notebook_sources", rows: [{ id: recordId, tenant_slug: "restore-test", created_by: owner,
      status: "registered", created_at: created, updated_at: created, retention_expires_at: expires }] });
    input.push({ table: "client_pipeline_items", rows: [{ id: recordId, tenant_slug: "restore-test", created_by: owner,
      slug: "restored", title: "Restored", idea: "Fixture", created_at: created, updated_at: created, retention_expires_at: expires }] });
    await db.exec("set role service_role");
    await db.query(rpc, ["restore-test", JSON.stringify(input)]);
    await db.exec("reset role");
    for (const table of ["client_notebook_sources", "client_pipeline_items"]) {
      const row = (await db.query<{ created_at: Date; retention_expires_at: Date }>(`select created_at,retention_expires_at from ${table} where tenant_slug='restore-test'`)).rows[0];
      expect(new Date(row.created_at).toISOString()).toBe(created);
      expect(new Date(row.retention_expires_at).toISOString()).toBe(expires);
    }
  } finally { await db.close(); }
});

test("ordinary restore rejects an ECC revision past its own expires_at deadline", async () => {
  const db = await database();
  try {
    await db.exec(`create table client_ecc_skill_revisions(id uuid primary key, tenant_slug text references client_tenants(slug),
      created_at timestamptz not null, expires_at timestamptz, revoked_at timestamptz)`);
    await db.exec(readFileSync(migration, "utf8"));
    const input = batches();
    input.push({ table: "client_ecc_skill_revisions", rows: [{ id: recordId, tenant_slug: "restore-test",
      created_at: input[0].rows[0].created_at, expires_at: new Date(Date.now() - 8 * day).toISOString(), revoked_at: new Date().toISOString() }] });
    await db.exec("set role service_role");
    await expect(db.query(rpc, ["restore-test", JSON.stringify(input)])).rejects.toThrow(/active_window_invalid/);
    await db.exec("reset role");
    expect((await db.query("select slug from client_tenants where slug='restore-test'")).rows).toHaveLength(0);
  } finally { await db.close(); }
});

test("ECC revision restore requires a bounded future expiry and revoked evidence", async () => {
  const db = await database();
  try {
    await db.exec(`create table client_ecc_skill_revisions(id uuid primary key, tenant_slug text references client_tenants(slug),
      created_at timestamptz not null, expires_at timestamptz, revoked_at timestamptz)`);
    await db.exec(readFileSync(migration, "utf8"));
    const input = batches();
    const created = String(input[0].rows[0].created_at);
    const row = { id: recordId, tenant_slug: "restore-test", created_at: created,
      expires_at: new Date(Date.parse(created) + 28 * day).toISOString(), revoked_at: new Date().toISOString() };
    input.push({ table: "client_ecc_skill_revisions", rows: [row] });
    for (const patch of [{ expires_at: null }, { expires_at: new Date(Date.now() + 29 * day).toISOString() }, { revoked_at: null }]) {
      input.at(-1)!.rows[0] = { ...row, ...patch };
      await db.exec("set role service_role");
      await expect(db.query(rpc, ["restore-test", JSON.stringify(input)])).rejects.toThrow(/client_restore_(active_window_invalid|learning_requires_review)/);
      await db.exec("reset role");
      expect((await db.query("select slug from client_tenants where slug='restore-test'")).rows).toHaveLength(0);
    }
    input.at(-1)!.rows[0] = row;
    await db.exec("set role service_role");
    await db.query(rpc, ["restore-test", JSON.stringify(input)]);
    await db.exec("reset role");
    const stored = (await db.query<{ expires_at: Date; revoked_at: Date }>("select expires_at,revoked_at from client_ecc_skill_revisions")).rows[0];
    expect(new Date(stored.expires_at).toISOString()).toBe(row.expires_at);
    expect(new Date(stored.revoked_at).toISOString()).toBe(row.revoked_at);
  } finally { await db.close(); }
});

test("learning items cannot restore a previous approval", async () => {
  const db = await database();
  try {
    await db.exec(`create table client_learning_items(id uuid primary key, tenant_slug text references client_tenants(slug),
      created_at timestamptz not null, retention_expires_at timestamptz, status text,
      approved_hash text, reviewed_by uuid, reviewed_at timestamptz, revoked_at timestamptz)`);
    await db.exec(readFileSync(migration, "utf8"));
    const input = batches();
    const row = { id: recordId, tenant_slug: "restore-test", created_at: input[0].rows[0].created_at,
      retention_expires_at: new Date(Date.parse(String(input[0].rows[0].created_at)) + 28 * day).toISOString(),
      status: "proposed", approved_hash: null, reviewed_by: null, reviewed_at: null, revoked_at: null };
    input.push({ table: "client_learning_items", rows: [row] });
    for (const patch of [{ status: "approved" }, { approved_hash: "old-approval" }, { reviewed_by: owner }]) {
      input.at(-1)!.rows[0] = { ...row, ...patch };
      await db.exec("set role service_role");
      await expect(db.query(rpc, ["restore-test", JSON.stringify(input)])).rejects.toThrow(/learning_requires_review/);
      await db.exec("reset role");
    }
    input.at(-1)!.rows[0] = row;
    await db.exec("set role service_role");
    await db.query(rpc, ["restore-test", JSON.stringify(input)]);
  } finally { await db.close(); }
});
