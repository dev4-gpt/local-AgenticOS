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

// Tracker item 6b: token use is counted per adapter per day, with no token ids, and shows in the 28-day activity view.
const jti = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function addAdapter(db: PGlite, adapter: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [OWNER]);
  await db.exec("set role authenticated");
  await db.query("insert into public.client_adapter_registry (tenant_slug, adapter_id, display_name, contract_version, manifest_sha256) values ('tenant-a',$1,$1,'h1',$2)", [adapter, "b".repeat(64)]);
  await db.exec("reset role");
}
const counts = async (db: PGlite) => {
  await db.exec("reset role");
  return (await db.query<{ tenant_slug: string; adapter_id: string; day: string; uses: number }>(
    "select tenant_slug, adapter_id, to_char(day, 'YYYY-MM-DD') as day, uses from public.client_adapter_token_use_counts order by tenant_slug, adapter_id, day",
  )).rows;
};
const today = () => new Date().toISOString().slice(0, 10);

test("a first use adds one to the day's count for its adapter; replays and refused calls count nothing", async () => {
  const db = await freshDb();
  try {
    await addAdapter(db, "knowledge");
    expect(await consume(db)).toBe(true);
    expect(await consume(db, { jti: jti(11) })).toBe(true);
    expect(await consume(db, { jti: jti(12), adapter: "knowledge" })).toBe(true);
    // all refused: a replay, a wrong worker token, an unknown adapter, a bad expiry, another tenant's token
    expect(await consume(db, { jti: jti(11) })).toBe(false);
    expect(await consume(db, { jti: jti(13), token: "wrong-token-wrong-token-wrong-token" })).toBe(false);
    expect(await consume(db, { jti: jti(14), adapter: "nobody-here" })).toBe(false);
    expect(await consume(db, { jti: jti(15), seconds: -5 })).toBe(false);
    expect(await consume(db, { jti: jti(16), seconds: 100_000 })).toBe(false);
    expect(await counts(db)).toEqual([
      { tenant_slug: "tenant-a", adapter_id: "forge", day: today(), uses: 2 },
      { tenant_slug: "tenant-a", adapter_id: "knowledge", day: today(), uses: 1 },
    ]);
    // the counter holds no token id and no person: only tenant, adapter, day and a number
    const columns = await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'client_adapter_token_use_counts' order by 1");
    expect(columns.rows.map((c) => c.column_name)).toEqual(["adapter_id", "day", "tenant_slug", "uses"]);
  } finally {
    await db.close();
  }
});

test("a new day starts a new count, and the 28-day activity view adds up the last 28 days for members only", async () => {
  const db = await freshDb();
  try {
    expect(await consume(db, { jti: jti(21) })).toBe(true);
    await db.exec("reset role");
    await db.exec(`
      update public.client_adapter_token_use_counts set day = current_date - 3 where adapter_id = 'forge';
      insert into public.client_adapter_token_use_counts (tenant_slug, adapter_id, day, uses) values ('tenant-a','forge', current_date - 29, 50);
    `);
    expect(await consume(db, { jti: jti(22) })).toBe(true); // a new day, a new row
    expect((await counts(db)).filter((c) => c.day === today())).toEqual([{ tenant_slug: "tenant-a", adapter_id: "forge", day: today(), uses: 1 }]);
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [MEMBER]);
    await db.exec("set role authenticated");
    const view = await db.query<{ adapter_id: string; event_type: string; event_count: number }>("select * from public.client_adapter_activity_counts('tenant-a') where event_type = 'token.use'");
    expect(view.rows).toEqual([{ adapter_id: "forge", event_type: "token.use", event_count: 2 }]); // today's and 3 days ago, not the 29-day-old 50
    await db.exec("reset role; set role anon");
    await expect(db.query("select * from public.client_adapter_activity_counts('tenant-a')")).rejects.toThrow(/permission denied/);
  } finally {
    await db.close();
  }
});

test("old counters are removed after 35 days, in bounded batches, and only by the service role; the table is closed to everyone else", async () => {
  const db = await freshDb();
  try {
    await db.exec(`
      insert into public.client_adapter_token_use_counts (tenant_slug, adapter_id, day, uses) values
        ('tenant-a','forge', current_date - 36, 3), ('tenant-a','forge', current_date - 40, 4), ('tenant-a','forge', current_date - 41, 5),
        ('tenant-a','forge', current_date - 35, 6), ('tenant-a','forge', current_date - 1, 7);`);
    await db.exec("reset role; set role service_role");
    expect((await db.query<{ n: number }>("select public.client_adapter_purge_token_counts(2) as n")).rows[0].n).toBe(2); // bounded
    expect((await db.query<{ n: number }>("select public.client_adapter_purge_token_counts() as n")).rows[0].n).toBe(1);
    expect((await db.query<{ n: number }>("select public.client_adapter_purge_token_counts() as n")).rows[0].n).toBe(0); // safe to repeat
    expect((await counts(db)).map((c) => c.uses)).toEqual([6, 7]); // 35 days old and yesterday stay
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`reset role; set role ${role}`);
      await expect(db.query("select public.client_adapter_purge_token_counts()"), role).rejects.toThrow(/permission denied/);
      await expect(db.query("select * from public.client_adapter_token_use_counts"), role).rejects.toThrow(/permission denied/);
    }
    await db.exec("reset role; set role service_role");
    await expect(db.query("update public.client_adapter_token_use_counts set uses = 99")).rejects.toThrow(/permission denied/);
    await expect(db.query("insert into public.client_adapter_token_use_counts (tenant_slug, adapter_id, day, uses) values ('tenant-a','forge', current_date, 1)")).rejects.toThrow(/permission denied/);
  } finally {
    await db.close();
  }
});

test("deleting a tenant removes its counters, and the counter will not take a zero or a malformed adapter", async () => {
  const db = await freshDb();
  try {
    expect(await consume(db)).toBe(true);
    await db.exec("reset role");
    await expect(db.query("insert into public.client_adapter_token_use_counts (tenant_slug, adapter_id, day, uses) values ('tenant-a','forge', current_date - 2, 0)")).rejects.toThrow(/check constraint|violates/);
    await expect(db.query("insert into public.client_adapter_token_use_counts (tenant_slug, adapter_id, day, uses) values ('tenant-a','Bad Adapter', current_date - 2, 1)")).rejects.toThrow(/check constraint|violates/);
    await db.exec("delete from public.client_tenants where slug = 'tenant-a'");
    expect(await counts(db)).toEqual([]);
  } finally {
    await db.close();
  }
});
