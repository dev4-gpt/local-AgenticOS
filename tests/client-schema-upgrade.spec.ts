import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { expect, test } from "@playwright/test";

// Use the real predecessor definitions: empty function fixtures miss PostgreSQL
// replacement rules, and cannot establish that these migrations work together.
const baseMigrations = [
  "deployment-requests", "public-request-hardening",
  "client-runtime-control-plane", "client-runtime-controls", "client-runtime-lifecycle",
  "client-runtime-records", "client-runtime-hosted-capabilities",
  "client-runtime-workflow-reconciliation", "client-hermes-content-factory",
  "client-runtime-conversation-lifecycle", "client-runtime-memory-graph",
  "client-runtime-source-pack-graph", "client-runtime-source-pack-rpc-guard",
  "client-runtime-source-pack-published-date",
  "client-paperclip", "client-room", "client-pipeline", "client-boards", "client-loop", "client-ruflo",
  "client-notebooks", "client-notebook-lineage", "client-notebook-execution-sources",
  "client-structured-research", "client-visual-qa",
  "public-launch-control-plane", "commercial-scope", "v31-provider-matrix",
  "v31-managed-credit-plans", "v32-managed-credit-readiness", "v33-managed-credit-lifecycle",
  "v34-managed-credit-execution-claims", "v34-managed-provider-reconciliation-gate",
  "v35-control-plane-approval-repair", "v35-reserve-client-credit-fix", "v36-platform-deploy-runs",
  "v37-managed-credit-hard-caps", "v38-managed-credential-lifecycle", "v39-tenant-rbac",
  "v40-credential-execution-gate", "v41-monthly-credit-refunds", "v42-suspended-tenant-access",
  "v43-ecc-learning", "v44-stripe-financial-event-dispositions",
  "v45-onboarding-verify-token", "v46-onboarding-setup-token", "v47-financial-offboard-guard",
];

const retentionMigrations = [
  "client-retention-policy-28", "v48-ecc-learning-retention-references",
  "client-runtime-record-retention", "client-runtime-job-retention-28", "client-room-retention-28",
  "client-pipeline-retention-28", "client-room-fixed-retention", "client-room-directive-review",
  "client-notebook-source-retention", "client-notebook-retention-28", "client-research-retention-28",
  "client-runtime-request-retention-28", "client-visual-qa-retention-28", "client-support-retention-28",
  "client-board-loop-retention-28", "client-paperclip-retention-28",
  "client-hermes-content-factory-retention-28", "client-ruflo-retention-28",
  "client-runtime-audit-budget-retention", "client-onboarding-token-retention",
  "client-runtime-rate-limit-retention", "client-runtime-artifact-owner-guard",
  "client-notebook-artifact-review", "client-notebook-source-reference-guard",
  "v49-managed-credit-retention", "client-lifecycle-restore",
];

const purgeNames = [
  "board_loop_records", "hermes_content_factory_records", "notebook_sources", "notebooks",
  "onboarding_tokens", "paperclip_records", "pipeline_items", "research", "room_records",
  "ruflo_records", "runtime_audit_and_budget", "runtime_jobs", "runtime_rate_limits",
  "runtime_records", "runtime_requests", "support_requests", "visual_qa",
].map((suffix) => `purge_expired_client_${suffix}`);
const globalPurges = new Set([
  "purge_expired_client_onboarding_tokens", "purge_expired_client_runtime_rate_limits",
]);

