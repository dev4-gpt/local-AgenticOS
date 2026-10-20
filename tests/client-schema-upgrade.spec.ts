import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import { clientIsolationFixture, clientIsolationFixtureSql } from "./helpers/client-isolation-fixture.mjs";

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
  "v49-managed-credit-retention",
  // Adapter host data, before the restore migration so its restore triggers attach to these tables.
  "client-adapter-host", "client-adapter-token-uses", "client-adapter-approval-gateway", "client-adapter-budget",
  "client-adapter-retention-28", "client-adapter-promotions", "client-adapter-background-owner",
  "client-lifecycle-restore", "client-table-privilege-hardening",
];

const purgeNames = [
  "board_loop_records", "hermes_content_factory_records", "notebook_sources", "notebooks",
  "onboarding_tokens", "paperclip_records", "pipeline_items", "research", "room_records",
  "ruflo_records", "runtime_audit_and_budget", "runtime_jobs", "runtime_rate_limits",
  "runtime_records", "runtime_requests", "support_requests", "visual_qa", "credit_records",
].map((suffix) => `purge_expired_client_${suffix}`);
const globalPurges = new Set([
  "purge_expired_client_onboarding_tokens", "purge_expired_client_runtime_rate_limits",
]);

async function repositoryDatabase({ broadTableDefaults = false } = {}) {
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
    if (broadTableDefaults) {
      // Match the observed Supabase creator's public-table defaults, not just
      // the explicit grants in application migrations. No hosted rows are used.
      await db.exec(`alter default privileges in schema public
        grant all privileges on tables to anon, authenticated, service_role;`);
    }
    for (const name of baseMigrations) {
      await db.exec(readFileSync(`product-experience/supabase-${name}.sql`, "utf8"));
    }
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

test("the two-member isolation fixture populates every real read probe atomically without execution", async () => {
  test.setTimeout(90_000);
  const db = await repositoryDatabase({ broadTableDefaults: true });
  try {
    for (const name of retentionMigrations) await db.exec(readFileSync(`product-experience/supabase-${name}.sql`, "utf8"));
    const memberA = "00000000-0000-4000-8000-000000000101";
    const memberB = "00000000-0000-4000-8000-000000000102";
    await db.query("insert into auth.users(id,email) values ($1,'a@example.invalid'),($2,'b@example.invalid')", [memberA, memberB]);
    const publicTables = (await db.query<{ name: string }>(`select c.relname as name from pg_class c
      join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') order by c.relname`)).rows;
    const counts = async () => Object.fromEntries(await Promise.all(publicTables.map(async ({ name }) => {
      expect(name).toMatch(/^[a-z_]+$/);
      return [name, (await db.query<{ n: number }>(`select count(*)::int as n from public.${name}`)).rows[0].n];
    })));
    const before = await counts();
    const createdAt = (await db.query<{ now: string }>("select now()::text as now")).rows[0].now;
    const fixture = clientIsolationFixture({ memberA, memberB, createdAt: new Date(createdAt).toISOString() });
    const ast = ts.createSourceFile("probe.mjs", readFileSync("scripts/verify-client-runtime-isolation.mjs", "utf8"), ts.ScriptTarget.Latest, true);
    const tables: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "probes") {
        expect(node.initializer && ts.isArrayLiteralExpression(node.initializer)).toBe(true);
        for (const element of (node.initializer as ts.ArrayLiteralExpression).elements) {
          expect(ts.isArrayLiteralExpression(element)).toBe(true);
          const value = (element as ts.ArrayLiteralExpression).elements[1] as ts.StringLiteral;
          expect(ts.isStringLiteral(value)).toBe(true);
          tables.push(value.text);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    expect(tables).toHaveLength(34);
    expect(fixture.groups.map(group => group.table).sort()).toEqual([...tables, "client_tenants", "client_memberships"].sort());
    expect(fixture.groups.reduce((sum, group) => sum + group.rows.length, 0)).toBe(72);
    const fixtureSql = clientIsolationFixtureSql(fixture);
    const missingMember = clientIsolationFixture({ memberA, memberB: "00000000-0000-4000-8000-000000000103", createdAt: fixture.createdAt });
    await expect(db.exec(clientIsolationFixtureSql(missingMember))).rejects.toMatchObject({ message: "fixture_auth_members_missing" });
    await db.exec("rollback");
    expect(await counts()).toEqual(before);
    for (const offset of [-21 * 60_000, 2 * 60_000]) {
      const invalidClock = clientIsolationFixture({ memberA, memberB,
        createdAt: new Date(Date.parse(fixture.createdAt) + offset).toISOString() });
      await expect(db.exec(clientIsolationFixtureSql(invalidClock))).rejects.toMatchObject({ message: "fixture_clock_outside_prepared_window" });
      await db.exec("rollback");
      expect(await counts()).toEqual(before);
    }
    await db.query("insert into public.client_tenants(slug,name) values ($1,'Existing local sentinel')", [fixture.tenants[0]]);
    const occupied = await counts();
    await expect(db.exec(fixtureSql)).rejects.toMatchObject({ message: "fixture_namespace_exists" });
    await db.exec("rollback");
    expect(await counts()).toEqual(occupied);
    await db.query("delete from public.client_tenants where slug=$1", [fixture.tenants[0]]);
    expect(await counts()).toEqual(before);
    await expect(db.exec(fixtureSql.replace("\ncommit;", "\nselect 1/0;\ncommit;"))).rejects.toMatchObject({ code: "22012" });
    await db.exec("rollback");
    expect(await counts()).toEqual(before);
    await db.exec(fixtureSql);
    const after = await counts();
    const fixtureTables = new Set(fixture.groups.map(group => group.table));
    for (const { name } of publicTables) expect(after[name] - before[name]).toBe(fixtureTables.has(name) ? 2 : 0);
    for (const group of fixture.groups) expect((await db.query(`select count(*)::int as n from public.${group.table}`)).rows).toEqual([{ n: 2 }]);
    for (const [member, own, other] of [[memberA, fixture.tenants[0], fixture.tenants[1]], [memberB, fixture.tenants[1], fixture.tenants[0]]]) {
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)", [member]);
      await db.exec("set role authenticated");
      for (const table of tables) {
        expect((await db.query(`select tenant_slug from public.${table} where tenant_slug=$1`, [own])).rows).toEqual([{ tenant_slug: own }]);
        expect((await db.query(`select tenant_slug from public.${table} where tenant_slug=$1`, [other])).rows).toEqual([]);
      }
      await db.exec("reset role");
    }
    await db.query("select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','anon',false)");
    await db.exec("set role anon");
    for (const table of tables) {
      try { expect((await db.query(`select tenant_slug from public.${table}`)).rows).toEqual([]); }
      catch (error) { expect(error).toMatchObject({ code: "42501" }); }
    }
    await db.exec("reset role");
    expect((await db.query("select status from public.client_runtime_jobs")).rows).toEqual([{ status: "cancelled" }, { status: "cancelled" }]);
    expect((await db.query("select status from public.client_hermes_content_factory_deliveries")).rows).toEqual([{ status: "blocked" }, { status: "blocked" }]);
    expect(() => clientIsolationFixture({ memberA, memberB: memberA, createdAt: fixture.createdAt })).toThrow("distinct_fixture_members_required");
    expect(() => clientIsolationFixture({ memberA, memberB, createdAt: "not-a-date" })).toThrow("canonical_fixture_clock_required");
    const drift = structuredClone(fixture);
    drift.groups[0].rows[0].retention_days = 365;
    expect(() => clientIsolationFixtureSql(drift)).toThrow("fixture_content_drift");
    // Rehearse the exact proposed transaction, not only parameterized inserts.
    await expect(db.exec(clientIsolationFixtureSql(fixture))).rejects.toMatchObject({ message: "fixture_members_already_assigned" });
    await db.exec("rollback");
    expect(await counts()).toEqual(after);
  } finally { await db.close(); }
});

test("Supabase table defaults cannot give members tenant-wide administrative privileges", async () => {
  test.setTimeout(90_000);
  const db = await repositoryDatabase({ broadTableDefaults: true });
  try {
    for (const name of retentionMigrations) {
      await db.exec(readFileSync(`product-experience/supabase-${name}.sql`, "utf8"));
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
        ('tenant-a','00000000-0000-4000-8000-000000000101','memory','A','Private to A'),
        ('tenant-b','00000000-0000-4000-8000-000000000102','memory','B','Private to B');
      insert into public.client_board_tasks(id,tenant_slug,created_by,board,title) values
        ('00000000-0000-4000-8000-000000000201','tenant-a','00000000-0000-4000-8000-000000000101','kanban','A'),
        ('00000000-0000-4000-8000-000000000202','tenant-b','00000000-0000-4000-8000-000000000102','kanban','B');
      insert into public.client_board_comments(tenant_slug,task_id,created_by,body) values
        ('tenant-a','00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101','Private to A'),
        ('tenant-b','00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000102','Private to B');
      insert into public.deployment_requests(name,email,company,workflow) values
        ('Synthetic A','a@example.invalid','Synthetic A','Synthetic test'),
        ('Synthetic B','b@example.invalid','Synthetic B','Synthetic test');
    `);
    const outcomes = [];
    for (const role of ["anon", "authenticated"]) {
      for (const table of ["client_board_comments", "deployment_requests"]) {
        let code: string | null = null;
        let remaining = 2;
        try {
          await db.exec(`begin; set local role ${role}; truncate public.${table}; reset role;`);
          remaining = (await db.query(`select id from public.${table}`)).rows.length;
        } catch (error) {
          code = (error as { code?: string }).code ?? "unknown";
        } finally {
          await db.exec("rollback; reset role;");
        }
        outcomes.push({ role, table, code, remainingBeforeRollback: remaining });
        expect((await db.query(`select id from public.${table}`)).rows).toHaveLength(2);
        expect((await db.query("select id from public.client_runtime_records")).rows).toHaveLength(2);
      }
    }
    test.info().annotations.push({ type: "truncate-boundary", description: JSON.stringify(outcomes) });
    expect(outcomes).toEqual([
      { role: "anon", table: "client_board_comments", code: "42501", remainingBeforeRollback: 2 },
      { role: "anon", table: "deployment_requests", code: "42501", remainingBeforeRollback: 2 },
      { role: "authenticated", table: "client_board_comments", code: "42501", remainingBeforeRollback: 2 },
      { role: "authenticated", table: "deployment_requests", code: "42501", remainingBeforeRollback: 2 },
    ]);

    const administrativeGrants = async () => (await db.query(`
      select c.relname, r.rolname, privilege
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      cross join (values ('anon'),('authenticated')) r(rolname)
      cross join (values ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege)
      where n.nspname='public' and c.relkind in ('r','p')
        and has_table_privilege(r.rolname,c.oid,p.privilege)
      order by c.relname,r.rolname,privilege
    `)).rows;
    expect(await administrativeGrants()).toEqual([]);
    await db.exec(`
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',false);
      set role authenticated;
    `);
    expect((await db.query("select tenant_slug from public.client_runtime_records")).rows)
      .toEqual([{ tenant_slug: "tenant-a" }]);
    await db.exec("reset role; set role service_role;");
    expect((await db.query("select id from public.client_runtime_records")).rows).toHaveLength(2);
    await db.exec("reset role;");
    expect((await db.query<{ allowed: boolean }>(
      "select has_table_privilege('service_role','public.client_runtime_records','TRUNCATE') as allowed",
    )).rows[0].allowed).toBe(true);

    // Global PUBLIC grants also contribute to effective permissions. Reapply
    // against that legacy shape and require future creator-owned tables safe.
    await db.exec(`alter default privileges grant truncate, references, trigger, maintain on tables to public;
      grant truncate, references, trigger, maintain on public.client_runtime_records to public;`);
    const hardening = readFileSync("product-experience/supabase-client-table-privilege-hardening.sql", "utf8");
    await db.exec(hardening);
    await db.exec(hardening);
    expect(await administrativeGrants()).toEqual([]);
    await db.exec("create table public.client_privilege_probe(id integer);");
    expect(await administrativeGrants()).toEqual([]);
    expect((await db.query<{ allowed: boolean }>(
      "select has_table_privilege('authenticated','public.client_privilege_probe','SELECT') as allowed",
    )).rows[0].allowed).toBe(true);
    expect((await db.query<{ allowed: boolean }>(
      "select has_table_privilege('service_role','public.client_privilege_probe','TRUNCATE') as allowed",
    )).rows[0].allowed).toBe(true);

    await db.exec(`create role legacy_table_admin;
      grant truncate on public.client_runtime_records to legacy_table_admin;
      grant legacy_table_admin to authenticated;
      grant trigger on public.client_runtime_records to public;`);
    try {
      await expect(db.exec(hardening)).rejects.toThrow("client_administrative_table_privilege_remains");
    } finally {
      await db.exec("rollback;");
    }
    // The failed migration must also roll back its earlier direct revokes.
    expect((await db.query<{ allowed: boolean }>(
      "select has_table_privilege('anon','public.client_runtime_records','TRIGGER') as allowed",
    )).rows[0].allowed).toBe(true);
  } finally {
    await db.close();
  }
});

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
    expect(Object.keys(columns)).toHaveLength(55);
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

test("research lifecycle round trip preserves creation clocks and rejects incomplete or expired backups atomically", async () => {
  test.setTimeout(90_000);
  const db = await repositoryDatabase();
  try {
    for (const name of retentionMigrations) {
      await db.exec(readFileSync(`product-experience/supabase-${name}.sql`, "utf8"));
    }
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
    const runCreated = daysAgo(27), recordCreated = daysAgo(26), citationCreated = daysAgo(25);
    const recordRetrieved = daysAgo(2), citationRetrieved = daysAgo(1);
    await db.exec(`
      insert into auth.users values ('00000000-0000-4000-8000-000000000101','research@example.invalid');
      insert into public.client_tenants(slug,name,retention_days) values
        ('tenant-research','Synthetic research',28),('tenant-foreign','Untouched synthetic tenant',14);
    `);
    await db.query(`insert into public.client_research_runs
      (id,tenant_slug,created_by,provider,query,status,idempotency_key,result_count,created_at,updated_at)
      values ('00000000-0000-4000-8000-000000000301','tenant-research',
        '00000000-0000-4000-8000-000000000101','synthetic','Synthetic research','complete','research-round-trip',1,$1,$1)`, [runCreated]);
    await db.query(`insert into public.client_research_records
      (id,tenant_slug,research_run_id,source_url,retrieved_at,status,created_at)
      values ('00000000-0000-4000-8000-000000000302','tenant-research',
        '00000000-0000-4000-8000-000000000301','https://example.invalid/research',$1,'complete',$2)`, [recordRetrieved, recordCreated]);
    await db.query(`insert into public.client_research_citations
      (id,tenant_slug,research_run_id,research_record_id,url,title,retrieved_at,evidence,created_at)
      values ('00000000-0000-4000-8000-000000000303','tenant-research',
        '00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000302',
        'https://example.invalid/evidence','Synthetic citation',$1,'Synthetic evidence',$2)`, [citationRetrieved, citationCreated]);
    const columns = (await db.query<{ value: Record<string, string> }>(
      "select public.client_lifecycle_restore_columns() as value",
    )).rows[0].value;
    const tables = ["client_tenants", "client_research_runs", "client_research_records", "client_research_citations"];
    const batches = [];
    for (const table of tables) {
      const tenantColumn = table === "client_tenants" ? "slug" : "tenant_slug";
      const result = await db.query(`select ${columns[table]} from public.${table} where ${tenantColumn}='tenant-research'`);
      batches.push({ table, rows: result.rows });
    }
    const snapshot = JSON.parse(JSON.stringify(batches));
    const foreign = (await db.query("select to_jsonb(t) as value from public.client_tenants t where slug='tenant-foreign'")).rows;
    await db.exec("delete from public.client_tenants where slug='tenant-research'; set role service_role;");
    const restore = (value: unknown) => db.query<{ value: { restoredRows: number; atomicMetadata: boolean } }>(
      "select public.restore_client_lifecycle_metadata('tenant-research',$1::jsonb) as value", [JSON.stringify(value)],
    );
    expect((await restore(snapshot)).rows[0].value).toMatchObject({ restoredRows: 4, atomicMetadata: true });
    await db.exec("reset role");
    for (const [table, created, retrieved] of [
      ["client_research_records", recordCreated, recordRetrieved],
      ["client_research_citations", citationCreated, citationRetrieved],
    ]) {
      const row = (await db.query<{ created_at: Date; retrieved_at: Date }>(
        `select created_at,retrieved_at from public.${table} where tenant_slug='tenant-research'`,
      )).rows[0];
      expect(new Date(row.created_at).toISOString()).toBe(created);
      expect(new Date(row.retrieved_at).toISOString()).toBe(retrieved);
    }
    await db.exec("delete from public.client_tenants where slug='tenant-research'; set role service_role;");
    for (const table of ["client_research_records", "client_research_citations"]) {
      const legacy = structuredClone(snapshot);
      delete legacy.find((batch: { table: string }) => batch.table === table).rows[0].created_at;
      await expect(restore(legacy)).rejects.toThrow(/client_restore_original_clock_required/);
      const expired = structuredClone(snapshot);
      expired.find((batch: { table: string }) => batch.table === table).rows[0].created_at = daysAgo(29);
      await expect(restore(expired)).rejects.toThrow(/client_restore_active_window_invalid/);
      const future = structuredClone(snapshot);
      future.find((batch: { table: string }) => batch.table === table).rows[0].created_at = daysAgo(-1);
      await expect(restore(future)).rejects.toThrow(/client_restore_original_clock_required/);
    }
    await db.exec("reset role");
    expect((await db.query("select slug from public.client_tenants where slug='tenant-research'")).rows).toHaveLength(0);
    expect((await db.query("select to_jsonb(t) as value from public.client_tenants t where slug='tenant-foreign'")).rows).toEqual(foreign);
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

test("Paperclip issue purge drains bounded comments and runs before deleting the parent", async () => {
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
      insert into public.client_paperclip_issues(tenant_slug,created_by,issue_number,identifier,title,created_at,updated_at)
        select member.tenant_slug,member.user_id,age.number,'PC-'||age.number,age.label,
          now()-make_interval(days=>age.days),now()
        from public.client_memberships member
        cross join (values (1,'active',10),(2,'recovery',30),(3,'due',40)) age(number,label,days);
      insert into public.client_paperclip_comments(tenant_slug,created_by,issue_id,body,created_at)
        select tenant_slug,created_by,id,'Synthetic issue comment',created_at+interval '1 day'
        from public.client_paperclip_issues cross join generate_series(1,3);
      insert into public.client_paperclip_runs(tenant_slug,created_by,issue_id,status,summary,created_at,updated_at)
        select tenant_slug,created_by,id,'succeeded','Synthetic issue run',created_at+interval '1 day',now()
        from public.client_paperclip_issues cross join generate_series(1,3);
    `);
    for (const name of retentionMigrations) await db.exec(readFileSync(`product-experience/supabase-${name}.sql`, "utf8"));
    await db.exec(`
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',false);
      select set_config('request.jwt.claim.role','authenticated',false); set role authenticated;
    `);
    expect((await db.query("select title from public.client_paperclip_issues")).rows).toEqual([{ title: "active" }]);
    expect((await db.query("select id from public.client_paperclip_comments")).rows).toHaveLength(3);
    expect((await db.query("select id from public.client_paperclip_runs")).rows).toHaveLength(3);
    await db.exec("reset role");
    const foreignBefore = (await db.query(`
      select to_jsonb(issue) as value from public.client_paperclip_issues issue where tenant_slug='tenant-b' order by id
    `)).rows;
    const count = async (table: string) => {
      expect(table).toMatch(/^client_paperclip_(comments|runs|issues)$/);
      return (await db.query(`select id from public.${table} where tenant_slug='tenant-a'`)).rows.length;
    };
    for (let batch = 0; batch < 3; batch++) {
      const commentsBefore = await count("client_paperclip_comments");
      const runsBefore = await count("client_paperclip_runs");
      await db.exec("set role service_role");
      const result = await db.query<{ result: { deleted: Record<string, number> } }>(
        "select public.purge_expired_client_paperclip_records('tenant-a',true,1) as result",
      );
      await db.exec("reset role");
      expect(commentsBefore - await count("client_paperclip_comments")).toBe(1);
      expect(runsBefore - await count("client_paperclip_runs")).toBe(1);
      expect(result.rows[0].result.deleted).toEqual({ comments: 1, runs: 1, issues: batch === 2 ? 1 : 0,
        projects: 0, agents: 0, companies: 0 });
      expect(await count("client_paperclip_issues")).toBe(batch === 2 ? 2 : 3);
    }
    expect((await db.query("select title from public.client_paperclip_issues where tenant_slug='tenant-a' order by title")).rows)
      .toEqual([{ title: "active" }, { title: "recovery" }]);
    expect((await db.query(`
      select to_jsonb(issue) as value from public.client_paperclip_issues issue where tenant_slug='tenant-b' order by id
    `)).rows).toEqual(foreignBefore);
    expect((await db.query("select id from public.client_paperclip_comments where tenant_slug='tenant-b'")).rows).toHaveLength(9);
    expect((await db.query("select id from public.client_paperclip_runs where tenant_slug='tenant-b'")).rows).toHaveLength(9);
    const auditCount = (await db.query("select id from public.client_runtime_audit_events")).rows.length;
    expect(auditCount).toBe(3);
    await db.exec("set role service_role");
    const replay = await db.query<{ result: { deleted: Record<string, number> } }>(
      "select public.purge_expired_client_paperclip_records('tenant-a',true,1) as result",
    );
    expect(Object.values(replay.rows[0].result.deleted).every((n) => n === 0)).toBe(true);
    await db.exec("reset role");
    expect((await db.query("select id from public.client_runtime_audit_events")).rows).toHaveLength(auditCount);
  } finally {
    await db.close();
  }
});
