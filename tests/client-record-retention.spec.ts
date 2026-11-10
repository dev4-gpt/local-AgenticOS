import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { retentionDatabase } from "./helpers/client-record-retention-database";


const call = "select public.purge_expired_client_runtime_records($1,$2,$3) as result";

test("runtime records become recovery-only at active expiry without early deletion", async () => {
  const db = await retentionDatabase();
  try {
    await db.exec("set role authenticated");
    const visible = await db.query<{ id: string }>("select id from client_runtime_records where tenant_slug='tenant-a' order by id");
    expect(visible.rows.map((row) => row.id)).toEqual(["00000000-0000-4000-8000-000000000003"]);
    const visibleGraphNodes = await db.query<{ id: string }>("select id from client_runtime_memory_graph_nodes where tenant_slug='tenant-a' order by id");
    expect(visibleGraphNodes.rows.map((row) => row.id)).toEqual([
      "00000000-0000-4000-8000-000000000012",
      "00000000-0000-4000-8000-000000000014",
      "00000000-0000-4000-8000-000000000015",
    ]);
    const visibleGraphEdges = await db.query<{ id: string }>("select id from client_runtime_memory_graph_edges where tenant_slug='tenant-a' order by id");
    expect(visibleGraphEdges.rows.map((row) => row.id)).toEqual([
      "00000000-0000-4000-8000-000000000023",
      "00000000-0000-4000-8000-000000000024",
    ]);
    expect((await db.query("update client_runtime_records set kind='journal' where id='00000000-0000-4000-8000-000000000006' returning id")).rows).toHaveLength(0);
    await db.query(`insert into client_runtime_records(id,tenant_slug,kind,created_at) values
      ('00000000-0000-4000-8000-000000000007','tenant-a','memory',now()-interval '80 days')`);
    const inserted = await db.query<{ serverDated: boolean }>(`select created_at>now()-interval '1 minute' as "serverDated"
      from client_runtime_records where id='00000000-0000-4000-8000-000000000007'`);
    expect(inserted.rows[0].serverDated).toBe(true);
    await db.exec("reset role");
    expect((await db.query("select id from client_runtime_records where id='00000000-0000-4000-8000-000000000006'")).rows).toHaveLength(1);
    await expect(db.query("update client_runtime_records set kind='journal' where id='00000000-0000-4000-8000-000000000006'")).rejects.toThrow(/client_runtime_record_expired/);
    await expect(db.query("update client_runtime_records set created_at=created_at-interval '1 day' where id='00000000-0000-4000-8000-000000000003'")).rejects.toThrow(/client_record_retention_immutable/);
  } finally {
    await db.close();
  }
});

test("28-day record retention is a bounded, tenant-scoped dry run before apply", async () => {
  const db = await retentionDatabase();
  try {
    const preview = await db.query<{ result: Record<string, unknown> }>(call, ["tenant-a", false, 1]);
    expect(preview.rows[0].result).toMatchObject({ candidates: 2, deleted: 0, remainingCandidates: 2, applied: false });
    expect((await db.query("select id from client_runtime_audit_events")).rows).toHaveLength(0);

    const first = await db.query<{ result: Record<string, unknown> }>(call, ["tenant-a", true, 1]);
    expect(first.rows[0].result).toMatchObject({ candidates: 2, deleted: 1, remainingCandidates: 1, graphOrphanNodesDeleted: 1 });
    const nodes = await db.query<{ id: string }>("select id from client_runtime_memory_graph_nodes where tenant_slug='tenant-a' order by id");
    expect(nodes.rows.map((row) => row.id)).toEqual([
      "00000000-0000-4000-8000-000000000012",
      "00000000-0000-4000-8000-000000000014",
      "00000000-0000-4000-8000-000000000015",
    ]);

    const second = await db.query<{ result: Record<string, unknown> }>(call, ["tenant-a", true, 1]);
    expect(second.rows[0].result).toMatchObject({ candidates: 1, deleted: 1, remainingCandidates: 0, graphOrphanNodesDeleted: 0 });
    expect((await db.query("select id from client_runtime_records where tenant_slug='tenant-a'")).rows).toHaveLength(2);
    expect((await db.query("select id from client_runtime_records where tenant_slug='tenant-b'")).rows).toHaveLength(1);
    expect((await db.query("select id from client_runtime_budget_ledger")).rows).toHaveLength(1);
    const audit = await db.query<{ event_type: string; metadata: { deleted: number; retentionDays: number } }>("select event_type, metadata from client_runtime_audit_events order by id");
    expect(audit.rows).toHaveLength(2);
    expect(audit.rows[0]).toMatchObject({ event_type: "tenant.runtime_records.retention_purged", metadata: { deleted: 1, retentionDays: 28 } });
  } finally {
    await db.close();
  }
});

