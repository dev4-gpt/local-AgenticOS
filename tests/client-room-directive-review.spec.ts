import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { retentionDatabase } from "./helpers/client-record-retention-database";
import { loadReviewModule } from "./helpers/load-review-module";
import { validRoomDirectiveProposal } from "../src/lib/clientRoomAdapter";
import * as adapter from "../src/lib/clientRoomAdapter";
import * as network from "../src/lib/clientNetworkSafety";

const owner = "00000000-0000-4000-8000-000000000010";
const other = "00000000-0000-4000-8000-000000000011";
const job = "00000000-0000-4000-8000-000000000099";
const conversationId = "00000000-0000-4000-8000-000000000098";
const proposal = { kind: "note", label: "Synthetic decision", body: "Review this synthetic decision.", agentId: "claude", agentName: "Claude" };
const pipeline = { ...proposal, kind: "pipeline", label: "Synthetic plan", body: "Synthetic plan" };

test("Room review is exact-payload bound, requester scoped, atomic, terminal and inherits the original job clock", async () => {
  const db = await retentionDatabase();
  try {
    await db.exec(`
      create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table memberships(tenant_slug text, user_id uuid, status text);
      insert into memberships values ('tenant-a','${owner}','active'),('tenant-a','${other}','active');
      create or replace function client_member(t text) returns boolean language sql stable security definer as $$
        select exists(select 1 from memberships where tenant_slug=t and user_id=auth.uid() and status='active')
      $$;
      alter table client_runtime_records alter column id set default gen_random_uuid();
      alter table client_runtime_records alter column created_at set default now();
      alter table client_tenants add column created_at timestamptz default now();
      create table client_runtime_jobs(id uuid primary key, tenant_slug text, requested_by uuid, capability text,
        status text, error_code text, input_metadata jsonb default '{}', output_metadata jsonb default '{}', created_at timestamptz default now());
      create table client_room_conversations(id uuid primary key,tenant_slug text,title text default 'Synthetic',status text default 'active',created_at timestamptz default now(),updated_at timestamptz default now());
      create table client_room_messages(id uuid primary key,tenant_slug text,conversation_id uuid references client_room_conversations(id),created_at timestamptz default now());
      create table client_room_rounds(id uuid primary key,tenant_slug text,conversation_id uuid references client_room_conversations(id),status text default 'queued',created_at timestamptz default now(),updated_at timestamptz default now());
      insert into client_room_conversations(id,tenant_slug) values('${conversationId}','tenant-a');
      create table client_pipeline_items(id uuid primary key default gen_random_uuid(),tenant_slug text,created_by uuid,
        slug text, title text, idea text,stage text,created_at timestamptz default now(),updated_at timestamptz default now(),
        retention_expires_at timestamptz,build_artifact_id uuid,execution_job_id uuid);
      create function create_client_runtime_record_worker(text,text,text,text,text,jsonb) returns uuid language sql as $$ select null::uuid $$;
      grant execute on function create_client_runtime_record_worker(text,text,text,text,text,jsonb) to anon;
      insert into client_runtime_records(tenant_slug,created_by,kind,title,content,metadata)
      values ('tenant-a','${owner}','memory','Legacy unreviewed','Do not use as context','{"source":"agent-room"}');
    `);
    await db.exec(readFileSync("product-experience/supabase-client-runtime-job-retention-28.sql", "utf8"));
    await db.exec(readFileSync("product-experience/supabase-client-pipeline-retention-28.sql", "utf8"));
    await db.exec(readFileSync("product-experience/supabase-client-room-retention-28.sql", "utf8"));
    await db.exec(readFileSync("product-experience/supabase-client-room-fixed-retention.sql", "utf8"));
    const migration = readFileSync("product-experience/supabase-client-room-directive-review.sql", "utf8");
    await db.exec(migration); await db.exec(migration);
    expect((await db.query("select status from client_runtime_records where title='Legacy unreviewed'")).rows[0]).toEqual({ status: "archived" });
    await expect(db.exec("update client_runtime_records set status='active' where title='Legacy unreviewed'")).rejects.toThrow(/legacy_record_unreviewed/);
    await expect(db.exec("update client_runtime_records set metadata='{}' where title='Legacy unreviewed'")).rejects.toThrow(/origin_immutable/);
    expect((await db.query("select to_regprocedure('create_client_runtime_record_worker(text,text,text,text,text,jsonb)') as legacy")).rows[0]).toEqual({ legacy: null });
    await db.query("insert into client_runtime_jobs(id,tenant_slug,requested_by,capability,status,input_metadata,output_metadata) values($1,'tenant-a',$2,'room-round','succeeded',$3::jsonb,$4::jsonb)", [job, owner, JSON.stringify({ conversationId }), JSON.stringify({ roomDirectives: [proposal, pipeline, pipeline] })]);
    const ageJob = async (days: number) => {
      await db.exec("alter table client_runtime_jobs disable trigger guard_client_runtime_job_retention");
      await db.exec("alter table client_room_conversations disable trigger guard_client_room_conversation_retention");
      await db.query("update client_room_conversations set created_at=now()-make_interval(days=>$1::integer),retention_expires_at=now()+make_interval(days=>28-$1::integer)", [days]);
      await db.query(`update client_runtime_jobs j set created_at=p.created_at,input_metadata=j.input_metadata||jsonb_build_object('roomCreatedAt',p.created_at,'roomRetentionExpiresAt',p.retention_expires_at)
        from client_room_conversations p where p.id=$1`, [conversationId]);
      await db.exec("alter table client_room_conversations enable trigger guard_client_room_conversation_retention");
      await db.exec("alter table client_runtime_jobs enable trigger guard_client_runtime_job_retention");
    };
    const decide = async (actor = owner, { tenant = "tenant-a", index = 0, expected = proposal, decision = "approved" } = {}) => {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
      await db.exec("set role authenticated");
      try { return (await db.query<{ review: { recordId: string | null; decision: string } | null }>(
        "select review_client_room_directive($1,$2,$3,$4::jsonb,$5) as review", [tenant, job, index, JSON.stringify(expected), decision])).rows[0].review; }
      finally { await db.exec("reset role"); }
    };
    const signature = "review_client_room_directive(text,uuid,integer,jsonb,text)";
    expect((await db.query<{ allowed: boolean }>(`select has_function_privilege('anon','${signature}','execute') as allowed`)).rows[0].allowed).toBe(false);
    expect(await decide(other)).toBeNull();
    expect(await decide("")).toBeNull();
    expect(await decide(owner, { tenant: "tenant-b" })).toBeNull();
    expect(await decide(owner, { index: -1 })).toBeNull();
    expect(await decide(owner, { index: 16 })).toBeNull();
    expect(await decide(owner, { decision: "unknown" })).toBeNull();
    expect(await decide(owner, { expected: { ...proposal, body: "Changed after viewing" } })).toBeNull();
    for (const status of ["queued", "running", "failed", "cancelled"]) {
      await db.query("update client_runtime_jobs set status=$1", [status]);
      expect(await decide(), status).toBeNull();
    }
    await db.exec("update client_runtime_jobs set status='succeeded', error_code='budget_settlement_failed'");
    expect(await decide()).toBeNull();
    await db.exec("update client_runtime_jobs set error_code=null,output_metadata=output_metadata || '{\"failureDisposition\":\"blocked\"}'");
    expect(await decide()).toBeNull();
    await db.exec("update client_runtime_jobs set output_metadata=output_metadata-'failureDisposition'");
    await db.exec(`alter table client_room_conversations disable trigger guard_client_room_conversation_retention;
      alter table client_runtime_jobs disable trigger guard_client_runtime_job_retention;
      update client_room_conversations set retention_expires_at=clock_timestamp()+interval '100 milliseconds';
      update client_runtime_jobs j set input_metadata=j.input_metadata||jsonb_build_object('roomRetentionExpiresAt',p.retention_expires_at) from client_room_conversations p where p.id='${conversationId}';
      alter table client_room_conversations enable trigger guard_client_room_conversation_retention;
      alter table client_runtime_jobs enable trigger guard_client_runtime_job_retention;
      begin; select pg_sleep(0.2);`);
    try { expect(await decide()).toBeNull(); } finally { await db.exec("rollback"); }
    await ageJob(28); expect(await decide()).toBeNull();
    await ageJob(27);
    await db.exec(`create function fail_room_review_write() returns trigger language plpgsql as $$ begin raise exception 'injected_review_failure'; end $$;
      create trigger fail_room_review_write before update on client_runtime_jobs for each row execute function fail_room_review_write();`);
    await expect(decide()).rejects.toThrow(/injected_review_failure/);
    expect((await db.query<{ count: number }>("select count(*)::integer as count from client_runtime_records where metadata ? 'roomSourceJobId'")).rows[0].count).toBe(0);
    await db.exec("drop trigger fail_room_review_write on client_runtime_jobs");
    const approved = await decide();
    expect(approved?.decision).toBe("approved");
    expect(approved?.recordId).toMatch(/^[a-f0-9-]{36}$/);
    expect(await decide()).toEqual(approved);
    expect(await decide(owner, { decision: "rejected" })).toBeNull();
    expect((await db.query<{ inherited: boolean; kind: string; owner: string }>(`select r.created_at+interval '28 days'=client_runtime_job_active_until(j.created_at,28,j.capability,j.input_metadata) as inherited,r.kind,r.created_by as owner
      from client_runtime_records r join client_runtime_jobs j on j.id=$1 where r.id=$2`, [job, approved!.recordId])).rows[0]).toEqual({ inherited: true, kind: "memory", owner });
    expect((await db.query<{ count: number }>("select count(*)::integer as count from client_runtime_records where metadata ? 'roomSourceJobId'")).rows[0].count).toBe(1);
    expect((await decide(owner, { index: 1, expected: pipeline, decision: "rejected" }))?.decision).toBe("rejected");
    expect(await decide(owner, { index: 1, expected: pipeline })).toBeNull();
    const captured = await decide(owner, { index: 2, expected: pipeline });
    expect(captured?.decision).toBe("approved");
    expect((await db.query<{ stage: string; inherited: boolean }>(`select p.stage,
      p.retention_expires_at=client_runtime_job_active_until(j.created_at,28,j.capability,j.input_metadata) as inherited
      from client_pipeline_items p join client_runtime_jobs j on j.id=$1 where p.id=$2`, [job, captured!.recordId])).rows[0]).toEqual({ stage: "inbox", inherited: true });
    expect(await decide(owner, { index: 2, expected: pipeline })).toEqual(captured);
    // Simulate approved copies created before source-bound retention was added.
    await db.exec("alter table client_runtime_records disable trigger guard_client_runtime_record_retention; alter table client_pipeline_items disable trigger guard_client_pipeline_retention");
    await db.query("update client_runtime_records set created_at=now() where id=$1", [approved!.recordId]);
    await db.query("update client_pipeline_items set created_at=now(),retention_expires_at=now()+interval '28 days' where id=$1", [captured!.recordId]);
    await db.exec("alter table client_runtime_records enable trigger guard_client_runtime_record_retention; alter table client_pipeline_items enable trigger guard_client_pipeline_retention");
    await db.exec(migration); await db.exec(migration);
    expect((await db.query<{ bounded: boolean }>(`select r.created_at+interval '28 days'<=client_runtime_job_active_until(j.created_at,28,j.capability,j.input_metadata) as bounded
      from client_runtime_records r join client_runtime_jobs j on j.id=$1 where r.id=$2`, [job, approved!.recordId])).rows[0].bounded).toBe(true);
    expect((await db.query<{ bounded: boolean }>(`select p.retention_expires_at<=client_runtime_job_active_until(j.created_at,28,j.capability,j.input_metadata) as bounded
      from client_pipeline_items p join client_runtime_jobs j on j.id=$1 where p.id=$2`, [job, captured!.recordId])).rows[0].bounded).toBe(true);
    const intactOutput = (await db.query<{ value: Record<string, unknown> }>("select output_metadata as value from client_runtime_jobs where id=$1", [job])).rows[0].value;
    await db.query("update client_runtime_jobs set output_metadata=jsonb_set(output_metadata,'{roomDirectiveReviews,0,recordId}',to_jsonb($1::text)) where id=$2", [other, job]);
    await expect(db.exec(migration)).rejects.toThrow(/client_room_derived_origin_unverified/);
    await db.exec("rollback");
    expect((await db.query<{ enabled: string }>("select tgenabled as enabled from pg_trigger where tgname='guard_client_runtime_record_retention'")).rows[0].enabled).toBe("O");
    await db.query("update client_runtime_jobs set output_metadata=$1::jsonb where id=$2", [JSON.stringify(intactOutput), job]);
    const noteBackup = (await db.query<{ value: Record<string, unknown> }>("select to_jsonb(r) as value from client_runtime_records r where id=$1", [approved!.recordId])).rows[0].value;
    await db.exec("set role authenticated");
    try {
      await expect(db.query("update client_runtime_records set metadata='{}' where id=$1", [approved!.recordId])).rejects.toThrow(/origin_immutable/);
      await expect(db.query("insert into client_runtime_records(tenant_slug,kind,title,content,metadata) values('tenant-a','memory','Forged','Forged',$1::jsonb)", [JSON.stringify({ roomSourceJobId: job, roomDirectiveIndex: 0 })])).rejects.toThrow(/row-level security/);
    } finally { await db.exec("reset role"); }
    await db.exec(`update memberships set status='inactive' where user_id='${owner}'`);
    expect(await decide()).toBeNull();
    await db.exec(`update memberships set status='active' where user_id='${owner}'; alter table client_runtime_records disable trigger guard_client_runtime_record_retention`);
    await db.query("update client_runtime_records set created_at=now()-interval '36 days' where id=$1", [approved!.recordId]);
    await db.exec("alter table client_runtime_records enable trigger guard_client_runtime_record_retention;set role authenticated");
    expect((await db.query("select id from client_runtime_records where id=$1", [approved!.recordId])).rows).toEqual([]);
    await db.exec("reset role");
    await db.query("select purge_expired_client_runtime_records('tenant-a',true,100)");
    expect((await db.query("select id from client_runtime_records where id=$1", [approved!.recordId])).rows).toEqual([]);
    const jobBackup = (await db.query<{ value: Record<string, unknown> }>("select to_jsonb(j) as value from client_runtime_jobs j where id=$1", [job])).rows[0].value;
    const roomBackup = (await db.query<{ value: Record<string, unknown> }>("select to_jsonb(p) as value from client_room_conversations p where id=$1", [conversationId])).rows[0].value;
    await db.query("delete from client_runtime_jobs where id=$1", [job]);
    await db.query("delete from client_room_conversations where id=$1", [conversationId]);
    await db.exec(readFileSync("product-experience/supabase-client-lifecycle-restore.sql", "utf8"));
    const batches: Array<{ table: string; rows: Array<Record<string, unknown>> }> = [
      { table: "client_tenants", rows: [{ slug: "tenant-restored", retention_days: 28, created_at: new Date().toISOString() }] },
      { table: "client_runtime_jobs", rows: [{ ...jobBackup, tenant_slug: "tenant-restored" }] },
      { table: "client_runtime_records", rows: [{ ...noteBackup, tenant_slug: "tenant-restored" }] },
      { table: "client_room_conversations", rows: [{ ...roomBackup, tenant_slug: "tenant-restored" }] },
    ];
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    const restore = async (payload: unknown) => {
      await db.exec("set role service_role");
      try { return await db.query("select restore_client_lifecycle_metadata('tenant-restored',$1::jsonb)", [JSON.stringify(payload)]); }
      finally { await db.exec("reset role"); }
    };
    const changedClock = structuredClone(batches);
    changedClock[2].rows[0].created_at = new Date().toISOString();
    await expect(restore(changedClock)).rejects.toThrow(/client_restore_clock_changed/);
    expect((await db.query("select slug from client_tenants where slug='tenant-restored'")).rows).toEqual([]);
    await restore(batches);
    expect((await db.query<{ inherited: boolean }>("select r.created_at+interval '28 days'=client_runtime_job_active_until(j.created_at,28,j.capability,j.input_metadata) as inherited from client_runtime_records r join client_runtime_jobs j on j.id=$1 where r.id=$2", [job, approved!.recordId])).rows[0].inherited).toBe(true);
  } finally { await db.close(); }
});

