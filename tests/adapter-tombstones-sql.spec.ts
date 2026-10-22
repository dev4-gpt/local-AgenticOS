import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// Real PostgreSQL (PGlite) tests for supabase-client-adapter-tombstones.sql: the host's books for deletion receipts, and
// the search for published copies at the moment a fact is withdrawn (ADR-014). Nothing real is used.
const read = (file: string) => readFileSync(`product-experience/supabase-client-${file}.sql`, "utf8");
const USER = {
  ownerA: "00000000-0000-4000-8000-0000000000a1",
  adminA: "00000000-0000-4000-8000-0000000000a2",
  memberA: "00000000-0000-4000-8000-0000000000a3",
  ownerB: "00000000-0000-4000-8000-0000000000b1",
};
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const FILES = ["adapter-host", "adapter-token-uses", "adapter-approval-gateway", "adapter-retention-28", "adapter-promotions", "adapter-proposals", "adapter-ingest", "adapter-tombstones"];
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
    insert into auth.users values ('${USER.ownerA}'), ('${USER.adminA}'), ('${USER.memberA}'), ('${USER.ownerB}');
    insert into public.client_tenants(slug, worker_token_hash) values ('tenant-a', '${sha(WORKER)}'), ('tenant-b', '${sha(WORKER)}');
    insert into public.client_memberships values
      ('tenant-a', '${USER.ownerA}', 'owner', 'active'), ('tenant-a', '${USER.adminA}', 'admin', 'active'),
      ('tenant-a', '${USER.memberA}', 'member', 'active'), ('tenant-b', '${USER.ownerB}', 'owner', 'active');
  `);
  for (const file of FILES) await db.exec(read(file));
  await db.exec(`insert into public.client_adapter_registry (tenant_slug, adapter_id, display_name, contract_version, manifest_sha256, created_by, state, deletion_guarantee)
    values ('tenant-a','creator-os','Creator OS','h1','${"a".repeat(64)}','${USER.ownerA}','enabled','receipt'),
           ('tenant-a','plain-one','Plain','h1','${"a".repeat(64)}','${USER.ownerA}','enabled','none'),
           ('tenant-b','creator-os','Creator OS','h1','${"a".repeat(64)}','${USER.ownerB}','enabled','receipt')`);
  await db.exec("update public.client_adapter_registry set side_effect_ceiling = 'publish' where adapter_id = 'creator-os'"); // so a publish approval can be requested
  return db;
}

const asUser = async (db: PGlite, id: string) => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
};
const asService = (db: PGlite) => db.exec("reset role; set role service_role");
const asOwner = (db: PGlite) => db.exec("reset role");
const scanOf = (content: string) => ({ scanner: "memory-scan-h1", content_sha256: sha(content), verdict: "clean", findings: [], scanned_chars: content.length });

let counter = 0;
const eventKey = () => (++counter).toString(16).padStart(32, "0");

/** A fact proposed by an adapter through the real ingest function, approved by an admin, and now a shared note. Returns the ids. */
async function sharedNote(db: PGlite, content = FACT, o: { tenant?: string; adapter?: string; key?: string } = {}) {
  const tenant = o.tenant ?? "tenant-a";
  const adapter = o.adapter ?? "creator-os";
  const key = o.key ?? eventKey();
  await asService(db);
  const result = (await db.query<{ r: Record<string, string> }>(
    "select public.client_adapter_ingest_memory_proposal($1,$2,$3,$4,$5,$6::jsonb,'0.1.0',$2,'h1-aaaaaaaaaaaaaaaaaaaaaaaa','https://example.test/x',null) as r",
    [tenant, adapter, key, content, sha(content), JSON.stringify(scanOf(content))],
  )).rows[0].r;
  if (result.status !== "created") throw new Error(`ingest said ${result.status}`);
  await asUser(db, tenant === "tenant-a" ? USER.adminA : USER.ownerB);
  await db.query("select public.client_adapter_decide_promotion($1,'approve',$2,null,'ordinary')", [result.promotion_id, sha(content)]);
  await asService(db);
  const shared = (await db.query<{ id: string }>(
    "insert into public.client_adapter_memory_items (tenant_slug, namespace, origin_adapter_id, content, content_sha256, trust_level, promotion_id, idempotency_key) values ($1,'shared',$2,$3,$4,'reviewed',$5,$6) returning id",
    [tenant, adapter, content, sha(content), result.promotion_id, `shared-${key}`],
  )).rows[0].id;
  return { privateId: result.item_id, sharedId: shared, key };
}
const withdraw = async (db: PGlite, id: string, user = USER.adminA) => {
  await asUser(db, user);
  return (await db.query<{ r: boolean }>("select public.client_adapter_revoke_shared_memory($1,'the fact is wrong now') as r", [id])).rows[0].r;
};
const pending = async (db: PGlite, tenant = "tenant-a", adapter = "creator-os") => {
  await asService(db);
  return (await db.query<{ r: Array<Record<string, unknown>> }>("select public.client_adapter_tombstones_pending($1,$2,20) as r", [tenant, adapter])).rows[0].r;
};
const summary = async (db: PGlite, tenant = "tenant-a", adapter = "creator-os") => {
  await asService(db);
  return (await db.query<{ r: Record<string, number> }>("select public.client_adapter_tombstone_summary($1,$2) as r", [tenant, adapter])).rows[0].r;
};
const scalar = async (db: PGlite, sql: string, params: unknown[] = []) => {
  await asService(db);
  return (await db.query<{ v: unknown }>(sql, params)).rows[0].v;
};

/**
 * A publish approval that carried the text. In tenant-a it is taken all the way to executed through the real gateway
 * functions (a member asks, an admin approves, the worker executes). Tenant-b has one admin, who cannot approve their own
 * request, so a copy there is only left waiting.
 */
async function publishedCopy(db: PGlite, text: string, destination: string, o: { kind?: string; finish?: boolean; tenant?: string } = {}) {
  const tenant = o.tenant ?? "tenant-a";
  const canonical = JSON.stringify({ adapterId: "creator-os", destination, kind: o.kind ?? "publish", payload: { text }, policyVersion: "p1", v: "approval-action-h1" });
  const hash = sha(canonical);
  await asUser(db, tenant === "tenant-a" ? USER.memberA : USER.ownerB);
  const id = (await db.query<{ r: string }>("select public.client_adapter_request_approval($1,'creator-os',$2,$3,$4,$5,'p1',3600) as r", [tenant, o.kind ?? "publish", hash, canonical, destination])).rows[0].r;
  if (o.finish === false || tenant !== "tenant-a") return id;
  await asUser(db, USER.adminA);
  await db.query("select public.client_adapter_decide_approval($1,'approve',$2)", [id, hash]);
  await db.exec("reset role; set role anon");
  await db.query("select public.client_adapter_execute_approval($1,$2,$3,$4,$5)", [tenant, WORKER, id, hash, "c".repeat(64)]);
  return id;
}

test("an erased note that came from an adapter is listed once, with the adapter's own event id and the hash the host kept", async () => {
  const db = await freshDb();
  try {
    const note = await sharedNote(db);
    expect(await pending(db)).toEqual([]); // nothing is erased yet
    expect(await withdraw(db, note.sharedId)).toBe(true);
    const [row, ...rest] = await pending(db);
    expect(rest).toEqual([]);
    expect(row).toMatchObject({ item_id: note.sharedId, adapter_event_id: note.key, content_sha256: sha(FACT), attempts: 0 });
    expect(row!.event_id).toMatch(/^[0-9a-f-]{36}$/);
    // asking again lists the same single row and does not register it twice
    expect((await pending(db)).map((r) => r.event_id)).toEqual([row!.event_id]);
    // the private source note, once it expires, is a second row for the same adapter fact
    await asOwner(db);
    await db.query("update public.client_adapter_memory_items set status='tombstoned', content='[tombstoned]', tombstoned_at=now() where id=$1", [note.privateId]);
    const both = await pending(db);
    expect(both.map((r) => r.adapter_event_id)).toEqual([note.key, note.key]);
    expect(new Set(both.map((r) => r.item_id))).toEqual(new Set([note.sharedId, note.privateId]));
  } finally {
    await db.close();
  }
});

test("only adapters with the receipt guarantee are told, and only notes that really came from an adapter event", async () => {
  const db = await freshDb();
  try {
    // an adapter without the guarantee
    await asService(db);
    const plain = (await db.query<{ r: Record<string, string> }>("select public.client_adapter_ingest_memory_proposal('tenant-a','plain-one',$1,$2,$3,$4::jsonb,'1','plain-one','t','https://example.test/x',null) as r", [eventKey(), FACT, sha(FACT), JSON.stringify(scanOf(FACT))])).rows[0].r;
    await asOwner(db);
    await db.query("update public.client_adapter_memory_items set status='tombstoned', content='[tombstoned]', tombstoned_at=now() where id=$1", [plain.item_id]);
    expect(await pending(db, "tenant-a", "plain-one")).toEqual([]);
    // a note put in by hand, with an ordinary idempotency key, has no adapter copy to ask about
    await asService(db);
    const manual = (await db.query<{ id: string }>("insert into public.client_adapter_memory_items (tenant_slug, namespace, origin_adapter_id, content, content_sha256, idempotency_key) values ('tenant-a','adapter:creator-os','creator-os',$1,$2,'a-hand-made-key') returning id", [FACT, sha(FACT)])).rows[0].id;
    await asOwner(db);
    await db.query("update public.client_adapter_memory_items set status='tombstoned', content='[tombstoned]', tombstoned_at=now() where id=$1", [manual]);
    expect(await pending(db)).toEqual([]);
    expect(await scalar(db, "select public.client_adapter_source_event_id($1) as v", [manual])).toBeNull();
  } finally {
    await db.close();
  }
});

test("delivery is counted, stops after ten attempts, and a receipt closes the note once, with a repeated answer accepted and a different one refused", async () => {
  const db = await freshDb();
  try {
    const note = await sharedNote(db);
    await withdraw(db, note.sharedId);
    const eventId = (await pending(db))[0]!.event_id as string;
    await asService(db);
    expect(await scalar(db, "select public.client_adapter_tombstone_attempt($1) as v", [eventId])).toBe(true);
    expect((await pending(db))[0]).toMatchObject({ attempts: 1 });
    const receipt = "d".repeat(64);
    expect(await scalar(db, "select public.client_adapter_tombstone_ack($1,$2,3) as v", [eventId, receipt])).toBe(true);
    expect(await pending(db)).toEqual([]);
    expect(await scalar(db, "select public.client_adapter_tombstone_ack($1,$2,3) as v", [eventId, receipt])).toBe(true); // the same answer again
    expect(await scalar(db, "select public.client_adapter_tombstone_ack($1,$2,3) as v", [eventId, "e".repeat(64)])).toBe(false); // a different one
    expect(await scalar(db, "select public.client_adapter_tombstone_ack($1,$2,4) as v", [eventId, receipt])).toBe(false);
    expect(await scalar(db, "select public.client_adapter_tombstone_attempt($1) as v", [eventId])).toBe(false); // nothing more to try
    expect(await summary(db)).toMatchObject({ pending: 0, gave_up: 0, acknowledged: 1 });
    // refused answers
    for (const [id, hash, count] of [[eventId, "short", 1], ["00000000-0000-4000-8000-000000000999", receipt, 1], [eventId, receipt, -1], [eventId, receipt, 1_000_001]] as const) {
      expect(await scalar(db, "select public.client_adapter_tombstone_ack($1,$2,$3) as v", [id, hash, count])).toBe(false);
    }
    // a second note that never answers is tried ten times and then given up on, and is reported as such
    const other = await sharedNote(db, "Another fact that is long enough to matter.");
    await withdraw(db, other.sharedId);
    const second = (await pending(db))[0]!.event_id as string;
    await asService(db);
    for (let i = 0; i < 10; i += 1) expect(await scalar(db, "select public.client_adapter_tombstone_attempt($1) as v", [second])).toBe(true);
    expect(await scalar(db, "select public.client_adapter_tombstone_attempt($1) as v", [second])).toBe(false);
    expect(await pending(db)).toEqual([]);
    expect(await summary(db)).toMatchObject({ pending: 0, gave_up: 1, acknowledged: 1 });
  } finally {
    await db.close();
  }
});

test("withdrawing a fact finds the publish approvals that carried it, before the text is erased", async () => {
  const db = await freshDb();
  try {
    const note = await sharedNote(db);
    await publishedCopy(db, `Our post says: REPLIES within 5  minutes converted at 42% for every client.`, "linkedin:company-page");
    await publishedCopy(db, "A post about something else entirely.", "newsletter:weekly");
    await publishedCopy(db, `Pending only: ${FACT}`, "blog:unapproved", { finish: false });
    await publishedCopy(db, `A different kind of approval: ${FACT}`, "run-command:x", { kind: "run-command" });
    expect(await withdraw(db, note.sharedId)).toBe(true);
    await asOwner(db);
    const found = (await db.query("select destination, approval_status from public.client_adapter_tombstone_exposures order by destination")).rows;
    expect(found).toEqual([{ destination: "linkedin:company-page", approval_status: "executed" }]);
    expect((await summary(db)).exposures).toBe(1);
    await asOwner(db);
    // the exposure row says where, never what
    expect(JSON.stringify((await db.query("select * from public.client_adapter_tombstone_exposures")).rows)).not.toMatch(/replies within/i);
    // an admin of the tenant can read it, a plain member cannot, another tenant's admin cannot
    await asUser(db, USER.adminA);
    expect((await db.query("select count(*)::int as n from public.client_adapter_tombstone_exposures")).rows[0]).toEqual({ n: 1 });
    await asUser(db, USER.memberA);
    expect((await db.query("select count(*)::int as n from public.client_adapter_tombstone_exposures")).rows[0]).toEqual({ n: 0 });
    await asUser(db, USER.ownerB);
    expect((await db.query("select count(*)::int as n from public.client_adapter_tombstone_exposures")).rows[0]).toEqual({ n: 0 });
  } finally {
    await db.close();
  }
});

test("another tenant's approvals are never searched, and a very short fact is not searched for inside other text", async () => {
  const db = await freshDb();
  try {
    const long = await sharedNote(db);
    await publishedCopy(db, `Tenant B sent ${FACT}`, "x:tenant-b", { tenant: "tenant-b" });
    const short = await sharedNote(db, "42%");
    await publishedCopy(db, "Replies converted at 42% last year", "linkedin:short");
    await withdraw(db, long.sharedId);
    await withdraw(db, short.sharedId);
    await asOwner(db);
    expect((await db.query("select count(*)::int as n from public.client_adapter_tombstone_exposures")).rows[0]).toEqual({ n: 0 });
  } finally {
    await db.close();
  }
});

test("the withdraw function keeps its rules: an admin, a shared note, a real reason, and a second withdrawal does nothing", async () => {
  const db = await freshDb();
  try {
    const note = await sharedNote(db);
    await asUser(db, USER.memberA);
    await expect(db.query("select public.client_adapter_revoke_shared_memory($1,'the fact is wrong now')", [note.sharedId])).rejects.toThrow(/adapter_revoke_not_found/);
    await asUser(db, USER.adminA);
    await expect(db.query("select public.client_adapter_revoke_shared_memory($1,'no')", [note.sharedId])).rejects.toThrow(/adapter_revoke_bad_reason/);
    await expect(db.query("select public.client_adapter_revoke_shared_memory($1,'the fact is wrong now')", [note.privateId])).rejects.toThrow(/adapter_revoke_not_shared/);
    expect(await withdraw(db, note.sharedId)).toBe(true);
    expect(await withdraw(db, note.sharedId)).toBe(false);
    await asOwner(db);
    expect((await db.query("select status, content from public.client_adapter_memory_items where id=$1", [note.sharedId])).rows[0]).toEqual({ status: "tombstoned", content: "[tombstoned]" });
    expect((await db.query("select count(*)::int as n from public.client_adapter_outbox where event_type='memory.tombstoned'")).rows[0]).toEqual({ n: 1 });
  } finally {
    await db.close();
  }
});

test("only the service role can use the delivery functions or read the receipts; signed-in users and anonymous callers cannot", async () => {
  const db = await freshDb();
  try {
    const note = await sharedNote(db);
    await withdraw(db, note.sharedId);
    const eventId = (await pending(db))[0]!.event_id as string;
    const calls = [
      "select public.client_adapter_tombstones_pending('tenant-a','creator-os',5)",
      `select public.client_adapter_tombstone_attempt('${eventId}')`,
      `select public.client_adapter_tombstone_ack('${eventId}','${"d".repeat(64)}',1)`,
      "select public.client_adapter_tombstone_summary('tenant-a','creator-os')",
      `select public.client_adapter_source_event_id('${note.sharedId}')`,
      "select * from public.client_adapter_tombstone_receipts",
      "insert into public.client_adapter_tombstone_exposures (tenant_slug, item_id, approval_id, destination, approval_status) values ('tenant-a', '" + note.sharedId + "', gen_random_uuid(), 'x', 'executed')",
    ];
    for (const role of ["authenticated", "anon"]) {
      await asOwner(db);
      await db.exec(`set role ${role}`);
      for (const sql of calls) await expect(db.query(sql), `${role}: ${sql.slice(0, 50)}`).rejects.toThrow(/permission denied/);
    }
  } finally {
    await db.close();
  }
});

test("receipts and exposures go with their note or tenant, and the migration can be applied twice", async () => {
  const db = await freshDb();
  try {
    const note = await sharedNote(db);
    await publishedCopy(db, FACT, "linkedin:company-page");
    await withdraw(db, note.sharedId);
    await pending(db);
    await asOwner(db);
    expect((await db.query("select (select count(*)::int from public.client_adapter_tombstone_receipts) r, (select count(*)::int from public.client_adapter_tombstone_exposures) e")).rows[0]).toEqual({ r: 1, e: 1 });
    await db.exec(read("adapter-tombstones"));
    await db.exec(read("adapter-tombstones"));
    await db.query("delete from public.client_tenants where slug='tenant-a'");
    expect((await db.query("select (select count(*)::int from public.client_adapter_tombstone_receipts) r, (select count(*)::int from public.client_adapter_tombstone_exposures) e")).rows[0]).toEqual({ r: 0, e: 0 });
  } finally {
    await db.close();
  }
});
