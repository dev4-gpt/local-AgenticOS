import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Real PostgreSQL (PGlite) tests for product-experience/supabase-client-adapter-host.sql.
// All users, tenants and rows are created inside each test; no real data or credentials are used.
const SQL = readFileSync("product-experience/supabase-client-adapter-host.sql", "utf8");
const USER = {
  ownerA: "00000000-0000-4000-8000-0000000000a1",
  adminA: "00000000-0000-4000-8000-0000000000a2",
  memberA: "00000000-0000-4000-8000-0000000000a3",
  viewerA: "00000000-0000-4000-8000-0000000000a4",
  ownerB: "00000000-0000-4000-8000-0000000000b1",
};
const H = (c: string) => c.repeat(64);

async function freshDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table auth.users(id uuid primary key);
    create table public.client_tenants(slug text primary key, status text not null default 'active');
    create table public.client_memberships(
      tenant_slug text not null references public.client_tenants(slug) on delete cascade,
      user_id uuid not null references auth.users(id), role text not null, status text not null default 'active',
      primary key (tenant_slug, user_id));
    create function public.client_member(p_tenant_slug text) returns boolean language sql stable security definer set search_path = public as $$
      select exists (select 1 from public.client_memberships where tenant_slug = p_tenant_slug and user_id = auth.uid() and status = 'active') $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function public.client_member(text) to authenticated;
    insert into auth.users values ('${USER.ownerA}'), ('${USER.adminA}'), ('${USER.memberA}'), ('${USER.viewerA}'), ('${USER.ownerB}');
    insert into public.client_tenants(slug) values ('tenant-a'), ('tenant-b');
    insert into public.client_memberships values
      ('tenant-a', '${USER.ownerA}', 'owner', 'active'), ('tenant-a', '${USER.adminA}', 'admin', 'active'),
      ('tenant-a', '${USER.memberA}', 'member', 'active'), ('tenant-a', '${USER.viewerA}', 'viewer', 'active'),
      ('tenant-b', '${USER.ownerB}', 'owner', 'active');
  `);
  await db.exec(SQL);
  await db.exec(SQL); // the second run proves the migration is safe to repeat
  return db;
}

const asUser = async (db: PGlite, id: string) => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
};
const asService = (db: PGlite) => db.exec("reset role; set role service_role");
const asAnon = (db: PGlite) => db.exec("reset role; set role anon");
const asOwner = (db: PGlite) => db.exec("reset role");

async function register(db: PGlite, user: string, tenant: string, adapter: string) {
  await asUser(db, user);
  await db.query(
    "insert into public.client_adapter_registry (tenant_slug, adapter_id, display_name, contract_version, manifest_sha256) values ($1,$2,$3,'h1',$4)",
    [tenant, adapter, adapter, H("a")],
  );
}

async function addPrivate(db: PGlite, adapter: string, content: string, hash: string, key: string): Promise<string> {
  await asService(db);
  const result = await db.query<{ id: string }>(
    "insert into public.client_adapter_memory_items (tenant_slug, namespace, origin_adapter_id, content, content_sha256, idempotency_key) values ('tenant-a',$1,$2,$3,$4,$5) returning id",
    [`adapter:${adapter}`, adapter, content, hash, key],
  );
  return result.rows[0].id;
}

async function propose(db: PGlite, itemId: string, adapter: string, hash: string, requester: string): Promise<string> {
  await asService(db);
  // A promotion needs a provenance record for its source note and a scan of exactly this content.
  await db.query(
    "insert into public.client_adapter_memory_provenance (tenant_slug, item_id, adapter_id, adapter_version, agent_principal, source_task_id, confidence) select 'tenant-a',$1,$2,'1','agent','task-1',0.5 where not exists (select 1 from public.client_adapter_memory_provenance where item_id = $1)",
    [itemId, adapter],
  );
  const scan = JSON.stringify({ scanner: "memory-scan-h1", content_sha256: hash, verdict: "clean", findings: [], scanned_chars: 1 });
  const result = await db.query<{ id: string }>(
    "insert into public.client_adapter_memory_promotions (tenant_slug, source_item_id, origin_adapter_id, content_sha256, requested_by, scan_result) values ('tenant-a',$1,$2,$3,$4,$5::jsonb) returning id",
    [itemId, adapter, hash, requester, scan],
  );
  return result.rows[0].id;
}

async function decide(db: PGlite, user: string, promotionId: string, hash: string, status = "approved") {
  await asUser(db, user);
  return db.query(
    "update public.client_adapter_memory_promotions set status=$3, reviewed_by=auth.uid(), reviewed_at=now(), approved_content_sha256=$2, approved_sensitivity = case when $3 = 'approved' then 'ordinary' end where id=$1",
    [promotionId, hash, status],
  );
}

async function addShared(db: PGlite, promotionId: string | null, content: string, hash: string, key: string) {
  await asService(db);
  return db.query<{ id: string }>(
    "insert into public.client_adapter_memory_items (tenant_slug, namespace, origin_adapter_id, content, content_sha256, trust_level, promotion_id, idempotency_key) values ('tenant-a','shared','knowledge',$1,$2,'reviewed',$3,$4) returning id",
    [content, hash, promotionId, key],
  );
}

test("applies twice and turns on row-level security for all eight tables", async () => {
  const db = await freshDb();
  try {
    const rows = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relkind = 'r' and relname like 'client_adapter_%' order by relname",
    );
    expect(rows.rows.map((row) => row.relname)).toEqual([
      "client_adapter_approvals",
      "client_adapter_budget_events",
      "client_adapter_memory_items",
      "client_adapter_memory_promotions",
      "client_adapter_memory_provenance",
      "client_adapter_outbox",
      "client_adapter_registry",
      "client_adapter_token_use_counts",
    ]);
    expect(rows.rows.every((row) => row.relrowsecurity)).toBe(true);
  } finally {
    await db.close();
  }
});

test("tenants and roles: members read their own tenant, only admins register, anonymous gets nothing", async () => {
  const db = await freshDb();
  try {
    await register(db, USER.ownerA, "tenant-a", "creator-os");
    await register(db, USER.adminA, "tenant-a", "knowledge");
    await register(db, USER.ownerB, "tenant-b", "creator-os");
    await asUser(db, USER.memberA);
    const seen = await db.query<{ adapter_id: string; state: string }>("select adapter_id, state from public.client_adapter_registry order by adapter_id");
    expect(seen.rows).toEqual([{ adapter_id: "creator-os", state: "disabled" }, { adapter_id: "knowledge", state: "disabled" }]);
    await asUser(db, USER.ownerB);
    expect((await db.query("select 1 from public.client_adapter_registry")).rows).toHaveLength(1);
    await expect(register(db, USER.memberA, "tenant-a", "forge")).rejects.toThrow(/row-level security/);
    await expect(register(db, USER.viewerA, "tenant-a", "forge")).rejects.toThrow(/row-level security/);
    await expect(register(db, USER.ownerA, "tenant-b", "forge")).rejects.toThrow(/row-level security/);
    await asAnon(db);
    await expect(db.query("select * from public.client_adapter_registry")).rejects.toThrow(/permission denied/);
  } finally {
    await db.close();
  }
});

test("function privileges: the anonymous role cannot execute the admin check or the trigger functions", async () => {
  const db = await freshDb();
  try {
    const fns = [
      "client_adapter_admin(text)",
      "client_adapter_reject_mutation()",
      "client_adapter_reject_truncate()",
      "client_adapter_guard_memory_item()",
      "client_adapter_guard_promotion()",
      "client_adapter_guard_approval()",
    ];
    for (const fn of fns) {
      const r = await db.query<{ anon: boolean; authenticated: boolean }>(
        "select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as authenticated",
        [`public.${fn}`],
      );
      expect(r.rows[0].anon, `${fn} must not be executable by anon`).toBe(false);
      expect(r.rows[0].authenticated, fn).toBe(fn === "client_adapter_admin(text)");
    }
    await asAnon(db);
    await expect(db.query("select public.client_adapter_admin('tenant-a')")).rejects.toThrow(/permission denied/);
  } finally {
    await db.close();
  }
});

test("private memory is admin-only, shared memory needs an approved promotion by a different person", async () => {
  const db = await freshDb();
  try {
    await register(db, USER.ownerA, "tenant-a", "knowledge");
    const first = await addPrivate(db, "knowledge", "Private working note one.", H("1"), "idem-private-1");
    const second = await addPrivate(db, "knowledge", "Private working note two.", H("2"), "idem-private-2");
    await asService(db);
    await expect(
      db.query("insert into public.client_adapter_memory_promotions (tenant_slug, source_item_id, origin_adapter_id, content_sha256, requested_by) values ('tenant-a',$1,'knowledge',$2,$3)", [second, H("9"), USER.memberA]),
    ).rejects.toThrow(/same content hash/);
    const promo1 = await propose(db, first, "knowledge", H("1"), USER.memberA);
    const promo2 = await propose(db, second, "knowledge", H("2"), USER.adminA);

    await expect(decide(db, USER.adminA, promo2, H("2"))).rejects.toThrow(/distinct_reviewer/);
    await expect(decide(db, USER.ownerA, promo1, H("8"))).rejects.toThrow(/approval_complete/);
    expect((await decide(db, USER.memberA, promo1, H("1"))).affectedRows).toBe(0);
    await asUser(db, USER.ownerA);
    await expect(db.query("update public.client_adapter_memory_promotions set content_sha256=$1 where id=$2", [H("5"), promo1])).rejects.toThrow(/permission denied/);

    await expect(addShared(db, null, "Shared without promotion.", H("1"), "idem-shared-0")).rejects.toThrow(/approved promotion/);
    await expect(addShared(db, promo1, "Shared before approval.", H("1"), "idem-shared-1")).rejects.toThrow(/approved promotion/);

    expect((await decide(db, USER.ownerA, promo1, H("1"))).affectedRows).toBe(1);
    await expect(decide(db, USER.ownerA, promo1, H("1"), "rejected")).rejects.toThrow(/decided promotion cannot change/);
    await expect(addShared(db, promo1, "Shared with the wrong hash.", H("7"), "idem-shared-2")).rejects.toThrow(/approved promotion/);
    await addShared(db, promo1, "Shared reviewed fact one.", H("1"), "idem-shared-3");

    await asUser(db, USER.memberA);
    expect((await db.query("select 1 from public.client_adapter_memory_items")).rows).toHaveLength(1);
    await asUser(db, USER.adminA);
    expect((await db.query("select 1 from public.client_adapter_memory_items")).rows).toHaveLength(3);
    await asUser(db, USER.ownerB);
    expect((await db.query("select 1 from public.client_adapter_memory_items")).rows).toHaveLength(0);
  } finally {
    await db.close();
  }
});

test("the same fact cannot be shared twice, and shared memory cannot be edited, only tombstoned with its content erased", async () => {
  const db = await freshDb();
  try {
    await register(db, USER.ownerA, "tenant-a", "knowledge");
    const one = await addPrivate(db, "knowledge", "Fact worth sharing.", H("1"), "idem-private-1");
    const two = await addPrivate(db, "knowledge", "Fact worth sharing.", H("1"), "idem-private-2");
    const promoOne = await propose(db, one, "knowledge", H("1"), USER.memberA);
    const promoTwo = await propose(db, two, "knowledge", H("1"), USER.memberA);
    await decide(db, USER.ownerA, promoOne, H("1"));
    await decide(db, USER.ownerA, promoTwo, H("1"));
    const shared = (await addShared(db, promoOne, "Fact worth sharing.", H("1"), "idem-shared-1")).rows[0].id;
    await expect(addShared(db, promoTwo, "Fact worth sharing.", H("1"), "idem-shared-2")).rejects.toThrow(/duplicate key|shared_hash_idx/);

    await asService(db);
    await expect(db.query("update public.client_adapter_memory_items set content='edited' where id=$1", [shared])).rejects.toThrow(/immutable/);
    await expect(db.query("update public.client_adapter_memory_items set status='tombstoned', tombstoned_at=now() where id=$1", [shared])).rejects.toThrow(/erase the content/);
    await db.query("update public.client_adapter_memory_items set status='tombstoned', tombstoned_at=now(), content='[tombstoned]' where id=$1", [shared]);
    await expect(db.query("update public.client_adapter_memory_items set status='active', tombstoned_at=null where id=$1", [shared])).rejects.toThrow(/cannot be restored/);
    await expect(db.query("delete from public.client_adapter_memory_items where id=$1", [shared])).rejects.toThrow(/permission denied/);
    await addShared(db, promoTwo, "Fact worth sharing.", H("1"), "idem-shared-3");
  } finally {
    await db.close();
  }
});

test("provenance and budget events are append-only; a tenant delete still cascades", async () => {
  const db = await freshDb();
  try {
    await register(db, USER.ownerA, "tenant-a", "knowledge");
    const item = await addPrivate(db, "knowledge", "A noted fact.", H("1"), "idem-private-1");
    await asService(db);
    await db.query(
      "insert into public.client_adapter_memory_provenance (tenant_slug, item_id, adapter_id, adapter_version, agent_principal, source_task_id, confidence) values ('tenant-a',$1,'knowledge','0.1.0','ingest','task-1',0.9)",
      [item],
    );
    await db.query(
      "insert into public.client_adapter_budget_events (tenant_slug, adapter_id, task_id, kind, amount_micros, provider, idempotency_key) values ('tenant-a','knowledge','task-1','reserve',250000,'provider-x','idem-budget-1')",
    );
    for (const table of ["client_adapter_memory_provenance", "client_adapter_budget_events"]) {
      await asService(db);
      await expect(db.query(`update public.${table} set tenant_slug = tenant_slug`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`delete from public.${table}`)).rejects.toThrow(/permission denied/);
      await asOwner(db);
      await expect(db.query(`update public.${table} set tenant_slug = tenant_slug`)).rejects.toThrow(/append-only/);
      await expect(db.query(`delete from public.${table}`)).rejects.toThrow(/append-only/);
      await expect(db.query(`truncate public.${table}`)).rejects.toThrow(/cannot be truncated/);
    }
    await asOwner(db);
    await db.exec("delete from public.client_tenants where slug='tenant-a'");
    expect((await db.query("select 1 from public.client_adapter_memory_provenance")).rows).toHaveLength(0);
    expect((await db.query("select 1 from public.client_adapter_budget_events")).rows).toHaveLength(0);
  } finally {
    await db.close();
  }
});

async function requestApproval(db: PGlite, requester: string, hash: string, destination = "https://example.com/post", createdOffset = "now()", expires = "now() + interval '1 hour'") {
  await asService(db);
  const result = await db.query<{ id: string }>(
    `insert into public.client_adapter_approvals (tenant_slug, adapter_id, action_kind, action_hash, destination, policy_version, requested_by, created_at, expires_at)
     values ('tenant-a','knowledge','publish',$1,$2,'policy-1',$3,${createdOffset},${expires}) returning id`,
    [hash, destination, requester],
  );
  return result.rows[0].id;
}

async function approve(db: PGlite, user: string, id: string, hash: string, status = "approved") {
  await asUser(db, user);
  return db.query("update public.client_adapter_approvals set status=$3, decided_by=auth.uid(), decided_at=now(), approved_action_hash=$2 where id=$1", [id, hash, status]);
}

test("approvals: bound to the exact hash, distinct approver, single use, expiring, no illegal moves", async () => {
  const db = await freshDb();
  try {
    await register(db, USER.ownerA, "tenant-a", "knowledge");
    const id = await requestApproval(db, USER.memberA, H("1"));
    await expect(requestApproval(db, USER.viewerA, H("1"))).rejects.toThrow(/duplicate key|live_idx/);
    await expect(approve(db, USER.ownerA, id, H("2"))).rejects.toThrow(/approved_complete/);
    expect((await approve(db, USER.memberA, id, H("1"))).affectedRows).toBe(0);
    const selfRequested = await requestApproval(db, USER.adminA, H("3"));
    await expect(approve(db, USER.adminA, selfRequested, H("3"))).rejects.toThrow(/distinct_approver/);

    expect((await approve(db, USER.ownerA, id, H("1"))).affectedRows).toBe(1);
    await asUser(db, USER.ownerA);
    await expect(db.query("update public.client_adapter_approvals set status='executed' where id=$1", [id])).rejects.toThrow(/executed_complete/);
    await asService(db);
    await expect(db.query("update public.client_adapter_approvals set destination='https://evil.example' where id=$1", [id])).rejects.toThrow(/identity is immutable/);

    const run = "update public.client_adapter_approvals set status='executed', executed_at=now(), execution_receipt_sha256=$2 where id=$1 and status='approved'";
    expect((await db.query(run, [id, H("e")])).affectedRows).toBe(1);
    expect((await db.query(run, [id, H("e")])).affectedRows).toBe(0);
    await requestApproval(db, USER.memberA, H("1")); // an executed approval does not block a new request for the same action

    const rejected = await requestApproval(db, USER.memberA, H("4"));
    await approve(db, USER.ownerA, rejected, H("4"), "rejected");
    await expect(approve(db, USER.ownerA, rejected, H("4"))).rejects.toThrow(/cannot move from rejected to approved/);

    const stale = await requestApproval(db, USER.memberA, H("5"), "https://example.com/old", "now() - interval '2 hours'", "now() - interval '1 hour'");
    await expect(approve(db, USER.ownerA, stale, H("5"))).rejects.toThrow(/expired/);
  } finally {
    await db.close();
  }
});

test("budget events: integer micros, idempotent, tied to a registered adapter, readable by members only", async () => {
  const db = await freshDb();
  try {
    await register(db, USER.ownerA, "tenant-a", "knowledge");
    await asService(db);
    const insert = "insert into public.client_adapter_budget_events (tenant_slug, adapter_id, task_id, kind, amount_micros, provider, idempotency_key) values ('tenant-a',$1,'task-1','settle',$2,'provider-x',$3)";
    await db.query(insert, ["knowledge", 1500, "idem-budget-1"]);
    await expect(db.query(insert, ["knowledge", 1500, "idem-budget-1"])).rejects.toThrow(/duplicate key/);
    await expect(db.query(insert, ["knowledge", -1, "idem-budget-2"])).rejects.toThrow(/amount_micros/);
    await expect(db.query(insert, ["unregistered", 1, "idem-budget-3"])).rejects.toThrow(/foreign key/);
    await asUser(db, USER.viewerA);
    expect((await db.query("select amount_micros from public.client_adapter_budget_events")).rows).toEqual([{ amount_micros: 1500 }]);
    await asUser(db, USER.ownerB);
    expect((await db.query("select 1 from public.client_adapter_budget_events")).rows).toHaveLength(0);
    await asAnon(db);
    await expect(db.query("select 1 from public.client_adapter_budget_events")).rejects.toThrow(/permission denied/);
  } finally {
    await db.close();
  }
});

test("outbox: unique event ids, bounded payloads, acknowledgement only after delivery, admin-only reads", async () => {
  const db = await freshDb();
  try {
    await asService(db);
    const insert = "insert into public.client_adapter_outbox (tenant_slug, event_id, event_type, payload) values ('tenant-a',$1,'memory.tombstoned',$2::jsonb)";
    const eventId = "00000000-0000-4000-8000-0000000000e1";
    await db.query(insert, [eventId, "{}"]);
    await expect(db.query(insert, [eventId, "{}"])).rejects.toThrow(/duplicate key/);
    await expect(db.query("insert into public.client_adapter_outbox (tenant_slug, event_type, payload) values ('tenant-a','memory.committed', jsonb_build_object('x', repeat('a', 20000)))")).rejects.toThrow(/payload/);
    await expect(db.query("update public.client_adapter_outbox set acked_at=now(), receipt_sha256=$2 where event_id=$1", [eventId, H("a")])).rejects.toThrow(/ack_after_delivery/);
    await db.query("update public.client_adapter_outbox set delivered_at=now(), attempt_count=1 where event_id=$1", [eventId]);
    await db.query("update public.client_adapter_outbox set acked_at=now(), receipt_sha256=$2 where event_id=$1", [eventId, H("a")]);
    await asUser(db, USER.memberA);
    expect((await db.query("select 1 from public.client_adapter_outbox")).rows).toHaveLength(0);
    await asUser(db, USER.adminA);
    expect((await db.query("select 1 from public.client_adapter_outbox")).rows).toHaveLength(1);
  } finally {
    await db.close();
  }
});

// Added by the Phase 1 mutation sweep (item 16): rules that could be removed without any test failing.
test("the restore context is honoured only for the service role, with well-formed settings for that table and tenant", async () => {
  const db = await freshDb();
  try {
    const ctx = (table = "client_adapter_memory_items", tenant = "tenant-a") => JSON.stringify({ table, tenant });
    const check = async (role: string, setting: string) => {
      await db.exec("reset role");
      await db.query("select set_config('app.client_lifecycle_restore',$1,false)", [setting]);
      if (role) await db.exec(`set role ${role}`);
      const r = await db.query<{ v: boolean | null }>("select public.client_adapter_restoring('client_adapter_memory_items','tenant-a') as v");
      return r.rows[0].v;
    };
    expect(await check("service_role", ctx())).toBe(true);
    // Anyone can put a value in that setting for their own session; only the service role may act on it.
    expect(await check("", ctx())).toBe(false);
    expect(await check("service_role", "")).toBe(false);
    expect(await check("service_role", "not json")).toBe(false);
    expect(await check("service_role", ctx("client_adapter_memory_promotions"))).toBe(false);
    expect(await check("service_role", ctx("client_adapter_memory_items", "tenant-b"))).toBe(false);
  } finally {
    await db.close();
  }
});

test("stored memory: identity and hash cannot change, and superseded memory stays superseded", async () => {
  const db = await freshDb();
  try {
    await register(db, USER.ownerA, "tenant-a", "knowledge");
    const item = await addPrivate(db, "knowledge", "A private working note.", H("1"), "idem-private-1");
    await asService(db);
    await expect(db.query("update public.client_adapter_memory_items set idempotency_key='idem-changed-1' where id=$1", [item])).rejects.toThrow(/identity and content hash are immutable/);
    await expect(db.query("update public.client_adapter_memory_items set content_sha256=$2 where id=$1", [item, H("2")])).rejects.toThrow(/identity and content hash are immutable/);
    await db.query("update public.client_adapter_memory_items set status='superseded' where id=$1", [item]);
    await expect(db.query("update public.client_adapter_memory_items set status='active' where id=$1", [item])).rejects.toThrow(/superseded memory cannot become active again/);
  } finally {
    await db.close();
  }
});

test("promotions: identity cannot change, and a promotion with no usable scan cannot be approved", async () => {
  const db = await freshDb();
  try {
    await register(db, USER.ownerA, "tenant-a", "knowledge");
    const first = await addPrivate(db, "knowledge", "A note to promote.", H("1"), "idem-private-1");
    const second = await addPrivate(db, "knowledge", "A note from before scanning existed.", H("2"), "idem-private-2");
    const promo = await propose(db, first, "knowledge", H("1"), USER.memberA);
    await asService(db);
    await expect(db.query("update public.client_adapter_memory_promotions set requested_by=$2 where id=$1", [promo, USER.adminA])).rejects.toThrow(/promotion identity is immutable/);
    await expect(db.query("update public.client_adapter_memory_promotions set content_sha256=$2 where id=$1", [promo, H("9")])).rejects.toThrow(/promotion identity is immutable/);

    // A promotion made before scans existed has no verdict. The insert guard is switched off only to create that old row.
    await asOwner(db);
    await db.exec("alter table public.client_adapter_memory_promotions disable trigger user");
    const legacy = await db.query<{ id: string }>(
      "insert into public.client_adapter_memory_promotions (tenant_slug, source_item_id, origin_adapter_id, content_sha256, requested_by, scan_result) values ('tenant-a',$1,'knowledge',$2,$3,'{}'::jsonb) returning id",
      [second, H("2"), USER.memberA],
    );
    await db.exec("alter table public.client_adapter_memory_promotions enable trigger user");
    await expect(decide(db, USER.ownerA, legacy.rows[0].id, H("2"))).rejects.toThrow(/adapter_promotion_scan_required/);
  } finally {
    await db.close();
  }
});

test("approvals: the decision fields cannot be edited while the status stays the same", async () => {
  const db = await freshDb();
  try {
    await register(db, USER.ownerA, "tenant-a", "knowledge");
    const id = await requestApproval(db, USER.memberA, H("1"));
    await asService(db);
    await expect(db.query("update public.client_adapter_approvals set decided_by=$2 where id=$1", [id, USER.ownerA])).rejects.toThrow(/decision fields change only with a status transition/);
    await expect(db.query("update public.client_adapter_approvals set approved_action_hash=$2 where id=$1", [id, H("1")])).rejects.toThrow(/decision fields change only with a status transition/);
  } finally {
    await db.close();
  }
});