test("Room proposals endpoint bounds input, filters reads, preserves exact payload and fails closed", async () => {
  let session: { tenantSlug: string; userId: string } | null = { tenantSlug: "tenant-a", userId: owner };
  let rpcOk = true; let rpcValue: unknown = { decision: "approved", recordId: job };
  let calls = 0; let tenantData = true;
  const route = loadReviewModule("src/app/api/client-runtime/room/proposals/route.ts", {
    "@/lib/clientRoomAdapter": adapter, "@/lib/clientNetworkSafety": network,
    "@/lib/clientRuntimePolicy": { clientCapabilityEnabled: () => tenantData },
    "@/lib/clientInputSafety": { containsClientSecretLike: () => false },
    "@/lib/clientRoomData": { ROOM_UUID_RE: /^[a-f0-9-]{36}$/, roomSession: async () => session,
      roomReadLimit: async () => ({ ok: true, allowed: true }), roomWriteLimit: async () => ({ ok: true, allowed: true }),
      readRoomConversation: async () => ({ id: conversationId }),
      roomJson: (body: object) => Response.json({ ok: true, ...body }), roomError: (error: string, status: number) => Response.json({ error }, { status }) },
    "@/lib/clientDataPlane": {
      selectClientRecords: async (_table: string, filters: Record<string, string>) => {
        expect(filters).toMatchObject({ tenant_slug: "eq.tenant-a", requested_by: `eq.${owner}`, capability: "eq.room-round", status: "eq.succeeded", error_code: "is.null", "input_metadata->>conversationId": `eq.${conversationId}` });
        return { ok: true, records: [{ id: job, output_metadata: { roomDirectives: [proposal] } }] };
      },
      clientRpc: async (name: string, args: Record<string, unknown>) => { calls++;
        expect(name).toBe("review_client_room_directive");
        expect(args).toMatchObject({ p_tenant_slug: "tenant-a", p_job_id: job, p_index: 0, p_expected: proposal, p_decision: "approved" });
        return { ok: rpcOk, value: rpcValue };
      },
    },
  });
  const post = (body: unknown) => route.POST(new Request("http://localhost/api/client-runtime/room/proposals", { method: "POST", body: JSON.stringify(body) }));
  const input = { jobId: job, index: 0, proposal, decision: "approved" };
  session = null; expect((await post(input)).status).toBe(401); session = { tenantSlug: "tenant-a", userId: owner };
  for (const invalid of [{ ...input, index: "0" }, { ...input, index: 16 }, { ...input, proposal: { ...proposal, body: "x".repeat(4001) } }, { ...input, decision: "override" }]) {
    expect((await post(invalid)).status).toBe(400);
  }
  expect(calls).toBe(0);
  tenantData = false; expect((await post(input)).status).toBe(403); tenantData = true;
  expect((await post(input)).status).toBe(200);
  rpcValue = null; expect((await post(input)).status).toBe(409);
  rpcOk = false; expect((await post(input)).status).toBe(503);
  const list = await route.GET(new Request(`http://localhost/api/client-runtime/room/proposals?conversationId=${conversationId}`));
  expect(await list.json()).toMatchObject({ proposals: [{ jobId: job, index: 0, proposal, decision: "pending" }] });
});

test("Room proposal validation and memory context exclude archived and unapproved records", async () => {
  expect(validRoomDirectiveProposal(proposal)).toBe(true);
  expect(validRoomDirectiveProposal({ ...proposal, unknown: true })).toBe(false);
  const data = loadReviewModule("src/lib/clientRoomData.ts", {
    "@/lib/clientAuth": {}, "@/lib/clientProviderAdapter": {}, "@/lib/clientExecutionCredential": {}, "@/lib/clientRuntimePolicy": {},
    "@/lib/clientRoomAdapter": adapter,
    "@/lib/clientDataPlane": { selectClientRecords: async (_table: string, filters: Record<string, string>) => {
      expect(filters.status).toBe("eq.active"); return { ok: true, records: [{ title: "Legacy unreviewed", content: "Do not use", metadata: { source: "agent-room" } }] };
    } },
  });
  expect(await data.roomMemoryContext("tenant-a", "Synthetic")).toEqual({ titles: [], text: "" });
});
