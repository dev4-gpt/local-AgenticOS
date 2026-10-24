import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// Real PostgreSQL (PGlite) tests for supabase-client-adapter-budget-reconcile.sql: what an adapter says a task cost,
// compared with the host's own reserve / settle / release rows (ADR-016). It only flags; nothing is settled or blocked.
const read = (file: string) => readFileSync(`product-experience/supabase-client-${file}.sql`, "utf8");
const USER = {
  ownerA: "00000000-0000-4000-8000-0000000000a1",
  adminA: "00000000-0000-4000-8000-0000000000a2",
  memberA: "00000000-0000-4000-8000-0000000000a3",
  ownerB: "00000000-0000-4000-8000-0000000000b1",
};
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const FILES = ["adapter-host", "adapter-token-uses", "adapter-retention-28", "adapter-promotions", "adapter-proposals", "adapter-ingest", "adapter-tombstones", "adapter-budget-reconcile"];
const WORKER = "worker-token-aaaaaaaaaaaaaaaaaaaaaaaa";

async function freshDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
    end $$;
    create schema extensions; create extension pgcrypto with schema extensions;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table auth.users(id uuid primary key);
    create table public.client_tenants(slug text primary key, status text not null default 'active', worker_token_hash text, retention_days integer not null default 28);
    create table public.client_memberships(
      tenant_slug text not null references public.client_tenants(slug) on delete cascade,
      user_id uuid not null references auth.users(id), role text not null, status text not null default 'active',
      primary key (tenant_slug, user_id));
    create function public.client_member(p_tenant_slug text) returns boolean language sql stable security definer set search_path = public as $$
      select exists (select 1 from public.client_memberships where tenant_slug = p_tenant_slug and user_id = auth.uid() and status = 'active') $$;
    grant usage on schema public, auth, extensions to anon, authenticated, service_role;
    grant execute on function public.client_member(text) to authenticated;
    insert into auth.users values ('${USER.ownerA}'), ('${USER.adminA}'), ('${USER.memberA}'), ('${USER.ownerB}');
    insert into public.client_tenants(slug, worker_token_hash) values ('tenant-a', '${sha(WORKER)}'), ('tenant-b', '${sha(WORKER)}');
    insert into public.client_memberships values
      ('tenant-a', '${USER.ownerA}', 'owner', 'active'), ('tenant-a', '${USER.adminA}', 'admin', 'active'),
      ('tenant-a', '${USER.memberA}', 'member', 'active'), ('tenant-b', '${USER.ownerB}', 'owner', 'active');
  `);
  for (const file of FILES) await db.exec(read(file));
  await db.exec(`insert into public.client_adapter_registry (tenant_slug, adapter_id, display_name, contract_version, manifest_sha256, created_by, state)
    values ('tenant-a','creator-os','Creator OS','h1','${"a".repeat(64)}','${USER.ownerA}','enabled'),
           ('tenant-a','forge','Forge','h1','${"a".repeat(64)}','${USER.ownerA}','disabled'),
           ('tenant-a','second-one','Second','h1','${"a".repeat(64)}','${USER.ownerA}','enabled'),
           ('tenant-a','preview-one','Preview','h1','${"a".repeat(64)}','${USER.ownerA}','preview'),
           ('tenant-b','creator-os','Creator OS','h1','${"a".repeat(64)}','${USER.ownerB}','enabled')`);
  return db;
}

const asUser = async (db: PGlite, id: string) => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
};
const asService = (db: PGlite) => db.exec("reset role; set role service_role");
const asOwner = (db: PGlite) => db.exec("reset role");

let key = 0;
/** The host's own rows for a task, written as the budget functions would write them (the comparison only reads them). */
async function host(db: PGlite, task: string, rows: Array<{ kind: "reserve" | "settle" | "release"; micros: number }>, o: { tenant?: string; adapter?: string } = {}) {
  await asOwner(db);
  for (const r of rows) {
    key += 1;
    await db.query(
      "insert into public.client_adapter_budget_events (tenant_slug, adapter_id, task_id, kind, amount_micros, provider, idempotency_key) values ($1,$2,$3,$4,$5,'test-provider',$6)",
      [o.tenant ?? "tenant-a", o.adapter ?? "creator-os", task, r.kind, r.micros, `key-${String(key).padStart(8, "0")}`],
    );
  }
}
async function report(db: PGlite, task: string, micros: number, o: { tenant?: string; adapter?: string } = {}) {
  await asService(db);
  return (await db.query<{ r: string }>("select public.client_adapter_budget_record_report($1,$2,$3,$4) as r", [o.tenant ?? "tenant-a", o.adapter ?? "creator-os", task, micros])).rows[0].r;
}
const counts = async (db: PGlite, user = USER.memberA, tenant = "tenant-a") => {
  await asUser(db, user);
  const rows = (await db.query<{ adapter_id: string; status: string; task_count: number }>("select * from public.client_adapter_budget_reconcile_counts($1) order by adapter_id, status", [tenant])).rows;
  return Object.fromEntries(rows.map((r) => [`${r.adapter_id}:${r.status}`, r.task_count]));
};
const tasks = async (db: PGlite, user = USER.adminA, tenant = "tenant-a") => {
  await asUser(db, user);
  return (await db.query<{ task_id: string; status: string; reported_micros: string; reserved_micros: string | null; settled_micros: string | null }>("select * from public.client_adapter_budget_reconcile_tasks($1)", [tenant])).rows;
};

test("a reported spend is recorded once per task, as ids and a number, and a second report changes nothing", async () => {
  const db = await freshDb();
  try {
    expect(await report(db, "h1-aaaaaaaaaaaaaaaaaaaaaaaa", 12_500)).toBe("recorded");
    expect(await report(db, "h1-aaaaaaaaaaaaaaaaaaaaaaaa", 12_500)).toBe("duplicate");
    expect(await report(db, "h1-aaaaaaaaaaaaaaaaaaaaaaaa", 99_999)).toBe("duplicate"); // the first report stands
    expect(await report(db, "h1-bbbbbbbbbbbbbbbbbbbbbbbb", 0)).toBe("recorded");
    expect(await report(db, "h1-aaaaaaaaaaaaaaaaaaaaaaaa", 7, { tenant: "tenant-b" })).toBe("recorded"); // another tenant's task is its own
    await asOwner(db);
    const rows = (await db.query("select tenant_slug, event_type, adapter_id, payload, causation_id from public.client_adapter_outbox where event_type = 'budget.reported' order by tenant_slug, payload ->> 'task_id'")).rows;
    expect(rows).toEqual([
      { tenant_slug: "tenant-a", event_type: "budget.reported", adapter_id: "creator-os", payload: { task_id: "h1-aaaaaaaaaaaaaaaaaaaaaaaa", reported_micros: 12_500 }, causation_id: null },
      { tenant_slug: "tenant-a", event_type: "budget.reported", adapter_id: "creator-os", payload: { task_id: "h1-bbbbbbbbbbbbbbbbbbbbbbbb", reported_micros: 0 }, causation_id: null },
      { tenant_slug: "tenant-b", event_type: "budget.reported", adapter_id: "creator-os", payload: { task_id: "h1-aaaaaaaaaaaaaaaaaaaaaaaa", reported_micros: 7 }, causation_id: null },
    ]);
  } finally {
    await db.close();
  }
});

test("a malformed report, an unknown or switched-off adapter and an inactive tenant are refused and leave nothing", async () => {
  const db = await freshDb();
  try {
    const T = "h1-cccccccccccccccccccccccc";
    expect(await report(db, T, -1)).toBe("invalid");
    expect(await report(db, T, 1_000_000_000_001)).toBe("invalid");
    expect(await report(db, "", 5)).toBe("invalid");
    expect(await report(db, "x".repeat(129), 5)).toBe("invalid");
    expect(await report(db, T, 5, { tenant: "Bad Tenant" })).toBe("invalid");
    expect(await report(db, T, 5, { adapter: "BAD" })).toBe("invalid");
    expect(await report(db, T, 5, { adapter: "forge" })).toBe("adapter_not_active"); // registered but disabled
    expect(await report(db, T, 5, { adapter: "nobody-here" })).toBe("adapter_not_active");
    await asOwner(db);
    await db.exec("update public.client_tenants set status = 'suspended' where slug = 'tenant-b'");
    expect(await report(db, T, 5, { tenant: "tenant-b" })).toBe("adapter_not_active");
    expect(await report(db, T, 1_000_000_000_000)).toBe("recorded"); // the top of the range is allowed
    expect(await report(db, T, 5, { adapter: "preview-one" })).toBe("recorded"); // a preview adapter is active enough to be heard
    await asOwner(db);
    expect(Number((await db.query<{ n: string }>("select count(*) as n from public.client_adapter_outbox where event_type = 'budget.reported'")).rows[0].n)).toBe(2);
  } finally {
    await db.close();
  }
});

test("each reported task is compared with the host's own rows and gets one of five statuses", async () => {
  const db = await freshDb();
  try {
    await report(db, "t-unreserved", 5_000);
    await host(db, "t-matched", [{ kind: "reserve", micros: 10_000 }, { kind: "settle", micros: 4_000 }]);
    await report(db, "t-matched", 4_500); // within the tolerance
    await host(db, "t-differs", [{ kind: "reserve", micros: 10_000 }, { kind: "settle", micros: 4_000 }]);
    await report(db, "t-differs", 6_000);
    await host(db, "t-over", [{ kind: "reserve", micros: 3_000 }]);
    await report(db, "t-over", 5_000);
    await host(db, "t-open", [{ kind: "reserve", micros: 10_000 }]);
    await report(db, "t-open", 2_000);
    await host(db, "t-released-free", [{ kind: "reserve", micros: 10_000 }, { kind: "release", micros: 10_000 }]);
    await report(db, "t-released-free", 0);
    await host(db, "t-released-spent", [{ kind: "reserve", micros: 10_000 }, { kind: "release", micros: 10_000 }]);
    await report(db, "t-released-spent", 5_000);
    expect(await counts(db)).toEqual({ "creator-os:unreserved": 1, "creator-os:matched": 2, "creator-os:settled_differs": 2, "creator-os:over_reserved": 1, "creator-os:open": 1 });
    const byTask = Object.fromEntries((await tasks(db)).map((t) => [t.task_id, t.status]));
    expect(byTask).toEqual({ "t-unreserved": "unreserved", "t-differs": "settled_differs", "t-over": "over_reserved", "t-open": "open", "t-released-spent": "settled_differs" }); // matched ones are not listed
  } finally {
    await db.close();
  }
});

test("the tolerance is exactly 1,000 micros, on both comparisons", async () => {
  const db = await freshDb();
  try {
    // cap: reserved 5,000, reported up to 6,000 is within the tolerance, 6,001 is over
    await host(db, "cap-edge-ok", [{ kind: "reserve", micros: 5_000 }, { kind: "settle", micros: 6_000 }]);
    await report(db, "cap-edge-ok", 6_000);
    await host(db, "cap-edge-over", [{ kind: "reserve", micros: 5_000 }]);
    await report(db, "cap-edge-over", 6_001);
    // settle: 4,000 settled, reported 5,000 matches, 5,001 differs; 3,000 matches, 2,999 differs
    for (const [task, reported] of [["settle-hi-ok", 5_000], ["settle-hi-bad", 5_001], ["settle-lo-ok", 3_000], ["settle-lo-bad", 2_999]] as const) {
      await host(db, task, [{ kind: "reserve", micros: 20_000 }, { kind: "settle", micros: 4_000 }]);
      await report(db, task, reported);
    }
    // a released reservation with up to 1,000 reported counts as nothing spent; 1,001 does not
    await host(db, "rel-ok", [{ kind: "reserve", micros: 20_000 }, { kind: "release", micros: 20_000 }]);
    await report(db, "rel-ok", 1_000);
    await host(db, "rel-bad", [{ kind: "reserve", micros: 20_000 }, { kind: "release", micros: 20_000 }]);
    await report(db, "rel-bad", 1_001);
    const rows = Object.fromEntries((await tasks(db)).map((t) => [t.task_id, t.status]));
    expect(rows).toEqual({ "cap-edge-over": "over_reserved", "settle-hi-bad": "settled_differs", "settle-lo-bad": "settled_differs", "rel-bad": "settled_differs" });
    expect(await counts(db)).toEqual({ "creator-os:matched": 4, "creator-os:over_reserved": 1, "creator-os:settled_differs": 3 });
  } finally {
    await db.close();
  }
});

test("only the tenant's own members see the counts, only admins see the tasks, and nobody else can read or call the rest", async () => {
  const db = await freshDb();
  try {
    await report(db, "t-one", 5_000);
    await report(db, "t-other-tenant", 9_000, { tenant: "tenant-b" });
    expect(await counts(db, USER.memberA)).toEqual({ "creator-os:unreserved": 1 });
    expect(await counts(db, USER.ownerB, "tenant-a")).toEqual({}); // another tenant's member gets nothing
    expect(await counts(db, USER.ownerB, "tenant-b")).toEqual({ "creator-os:unreserved": 1 });
    expect((await tasks(db, USER.adminA)).map((t) => t.task_id)).toEqual(["t-one"]);
    expect(await tasks(db, USER.memberA)).toEqual([]); // a plain member sees counts, not task ids
    expect(await tasks(db, USER.ownerB, "tenant-a")).toEqual([]);
    // signed-in users cannot record a report or call the internal comparison; the anonymous role can call nothing
    await asUser(db, USER.adminA);
    await expect(db.query("select public.client_adapter_budget_record_report('tenant-a','creator-os','t-x',5)")).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from public.client_adapter_budget_reconcile_rows('tenant-a')")).rejects.toThrow(/permission denied/);
    await asOwner(db);
    await db.exec("set role anon");
    for (const sql of ["select * from public.client_adapter_budget_reconcile_counts('tenant-a')", "select * from public.client_adapter_budget_reconcile_tasks('tenant-a')", "select public.client_adapter_budget_record_report('tenant-a','creator-os','t-x',5)"]) {
      await expect(db.query(sql), sql).rejects.toThrow(/permission denied/);
    }
  } finally {
    await db.close();
  }
});

test("only the last 28 days are compared, the money tables are never changed, and the activity panel counts the reports", async () => {
  const db = await freshDb();
  try {
    await host(db, "t-money", [{ kind: "reserve", micros: 10_000 }, { kind: "settle", micros: 4_000 }]);
    const before = JSON.stringify((await db.query("select task_id, kind, amount_micros from public.client_adapter_budget_events order by task_id, kind")).rows);
    await report(db, "t-money", 6_000);
    await report(db, "t-old", 5_000);
    await report(db, "t-edge", 5_000);
    await asOwner(db);
    await db.exec("update public.client_adapter_outbox set created_at = now() - interval '40 days' where payload ->> 'task_id' = 't-old'");
    await db.exec("update public.client_adapter_outbox set created_at = now() - interval '27 days 12 hours' where payload ->> 'task_id' = 't-edge'");
    expect(await counts(db)).toEqual({ "creator-os:settled_differs": 1, "creator-os:unreserved": 1 }); // 40 days old is out of the window, 27.5 days old is still in
    await asOwner(db);
    expect(JSON.stringify((await db.query("select task_id, kind, amount_micros from public.client_adapter_budget_events order by task_id, kind")).rows)).toBe(before);
    await asUser(db, USER.memberA);
    const activity = await db.query("select adapter_id, event_type, event_count from public.client_adapter_activity_counts('tenant-a') where event_type = 'budget.reported'");
    expect(activity.rows).toEqual([{ adapter_id: "creator-os", event_type: "budget.reported", event_count: 2 }]);
  } finally {
    await db.close();
  }
});

test("a database installed before the event existed accepts it once the migration is applied, and the migration can be applied twice", async () => {
  const db = await freshDb();
  try {
    await asOwner(db);
    await db.exec("alter table public.client_adapter_outbox drop constraint client_adapter_outbox_event_type_check; alter table public.client_adapter_outbox add constraint client_adapter_outbox_event_type_check check (event_type in ('memory.committed', 'memory.tombstoned', 'task.requested', 'approval.requested', 'approval.decided', 'approval.executed', 'promotion.decided', 'memory.proposed', 'memory.erased'));");
    await expect(report(db, "t-early", 5)).rejects.toThrow(/event_type_check/);
    await asOwner(db);
    await db.exec(read("adapter-budget-reconcile"));
    await db.exec(read("adapter-budget-reconcile"));
    expect(await report(db, "t-early", 5)).toBe("recorded");
  } finally {
    await db.close();
  }
});

test("one adapter's report is its own, and another tenant's or another adapter's rows for the same task id never count", async () => {
  const db = await freshDb();
  try {
    // the same task id in two tenants and two adapters is three different things
    expect(await report(db, "t-shared-id", 4_000)).toBe("recorded");
    expect(await report(db, "t-shared-id", 4_000, { adapter: "second-one" })).toBe("recorded");
    expect(await report(db, "t-shared-id", 4_000, { tenant: "tenant-b" })).toBe("recorded");
    await host(db, "t-shared-id", [{ kind: "reserve", micros: 10_000 }, { kind: "settle", micros: 4_000 }], { tenant: "tenant-b" });
    await host(db, "t-shared-id", [{ kind: "reserve", micros: 10_000 }, { kind: "settle", micros: 9_000 }], { adapter: "second-one" });
    expect(await counts(db, USER.memberA, "tenant-a")).toEqual({ "creator-os:unreserved": 1, "second-one:settled_differs": 1 }); // creator-os in tenant-a has no reservation of its own
    expect(await counts(db, USER.ownerB, "tenant-b")).toEqual({ "creator-os:matched": 1 });
    // creator-os has only a reservation of its own; the other adapter's settle and release of the same task id must not close it
    await host(db, "t-shared-2", [{ kind: "reserve", micros: 10_000 }]);
    await host(db, "t-shared-2", [{ kind: "reserve", micros: 10_000 }, { kind: "settle", micros: 4_000 }], { adapter: "second-one" });
    await report(db, "t-shared-2", 4_000);
    await host(db, "t-shared-3", [{ kind: "reserve", micros: 10_000 }]);
    await host(db, "t-shared-3", [{ kind: "reserve", micros: 10_000 }, { kind: "release", micros: 10_000 }], { adapter: "second-one" });
    await report(db, "t-shared-3", 4_000);
    expect(await counts(db, USER.memberA, "tenant-a")).toEqual({ "creator-os:unreserved": 1, "creator-os:open": 2, "second-one:settled_differs": 1 });
  } finally {
    await db.close();
  }
});