test("record retention rejects unconfigured tenants and rolls back on audit failure", async () => {
  const db = await retentionDatabase();
  try {
    const privileges = await db.query<{ unauthenticated: boolean; member: boolean; operator: boolean }>(`
      select has_function_privilege('anon', 'public.purge_expired_client_runtime_records(text,boolean,integer)', 'EXECUTE') as unauthenticated,
        has_function_privilege('authenticated', 'public.purge_expired_client_runtime_records(text,boolean,integer)', 'EXECUTE') as member,
        has_function_privilege('service_role', 'public.purge_expired_client_runtime_records(text,boolean,integer)', 'EXECUTE') as operator
    `);
    expect(privileges.rows[0]).toEqual({ unauthenticated: false, member: false, operator: true });
    expect((await db.query(call, ["tenant-short", false, 500])).rows[0].result).toMatchObject({ retentionDays: 14, candidates: 1, applied: false });
    await expect(db.query(call, ["tenant-invalid", false, 500])).rejects.toThrow(/client_record_retention_tenant_not_configured/);
    await expect(db.query(call, ["tenant-a", true, 1001])).rejects.toThrow(/client_record_retention_invalid_input/);
    await db.exec(`
      create function reject_retention_audit() returns trigger language plpgsql as $$
      begin raise exception 'audit_unavailable'; end; $$;
      create trigger reject_retention_audit before insert on client_runtime_audit_events
        for each row execute function reject_retention_audit();
    `);
    await expect(db.query(call, ["tenant-a", true, 500])).rejects.toThrow(/audit_unavailable/);
    expect((await db.query("select id from client_runtime_records where tenant_slug='tenant-a'")).rows).toHaveLength(4);
    expect((await db.query("select id from client_runtime_memory_graph_nodes where tenant_slug='tenant-a'")).rows).toHaveLength(5);
    expect((await db.query("select id from client_runtime_memory_graph_edges where tenant_slug='tenant-a'")).rows).toHaveLength(4);
  } finally {
    await db.close();
  }
});