async function repositoryDatabase() {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema extensions;
      create extension pgcrypto with schema extensions;
      create table auth.users(id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      create function auth.role() returns text language sql stable as $$
        select nullif(current_setting('request.jwt.claim.role',true),'')
      $$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant execute on function auth.uid(),auth.role() to anon,authenticated,service_role;
    `);
    for (const name of baseMigrations) {
      await db.exec(readFileSync(`product-experience/supabase-${name}.sql`, "utf8"));
    }
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

test("repository schema upgrades retain worker contracts and execute lifecycle previews under local roles", async () => {
  test.setTimeout(90_000);
  const db = await repositoryDatabase();
  const migrate = async (name: string) => {
    await test.step(name, () => db.exec(readFileSync(`product-experience/supabase-${name}.sql`, "utf8")));
  };
  try {
    const workers = [
      "update_client_board_task_worker", "append_client_loop_round_worker",
      "settle_client_loop_run_worker", "complete_client_paperclip_run_worker",
    ];
    const workerContracts = async () => (await db.query(`
      select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
        has_function_privilege('anon',p.oid,'execute') as anon,
        has_function_privilege('authenticated',p.oid,'execute') as authenticated
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=any($1::text[]) order by p.proname
    `, [workers])).rows;
    const before = await workerContracts();
    expect(before).toHaveLength(workers.length);
    for (const migration of retentionMigrations) await migrate(migration);
    expect(await workerContracts()).toEqual(before);

    const columns = (await db.query<{ value: Record<string, string> }>(
      "select public.client_lifecycle_restore_columns() as value",
    )).rows[0].value;
    expect(Object.keys(columns)).toHaveLength(49);
    for (const [table, projection] of Object.entries(columns)) {
      expect(table).toMatch(/^client_[a-z_]+$/);
      expect(projection).toMatch(/^[a-z_][a-z0-9_]*(,[a-z_][a-z0-9_]*)*$/);
      await db.query(`select ${projection} from public.${table} limit 0`);
    }

    await db.exec(`
      insert into auth.users values
        ('00000000-0000-4000-8000-000000000101','owner-a@example.invalid'),
        ('00000000-0000-4000-8000-000000000102','owner-b@example.invalid');
      insert into public.client_tenants(slug,name,retention_days) values
        ('tenant-a','Synthetic A',28),('tenant-b','Synthetic B',28);
      insert into public.client_memberships(tenant_slug,user_id,role) values
        ('tenant-a','00000000-0000-4000-8000-000000000101','owner'),
        ('tenant-b','00000000-0000-4000-8000-000000000102','owner');
      insert into public.client_runtime_records(tenant_slug,created_by,kind,title,content) values
        ('tenant-a','00000000-0000-4000-8000-000000000101','memory','Synthetic A','Private to A'),
        ('tenant-b','00000000-0000-4000-8000-000000000102','memory','Synthetic B','Private to B');
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',false);
      select set_config('request.jwt.claim.role','service_role',false);
      set role service_role;
    `);
    expect((await db.query<{ ready: boolean }>(
      "select public.client_learning_retention_references_ready() as ready",
    )).rows[0].ready).toBe(true);
    for (const name of purgeNames) {
      const args = globalPurges.has(name) ? "false,10" : "'tenant-a',false,10";
      const result = await db.query<{ result: { applied: boolean; recoveryDays: number } }>(
        `select public.${name}(${args}) as result`,
      );
      expect(result.rows[0].result).toMatchObject({ applied: false, recoveryDays: 7 });
    }
    await expect(db.query("select public.restore_client_lifecycle_metadata('tenant-a','[]'::jsonb)"))
      .rejects.toThrow(/client_restore_requires_one_tenant/);
    const originalCreated = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const restored = await db.query<{ result: { restoredRows: number; atomicMetadata: boolean } }>(
      "select public.restore_client_lifecycle_metadata('tenant-restored',$1::jsonb) as result",
      [JSON.stringify([
        { table: "client_tenants", rows: [{ slug: "tenant-restored", name: "Synthetic restore",
          status: "active", retention_days: 28, created_at: originalCreated, updated_at: originalCreated }] },
        { table: "client_runtime_records", rows: [{ id: "00000000-0000-4000-8000-000000000201",
          tenant_slug: "tenant-restored", created_by: "00000000-0000-4000-8000-000000000101",
          kind: "memory", title: "Original clock", content: "Synthetic metadata restore",
          status: "active", metadata: {}, created_at: originalCreated, updated_at: originalCreated }] },
      ])],
    );
    expect(restored.rows[0].result).toMatchObject({ restoredRows: 2, atomicMetadata: true });
    await db.exec("reset role");
    const clock = await db.query<{ created_at: Date }>(
      "select created_at from public.client_runtime_records where tenant_slug='tenant-restored'",
    );
    expect(new Date(clock.rows[0].created_at).toISOString()).toBe(originalCreated);

    for (const [user, tenant] of [["101", "tenant-a"], ["102", "tenant-b"]]) {
      await db.exec(`reset role;
        select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000${user}',false);
        select set_config('request.jwt.claim.role','authenticated',false);
        set role authenticated;
      `);
      const visible = await db.query<{ slug: string }>("select slug from public.client_tenants order by slug");
      expect(visible.rows.map((row) => row.slug)).toEqual([tenant]);
      const records = await db.query<{ tenant_slug: string }>("select tenant_slug from public.client_runtime_records");
      expect(records.rows.map((row) => row.tenant_slug)).toEqual([tenant]);
      await expect(db.query("select public.purge_expired_client_runtime_jobs('tenant-a',false,10)"))
        .rejects.toThrow(/permission denied/);
      for (const name of purgeNames) {
        const signature = globalPurges.has(name) ? "boolean,integer" : "text,boolean,integer";
        const grants = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>(`
          select has_function_privilege('anon',$1,'execute') as anon,
            has_function_privilege('authenticated',$1,'execute') as authenticated,
            has_function_privilege('service_role',$1,'execute') as service
        `, [`public.${name}(${signature})`]);
        expect(grants.rows[0]).toEqual({ anon: false, authenticated: false, service: true });
      }
    }
  } finally {
    await db.close();
  }
});

test("populated repository upgrade preserves original deadlines and purges only due tenant content", async () => {
  test.setTimeout(90_000);
  const db = await repositoryDatabase();
  try {
    await db.exec(`
      insert into auth.users values
        ('00000000-0000-4000-8000-000000000101','owner-a@example.invalid'),
        ('00000000-0000-4000-8000-000000000102','owner-b@example.invalid');
      insert into public.client_tenants(slug,name,retention_days) values
        ('tenant-a','Synthetic A',28),('tenant-b','Synthetic B',14);
      insert into public.client_memberships(tenant_slug,user_id,role) values
        ('tenant-a','00000000-0000-4000-8000-000000000101','owner'),
        ('tenant-b','00000000-0000-4000-8000-000000000102','owner');
      insert into public.client_runtime_jobs(tenant_slug,requested_by,capability,idempotency_key,status,created_at)
        select tenant.slug,member.user_id,'text-agents',age.label,'succeeded',now()-make_interval(days=>age.days)
        from public.client_tenants tenant join public.client_memberships member on member.tenant_slug=tenant.slug
        cross join (values ('active',10),('recovery',30),('due',40)) age(label,days);
      insert into public.client_board_tasks(tenant_slug,created_by,board,title,body,execution_job_id,created_at,updated_at)
        select tenant_slug,requested_by,'kanban',idempotency_key,'Synthetic historical task',id,created_at,now()
        from public.client_runtime_jobs;
      insert into public.client_board_comments(tenant_slug,task_id,body,created_at)
        select tenant_slug,id,'Synthetic historical comment',created_at+interval '1 day' from public.client_board_tasks;
      insert into public.client_board_comments(tenant_slug,task_id,body,created_at)
        select tenant_slug,id,'Synthetic extra due comment',created_at+interval '2 days'
        from public.client_board_tasks cross join generate_series(1,2) where title='due';
      insert into public.client_board_events(tenant_slug,task_id,kind,created_at)
        select tenant_slug,id,'historical',created_at+interval '1 day' from public.client_board_tasks;
      insert into public.client_board_events(tenant_slug,task_id,kind,created_at)
        select tenant_slug,id,'extra-due',created_at+interval '2 days'
        from public.client_board_tasks cross join generate_series(1,2) where title='due';
      insert into public.client_loop_runs(tenant_slug,created_by,goal,title,job_id,created_at,updated_at)
        select tenant_slug,requested_by,'Synthetic historical loop',idempotency_key,id,created_at,now()
        from public.client_runtime_jobs;
      insert into public.client_loop_rounds(tenant_slug,run_id,round,summary,created_at)
        select tenant_slug,id,1,'Synthetic historical round',created_at+interval '1 day' from public.client_loop_runs;
      insert into public.client_loop_rounds(tenant_slug,run_id,round,summary,created_at)
        select tenant_slug,id,n,'Synthetic extra due round',created_at+interval '2 days'
        from public.client_loop_runs cross join generate_series(2,3) n where title='due';
      insert into public.client_room_conversations(tenant_slug,created_by,title,created_at,updated_at)
        select tenant_slug,requested_by,idempotency_key,created_at,now() from public.client_runtime_jobs;
      insert into public.client_room_messages(tenant_slug,conversation_id,role,content,created_at)
        select tenant_slug,id,'user','Synthetic historical message',created_at+interval '1 day'
        from public.client_room_conversations;
      insert into public.client_pipeline_items(tenant_slug,created_by,slug,title,idea,execution_job_id,created_at,updated_at)
        select tenant_slug,requested_by,idempotency_key,idempotency_key,'Synthetic historical idea',id,created_at,now()
        from public.client_runtime_jobs;
    `);
    const original = (await db.query(`
      select id,created_at,updated_at from public.client_board_tasks order by id
    `)).rows;
    for (const name of retentionMigrations) {
      await test.step(`populated ${name}`, () => db.exec(readFileSync(`product-experience/supabase-${name}.sql`, "utf8")));
    }
    expect((await db.query("select id,created_at,updated_at from public.client_board_tasks order by id")).rows).toEqual(original);
    for (const table of ["client_board_tasks", "client_loop_runs", "client_room_conversations", "client_pipeline_items"]) {
      const deadlines = await db.query<{ original_deadline: boolean }>(`
        select item.retention_expires_at=item.created_at+make_interval(days=>tenant.retention_days) as original_deadline
        from public.${table} item join public.client_tenants tenant on tenant.slug=item.tenant_slug
      `);
      expect(deadlines.rows).toHaveLength(6);
      expect(deadlines.rows.every((row) => row.original_deadline)).toBe(true);
    }
    for (const [child, parent, key] of [
      ["client_board_comments", "client_board_tasks", "task_id"],
      ["client_board_events", "client_board_tasks", "task_id"],
      ["client_loop_rounds", "client_loop_runs", "run_id"],
      ["client_room_messages", "client_room_conversations", "conversation_id"],
    ]) {
      expect((await db.query<{ bounded: boolean }>(`
        select child.retention_expires_at=parent.retention_expires_at as bounded
        from public.${child} child join public.${parent} parent on parent.id=child.${key}
      `)).rows.every((row) => row.bounded)).toBe(true);
    }
    await db.exec(`
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',false);
      select set_config('request.jwt.claim.role','authenticated',false); set role authenticated;
    `);
    for (const table of ["client_board_tasks", "client_loop_runs", "client_room_conversations", "client_pipeline_items"]) {
      expect((await db.query<{ title: string }>(`select title from public.${table}`)).rows).toEqual([{ title: "active" }]);
    }
    expect((await db.query("select * from public.client_board_comments")).rows).toHaveLength(1);
    expect((await db.query("select * from public.client_room_messages")).rows).toHaveLength(1);
    await db.exec("reset role; select set_config('request.jwt.claim.role','service_role',false); set role service_role");
    const preview = await db.query<{ result: { applied: boolean; deleted: { boardTasks: number }; expiredOrPurgeDue: { boardTasks: number; boardComments: number } } }>(
      "select public.purge_expired_client_board_loop_records('tenant-a',false,1) as result",
    );
    expect(preview.rows[0].result.applied).toBe(false);
    expect(preview.rows[0].result.deleted.boardTasks).toBe(0);
    expect(preview.rows[0].result.expiredOrPurgeDue).toMatchObject({ boardTasks: 1, boardComments: 3 });
    for (let batch = 0; batch < 3; batch++) {
      await db.exec("reset role");
      const before = (await db.query("select id from public.client_board_comments where tenant_slug='tenant-a'")).rows.length;
      const roundsBefore = (await db.query("select id from public.client_loop_rounds where tenant_slug='tenant-a'")).rows.length;
      const eventsBefore = (await db.query("select id from public.client_board_events where tenant_slug='tenant-a'")).rows.length;
      await db.exec("set role service_role");
      const applied = await db.query<{ result: { deleted: { boardComments: number; boardEvents: number; boardTasks: number; loopRounds: number; loopRuns: number } } }>(
        "select public.purge_expired_client_board_loop_records('tenant-a',true,1) as result",
      );
      await db.exec("reset role");
      const after = (await db.query("select id from public.client_board_comments where tenant_slug='tenant-a'")).rows.length;
      const roundsAfter = (await db.query("select id from public.client_loop_rounds where tenant_slug='tenant-a'")).rows.length;
      const eventsAfter = (await db.query("select id from public.client_board_events where tenant_slug='tenant-a'")).rows.length;
      expect(before - after).toBe(1);
      expect(roundsBefore - roundsAfter).toBe(1);
      expect(eventsBefore - eventsAfter).toBe(1);
      expect(applied.rows[0].result.deleted).toMatchObject({ boardComments: 1, boardEvents: 1, loopRounds: 1,
        boardTasks: batch === 2 ? 1 : 0, loopRuns: batch === 2 ? 1 : 0 });
      await db.exec("set role service_role");
    }
    for (const suffix of ["room_records", "pipeline_items", "runtime_jobs"]) {
      await db.query(`select public.purge_expired_client_${suffix}('tenant-a',true,1)`);
    }
    await db.exec("reset role");
    for (const table of ["client_board_tasks", "client_loop_runs", "client_room_conversations", "client_pipeline_items"]) {
      expect((await db.query<{ title: string }>(`
        select title from public.${table} where tenant_slug='tenant-a' order by title
      `)).rows).toEqual([{ title: "active" }, { title: "recovery" }]);
      expect((await db.query(`select id from public.${table} where tenant_slug='tenant-b'`)).rows).toHaveLength(3);
    }
    expect((await db.query("select id from public.client_runtime_jobs where tenant_slug='tenant-a'")).rows).toHaveLength(2);
    expect((await db.query("select id from public.client_runtime_jobs where tenant_slug='tenant-b'")).rows).toHaveLength(3);
    for (const table of ["client_board_comments", "client_board_events", "client_loop_rounds", "client_room_messages"]) {
      expect((await db.query(`select id from public.${table} where tenant_slug='tenant-a'`)).rows).toHaveLength(2);
      expect((await db.query(`select id from public.${table} where tenant_slug='tenant-b'`)).rows)
        .toHaveLength(table === "client_room_messages" ? 3 : 5);
    }
    const auditBeforeReplay = (await db.query("select id from public.client_runtime_audit_events")).rows.length;
    await db.exec("set role service_role");
    const replay = await db.query<{ result: { deleted: number; candidates: number } }>(
      "select public.purge_expired_client_runtime_jobs('tenant-a',true,1) as result",
    );
    expect(replay.rows[0].result).toMatchObject({ deleted: 0, candidates: 0 });
    const boardReplay = await db.query<{ result: { deleted: Record<string, number> } }>(
      "select public.purge_expired_client_board_loop_records('tenant-a',true,1) as result",
    );
    expect(Object.values(boardReplay.rows[0].result.deleted).every((count) => count === 0)).toBe(true);
    await db.exec("reset role");
    expect((await db.query("select id from public.client_runtime_audit_events")).rows).toHaveLength(auditBeforeReplay);
  } finally {
    await db.close();
  }
});
