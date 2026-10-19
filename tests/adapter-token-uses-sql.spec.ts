import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// Real PostgreSQL (PGlite) tests for product-experience/supabase-client-adapter-token-uses.sql.
// All users, tenants and tokens are created inside each test; nothing real is used.
const HOST_SQL = readFileSync("product-experience/supabase-client-adapter-host.sql", "utf8");
const TOKEN_SQL = readFileSync("product-experience/supabase-client-adapter-token-uses.sql", "utf8");
const OWNER = "00000000-0000-4000-8000-0000000000a1";
const MEMBER = "00000000-0000-4000-8000-0000000000a3";
const WORKER = "test-worker-token-aaaaaaaaaaaaaaaaaaaa";
const JTI1 = "00000000-0000-4000-8000-000000000001";
const JTI2 = "00000000-0000-4000-8000-000000000002";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

async function freshDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create schema extensions; create extension pgcrypto with schema extensions;
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table auth.users(id uuid primary key);
    create table public.client_tenants(slug text primary key, status text not null default 'active', worker_token_hash text);
    create table public.client_memberships(
      tenant_slug text not null references public.client_tenants(slug) on delete cascade,
      user_id uuid not null references auth.users(id), role text not null, status text not null default 'active',
      primary key (tenant_slug, user_id));
    create function public.client_member(p_tenant_slug text) returns boolean language sql stable security definer set search_path = public as $$
      select exists (select 1 from public.client_memberships where tenant_slug = p_tenant_slug and user_id = auth.uid() and status = 'active') $$;
    grant usage on schema public, auth, extensions to anon, authenticated, service_role;
    grant execute on function public.client_member(text) to authenticated;
    insert into auth.users values ('${OWNER}'), ('${MEMBER}');
    insert into public.client_tenants(slug, worker_token_hash) values ('tenant-a', '${sha(WORKER)}'), ('tenant-b', '${sha(WORKER)}');
    insert into public.client_memberships values ('tenant-a', '${OWNER}', 'owner', 'active'), ('tenant-a', '${MEMBER}', 'member', 'active');
  `);
  await db.exec(HOST_SQL);
  await db.exec(TOKEN_SQL);
  await db.exec(TOKEN_SQL); // safe to repeat
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [OWNER]);
  await db.exec("set role authenticated");
  await db.query(
    "insert into public.client_adapter_registry (tenant_slug, adapter_id, display_name, contract_version, manifest_sha256) values ('tenant-a','forge','Forge','h1',$1)",
    ["a".repeat(64)],
  );
  await db.exec("reset role");
  return db;
}

const consume = async (db: PGlite, o: { tenant?: string; token?: string; adapter?: string; jti?: string; seconds?: number } = {}) => {
  await db.exec("reset role; set role anon");
  const r = await db.query<{ ok: boolean }>(
    "select public.client_adapter_consume_token($1,$2,$3,$4, now() + make_interval(secs => $5)) as ok",
    [o.tenant ?? "tenant-a", o.token ?? WORKER, o.adapter ?? "forge", o.jti ?? JTI1, o.seconds ?? 60],
  );
  return r.rows[0].ok;
};

test("a token id can be consumed once; a replay is refused", async () => {
  const db = await freshDb();
  try {
    expect(await consume(db)).toBe(true);
    expect(await consume(db)).toBe(false);
    expect(await consume(db, { jti: JTI2 })).toBe(true);
  } finally {
    await db.close();
  }
});

test("wrong worker token, wrong tenant, unknown adapter and bad expiry are all refused", async () => {
  const db = await freshDb();
  try {
    expect(await consume(db, { token: "wrong-token-wrong-token-wrong-token" })).toBe(false);
    expect(await consume(db, { token: "short" })).toBe(false);
    expect(await consume(db, { tenant: "tenant-b" })).toBe(false); // adapter not registered there
    expect(await consume(db, { adapter: "knowledge" })).toBe(false);
    expect(await consume(db, { seconds: -5 })).toBe(false);
    expect(await consume(db, { seconds: 3600 })).toBe(false);
    await db.exec("reset role");
    expect((await db.query("select count(*)::int as n from public.client_adapter_token_uses")).rows[0]).toEqual({ n: 0 });
  } finally {
    await db.close();
  }
});

test("members and anonymous callers cannot read, write or consume directly", async () => {
  const db = await freshDb();
  try {
    expect(await consume(db)).toBe(true);
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [OWNER]);
    await db.exec("set role authenticated");
    await expect(db.query("select * from public.client_adapter_token_uses")).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.client_adapter_consume_token('tenant-a',$1,'forge',gen_random_uuid(), now() + interval '1 minute')", [WORKER])).rejects.toThrow(/permission denied/);
    await db.exec("reset role; set role anon");
    await expect(db.query("select * from public.client_adapter_token_uses")).rejects.toThrow(/permission denied/);
    await expect(db.query("insert into public.client_adapter_token_uses (tenant_slug, jti, adapter_id, expires_at) values ('tenant-a', gen_random_uuid(), 'forge', now())")).rejects.toThrow(/permission denied/);
  } finally {
    await db.close();
  }
});

test("only the service role can purge, and only long-expired rows are removed", async () => {
  const db = await freshDb();
  try {
    expect(await consume(db, { jti: JTI1 })).toBe(true);
    await db.exec("reset role");
    await db.query("insert into public.client_adapter_token_uses (tenant_slug, jti, adapter_id, expires_at) values ('tenant-a', $1, 'forge', now() - interval '3 days')", [JTI2]);
    await db.exec("set role authenticated");
    await expect(db.query("select public.client_adapter_purge_token_uses(10)")).rejects.toThrow(/permission denied/);
    await db.exec("reset role; set role anon");
    await expect(db.query("select public.client_adapter_purge_token_uses(10)")).rejects.toThrow(/permission denied/);
    await db.exec("reset role; set role service_role");
    expect((await db.query<{ n: number }>("select public.client_adapter_purge_token_uses(10) as n")).rows[0].n).toBe(1);
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.client_adapter_token_uses")).rows[0].n).toBe(1);
  } finally {
    await db.close();
  }
});

test("removing a tenant removes its token rows", async () => {
  const db = await freshDb();
  try {
    expect(await consume(db)).toBe(true);
    await db.exec("reset role");
    await db.exec("alter table public.client_adapter_registry disable trigger user; alter table public.client_adapter_approvals disable trigger user");
    await db.exec("delete from public.client_tenants where slug = 'tenant-a'");
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.client_adapter_token_uses")).rows[0].n).toBe(0);
  } finally {
    await db.close();
  }
});
