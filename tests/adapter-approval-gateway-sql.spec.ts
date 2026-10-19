import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// Real PostgreSQL (PGlite) tests for product-experience/supabase-client-adapter-approval-gateway.sql.
// Users, tenants, tokens and rows are all created inside each test; nothing real is used.
const HOST_SQL = readFileSync("product-experience/supabase-client-adapter-host.sql", "utf8");
const GATEWAY_SQL = readFileSync("product-experience/supabase-client-adapter-approval-gateway.sql", "utf8");
const USER = {
  ownerA: "00000000-0000-4000-8000-0000000000a1",
  adminA: "00000000-0000-4000-8000-0000000000a2",
  memberA: "00000000-0000-4000-8000-0000000000a3",
  ownerB: "00000000-0000-4000-8000-0000000000b1",
};
const H = (c: string) => c.repeat(64);
const TOKEN = "test-worker-token-aaaaaaaaaaaaaaaaaaaa";
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
    insert into auth.users values ('${USER.ownerA}'), ('${USER.adminA}'), ('${USER.memberA}'), ('${USER.ownerB}');
    insert into public.client_tenants(slug, worker_token_hash) values ('tenant-a', '${sha(TOKEN)}'), ('tenant-b', null);
    insert into public.client_memberships values
      ('tenant-a', '${USER.ownerA}', 'owner', 'active'), ('tenant-a', '${USER.adminA}', 'admin', 'active'),
      ('tenant-a', '${USER.memberA}', 'member', 'active'), ('tenant-b', '${USER.ownerB}', 'owner', 'active');
  `);
  await db.exec(HOST_SQL);
  await db.exec(GATEWAY_SQL);
  await db.exec(GATEWAY_SQL); // safe to repeat
  return db;
}

const asUser = async (db: PGlite, id: string) => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
};
const asAnon = (db: PGlite) => db.exec("reset role; set role anon");
const asOwner = (db: PGlite) => db.exec("reset role");

async function setup(db: PGlite, side = "publish", state = "enabled") {
  await asUser(db, USER.ownerA);
  await db.query(
    "insert into public.client_adapter_registry (tenant_slug, adapter_id, display_name, contract_version, manifest_sha256, side_effect_ceiling) values ('tenant-a','forge','Forge','h1',$1,$2)",
    [H("a"), side],
  );
  await db.query("update public.client_adapter_registry set state = $1 where adapter_id = 'forge'", [state]);
}

async function request(db: PGlite, user: string, hash = H("1"), kind = "publish", ttl = 3600, tenant = "tenant-a") {
  await asUser(db, user);
  const r = await db.query<{ id: string }>(
    "select public.client_adapter_request_approval($1,'forge',$2,$3,'https://example.test/post','policy-1',$4) as id",
    [tenant, kind, hash, ttl],
  );
  return r.rows[0].id;
}

const decide = async (db: PGlite, user: string, id: string, decision: string, hash: string | null) => {
  await asUser(db, user);
  const r = await db.query<{ s: string }>("select public.client_adapter_decide_approval($1,$2,$3) as s", [id, decision, hash]);
  return r.rows[0].s;
};

const execute = async (db: PGlite, id: string, hash: string, token = TOKEN, receipt = H("9")) => {
  await asAnon(db);
  const r = await db.query<{ ok: boolean }>("select public.client_adapter_execute_approval('tenant-a',$1,$2,$3,$4) as ok", [token, id, hash, receipt]);
  return r.rows[0].ok;
};

test("a member requests, a different admin approves, the worker consumes it exactly once", async () => {
  const db = await freshDb();
  try {
    await setup(db);
    const id = await request(db, USER.memberA);
    expect(await decide(db, USER.adminA, id, "approve", H("1"))).toBe("approved");
    expect(await execute(db, id, H("1"))).toBe(true);
    expect(await execute(db, id, H("1"))).toBe(false); // replay
    await asOwner(db);
    const row = await db.query<{ status: string; requested_by: string; decided_by: string }>("select status, requested_by, decided_by from public.client_adapter_approvals");
    expect(row.rows[0]).toEqual({ status: "executed", requested_by: USER.memberA, decided_by: USER.adminA });
    const events = await db.query<{ event_type: string }>("select event_type from public.client_adapter_outbox order by created_at, event_type");
    expect(events.rows.map((e) => e.event_type).sort()).toEqual(["approval.decided", "approval.requested"]);
  } finally {
    await db.close();
  }
});

test("the requester cannot approve their own request, even as admin", async () => {
  const db = await freshDb();
  try {
    await setup(db);
    const id = await request(db, USER.adminA);
    await asUser(db, USER.adminA);
    await expect(db.query("select public.client_adapter_decide_approval($1,'approve',$2)", [id, H("1")])).rejects.toThrow(/requester_cannot_decide/);
  } finally {
    await db.close();
  }
});

test("plain members and other tenants cannot decide; unknown ids look the same", async () => {
  const db = await freshDb();
  try {
    await setup(db);
    const id = await request(db, USER.memberA);
    for (const user of [USER.memberA, USER.ownerB]) {
      await asUser(db, user);
      await expect(db.query("select public.client_adapter_decide_approval($1,'approve',$2)", [id, H("1")])).rejects.toThrow(/adapter_approval_not_found/);
    }
    await asUser(db, USER.ownerA);
    await expect(
      db.query("select public.client_adapter_decide_approval('00000000-0000-4000-8000-00000000ffff','approve',$1)", [H("1")]),
    ).rejects.toThrow(/adapter_approval_not_found/);
  } finally {
    await db.close();
  }
});

test("approval is bound to the exact hash and cannot be reused for another action", async () => {
  const db = await freshDb();
  try {
    await setup(db);
    const id = await request(db, USER.memberA, H("1"));
    await asUser(db, USER.adminA);
    await expect(db.query("select public.client_adapter_decide_approval($1,'approve',$2)", [id, H("2")])).rejects.toThrow(/hash_mismatch/);
    expect(await decide(db, USER.adminA, id, "approve", H("1"))).toBe("approved");
    expect(await execute(db, id, H("2"))).toBe(false); // different action
    expect(await execute(db, id, H("1"), "wrong-token-wrong-token-wrong-token")).toBe(false);
    expect(await execute(db, id, H("1"), TOKEN, "not-a-hash")).toBe(false);
    expect(await execute(db, id, H("1"))).toBe(true);
  } finally {
    await db.close();
  }
});

test("rejected and already-decided requests cannot be executed or decided again", async () => {
  const db = await freshDb();
  try {
    await setup(db);
    const id = await request(db, USER.memberA);
    expect(await decide(db, USER.adminA, id, "reject", null)).toBe("rejected");
    expect(await execute(db, id, H("1"))).toBe(false);
    await asUser(db, USER.ownerA);
    await expect(db.query("select public.client_adapter_decide_approval($1,'approve',$2)", [id, H("1")])).rejects.toThrow(/not_pending/);
  } finally {
    await db.close();
  }
});

test("expired requests cannot be approved or executed, and a fresh request is allowed", async () => {
  const db = await freshDb();
  try {
    await setup(db);
    const id = await request(db, USER.memberA, H("1"), "publish", 3600);
    await asOwner(db);
    await db.exec("alter table public.client_adapter_approvals disable trigger user");
    await db.exec("update public.client_adapter_approvals set expires_at = now() - interval '1 minute', created_at = now() - interval '2 hours'");
    await db.exec("alter table public.client_adapter_approvals enable trigger user");
    expect(await decide(db, USER.adminA, id, "approve", H("1"))).toBe("expired");
    expect(await execute(db, id, H("1"))).toBe(false);
    const again = await request(db, USER.memberA, H("1"));
    expect(again).not.toBe(id);
  } finally {
    await db.close();
  }
});

test("request rules: adapter must exist and be ready, one live request per exact action, limits apply", async () => {
  const db = await freshDb();
  try {
    await setup(db, "read", "enabled");
    await asUser(db, USER.memberA);
    await expect(
      db.query("select public.client_adapter_request_approval('tenant-a','forge','publish',$1,'d','p',3600)", [H("1")]),
    ).rejects.toThrow(/adapter_not_ready/); // ceiling is read, so publish is not possible
    await expect(
      db.query("select public.client_adapter_request_approval('tenant-a','nope-adapter','promote',$1,'d','p',3600)", [H("1")]),
    ).rejects.toThrow(/unknown_adapter/);
    await expect(
      db.query("select public.client_adapter_request_approval('tenant-a','forge','promote',$1,'d','p',5)", [H("1")]),
    ).rejects.toThrow(/bad_ttl/);
    await expect(
      db.query("select public.client_adapter_request_approval('tenant-b','forge','promote',$1,'d','p',3600)", [H("1")]),
    ).rejects.toThrow(/not_allowed/);
    await request(db, USER.memberA, H("3"), "promote");
    await asUser(db, USER.memberA);
    await expect(
      db.query("select public.client_adapter_request_approval('tenant-a','forge','promote',$1,'https://example.test/post','policy-1',3600)", [H("3")]),
    ).rejects.toThrow(/duplicate key|unique/);
  } finally {
    await db.close();
  }
});

test("function grants: anonymous cannot request or decide, signed-in users cannot execute", async () => {
  const db = await freshDb();
  try {
    await setup(db);
    await asAnon(db);
    await expect(db.query("select public.client_adapter_request_approval('tenant-a','forge','promote',$1,'d','p',3600)", [H("1")])).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.client_adapter_decide_approval(gen_random_uuid(),'reject',null)")).rejects.toThrow(/permission denied/);
    await asUser(db, USER.ownerA);
    await expect(db.query("select public.client_adapter_execute_approval('tenant-a',$1,gen_random_uuid(),$2,$3)", [TOKEN, H("1"), H("9")])).rejects.toThrow(/permission denied/);
  } finally {
    await db.close();
  }
});
