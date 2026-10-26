import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { APPROVAL_ACTION_KINDS } from "../src/lib/adapterContracts";

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
// The canonical text is what the host hashes: sorted keys, no spaces. The database checks the text against the hash.
const ACT = (tag: string, kind = "publish", destination = "https://example.test/post", policy = "policy-1") => {
  const canonical = JSON.stringify({ adapterId: "forge", destination, kind, payload: { tag }, policyVersion: policy, v: "approval-action-h1" });
  return { canonical, hash: sha(canonical) };
};
const HASH = (tag: string, kind = "publish") => ACT(tag, kind).hash;

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

async function request(db: PGlite, user: string, tag = "1", kind = "publish", ttl = 3600, tenant = "tenant-a") {
  await asUser(db, user);
  const { canonical, hash } = ACT(tag, kind);
  const r = await db.query<{ id: string }>(
    "select public.client_adapter_request_approval($1,'forge',$2,$3,$4,'https://example.test/post','policy-1',$5) as id",
    [tenant, kind, hash, canonical, ttl],
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
    expect(await decide(db, USER.adminA, id, "approve", HASH("1"))).toBe("approved");
    expect(await execute(db, id, HASH("1"))).toBe(true);
    expect(await execute(db, id, HASH("1"))).toBe(false); // replay
    await asOwner(db);
    const row = await db.query<{ status: string; requested_by: string; decided_by: string }>("select status, requested_by, decided_by from public.client_adapter_approvals");
    expect(row.rows[0]).toEqual({ status: "executed", requested_by: USER.memberA, decided_by: USER.adminA });
    const events = await db.query<{ event_type: string }>("select event_type from public.client_adapter_outbox order by created_at, event_type");
    // Exactly one executed event: the replay that returned false wrote nothing.
    expect(events.rows.map((e) => e.event_type).sort()).toEqual(["approval.decided", "approval.executed", "approval.requested"]);
  } finally {
    await db.close();
  }
});