test("new learning items survive deletion of older source records and jobs", async () => {
  const db = await retentionDatabase();
  try {
    await db.exec(`
      create unique index client_runtime_records_tenant_id_test on client_runtime_records (tenant_slug, id);
      create table client_runtime_jobs (
        id uuid primary key, tenant_slug text not null references client_tenants(slug),
        unique (tenant_slug, id)
      );
      create table client_learning_items (
        id uuid primary key, tenant_slug text not null references client_tenants(slug),
        source_job_id uuid, source_record_id uuid, created_at timestamptz not null,
        constraint client_learning_items_tenant_slug_source_job_id_fkey
          foreign key (tenant_slug, source_job_id) references client_runtime_jobs (tenant_slug, id) on delete cascade,
        constraint client_learning_items_tenant_slug_source_record_id_fkey
          foreign key (tenant_slug, source_record_id) references client_runtime_records (tenant_slug, id) on delete cascade
      );
      insert into client_runtime_jobs values ('00000000-0000-4000-8000-000000000031', 'tenant-a');
      insert into client_learning_items values
        ('00000000-0000-4000-8000-000000000041', 'tenant-a', null,
         '00000000-0000-4000-8000-000000000001', now()),
        ('00000000-0000-4000-8000-000000000042', 'tenant-a',
         '00000000-0000-4000-8000-000000000031', null, now());
    `);
    const migration = readFileSync("product-experience/supabase-v48-ecc-learning-retention-references.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);
    expect((await db.query<{ ready: boolean }>("select public.client_learning_retention_references_ready() as ready")).rows[0].ready).toBe(true);
    await db.query(call, ["tenant-a", true, 1]);
    await db.exec("delete from client_runtime_jobs where tenant_slug='tenant-a'");
    const items = await db.query<{ id: string; tenant_slug: string; source_job_id: string | null; source_record_id: string | null }>(
      "select id, tenant_slug, source_job_id, source_record_id from client_learning_items order by id",
    );
    expect(items.rows).toEqual([
      { id: "00000000-0000-4000-8000-000000000041", tenant_slug: "tenant-a", source_job_id: null, source_record_id: null },
      { id: "00000000-0000-4000-8000-000000000042", tenant_slug: "tenant-a", source_job_id: null, source_record_id: null },
    ]);
    const privileges = await db.query<{ browser: boolean; operator: boolean }>(`
      select has_function_privilege('authenticated', 'public.client_learning_retention_references_ready()', 'EXECUTE') as browser,
        has_function_privilege('service_role', 'public.client_learning_retention_references_ready()', 'EXECUTE') as operator
    `);
    expect(privileges.rows[0]).toEqual({ browser: false, operator: true });
    await db.exec(`
      alter table client_learning_items drop constraint client_learning_items_tenant_slug_source_job_id_fkey;
      alter table client_learning_items add constraint client_learning_items_tenant_slug_source_job_id_fkey
        foreign key (tenant_slug, source_job_id) references client_runtime_jobs (tenant_slug, id) on delete cascade;
    `);
    expect((await db.query<{ ready: boolean }>("select public.client_learning_retention_references_ready() as ready")).rows[0].ready).toBe(false);
  } finally {
    await db.close();
  }
});

test("operator retention requires confirmation and stops when the record RPC fails", () => {
  const script = path.join(process.cwd(), "scripts/client-lifecycle.mjs");
  const fixture = path.join(process.cwd(), "scripts/fixtures/client-retention-fetch.mjs");
  const run = (args: string[], extraEnv: Record<string, string> = {}) => spawnSync(process.execPath, [
    "--import", fixture, script, "--mode", "retention", "--slug", "tenant-a", ...args,
  ], { cwd: process.cwd(), encoding: "utf8", env: {
    PATH: process.env.PATH ?? "", SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-only", ...extraEnv,
  } });

  const preview = run([]);
  expect(preview.status).toBe(0);
  expect(preview.stdout).toContain("MOCK_RECORD_RETENTION:false");
  expect(preview.stdout).toContain("MOCK_ONBOARDING_TOKEN_RETENTION:false");
  expect(preview.stdout).toContain("MOCK_SOURCE_RETENTION:false");
  expect(preview.stdout).toContain("MOCK_RESEARCH_RETENTION:false");
  expect(preview.stdout).toContain("MOCK_NOTEBOOK_RETENTION:false");
  expect(preview.stdout).toContain("MOCK_RUNTIME_REQUEST_RETENTION:false");
  expect(preview.stdout).toContain("MOCK_ROOM_RETENTION:false");
  expect(preview.stdout).toContain("MOCK_VISUAL_QA_RETENTION:false");
  expect(preview.stdout).toContain("MOCK_SUPPORT_RETENTION:false");
  expect(preview.stdout).toContain("MOCK_PIPELINE_RETENTION:false");
  expect(preview.stdout).toContain("MOCK_BOARD_LOOP_RETENTION:false");
  expect(preview.stdout).toContain("MOCK_PAPERCLIP_RETENTION:false");
  expect(preview.stdout).toContain("MOCK_RUFLO_RETENTION:false");
  expect(preview.stdout).toContain("MOCK_JOB_RETENTION:false");
  expect(preview.stdout).toContain("MOCK_CREDIT_RETENTION:false");
  expect(preview.stdout).toContain("MOCK_AUDIT_BUDGET_RETENTION:false");
  expect(preview.stdout).not.toContain("MOCK_LEARNING_RETENTION_DELETE");
  expect(JSON.parse(preview.stdout.trim().split("\n").at(-1) || "{}")).toMatchObject({
    onboardingTokens: { candidates: 1, deleted: 0, remainingCandidates: 1, recoveryDays: 7, applied: false },
    runtimeRateLimits: { candidates: 1, deleted: 0, remainingCandidates: 1, recoveryDays: 7, applied: false },
    runtimeRecords: { candidates: 2, deleted: 0 }, notebookSources: { candidates: 1, deleted: 0 },
    runtimeJobs: { candidates: 2, deleted: 0, remainingCandidates: 2, applied: false },
    creditRetention: { candidates: { transactions: 2 }, deleted: {}, remainingCandidates: { transactions: 2 },
      preservedNonzeroWalletBalances: 1, preservedNonzeroProviderBalances: 1, purgeAfterDays: 35, applied: false },
    notebooks: { candidates: 0, deleted: 0 }, research: { candidates: { runs: 0, records: 0, citations: 0, workerFailures: 0 } },
    room: { candidates: { messages: 1, rounds: 1, conversations: 1 }, deleted: { messages: 0, rounds: 0, conversations: 0 }, applied: false },
    visualQa: { candidates: { findings: 1, reports: 1 }, deleted: { findings: 0, reports: 0 }, applied: false },
    pipeline: { expiredCandidates: 1, purgeDueCandidates: 0, deleted: 0, remainingPurgeDue: 0, applied: false },
    boardLoop: { expiredOrPurgeDue: { boardComments: 0, boardEvents: 0, loopRounds: 0, boardTasks: 0, loopRuns: 0 }, applied: false },
    paperclip: { expiredOrPurgeDue: { comments: 0, runs: 0, issues: 0, projects: 0, agents: 0 }, applied: false },
    ruflo: { expiredOrPurgeDue: { agents: 0, swarms: 0 }, deleted: { agents: 0, swarms: 0 }, applied: false },
    purgeDueLearningItems: 1, retentionDays: 28, recoveryDays: 7, purgeAfterDays: 35, applied: false,
  });

  const unconfirmed = run(["--apply"]);
  expect(unconfirmed.status).toBe(1);
  expect(unconfirmed.stderr).toContain("--confirm-retention-records");
  expect(unconfirmed.stdout).toBe("");

  const missingLearningConfirmation = run(["--apply", "--confirm-retention-records"]);
  expect(missingLearningConfirmation.status).toBe(1);
  expect(missingLearningConfirmation.stderr).toContain("--confirm-retention-learning");

  const missingTokenConfirmation = run(["--apply", "--confirm-retention-records", "--confirm-retention-learning", "--confirm-retention-sources", "--confirm-retention-notebooks", "--confirm-retention-research", "--confirm-retention-runtime", "--confirm-retention-room", "--confirm-retention-visual-qa", "--confirm-retention-support", "--confirm-retention-pipeline", "--confirm-retention-board-loop", "--confirm-retention-paperclip", "--confirm-retention-hermes", "--confirm-retention-ruflo"]);
  expect(missingTokenConfirmation.status).toBe(1);
  expect(missingTokenConfirmation.stderr).toContain("--confirm-retention-onboarding-tokens");

  const missingRateLimitConfirmation = run(["--apply", "--confirm-retention-records", "--confirm-retention-learning", "--confirm-retention-sources", "--confirm-retention-notebooks", "--confirm-retention-research", "--confirm-retention-runtime", "--confirm-retention-room", "--confirm-retention-visual-qa", "--confirm-retention-support", "--confirm-retention-pipeline", "--confirm-retention-board-loop", "--confirm-retention-paperclip", "--confirm-retention-hermes", "--confirm-retention-ruflo", "--confirm-retention-onboarding-tokens"]);
  expect(missingRateLimitConfirmation.status).toBe(1);
  expect(missingRateLimitConfirmation.stderr).toContain("--confirm-retention-rate-limits");

  const missingSourceConfirmation = run(["--apply", "--confirm-retention-records", "--confirm-retention-learning"]);
  expect(missingSourceConfirmation.status).toBe(1);
  expect(missingSourceConfirmation.stderr).toContain("--confirm-retention-sources");

  const missingResearchConfirmation = run(["--apply", "--confirm-retention-records", "--confirm-retention-learning", "--confirm-retention-sources"]);
  expect(missingResearchConfirmation.status).toBe(1);
  expect(missingResearchConfirmation.stderr).toContain("--confirm-retention-notebooks");

  const missingNotebookConfirmation = run(["--apply", "--confirm-retention-records", "--confirm-retention-learning", "--confirm-retention-sources", "--confirm-retention-notebooks"]);
  expect(missingNotebookConfirmation.status).toBe(1);
  expect(missingNotebookConfirmation.stderr).toContain("--confirm-retention-research");

  const missingRuntimeConfirmation = run(["--apply", "--confirm-retention-records", "--confirm-retention-learning", "--confirm-retention-sources", "--confirm-retention-notebooks", "--confirm-retention-research"]);
  expect(missingRuntimeConfirmation.status).toBe(1);
  expect(missingRuntimeConfirmation.stderr).toContain("--confirm-retention-runtime");

  const missingRoomConfirmation = run(["--apply", "--confirm-retention-records", "--confirm-retention-learning", "--confirm-retention-sources", "--confirm-retention-notebooks", "--confirm-retention-research", "--confirm-retention-runtime"]);
  expect(missingRoomConfirmation.status).toBe(1);
  expect(missingRoomConfirmation.stderr).toContain("--confirm-retention-room");

  const missingVisualQaConfirmation = run(["--apply", "--confirm-retention-records", "--confirm-retention-learning", "--confirm-retention-sources", "--confirm-retention-notebooks", "--confirm-retention-research", "--confirm-retention-runtime", "--confirm-retention-room"]);
  expect(missingVisualQaConfirmation.status).toBe(1);
  expect(missingVisualQaConfirmation.stderr).toContain("--confirm-retention-visual-qa");

  const missingSupportConfirmation = run(["--apply", "--confirm-retention-records", "--confirm-retention-learning", "--confirm-retention-sources", "--confirm-retention-notebooks", "--confirm-retention-research", "--confirm-retention-runtime", "--confirm-retention-room", "--confirm-retention-visual-qa"]);
  expect(missingSupportConfirmation.status).toBe(1);
  expect(missingSupportConfirmation.stderr).toContain("--confirm-retention-support");

  const missingPipelineConfirmation = run(["--apply", "--confirm-retention-records", "--confirm-retention-learning", "--confirm-retention-sources", "--confirm-retention-notebooks", "--confirm-retention-research", "--confirm-retention-runtime", "--confirm-retention-room", "--confirm-retention-visual-qa", "--confirm-retention-support"]);
  expect(missingPipelineConfirmation.status).toBe(1);
  expect(missingPipelineConfirmation.stderr).toContain("--confirm-retention-pipeline");

  const missingBoardLoopConfirmation = run(["--apply", "--confirm-retention-records", "--confirm-retention-learning", "--confirm-retention-sources", "--confirm-retention-notebooks", "--confirm-retention-research", "--confirm-retention-runtime", "--confirm-retention-room", "--confirm-retention-visual-qa", "--confirm-retention-support", "--confirm-retention-pipeline"]);
  expect(missingBoardLoopConfirmation.status).toBe(1);
  expect(missingBoardLoopConfirmation.stderr).toContain("--confirm-retention-board-loop");

  const missingPaperclipConfirmation = run(["--apply", "--confirm-retention-records", "--confirm-retention-learning", "--confirm-retention-sources", "--confirm-retention-notebooks", "--confirm-retention-research", "--confirm-retention-runtime", "--confirm-retention-room", "--confirm-retention-visual-qa", "--confirm-retention-support", "--confirm-retention-pipeline", "--confirm-retention-board-loop"]);
  expect(missingPaperclipConfirmation.status).toBe(1);
  expect(missingPaperclipConfirmation.stderr).toContain("--confirm-retention-paperclip");

  const missingHermesConfirmation = run(["--apply", "--confirm-retention-records", "--confirm-retention-learning", "--confirm-retention-sources", "--confirm-retention-notebooks", "--confirm-retention-research", "--confirm-retention-runtime", "--confirm-retention-room", "--confirm-retention-visual-qa", "--confirm-retention-support", "--confirm-retention-pipeline", "--confirm-retention-board-loop", "--confirm-retention-paperclip"]);
  expect(missingHermesConfirmation.status).toBe(1);
  expect(missingHermesConfirmation.stderr).toContain("--confirm-retention-hermes");

  const missingRufloConfirmation = run(["--apply", "--confirm-retention-records", "--confirm-retention-learning", "--confirm-retention-sources", "--confirm-retention-notebooks", "--confirm-retention-research", "--confirm-retention-runtime", "--confirm-retention-room", "--confirm-retention-visual-qa", "--confirm-retention-support", "--confirm-retention-pipeline", "--confirm-retention-board-loop", "--confirm-retention-paperclip", "--confirm-retention-hermes"]);
  expect(missingRufloConfirmation.status).toBe(1);
  expect(missingRufloConfirmation.stderr).toContain("--confirm-retention-ruflo");

  const confirmationsWithoutAuditBudget = ["--confirm-retention-records", "--confirm-retention-learning", "--confirm-retention-sources", "--confirm-retention-notebooks", "--confirm-retention-research", "--confirm-retention-runtime", "--confirm-retention-room", "--confirm-retention-visual-qa", "--confirm-retention-support", "--confirm-retention-pipeline", "--confirm-retention-board-loop", "--confirm-retention-paperclip", "--confirm-retention-hermes", "--confirm-retention-ruflo", "--confirm-retention-onboarding-tokens", "--confirm-retention-rate-limits"];
  const missingAuditBudgetConfirmation = run(["--apply", ...confirmationsWithoutAuditBudget]);
  expect(missingAuditBudgetConfirmation.status).toBe(1);
  expect(missingAuditBudgetConfirmation.stderr).toContain("--confirm-retention-audit-budget");

  const missingJobConfirmation = run(["--apply", ...confirmationsWithoutAuditBudget, "--confirm-retention-audit-budget"]);
  expect(missingJobConfirmation.status).toBe(1);
  expect(missingJobConfirmation.stderr).toContain("--confirm-retention-jobs");
  expect(missingJobConfirmation.stdout).toBe("");

  const withoutCredit = ["--apply", ...confirmationsWithoutAuditBudget, "--confirm-retention-audit-budget", "--confirm-retention-jobs"];
  const missingCreditConfirmation = run(withoutCredit);
  expect(missingCreditConfirmation.status).toBe(1);
  expect(missingCreditConfirmation.stderr).toContain("--confirm-retention-credit");
  expect(missingCreditConfirmation.stdout).toBe("");
  const confirmed = [...withoutCredit, "--confirm-retention-credit"];

  const failedRpc = run(confirmed, { RETENTION_MOCK_RPC_FAIL: "1" });
  expect(failedRpc.status).toBe(1);
  expect(failedRpc.stderr).toContain("Client record retention failed (404)");
  expect(failedRpc.stdout).not.toContain("MOCK_LEARNING_RETENTION_DELETE");

  const failedTokenRpc = run(confirmed, { RETENTION_MOCK_ONBOARDING_TOKEN_RPC_FAIL: "1" });
  expect(failedTokenRpc.status).toBe(1);
  expect(failedTokenRpc.stderr).toContain("Onboarding token retention failed (404)");
  expect(failedTokenRpc.stdout).not.toContain("MOCK_RECORD_RETENTION");

  const failedRateLimitRpc = run(confirmed, { RETENTION_MOCK_RATE_LIMIT_RPC_FAIL: "1" });
  expect(failedRateLimitRpc.status).toBe(1);
  expect(failedRateLimitRpc.stderr).toContain("Runtime rate-limit retention failed (404)");
  expect(failedRateLimitRpc.stdout).not.toContain("MOCK_RECORD_RETENTION");

  const failedSourceRpc = run(confirmed, { RETENTION_MOCK_SOURCE_RPC_FAIL: "1" });
  expect(failedSourceRpc.status).toBe(1);
  expect(failedSourceRpc.stderr).toContain("Notebook source retention failed (404)");
  expect(failedSourceRpc.stdout).not.toContain("MOCK_LEARNING_RETENTION_DELETE");

  const failedResearchRpc = run(confirmed, { RETENTION_MOCK_RESEARCH_RPC_FAIL: "1" });
  expect(failedResearchRpc.status).toBe(1);
  expect(failedResearchRpc.stderr).toContain("Research retention failed (404)");
  expect(failedResearchRpc.stdout).not.toContain("MOCK_LEARNING_RETENTION_DELETE");

  const failedNotebookRpc = run(confirmed, { RETENTION_MOCK_NOTEBOOK_RPC_FAIL: "1" });
  expect(failedNotebookRpc.status).toBe(1);
  expect(failedNotebookRpc.stderr).toContain("Notebook retention failed (404)");
  expect(failedNotebookRpc.stdout).not.toContain("MOCK_LEARNING_RETENTION_DELETE");

  const failedRuntimeRpc = run(confirmed, { RETENTION_MOCK_RUNTIME_RPC_FAIL: "1" });
  expect(failedRuntimeRpc.status).toBe(1);
  expect(failedRuntimeRpc.stderr).toContain("Runtime request retention failed (404)");
  expect(failedRuntimeRpc.stdout).not.toContain("MOCK_LEARNING_RETENTION_DELETE");

  const failedRoomRpc = run(confirmed, { RETENTION_MOCK_ROOM_RPC_FAIL: "1" });
  expect(failedRoomRpc.status).toBe(1);
  expect(failedRoomRpc.stderr).toContain("Agent Room retention failed (404)");
  expect(failedRoomRpc.stdout).not.toContain("MOCK_LEARNING_RETENTION_DELETE");

  const failedVisualQaRpc = run(confirmed, { RETENTION_MOCK_VISUAL_QA_RPC_FAIL: "1" });
  expect(failedVisualQaRpc.status).toBe(1);
  expect(failedVisualQaRpc.stderr).toContain("Visual QA retention failed (404)");
  expect(failedVisualQaRpc.stdout).not.toContain("MOCK_LEARNING_RETENTION_DELETE");

  const failedSupportRpc = run(confirmed, { RETENTION_MOCK_SUPPORT_RPC_FAIL: "1" });
  expect(failedSupportRpc.status).toBe(1);
  expect(failedSupportRpc.stderr).toContain("Tenant support retention failed (404)");
  expect(failedSupportRpc.stdout).not.toContain("MOCK_LEARNING_RETENTION_DELETE");

  const failedPipelineRpc = run(confirmed, { RETENTION_MOCK_PIPELINE_RPC_FAIL: "1" });
  expect(failedPipelineRpc.status).toBe(1);
  expect(failedPipelineRpc.stderr).toContain("Pipeline retention failed (404)");
  expect(failedPipelineRpc.stdout).not.toContain("MOCK_LEARNING_RETENTION_DELETE");

  const failedBoardLoopRpc = run(confirmed, { RETENTION_MOCK_BOARD_LOOP_RPC_FAIL: "1" });
  expect(failedBoardLoopRpc.status).toBe(1);
  expect(failedBoardLoopRpc.stderr).toContain("Board and Loop retention failed (404)");
  expect(failedBoardLoopRpc.stdout).not.toContain("MOCK_LEARNING_RETENTION_DELETE");

  const failedPaperclipRpc = run(confirmed, { RETENTION_MOCK_PAPERCLIP_RPC_FAIL: "1" });
  expect(failedPaperclipRpc.status).toBe(1);
  expect(failedPaperclipRpc.stderr).toContain("Paperclip retention failed (404)");
  expect(failedPaperclipRpc.stdout).not.toContain("MOCK_LEARNING_RETENTION_DELETE");

  const failedHermesRpc = run(confirmed, { RETENTION_MOCK_HERMES_RPC_FAIL: "1" });
  expect(failedHermesRpc.status).toBe(1);
  expect(failedHermesRpc.stderr).toContain("Hermes Content Factory retention failed (404)");
  expect(failedHermesRpc.stdout).not.toContain("MOCK_LEARNING_RETENTION_DELETE");

  const failedRufloRpc = run(confirmed, { RETENTION_MOCK_RUFLO_RPC_FAIL: "1" });
  expect(failedRufloRpc.status).toBe(1);
  expect(failedRufloRpc.stderr).toContain("Ruflo retention failed (404)");
  expect(failedRufloRpc.stdout).not.toContain("MOCK_LEARNING_RETENTION_DELETE");

  const failedAuditBudgetRpc = run(confirmed, { RETENTION_MOCK_AUDIT_BUDGET_RPC_FAIL: "1" });
  expect(failedAuditBudgetRpc.status).toBe(1);
  expect(failedAuditBudgetRpc.stderr).toContain("Audit and budget retention failed (404)");

  const failedJobRpc = run(confirmed, { RETENTION_MOCK_JOB_RPC_FAIL: "1" });
  expect(failedJobRpc.status).toBe(1);
  expect(failedJobRpc.stderr).toContain("Runtime job retention failed (404)");
  expect(failedJobRpc.stdout).not.toContain("MOCK_AUDIT_BUDGET_RETENTION");
  expect(failedJobRpc.stdout).not.toContain("MOCK_CREDIT_RETENTION");

  const failedCreditRpc = run(confirmed, { RETENTION_MOCK_CREDIT_RPC_FAIL: "1" });
  expect(failedCreditRpc.status).toBe(1);
  expect(failedCreditRpc.stderr).toContain("Managed-credit retention failed (404)");
  expect(failedCreditRpc.stdout).toContain("MOCK_JOB_RETENTION:true");
  expect(failedCreditRpc.stdout).not.toContain("MOCK_AUDIT_BUDGET_RETENTION");

  const missingReferenceGuard = run(confirmed, { RETENTION_MOCK_REFERENCE_GUARD_FAIL: "1" });
  expect(missingReferenceGuard.status).toBe(1);
  expect(missingReferenceGuard.stderr).toContain("Learning retention reference guard is not applied");
  expect(missingReferenceGuard.stdout).not.toContain("MOCK_RECORD_RETENTION");

  const invalidIds = run(confirmed, { RETENTION_MOCK_BAD_IDS: "1" });
  expect(invalidIds.status).toBe(1);
  expect(invalidIds.stderr).toContain("Learning retention selection returned invalid IDs");
  expect(invalidIds.stdout).not.toContain("MOCK_RECORD_RETENTION");
  expect(invalidIds.stdout).not.toContain("MOCK_LEARNING_RETENTION_DELETE");

  const mismatchedDelete = run(confirmed, { RETENTION_MOCK_DELETE_MISMATCH: "1" });
  expect(mismatchedDelete.status).toBe(1);
  expect(mismatchedDelete.stderr).toContain("Learning retention delete did not match the reviewed batch");

  const applied = run(confirmed);
  expect(applied.status).toBe(0);
  expect(applied.stdout).toContain("MOCK_RECORD_RETENTION:true");
  expect(applied.stdout).toContain("MOCK_SOURCE_RETENTION:true");
  expect(applied.stdout).toContain("MOCK_RUNTIME_REQUEST_RETENTION:true");
  expect(applied.stdout).toContain("MOCK_ROOM_RETENTION:true");
  expect(applied.stdout).toContain("MOCK_VISUAL_QA_RETENTION:true");
  expect(applied.stdout).toContain("MOCK_SUPPORT_RETENTION:true");
  expect(applied.stdout).toContain("MOCK_BOARD_LOOP_RETENTION:true");
  expect(applied.stdout).toContain("MOCK_PAPERCLIP_RETENTION:true");
  expect(applied.stdout).toContain("MOCK_HERMES_RETENTION:true");
  expect(applied.stdout).toContain("MOCK_RUFLO_RETENTION:true");
  expect(applied.stdout).toContain("MOCK_JOB_RETENTION:true");
  expect(applied.stdout).toContain("MOCK_CREDIT_RETENTION:true");
  expect(applied.stdout.indexOf("MOCK_CREDIT_RETENTION:true")).toBeGreaterThan(applied.stdout.indexOf("MOCK_JOB_RETENTION:true"));
  expect(applied.stdout.indexOf("MOCK_AUDIT_BUDGET_RETENTION:true")).toBeGreaterThan(applied.stdout.indexOf("MOCK_CREDIT_RETENTION:true"));
  expect(applied.stdout.indexOf("MOCK_JOB_RETENTION:true")).toBeGreaterThan(applied.stdout.indexOf("MOCK_ROOM_RETENTION:true"));
  expect(applied.stdout.indexOf("MOCK_JOB_RETENTION:true")).toBeGreaterThan(applied.stdout.indexOf("MOCK_LEARNING_RETENTION_DELETE"));
  expect(JSON.parse(applied.stdout.trim().split("\n").at(-1) || "{}")).toMatchObject({
    runtimeJobs: { candidates: 2, deleted: 2, remainingCandidates: 0, applied: true },
    creditRetention: { deleted: { transactions: 2 }, remainingCandidates: { transactions: 0 },
      preservedNonzeroWalletBalances: 1, preservedNonzeroProviderBalances: 1, purgeAfterDays: 35, applied: true },
  });
  expect(applied.stdout).toContain("MOCK_AUDIT_BUDGET_RETENTION:true");
  expect(applied.stdout).toContain("MOCK_LEARNING_RETENTION_DELETE");
});
