import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// Real PostgreSQL (PGlite) tests for client_adapter_read_scoped in product-experience/supabase-client-adapter-token-uses.sql
// (item 7, scoped handles). All tenants, adapters, tokens and memory are made up inside each test.
const HOST_SQL = readFileSync("product-experience/supabase-client-adapter-host.sql", "utf8");
const TOKEN_SQL = readFileSync("product-experience/supabase-client-adapter-token-uses.sql", "utf8");
const OWNER = "00000000-0000-4000-8000-0000000000a1";
const OWNER_B = "00000000-0000-4000-8000-0000000000b1";
const WORKER = "test-worker-token-aaaaaaaaaaaaaaaaaaaa";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const P_FORGE = ID(1);
const P_KNOWLEDGE = ID(2);
const S_ACTIVE = ID(3);
const S_TOMBSTONED = ID(4);
const P_SUPERSEDED = ID(5);
const B_FORGE = ID(6);

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
    insert into auth.users values ('${OWNER}'), ('${OWNER_B}');
    insert into public.client_tenants(slug, worker_token_hash) values ('tenant-a', '${sha(WORKER)}'), ('tenant-b', '${sha(WORKER)}');
    insert into public.client_memberships values ('tenant-a', '${OWNER}', 'owner', 'active'), ('tenant-b', '${OWNER_B}', 'owner', 'active');
  `);
  await db.exec(HOST_SQL);
  await db.exec(TOKEN_SQL);
  await db.exec(TOKEN_SQL); // safe to repeat
  // Fixtures are written as the database owner with guards and foreign keys off: the guards are tested elsewhere,
  // and this file only tests who can read what.
  await db.exec(`
    set session_replication_role = replica; -- no guards and no foreign-key checks while seeding
    insert into public.client_adapter_registry (tenant_slug, adapter_id, display_name, contract_version, manifest_sha256, state, created_by) values
      ('tenant-a','forge','Forge','h1','${"a".repeat(64)}','enabled','${OWNER}'),
      ('tenant-a','knowledge','Knowledge','h1','${"b".repeat(64)}','enabled','${OWNER}'),
      ('tenant-b','forge','Forge','h1','${"a".repeat(64)}','enabled','${OWNER_B}');
    insert into public.client_adapter_memory_items (id, tenant_slug, namespace, origin_adapter_id, status, content, content_sha256, trust_level, idempotency_key, promotion_id, tombstoned_at) values
      ('${P_FORGE}','tenant-a','adapter:forge','forge','active','forge private','${sha("p1")}','untrusted','idem-0000001',null,null),
      ('${P_KNOWLEDGE}','tenant-a','adapter:knowledge','knowledge','active','knowledge private','${sha("p2")}','untrusted','idem-0000002',null,null),
      ('${S_ACTIVE}','tenant-a','shared','forge','active','shared fact','${sha("s1")}','reviewed','idem-0000003','${ID(90)}',null),
      ('${S_TOMBSTONED}','tenant-a','shared','forge','tombstoned','x','${sha("s2")}','reviewed','idem-0000004','${ID(91)}', now()),
      ('${P_SUPERSEDED}','tenant-a','adapter:forge','forge','superseded','old forge private','${sha("p3")}','untrusted','idem-0000005',null,null),
      ('${B_FORGE}','tenant-b','adapter:forge','forge','active','other tenant private','${sha("p4")}','untrusted','idem-0000006',null,null);
    set session_replication_role = origin;
  `);
  return db;
}

const read = async (db: PGlite, ids: string[] | null, o: { tenant?: string; token?: string; adapter?: string } = {}) => {
  await db.exec("reset role; set role anon");
  const r = await db.query<{ id: string; namespace: string; content: string }>(
    "select id, namespace, content from public.client_adapter_read_scoped($1,$2,$3,$4::uuid[])",
    [o.tenant ?? "tenant-a", o.token ?? WORKER, o.adapter ?? "forge", ids],
  );
  return r.rows;
};

test("an adapter reads its own active private items and active shared items, and nothing else it asks for", async () => {
  const db = await freshDb();
  try {
    const rows = await read(db, [P_FORGE, S_ACTIVE, P_KNOWLEDGE, S_TOMBSTONED, P_SUPERSEDED, B_FORGE, ID(999)]);
    expect(rows.map((r) => r.id).sort()).toEqual([P_FORGE, S_ACTIVE].sort());
    expect(rows.find((r) => r.id === P_FORGE)).toMatchObject({ namespace: "adapter:forge", content: "forge private" });
    // Another adapter's private memory, another tenant's, a tombstoned, a superseded and an unknown id all look alike: absent.
    expect(await read(db, [P_KNOWLEDGE])).toEqual([]);
    expect(await read(db, [B_FORGE])).toEqual([]);
    expect(await read(db, [S_TOMBSTONED, P_SUPERSEDED, ID(999)])).toEqual([]);
    // The same item is readable by the adapter that owns it, and by it only.
    expect((await read(db, [P_KNOWLEDGE], { adapter: "knowledge" })).map((r) => r.id)).toEqual([P_KNOWLEDGE]);
    // Tenant B's worker reaches tenant B's item for tenant B, and still not tenant A's.
    expect((await read(db, [B_FORGE], { tenant: "tenant-b" })).map((r) => r.id)).toEqual([B_FORGE]);
    expect(await read(db, [P_FORGE, S_ACTIVE], { tenant: "tenant-b" })).toEqual([]);
  } finally {
    await db.close();
  }
});

test("a bad worker token, an unusable adapter or a bad id list returns no rows", async () => {
  const db = await freshDb();
  try {
    expect(await read(db, [P_FORGE], { token: "wrong-token-wrong-token-wrong-token" })).toEqual([]);
    expect(await read(db, [P_FORGE], { token: "short" })).toEqual([]);
    expect(await read(db, [P_FORGE], { adapter: "unknown-adapter" })).toEqual([]);
    expect(await read(db, null)).toEqual([]);
    expect(await read(db, [])).toEqual([]);
    const twentyOne = [P_FORGE, ...Array.from({ length: 20 }, (_, i) => ID(100 + i))];
    expect(await read(db, twentyOne)).toEqual([]); // 21 ids is refused outright, even with a valid one in it
    const twenty = [P_FORGE, ...Array.from({ length: 19 }, (_, i) => ID(200 + i))];
    expect((await read(db, twenty)).map((r) => r.id)).toEqual([P_FORGE]); // exactly 20 is allowed
    for (const state of ["disabled", "suspended"]) {
      await db.exec(`reset role; update public.client_adapter_registry set state = '${state}' where tenant_slug = 'tenant-a' and adapter_id = 'forge'`);
      expect(await read(db, [P_FORGE])).toEqual([]);
    }
    await db.exec("reset role; update public.client_adapter_registry set state = 'preview' where tenant_slug = 'tenant-a' and adapter_id = 'forge'");
    expect((await read(db, [P_FORGE])).map((r) => r.id)).toEqual([P_FORGE]);
  } finally {
    await db.close();
  }
});

test("only the worker path can run it: signed-in users and the public role cannot", async () => {
  const db = await freshDb();
  try {
    await db.exec("reset role; set role authenticated");
    await expect(db.query("select * from public.client_adapter_read_scoped('tenant-a',$1,'forge',$2::uuid[])", [WORKER, [P_FORGE]])).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
    const grants = await db.query<{ grantee: string }>(
      "select grantee from information_schema.routine_privileges where routine_name = 'client_adapter_read_scoped' and grantee in ('PUBLIC','anon','authenticated') order by grantee",
    );
    expect(grants.rows.map((g) => g.grantee)).toEqual(["anon"]);
  } finally {
    await db.close();
  }
});
