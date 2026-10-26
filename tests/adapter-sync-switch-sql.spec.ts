import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// Real PostgreSQL (PGlite) tests for supabase-client-adapter-sync-switch.sql (ADR-019): the switch that decides whether the
// scheduled adapter sync may call the adapter. Nothing real is used.
const read = (file: string) => readFileSync(`product-experience/supabase-client-${file}.sql`, "utf8");
const USER = {
  ownerA: "00000000-0000-4000-8000-0000000000a1",
  adminA: "00000000-0000-4000-8000-0000000000a2",
  memberA: "00000000-0000-4000-8000-0000000000a3",
  ownerB: "00000000-0000-4000-8000-0000000000b1",
  outsider: "00000000-0000-4000-8000-0000000000c1",
};
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const FILES = ["adapter-host", "adapter-token-uses", "adapter-approval-gateway", "adapter-retention-28", "adapter-promotions", "adapter-proposals", "adapter-ingest", "adapter-tombstones", "adapter-sync-switch"];
const WORKER = "worker-token-aaaaaaaaaaaaaaaaaaaaaaaa";
const FACT = "Replies within 5 minutes converted at 42%.";

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
    insert into auth.users values ('${USER.ownerA}'), ('${USER.adminA}'), ('${USER.memberA}'), ('${USER.ownerB}'), ('${USER.outsider}');
    insert into public.client_tenants(slug, worker_token_hash) values ('tenant-a', '${sha(WORKER)}'), ('tenant-b', '${sha(WORKER)}');
    insert into public.client_memberships values
      ('tenant-a', '${USER.ownerA}', 'owner', 'active'), ('tenant-a', '${USER.adminA}', 'admin', 'active'),
      ('tenant-a', '${USER.memberA}', 'member', 'active'), ('tenant-b', '${USER.ownerB}', 'owner', 'active');
  `);
  for (const file of FILES) await db.exec(read(file));
  await db.exec(`insert into public.client_adapter_registry (tenant_slug, adapter_id, display_name, contract_version, manifest_sha256, created_by, state, deletion_guarantee)
    values ('tenant-a','creator-os','Creator OS','h1','${"a".repeat(64)}','${USER.ownerA}','enabled','receipt'),
           ('tenant-a','plain-one','Plain','h1','${"a".repeat(64)}','${USER.ownerA}','enabled','none'),
           ('tenant-a','paused-one','Paused','h1','${"a".repeat(64)}','${USER.ownerA}','suspended','receipt'),
           ('tenant-b','creator-os','Creator OS','h1','${"a".repeat(64)}','${USER.ownerB}','enabled','receipt')`);
  return db;
}

const asUser = async (db: PGlite, id: string) => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
};
const asService = (db: PGlite) => db.exec("reset role; set role service_role");
const asOwner = (db: PGlite) => db.exec("reset role");

type Status = { mode: string; on_until: string | null; always_on_allowed: boolean; sync_now_pending: boolean; now: string };
const status = async (db: PGlite, user = USER.memberA, tenant = "tenant-a", adapter = "creator-os") => {
  await asUser(db, user);
  return (await db.query<{ r: Status }>("select public.client_adapter_sync_switch_status($1,$2) as r", [tenant, adapter])).rows[0].r;
};
const setMode = async (db: PGlite, mode: string, user = USER.adminA, tenant = "tenant-a", adapter = "creator-os") => {
  await asUser(db, user);
  return (await db.query<{ r: string }>("select public.client_adapter_sync_switch_set($1,$2,$3) as r", [tenant, adapter, mode])).rows[0].r;
};
const requestNow = async (db: PGlite, user = USER.adminA) => {
  await asUser(db, user);
  return (await db.query<{ r: boolean }>("select public.client_adapter_sync_switch_request_now('tenant-a','creator-os') as r")).rows[0].r;
};
const jobCheck = async (db: PGlite, tenant = "tenant-a", adapter = "creator-os") => {
  await asService(db);
  return (await db.query<{ r: string }>("select public.client_adapter_sync_switch_job_check($1,$2) as r", [tenant, adapter])).rows[0].r;
};
const allowAlways = async (db: PGlite, allowed: boolean, adapter = "creator-os") => {
  await asService(db);
  return (await db.query<{ r: boolean }>("select public.client_adapter_sync_switch_allow_always('tenant-a',$1,$2) as r", [adapter, allowed])).rows[0].r;
};

test("a fresh client reads as off, and a sync run is skipped so the adapter is never called", async () => {
  const db = await freshDb();
  expect(await status(db)).toMatchObject({ mode: "off", on_until: null, always_on_allowed: false, sync_now_pending: false });
  expect(await jobCheck(db)).toBe("skip");
});

test("an admin turns it on for 1, 4 or 24 hours and the run is allowed until the time is up, then it turns itself off", async () => {
  const db = await freshDb();
  for (const [mode, hours] of [["1h", 1], ["4h", 4], ["24h", 24]] as const) {
    expect(await setMode(db, mode)).toBe("timed");
    const s = await status(db);
    expect(s.mode).toBe("timed");
    const length = (Date.parse(s.on_until!) - Date.parse(s.now)) / 3_600_000;
    expect(length).toBeGreaterThan(hours - 0.01);
    expect(length).toBeLessThanOrEqual(hours + 0.01);
    expect(await jobCheck(db)).toBe("run_on");
  }
  await asOwner(db);
  await db.exec("update public.client_adapter_sync_switch set on_until = now() - interval '1 second'");
  expect(await status(db)).toMatchObject({ mode: "off", on_until: null });
  expect(await jobCheck(db)).toBe("skip");
});

test("turning it off stops runs at once, and an owner can do it too", async () => {
  const db = await freshDb();
  await setMode(db, "4h");
  expect(await setMode(db, "off", USER.ownerA)).toBe("off");
  expect(await jobCheck(db)).toBe("skip");
  expect((await status(db)).mode).toBe("off");
});

test("a plain member, an outsider and another client's owner can read or change nothing", async () => {
  const db = await freshDb();
  await expect(setMode(db, "1h", USER.memberA)).rejects.toThrow(/adapter_sync_switch_not_found/);
  await expect(requestNow(db, USER.memberA)).rejects.toThrow(/adapter_sync_switch_not_found/);
  await expect(setMode(db, "1h", USER.ownerB)).rejects.toThrow(/adapter_sync_switch_not_found/);
  await expect(status(db, USER.outsider)).rejects.toThrow(/adapter_sync_switch_not_found/);
  await expect(status(db, USER.ownerB)).rejects.toThrow(/adapter_sync_switch_not_found/);
  expect(await jobCheck(db)).toBe("skip");
});

test("an unknown mode is refused, and so is an adapter that is not enabled", async () => {
  const db = await freshDb();
  for (const bad of ["2h", "forever", "", "1H"]) await expect(setMode(db, bad)).rejects.toThrow(/adapter_sync_switch_bad_mode/);
  await expect(setMode(db, "1h", USER.adminA, "tenant-a", "paused-one")).rejects.toThrow(/adapter_sync_switch_adapter_not_active/);
  expect(await jobCheck(db, "tenant-a", "paused-one")).toBe("skip");
  expect(await jobCheck(db, "tenant-a", "no-such-one")).toBe("skip");
});

test("'always' is refused for an admin until the operator allows it, and forbidding it again turns it off", async () => {
  const db = await freshDb();
  await expect(setMode(db, "always")).rejects.toThrow(/adapter_sync_switch_always_not_allowed/);
  await expect(setMode(db, "always", USER.ownerA)).rejects.toThrow(/adapter_sync_switch_always_not_allowed/);
  expect(await allowAlways(db, true)).toBe(true);
  expect((await status(db)).always_on_allowed).toBe(true);
  expect(await jobCheck(db)).toBe("skip"); // allowed is not the same as on
  expect(await setMode(db, "always")).toBe("always");
  expect(await status(db)).toMatchObject({ mode: "always", on_until: null });
  expect(await jobCheck(db)).toBe("run_on");
  expect(await setMode(db, "1h")).toBe("timed"); // choosing a time replaces always
  expect(await setMode(db, "always")).toBe("always");
  expect(await allowAlways(db, false)).toBe(true);
  expect(await status(db)).toMatchObject({ mode: "off", always_on_allowed: false });
  expect(await jobCheck(db)).toBe("skip");
});

test("only the service role can allow 'always' or ask whether a run may go ahead", async () => {
  const db = await freshDb();
  await asUser(db, USER.adminA);
  await expect(db.query("select public.client_adapter_sync_switch_allow_always('tenant-a','creator-os',true)")).rejects.toThrow(/permission denied/);
  await expect(db.query("select public.client_adapter_sync_switch_job_check('tenant-a','creator-os')")).rejects.toThrow(/permission denied/);
  await db.exec("reset role; set role anon");
  await expect(db.query("select public.client_adapter_sync_switch_status('tenant-a','creator-os')")).rejects.toThrow(/permission denied/);
  await expect(db.query("select * from public.client_adapter_sync_switch")).rejects.toThrow(/permission denied/);
  expect(await allowAlways(db, true, "no-such-one")).toBe(false);
});

test("'sync now' allows exactly one run, and asking twice before it runs is still one", async () => {
  const db = await freshDb();
  expect(await requestNow(db)).toBe(true);
  expect(await requestNow(db)).toBe(true);
  expect((await status(db)).sync_now_pending).toBe(true);
  expect(await jobCheck(db)).toBe("run_now");
  expect((await status(db)).sync_now_pending).toBe(false);
  expect(await jobCheck(db)).toBe("skip");
  await expect(requestNow(db)).resolves.toBe(true);
  expect(await jobCheck(db)).toBe("run_now");
});

test("a request for a sync does not turn the switch on", async () => {
  const db = await freshDb();
  await requestNow(db);
  expect((await status(db)).mode).toBe("off");
});

let counter = 0;
async function erasedNote(db: PGlite, adapter = "creator-os") {
  const eventId = (++counter).toString(16).padStart(32, "0");
  const content = `${FACT} (${adapter})`;
  await asService(db);
  const ingest = (await db.query<{ r: Record<string, string> }>(
    "select public.client_adapter_ingest_memory_proposal('tenant-a',$1,$2,$3,$4,$5::jsonb,'0.1.0',$1,'h1-aaaaaaaaaaaaaaaaaaaaaaaa','https://example.test/x',null) as r",
    [adapter, eventId, content, sha(content), JSON.stringify({ scanner: "memory-scan-h1", content_sha256: sha(content), verdict: "clean", findings: [], scanned_chars: content.length })],
  )).rows[0].r;
  await asUser(db, USER.adminA);
  await db.query("select public.client_adapter_decide_promotion($1,'approve',$2,null,'ordinary')", [ingest.promotion_id, sha(content)]);
  await asService(db);
  const shared = (await db.query<{ id: string }>(
    "insert into public.client_adapter_memory_items (tenant_slug, namespace, origin_adapter_id, content, content_sha256, trust_level, promotion_id, idempotency_key) values ('tenant-a','shared',$1,$2,$3,'reviewed',$4,'shared-' || $5) returning id",
    [adapter, content, sha(content), ingest.promotion_id, eventId],
  )).rows[0].id;
  await asUser(db, USER.adminA);
  await db.query("select public.client_adapter_revoke_shared_memory($1,'the fact is wrong now')", [shared]);
}

test("a deletion owed to an adapter that promised a receipt ignores the switch, until the receipt is recorded", async () => {
  const db = await freshDb();
  expect(await jobCheck(db)).toBe("skip");
  await erasedNote(db);
  expect((await status(db)).mode).toBe("off"); // the switch is still off ...
  expect(await jobCheck(db)).toBe("run_deletions_owed"); // ... but the run goes ahead, because an erasure is owed
  await asService(db);
  const owed = (await db.query<{ r: Array<{ event_id: string }> }>("select public.client_adapter_tombstones_pending('tenant-a','creator-os',20) as r")).rows[0].r;
  expect(owed).toHaveLength(1);
  expect(await jobCheck(db)).toBe("run_deletions_owed"); // registered but not yet confirmed
  expect((await db.query<{ r: boolean }>("select public.client_adapter_tombstone_ack($1,$2,3) as r", [owed[0].event_id, sha("receipt")])).rows[0].r).toBe(true);
  expect(await jobCheck(db)).toBe("skip"); // confirmed, so the switch rules again
});

test("a deletion owed to an adapter with no receipt promise, or one given up on after ten tries, does not force a run", async () => {
  const db = await freshDb();
  await erasedNote(db, "plain-one");
  expect(await jobCheck(db, "tenant-a", "plain-one")).toBe("skip");
  await erasedNote(db);
  await asService(db);
  const owed = (await db.query<{ r: Array<{ event_id: string }> }>("select public.client_adapter_tombstones_pending('tenant-a','creator-os',20) as r")).rows[0].r;
  for (let i = 0; i < 10; i += 1) await db.query("select public.client_adapter_tombstone_attempt($1)", [owed[0].event_id]);
  expect(await jobCheck(db)).toBe("skip"); // the job's own alert covers a given-up deletion; a forced run would only repeat it
});

test("removing an adapter removes its switch", async () => {
  const db = await freshDb();
  await setMode(db, "1h");
  await asOwner(db);
  await db.exec("delete from public.client_adapter_registry where tenant_slug = 'tenant-a' and adapter_id = 'creator-os'");
  expect((await db.query<{ n: number }>("select count(*)::int as n from public.client_adapter_sync_switch")).rows[0].n).toBe(0);
});