test("a failed execution (wrong hash, wrong token, rejected request) writes no executed event", async () => {
  const db = await freshDb();
  try {
    await setup(db);
    const id = await request(db, USER.memberA);
    await decide(db, USER.adminA, id, "approve", HASH("1"));
    expect(await execute(db, id, HASH("other"))).toBe(false);
    expect(await execute(db, id, HASH("1"), "wrong-token-aaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
    await asOwner(db);
    const none = await db.query("select 1 from public.client_adapter_outbox where event_type = 'approval.executed'");
    expect(none.rows).toHaveLength(0);
  } finally {
    await db.close();
  }
});

test("activity counts: per-kind counts for the last 28 days, members only, own tenant only, no payloads", async () => {
  const db = await freshDb();
  try {
    await setup(db);
    const id = await request(db, USER.memberA);
    await decide(db, USER.adminA, id, "approve", HASH("1"));
    await execute(db, id, HASH("1"));
    await asOwner(db);
    // An old event outside the window, and a budget event inside it.
    await db.exec(`
      insert into public.client_adapter_outbox (tenant_slug, event_type, adapter_id, payload, created_at)
        values ('tenant-a','approval.requested','forge','{}'::jsonb, now() - interval '40 days');
      insert into public.client_adapter_budget_events (tenant_slug, adapter_id, task_id, kind, amount_micros, provider, idempotency_key)
        values ('tenant-a','forge','task-1','reserve',1000,'test-provider','key-00001');`);
    await asUser(db, USER.memberA);
    const own = await db.query<{ adapter_id: string; event_type: string; event_count: number }>("select * from public.client_adapter_activity_counts('tenant-a')");
    expect(own.rows).toEqual([
      { adapter_id: "forge", event_type: "approval.decided", event_count: 1 },
      { adapter_id: "forge", event_type: "approval.executed", event_count: 1 },
      { adapter_id: "forge", event_type: "approval.requested", event_count: 1 },
      { adapter_id: "forge", event_type: "budget.reserve", event_count: 1 },
    ]);
    expect(Object.keys(own.rows[0]).sort()).toEqual(["adapter_id", "event_count", "event_type"]);
    await asUser(db, USER.ownerB);
    expect((await db.query("select * from public.client_adapter_activity_counts('tenant-a')")).rows).toHaveLength(0);
    await asAnon(db);
    await expect(db.query("select * from public.client_adapter_activity_counts('tenant-a')")).rejects.toThrow(/permission denied/);
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
    await expect(db.query("select public.client_adapter_decide_approval($1,'approve',$2)", [id, HASH("1")])).rejects.toThrow(/requester_cannot_decide/);
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
      await expect(db.query("select public.client_adapter_decide_approval($1,'approve',$2)", [id, HASH("1")])).rejects.toThrow(/adapter_approval_not_found/);
    }
    await asUser(db, USER.ownerA);
    await expect(
      db.query("select public.client_adapter_decide_approval('00000000-0000-4000-8000-00000000ffff','approve',$1)", [HASH("1")]),
    ).rejects.toThrow(/adapter_approval_not_found/);
  } finally {
    await db.close();
  }
});

test("approval is bound to the exact hash and cannot be reused for another action", async () => {
  const db = await freshDb();
  try {
    await setup(db);
    const id = await request(db, USER.memberA, "1");
    await asUser(db, USER.adminA);
    await expect(db.query("select public.client_adapter_decide_approval($1,'approve',$2)", [id, HASH("2")])).rejects.toThrow(/hash_mismatch/);
    expect(await decide(db, USER.adminA, id, "approve", HASH("1"))).toBe("approved");
    expect(await execute(db, id, HASH("2"))).toBe(false); // different action
    expect(await execute(db, id, HASH("1"), "wrong-token-wrong-token-wrong-token")).toBe(false);
    expect(await execute(db, id, HASH("1"), TOKEN, "not-a-hash")).toBe(false);
    expect(await execute(db, id, HASH("1"))).toBe(true);
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
    expect(await execute(db, id, HASH("1"))).toBe(false);
    await asUser(db, USER.ownerA);
    await expect(db.query("select public.client_adapter_decide_approval($1,'approve',$2)", [id, HASH("1")])).rejects.toThrow(/not_pending/);
  } finally {
    await db.close();
  }
});

test("expired requests cannot be approved or executed, and a fresh request is allowed", async () => {
  const db = await freshDb();
  try {
    await setup(db);
    const id = await request(db, USER.memberA, "1", "publish", 3600);
    await asOwner(db);
    await db.exec("alter table public.client_adapter_approvals disable trigger user");
    await db.exec("update public.client_adapter_approvals set expires_at = now() - interval '1 minute', created_at = now() - interval '2 hours'");
    await db.exec("alter table public.client_adapter_approvals enable trigger user");
    expect(await decide(db, USER.adminA, id, "approve", HASH("1"))).toBe("expired");
    expect(await execute(db, id, HASH("1"))).toBe(false);
    const again = await request(db, USER.memberA, "1");
    expect(again).not.toBe(id);
  } finally {
    await db.close();
  }
});

test("the expiry sweep marks only open, past-due requests, in bounded batches, and only for the service role", async () => {
  const db = await freshDb();
  try {
    await setup(db);
    const waiting = await request(db, USER.memberA, "1");
    const approved = await request(db, USER.memberA, "2");
    const used = await request(db, USER.memberA, "3");
    const fresh = await request(db, USER.memberA, "4");
    expect(await decide(db, USER.adminA, approved, "approve", HASH("2"))).toBe("approved");
    expect(await decide(db, USER.adminA, used, "approve", HASH("3"))).toBe("approved");
    expect(await execute(db, used, HASH("3"))).toBe(true);
    const rejected = await request(db, USER.memberA, "5");
    expect(await decide(db, USER.adminA, rejected, "reject", null)).toBe("rejected");
    await asOwner(db);
    await db.exec("alter table public.client_adapter_approvals disable trigger user");
    await db.query("update public.client_adapter_approvals set expires_at = now() - interval '1 minute', created_at = now() - interval '2 hours' where id <> $1", [fresh]);
    await db.exec("alter table public.client_adapter_approvals enable trigger user");
    const status = async () => Object.fromEntries((await db.query<{ id: string; status: string }>("select id, status from public.client_adapter_approvals")).rows.map((r) => [r.id, r.status]));

    // the signed-in roles and the anonymous role cannot run it
    for (const as of [() => asAnon(db), () => asUser(db, USER.ownerA)]) {
      await as();
      await expect(db.query("select public.client_adapter_expire_approvals(10)")).rejects.toThrow(/permission denied/);
    }
    await db.exec("reset role; set role service_role");
    // a batch of one moves exactly one; a second sweep finishes the rest; a third finds nothing
    expect((await db.query<{ n: number }>("select public.client_adapter_expire_approvals(1) as n")).rows[0].n).toBe(1);
    expect((await db.query<{ n: number }>("select public.client_adapter_expire_approvals(100) as n")).rows[0].n).toBe(1);
    expect((await db.query<{ n: number }>("select public.client_adapter_expire_approvals(100) as n")).rows[0].n).toBe(0);
    await asOwner(db);
    expect(await status()).toEqual({ [waiting]: "expired", [approved]: "expired", [used]: "executed", [rejected]: "rejected", [fresh]: "pending" });
  } finally {
    await db.close();
  }
});

test("the retention command runs the expiry sweep and the token purge only with the adapter host flag and only for a real run", () => {
  const lifecycle = readFileSync("scripts/client-lifecycle.mjs", "utf8");
  const start = lifecycle.indexOf("if (adapterHost.included) {");
  expect(start).toBeGreaterThan(0);
  const block = lifecycle.slice(start, lifecycle.indexOf("if (apply && ids.length) {", start));
  // not run, and reported as not run, unless this is a real run
  expect(block).toContain("adapterHost.approvalsExpired = null;");
  expect(block).toContain("adapterHost.tokenUsesPurged = null;");
  expect(block).toContain("adapterHost.tokenCountsPurged = null;");
  const guarded = block.slice(block.indexOf("if (apply) {"));
  expect(guarded).toContain("rpc/client_adapter_expire_approvals");
  expect(guarded).toContain("rpc/client_adapter_purge_token_uses");
  expect(guarded).toContain("rpc/client_adapter_purge_token_counts");
  // a failed housekeeping call stops the run instead of being reported as success
  expect((guarded.match(/fail\(/g) ?? []).length).toBe(3);
  // the report carries the counts
  expect(lifecycle).toMatch(/console\.log\(JSON\.stringify\(\{[^\n]*adapterHost/);
});

test("request rules: adapter must exist and be ready, one live request per exact action, limits apply", async () => {
  const db = await freshDb();
  try {
    await setup(db, "read", "enabled");
    await asUser(db, USER.memberA);
    const call = (adapter: string, kind: string, ttl: number, tenant = "tenant-a") => {
      const { canonical, hash } = (() => { const c = JSON.stringify({ adapterId: adapter, destination: "d", kind, payload: {}, policyVersion: "p", v: "approval-action-h1" }); return { canonical: c, hash: sha(c) }; })();
      return db.query("select public.client_adapter_request_approval($1,$2,$3,$4,$5,'d','p',$6)", [tenant, adapter, kind, hash, canonical, ttl]);
    };
    await expect(call("forge", "publish", 3600)).rejects.toThrow(/adapter_not_ready/); // ceiling is read, so publish is not possible
    await expect(call("nope-adapter", "promote", 3600)).rejects.toThrow(/unknown_adapter/);
    await expect(call("forge", "promote", 5)).rejects.toThrow(/bad_ttl/);
    await expect(call("forge", "promote", 3600, "tenant-b")).rejects.toThrow(/not_allowed/);
    await call("forge", "promote", 3600);
    await expect(call("forge", "promote", 3600)).rejects.toThrow(/duplicate key|unique/);
  } finally {
    await db.close();
  }
});

test("function grants: anonymous cannot request or decide, signed-in users cannot execute", async () => {
  const db = await freshDb();
  try {
    await setup(db);
    await asAnon(db);
    const { canonical, hash } = ACT("1", "promote");
    await expect(db.query("select public.client_adapter_request_approval('tenant-a','forge','promote',$1,$2,'https://example.test/post','policy-1',3600)", [hash, canonical])).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.client_adapter_decide_approval(gen_random_uuid(),'reject',null)")).rejects.toThrow(/permission denied/);
    await asUser(db, USER.ownerA);
    await expect(db.query("select public.client_adapter_execute_approval('tenant-a',$1,gen_random_uuid(),$2,$3)", [TOKEN, HASH("1"), H("9")])).rejects.toThrow(/permission denied/);
  } finally {
    await db.close();
  }
});

test("the stored text must be exactly what was hashed, and agree with the request", async () => {
  const db = await freshDb();
  try {
    await setup(db);
    await asUser(db, USER.memberA);
    const ask = (over: { hash?: string; canonical?: string | null; kind?: string; destination?: string; policy?: string; adapter?: string }) => {
      const base = ACT("1");
      return db.query(
        "select public.client_adapter_request_approval('tenant-a',$1,$2,$3,$4,$5,$6,3600)",
        [over.adapter ?? "forge", over.kind ?? "publish", over.hash ?? base.hash, over.canonical === undefined ? base.canonical : over.canonical, over.destination ?? "https://example.test/post", over.policy ?? "policy-1"],
      );
    };
    // text that does not hash to the fingerprint
    await expect(ask({ hash: HASH("other") })).rejects.toThrow(/adapter_approval_canonical_mismatch/);
    await expect(ask({ canonical: ACT("1").canonical + " " })).rejects.toThrow(/adapter_approval_canonical_mismatch/);
    // text that hashes correctly but says something different from the row
    for (const [name, other] of [["kind", ACT("1", "promote")], ["destination", ACT("1", "publish", "https://example.test/elsewhere")], ["policy", ACT("1", "publish", "https://example.test/post", "policy-2")]] as const) {
      await expect(ask({ hash: other.hash, canonical: other.canonical }), name).rejects.toThrow(/adapter_approval_canonical_mismatch/);
    }
    const wrongVersion = JSON.stringify({ adapterId: "forge", destination: "https://example.test/post", kind: "publish", payload: {}, policyVersion: "policy-1", v: "approval-action-h0" });
    await expect(ask({ hash: sha(wrongVersion), canonical: wrongVersion })).rejects.toThrow(/adapter_approval_canonical_mismatch/);
    const otherAdapter = JSON.stringify({ adapterId: "knowledge", destination: "https://example.test/post", kind: "publish", payload: {}, policyVersion: "policy-1", v: "approval-action-h1" });
    await expect(ask({ hash: sha(otherAdapter), canonical: otherAdapter })).rejects.toThrow(/adapter_approval_canonical_mismatch/);
    // text that is missing, not JSON, not an object, or too big
    await expect(ask({ canonical: null })).rejects.toThrow(/adapter_approval_canonical_invalid/);
    await expect(ask({ canonical: "" })).rejects.toThrow(/adapter_approval_canonical_invalid/);
    for (const text of ["not json", "[1,2]", "\"text\"", "42"]) await expect(ask({ hash: sha(text), canonical: text }), text).rejects.toThrow(/adapter_approval_canonical_invalid/);
    const huge = JSON.stringify({ adapterId: "forge", destination: "https://example.test/post", kind: "publish", payload: { x: "y".repeat(17_000) }, policyVersion: "policy-1", v: "approval-action-h1" });
    await expect(ask({ hash: sha(huge), canonical: huge })).rejects.toThrow(/adapter_approval_canonical_invalid/);
    // nothing was stored by any of the refusals
    await asOwner(db);
    expect((await db.query("select 1 from public.client_adapter_approvals")).rows).toHaveLength(0);
    // the text is hashed as UTF-8, so non-English content works
    await asUser(db, USER.memberA);
    const unicode = JSON.stringify({ adapterId: "forge", destination: "https://example.test/post", kind: "publish", payload: { text: "Café 日本語 🙂" }, policyVersion: "policy-1", v: "approval-action-h1" });
    const ok = await ask({ hash: sha(unicode), canonical: unicode });
    expect(ok.rows).toHaveLength(1);
  } finally {
    await db.close();
  }
});

test("the stored text is kept with the approval, immutable, and visible only to the requester and admins", async () => {
  const db = await freshDb();
  try {
    await setup(db);
    const id = await request(db, USER.memberA, "7");
    const { canonical } = ACT("7");
    await asUser(db, USER.memberA);
    expect((await db.query<{ action_canonical: string }>("select action_canonical from public.client_adapter_approvals")).rows).toEqual([{ action_canonical: canonical }]);
    await asUser(db, USER.adminA);
    expect((await db.query<{ action_canonical: string }>("select action_canonical from public.client_adapter_approvals")).rows).toEqual([{ action_canonical: canonical }]);
    // it cannot be changed, not even by the service role or the owner
    for (const role of ["service_role", "owner"]) {
      if (role === "owner") await asOwner(db); else await db.exec("reset role; set role service_role");
      await expect(db.query("update public.client_adapter_approvals set action_canonical = $1 where id = $2", [ACT("8").canonical, id]), role).rejects.toThrow(/approval identity is immutable/);
    }
    // deciding does not touch it
    expect(await decide(db, USER.adminA, id, "approve", HASH("7"))).toBe("approved");
    await asOwner(db);
    expect((await db.query<{ action_canonical: string }>("select action_canonical from public.client_adapter_approvals")).rows).toEqual([{ action_canonical: canonical }]);
    // an unrelated member in the same tenant sees nothing, as before
    await db.exec("insert into auth.users values ('00000000-0000-4000-8000-0000000000c1')");
    await db.exec("insert into public.client_memberships values ('tenant-a','00000000-0000-4000-8000-0000000000c1','member','active')");
    await asUser(db, "00000000-0000-4000-8000-0000000000c1");
    expect((await db.query("select 1 from public.client_adapter_approvals")).rows).toHaveLength(0);
  } finally {
    await db.close();
  }
});

test("the old request signature without the text is gone", async () => {
  const db = await freshDb();
  try {
    await setup(db);
    await asUser(db, USER.memberA);
    await expect(db.query("select public.client_adapter_request_approval('tenant-a','forge','publish',$1,'d','p',3600)", [HASH("1")])).rejects.toThrow(/does not exist/);
  } finally {
    await db.close();
  }
});

// Added by the Phase 1 mutation sweep (item 16): rules that could be removed without any test failing.
const requestAction = (db: PGlite, o: { adapter?: string; kind: string; tag?: string; tenant?: string }) => {
  const canonical = JSON.stringify({ adapterId: o.adapter ?? "forge", destination: "d", kind: o.kind, payload: { tag: o.tag ?? "x" }, policyVersion: "p", v: "approval-action-h1" });
  return db.query("select public.client_adapter_request_approval($1,$2,$3,$4,$5,'d','p',3600)", [o.tenant ?? "tenant-a", o.adapter ?? "forge", o.kind, sha(canonical), canonical]);
};

test("request rules: unknown kinds are refused by name, and each kind needs the adapter in the right state", async () => {
  const db = await freshDb();
  try {
    await setup(db, "publish", "enabled");
    await asUser(db, USER.memberA);
    await expect(requestAction(db, { kind: "delete" })).rejects.toThrow(/adapter_approval_bad_kind/);
    await requestAction(db, { kind: "publish" });
    await requestAction(db, { kind: "promote" });
    // Enabling an adapter that is already enabled makes no sense.
    await expect(requestAction(db, { kind: "enable-adapter" })).rejects.toThrow(/adapter_not_ready/);
    await asOwner(db);
    await db.exec("update public.client_adapter_registry set state = 'disabled' where adapter_id = 'forge'");
    await asUser(db, USER.memberA);
    // A disabled adapter can be asked to be enabled, but nothing can be published or promoted through it.
    await requestAction(db, { kind: "enable-adapter" });
    await expect(requestAction(db, { kind: "promote", tag: "y" })).rejects.toThrow(/adapter_not_ready/);
    await expect(requestAction(db, { kind: "publish", tag: "y" })).rejects.toThrow(/adapter_not_ready/);
  } finally {
    await db.close();
  }
});

test("at most 50 open requests per tenant; the 51st is refused until one is no longer open", async () => {
  const db = await freshDb();
  try {
    await setup(db, "publish", "enabled");
    await asOwner(db);
    await db.query(
      `insert into public.client_adapter_approvals (tenant_slug, adapter_id, action_kind, action_hash, destination, policy_version, requested_by, expires_at)
       select 'tenant-a','forge','publish', md5(i::text) || md5((i + 1000)::text), 'd', 'p', $1, now() + interval '1 hour' from generate_series(1, 50) i`,
      [USER.memberA],
    );
    await asUser(db, USER.memberA);
    await expect(requestAction(db, { kind: "publish", tag: "fifty-one" })).rejects.toThrow(/adapter_approval_too_many_open/);
    await asOwner(db);
    await db.exec("update public.client_adapter_approvals set status = 'rejected', decided_by = '" + USER.ownerA + "', decided_at = now() where id = (select id from public.client_adapter_approvals limit 1)");
    await asUser(db, USER.memberA);
    await requestAction(db, { kind: "publish", tag: "fifty-one" });
  } finally {
    await db.close();
  }
});

test("a decision must be exactly approve or reject", async () => {
  const db = await freshDb();
  try {
    await setup(db);
    const id = await request(db, USER.memberA);
    for (const bad of ["banana", "APPROVE", ""]) {
      await asUser(db, USER.adminA);
      await expect(db.query("select public.client_adapter_decide_approval($1,$2,$3)", [id, bad, HASH("1")])).rejects.toThrow(/adapter_approval_bad_decision/);
    }
    await asUser(db, USER.adminA);
    await expect(db.query("select public.client_adapter_decide_approval($1,null,$2)", [id, HASH("1")])).rejects.toThrow(/adapter_approval_bad_decision/);
    await asOwner(db);
    expect((await db.query<{ status: string }>("select status from public.client_adapter_approvals where id = $1", [id])).rows[0].status).toBe("pending");
  } finally {
    await db.close();
  }
});

// QM-6b: "run-command" is an approval kind, for adapters that may act and are ready.
test("a command can be put up for approval only by an adapter that is ready and not read-only, then approved and used once", async () => {
  const db = await freshDb();
  try {
    await setup(db, "draft", "enabled");
    const id = await request(db, USER.memberA, "cmd-1", "run-command");
    expect(await decide(db, USER.adminA, id, "approve", HASH("cmd-1", "run-command"))).toBe("approved");
    expect(await execute(db, id, HASH("cmd-1", "run-command"))).toBe(true);
    expect(await execute(db, id, HASH("cmd-1", "run-command"))).toBe(false); // used once
    await asOwner(db);
    expect((await db.query<{ action_kind: string; status: string }>("select action_kind, status from public.client_adapter_approvals where id = $1", [id])).rows[0]).toEqual({ action_kind: "run-command", status: "executed" });

    // a read-only adapter, a disabled one and a suspended one cannot ask to run a command
    for (const [ceiling, state] of [["read", "enabled"], ["draft", "disabled"], ["draft", "suspended"], ["read", "preview"]] as const) {
      await asOwner(db);
      await db.exec(`update public.client_adapter_registry set side_effect_ceiling = '${ceiling}', state = '${state}' where adapter_id = 'forge'`);
      await expect(request(db, USER.memberA, `cmd-${ceiling}-${state}`, "run-command"), `${ceiling}/${state}`).rejects.toThrow(/adapter_approval_adapter_not_ready/);
    }
    await asOwner(db);
    await db.exec("update public.client_adapter_registry set side_effect_ceiling = 'publish', state = 'preview' where adapter_id = 'forge'");
    await expect(request(db, USER.memberA, "cmd-preview-ok", "run-command")).resolves.toBeDefined();
  } finally {
    await db.close();
  }
});

test("on a database that already holds the three older approval kinds, applying the migration allows run-command", async () => {
  const db = await freshDb();
  try {
    await asOwner(db);
    await db.exec(`alter table public.client_adapter_approvals drop constraint client_adapter_approvals_action_kind_check;
      alter table public.client_adapter_approvals add constraint client_adapter_approvals_action_kind_check check (action_kind in ('publish', 'promote', 'enable-adapter'));`);
    await setup(db, "draft", "enabled");
    await asOwner(db);
    await expect(db.query("insert into public.client_adapter_approvals (tenant_slug, adapter_id, action_kind, action_hash, destination, policy_version, requested_by, expires_at) values ('tenant-a','forge','run-command',$1,'command','p',$2, now() + interval '1 hour')", [H("7"), USER.memberA])).rejects.toThrow(/check constraint|violates/);
    await db.exec(GATEWAY_SQL);
    await expect(db.query("insert into public.client_adapter_approvals (tenant_slug, adapter_id, action_kind, action_hash, destination, policy_version, requested_by, expires_at) values ('tenant-a','forge','run-command',$1,'command','p',$2, now() + interval '1 hour')", [H("7"), USER.memberA])).resolves.toBeDefined();
    await expect(db.query("insert into public.client_adapter_approvals (tenant_slug, adapter_id, action_kind, action_hash, destination, policy_version, requested_by, expires_at) values ('tenant-a','forge','teleport',$1,'command','p',$2, now() + interval '1 hour')", [H("8"), USER.memberA])).rejects.toThrow(/check constraint|violates/);
  } finally {
    await db.close();
  }
});

test("the approval kinds are one list in the code, the table's check, the upgrade and the request function", () => {
  const quoted = (text: string) => [...text.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]!).sort();
  const hostList = /action_kind in \(([^)]*)\)/.exec(HOST_SQL)?.[1];
  const upgradeList = /action_kind_check\s+check \(action_kind in \(([^)]*)\)\)/.exec(GATEWAY_SQL)?.[1];
  const requestList = /p_action_kind not in \(([^)]*)\)/.exec(GATEWAY_SQL)?.[1];
  expect(hostList && upgradeList && requestList).toBeTruthy();
  const expected = [...APPROVAL_ACTION_KINDS].sort();
  expect(quoted(hostList!)).toEqual(expected);
  expect(quoted(upgradeList!)).toEqual(expected);
  expect(quoted(requestList!)).toEqual(expected);
  expect(expected).toContain("run-command");
});
