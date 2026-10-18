import { expect, test } from "@playwright/test";
import { chmodSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { notifyLead } from "../product-experience/src/lib/leadNotification";
import { workingTreeFingerprintSha256 } from "../scripts/lib/working-tree-fingerprint.mjs";
import { buildNotebookJourneyReceipt, NOTEBOOK_JOURNEY_SCENARIOS } from "../scripts/lib/notebook-journey-evidence.mjs";

test("release verifier records the current revision without secrets", () => {
  const script = resolve(process.cwd(), "scripts/verify-production-readiness.mjs");
  const result = spawnSync(process.execPath, [script, "--allow-dirty", "--test-result", "typecheck=passed"], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, VELOCE_RELEASE_LEDGER_BUCKET: "" } });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('"releaseReady": false');
  expect(result.stdout).toContain("release_gate:ledger_bucket_not_configured");
  const report = JSON.parse(result.stdout);
  expect(report.notEvaluated).toContain("customer_journey_evidence");
  expect(report.notEvaluated).toContain("notebook_execution_journey_local_evidence");
  expect(report.notEvaluated).toContain("client_cloud_config_evidence");
  expect(report.notEvaluated).toContain("source_guard_schema_evidence");
  expect(report.notEvaluated).toContain("buyer_pilot_evidence");
  expect(report.notEvaluated).toContain("buyer_pilot_cost_evidence");
  expect(report.notEvaluated).toContain("board_loop_retention_migration_attached");
  expect(report.notEvaluated).toContain("sourceImportResult_approved");
  expect(report.notEvaluated).toContain("tenantIsolationResult_approved");
  expect(report.notEvaluated).toContain("buyerSimulationResult_approved");
  expect(report.notEvaluated).toContain("legalApproval_approved");
  expect(result.stdout).not.toContain("veloce-agenticos-2026-veloce-release-ledger");
  expect(result.stdout).not.toMatch(/sk-[A-Za-z0-9_-]{16,}|service_role|api[_ -]?key\s*[:=]/i);
});

for (const workingTreeClean of [true, false]) {
test(`inspection reports candidate-bound local checks for a ${workingTreeClean ? "clean" : "dirty"} checkout without granting release approval`, () => {
  const dir = mkdtempSync(join(tmpdir(), "veloce-local-candidate-checks-"));
  try {
    // The verifier resolves its root from its own location, so isolate both source and Git state.
    const root = join(dir, "source");
    mkdirSync(root);
    cpSync(resolve("scripts/lib"), join(root, "scripts/lib"), { recursive: true });
    for (const file of ["scripts/verify-production-readiness.mjs", "src/lib/clientRuntimeConfigDigest.mjs",
      "src/lib/clientStorageRetentionClock.mjs", "package.json", "playwright.unit.config.ts",
      "evaluations/ai-release-local-v1.json", "node_modules/playwright/package.json"]) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      copyFileSync(resolve(file), join(root, file));
    }
    writeFileSync(join(root, ".gitignore"), "node_modules/\n");
    const git = (args: string[]) => {
      const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      return result.stdout.trim();
    };
    git(["init", "--quiet"]);
    git(["add", "--", "."]);
    git(["-c", "user.name=Readiness Fixture", "-c", "user.email=fixture@example.invalid",
      "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "Fixture baseline"]);
    if (!workingTreeClean) writeFileSync(join(root, "candidate-change.txt"), "Uncommitted fixture change\n");
    expect(git(["status", "--porcelain"]) === "").toBe(workingTreeClean);
    const aiFile = join(dir, "ai.json");
    const notebookFile = join(dir, "notebook.json");
    const fixture = readFileSync(resolve(process.cwd(), "evaluations/ai-release-local-v1.json"));
    const fixtureCases = JSON.parse(fixture.toString("utf8")).cases;
    const sourceCommit = git(["rev-parse", "HEAD"]);
    const candidateFingerprint = workingTreeFingerprintSha256(root);
    const checkedAt = new Date().toISOString();
    writeFileSync(aiFile, JSON.stringify({
      schemaVersion: 2, suite: "ai-release-local-v1", mode: "deterministic-local", localGatePassed: true, productionReady: false,
      startedAt: checkedAt, checkedAt, runnerStatus: "passed", failures: [],
      workingTreeClean, workingTreeCleanAfter: workingTreeClean, nodeEngineSupported: true, nodeVersion: process.version,
      runnerExitCode: 0, sourceCommit, sourceCommitAfter: sourceCommit,
      candidateFingerprintSchema: "agentos-working-tree-v1", candidateFingerprintSha256: candidateFingerprint,
      candidateFingerprintAfterSha256: candidateFingerprint,
      unitConfigSha256: createHash("sha256").update(readFileSync("playwright.unit.config.ts")).digest("hex"),
      playwrightVersion: JSON.parse(readFileSync("node_modules/playwright/package.json", "utf8")).version,
      playwrightVersionAfter: JSON.parse(readFileSync("node_modules/playwright/package.json", "utf8")).version,
      runnerConfiguration: { workers: 1, retries: 0, reporter: "json", timeoutMs: 600000, environment: "allowlisted-offline-v1" },
      fixtureSha256: createHash("sha256").update(fixture).digest("hex"),
      metrics: { cases: fixtureCases.length, passed: fixtureCases.length, failed: 0, modelSamples: 0 },
      cases: fixtureCases.map(({ id, spec, title }: { id: string; spec: string; title: string }) => ({ id, spec, title, status: "passed" })),
    }));
    writeFileSync(notebookFile, JSON.stringify(buildNotebookJourneyReceipt({
      sourceCommit,
      candidateFingerprint,
      sourceCommitAfter: sourceCommit, candidateFingerprintAfter: candidateFingerprint, runnerStatus: "passed",
      runtime: { browserName: "chromium", browserVersion: "150.0.0.1", playwrightVersion: "1.62.1", nodeVersion: "v24.18.0", platform: "darwin", arch: "arm64" },
      checkedAt,
      testPort: 3941,
      scenarios: NOTEBOOK_JOURNEY_SCENARIOS.map((id) => ({ id, status: "passed", durationMs: 1 })),
    })));

    const result = spawnSync(process.execPath, [
      join(root, "scripts/verify-production-readiness.mjs"), "--allow-dirty",
      "--ai-evaluation-report", aiFile, "--notebook-journey-receipt", notebookFile,
    ], {
      cwd: root, encoding: "utf8",
      env: { ...process.env, VELOCE_RELEASE_LEDGER_BUCKET: "" },
    });
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.localCandidateChecks).toMatchObject({
      candidateFingerprintSha256: candidateFingerprint,
      workingTreeClean,
      aiEvaluation: { status: workingTreeClean ? "passed_candidate_bound" : "passed_candidate_bound_dirty_tree", productionReady: false, modelSamples: 0 },
      notebookExecutionJourney: { status: "passed_candidate_bound", scenarios: NOTEBOOK_JOURNEY_SCENARIOS.length },
    });
    expect(report.releaseReady).toBe(false);
    expect(report.notEvaluated).toContain("ai_evaluation_local_evidence");
    expect(report.notEvaluated).toContain("notebook_execution_journey_local_evidence");
    expect(workingTreeFingerprintSha256(root)).toBe(candidateFingerprint);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
}

test("release ledger lookup distinguishes an absent record from an unavailable check", () => {
  const dir = mkdtempSync(join(tmpdir(), "veloce-ledger-lookup-"));
  const bin = join(dir, "bin");
  const fakeGcloud = join(bin, "gcloud");
  const script = resolve(process.cwd(), "scripts/verify-production-readiness.mjs");
  mkdirSync(bin);
  const inspect = (response: string) => {
    writeFileSync(fakeGcloud, `#!/bin/sh\n${response}\n`);
    chmodSync(fakeGcloud, 0o700);
    const result = spawnSync(process.execPath, [script, "--allow-dirty"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        VELOCE_RELEASE_LEDGER_BUCKET: "agentos-release-ledger-test",
      },
    });
    expect(result.status).toBe(0);
    return JSON.parse(result.stdout);
  };
  try {
    const unavailable = inspect('echo "Unable to initialize credentials database" >&2\nexit 1');
    expect(unavailable.failures).toContain("release_gate:release_ledger_lookup_unavailable");
    expect(unavailable.failures).not.toContain("release_gate:release_ledger_record_missing");

    const missing = inspect('echo "CommandException: One or more URLs matched no objects." >&2\nexit 1');
    expect(missing.failures).toContain("release_gate:release_ledger_record_missing");
    expect(missing.failures).not.toContain("release_gate:release_ledger_lookup_unavailable");

    const invalid = inspect('if [ "$2" = "ls" ]; then echo "gs://agentos-release-ledger-test/releases/test/record.json"; else echo "not-json"; fi');
    expect(invalid.failures).toContain("release_gate:release_ledger_record_invalid");
    expect(invalid.failures).not.toContain("release_gate:release_ledger_record_missing");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("strict release acceptance does not trust an unpublished local ledger file", () => {
  const dir = mkdtempSync(join(tmpdir(), "veloce-unpublished-ledger-"));
  try {
    const file = join(dir, "record.json");
    writeFileSync(file, "{}\n");
    const result = spawnSync(process.execPath, ["scripts/verify-production-readiness.mjs", "--strict", "--allow-dirty", "--ledger-record-file", file], {
      cwd: process.cwd(), encoding: "utf8", env: { ...process.env, VELOCE_RELEASE_LEDGER_BUCKET: "" },
    });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).failures).toContain("Strict release evidence missing or failed: published_ledger_required");
    const inspection = spawnSync(process.execPath, ["scripts/verify-production-readiness.mjs", "--allow-dirty", "--ledger-record-file", file], {
      cwd: process.cwd(), encoding: "utf8", env: { ...process.env, VELOCE_RELEASE_LEDGER_BUCKET: "" },
    });
    expect(inspection.status).toBe(0);
    expect(JSON.parse(inspection.stdout)).toMatchObject({ releaseReady: false });
    expect(JSON.parse(inspection.stdout).failures).toContain("release_gate:published_ledger_required");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("release evidence requires setup, financial, retention, source, artifact, review, and table-privilege migrations", () => {
  const dir = mkdtempSync(join(tmpdir(), "veloce-incomplete-ledger-"));
  try {
    const file = join(dir, "record.json");
    const verifyFile = "product-experience/supabase-v45-onboarding-verify-token.sql";
    const verifyHash = createHash("sha256").update(readFileSync(resolve(process.cwd(), verifyFile), "utf8")).digest("hex");
    const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }).stdout.trim();
    writeFileSync(file, JSON.stringify({
      schemaVersion: 2,
      source: { commit },
      migration: { applied: [{ file: verifyFile, sha256: verifyHash }] },
      tests: { focused: "passed" },
      deployment: { environment: "staging", vercelDeployment: "test-deploy", cloudRunRevision: "test-revision", imageDigest: `sha256:${"a".repeat(64)}` },
      rollbackTarget: { cloudRunRevision: "prior-revision" },
    }));
    const result = spawnSync(process.execPath, ["scripts/verify-production-readiness.mjs", "--allow-dirty", "--ledger-record-file", file], {
      cwd: process.cwd(), encoding: "utf8", env: { ...process.env, VELOCE_RELEASE_LEDGER_BUCKET: "" },
    });
    expect(result.status).toBe(0);
    const failures = JSON.parse(result.stdout).failures as string[];
    expect(JSON.parse(result.stdout).notEvaluated).toEqual([]);
    expect(failures).toContain("release_gate:setup_migration_attached");
    expect(failures).toContain("release_gate:financial_offboard_guard_migration_attached");
    expect(failures).toContain("release_gate:learning_retention_reference_migration_attached");
    expect(failures).toContain("release_gate:source_graph_migration_attached");
    expect(failures).toContain("release_gate:source_rpc_guard_migration_attached");
    expect(failures).toContain("release_gate:source_published_date_migration_attached");
    expect(failures).toContain("release_gate:record_retention_migration_attached");
    expect(failures).toContain("release_gate:onboarding_token_retention_migration_attached");
    expect(failures).toContain("release_gate:runtime_rate_limit_retention_migration_attached");
    expect(failures).toContain("release_gate:research_retention_migration_attached");
    expect(failures).toContain("release_gate:notebook_retention_migration_attached");
    expect(failures).toContain("release_gate:runtime_request_retention_migration_attached");
    expect(failures).toContain("release_gate:runtime_job_retention_migration_attached");
    expect(failures).toContain("release_gate:room_retention_migration_attached");
    expect(failures).toContain("release_gate:room_fixed_retention_migration_attached");
    expect(failures).toContain("release_gate:room_directive_review_migration_attached");
    expect(failures).toContain("release_gate:table_privilege_hardening_migration_attached");
    expect(failures).toContain("release_gate:visual_qa_retention_migration_attached");
    expect(failures).toContain("release_gate:support_retention_migration_attached");
    expect(failures).toContain("release_gate:board_loop_retention_migration_attached");
    expect(failures).toContain("release_gate:artifact_owner_guard_migration_attached");
    expect(failures).toContain("release_gate:notebook_artifact_review_migration_attached");
    expect(failures).toContain("release_gate:notebook_reference_guard_migration_attached");
    expect(failures).toContain("release_gate:notebook_execution_sources_migration_attached");
    expect(failures).toContain("release_gate:sourceImportResult_approved");
    expect(failures).toContain("release_gate:uiParityResult_approved");
    expect(failures).toContain("release_gate:buyerSimulationResult_approved");
    expect(failures).toContain("release_gate:aiEngineeringResult_approved");
    expect(failures).toContain("release_gate:ai_evaluation_local_evidence");
    expect(failures).toContain("release_gate:buyer_pilot_evidence");
    expect(failures).toContain("release_gate:buyer_pilot_cost_evidence");
    expect(failures).toContain("release_gate:customer_journey_evidence");
    expect(failures).toContain("release_gate:client_cloud_config_evidence");
    expect(failures).toContain("release_gate:source_guard_schema_evidence");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("customer journey approval requires fifteen current-deployment receipts", () => {
  const dir = mkdtempSync(join(tmpdir(), "veloce-journey-ledger-"));
  try {
    const file = join(dir, "record.json");
    const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }).stdout.trim();
    const deployment = {
      environment: "staging", vercelDeployment: "reviewed-vercel-deployment",
      cloudRunRevision: "reviewed-cloud-run-revision", imageDigest: `sha256:${"a".repeat(64)}`,
      publicJourneyResult: "passed",
    };
    const evidenceFiles = readdirSync(resolve(process.cwd(), "docs/evidence")).filter((name) => name.endsWith(".json")).sort().slice(0, 15);
    expect(evidenceFiles).toHaveLength(15);
    const report = {
      schemaVersion: 1, sourceCommit: commit, ...deployment, checkedAt: "2026-10-03T20:00:00Z",
      cases: Array.from({ length: 15 }, (_, index) => ({
        id: `J${String(index + 1).padStart(2, "0")}`, status: "passed",
        evidence: [{
          kind: "artifact",
          ref: `docs/evidence/${evidenceFiles[index]}`,
          sha256: createHash("sha256").update(readFileSync(resolve(process.cwd(), "docs/evidence", evidenceFiles[index]))).digest("hex"),
        }],
      })),
    };
    const inspect = (customerJourneyReport: unknown) => {
      writeFileSync(file, JSON.stringify({ schemaVersion: 2, source: { commit }, deployment, customerJourneyReport }));
      const result = spawnSync(process.execPath, ["scripts/verify-production-readiness.mjs", "--allow-dirty", "--ledger-record-file", file], {
        cwd: process.cwd(), encoding: "utf8", env: { ...process.env, VELOCE_RELEASE_LEDGER_BUCKET: "" },
      });
      expect(result.status).toBe(0);
      return JSON.parse(result.stdout).failures as string[];
    };
    expect(inspect(null)).toContain("release_gate:customer_journey_evidence");
    expect(inspect({ ...report, sourceCommit: "0".repeat(40) })).toContain("release_gate:customer_journey_evidence");
    expect(inspect({ ...report, cloudRunRevision: "other-revision" })).toContain("release_gate:customer_journey_evidence");
    expect(inspect({ ...report, cases: report.cases.slice(1) })).toContain("release_gate:customer_journey_evidence");
    expect(inspect({ ...report, cases: [report.cases[0], ...report.cases.slice(0, 14)] })).toContain("release_gate:customer_journey_evidence");
    expect(inspect({ ...report, checkedAt: "yesterday" })).toContain("release_gate:customer_journey_evidence");
    expect(inspect({ ...report, cases: [{ ...report.cases[0], evidence: [] }, ...report.cases.slice(1)] })).toContain("release_gate:customer_journey_evidence");
    expect(inspect({ ...report, cases: [{ ...report.cases[0], evidence: [{ ...report.cases[0].evidence[0], sha256: "0".repeat(64) }] }, ...report.cases.slice(1)] })).toContain("release_gate:customer_journey_evidence");
    expect(inspect({ ...report, cases: [{ ...report.cases[0], evidence: [{ ref: "docs/evidence/missing-receipt.json", sha256: "0".repeat(64) }] }, ...report.cases.slice(1)] })).toContain("release_gate:customer_journey_evidence");
    const missingPrivateReceipt = { ...report, cases: [{ ...report.cases[0], evidence: [{ ref: "gs://reviewed-evidence/missing.json", sha256: "0".repeat(64) }] }, ...report.cases.slice(1)] };
    writeFileSync(file, JSON.stringify({ schemaVersion: 2, source: { commit }, deployment, customerJourneyReport: missingPrivateReceipt }));
    const offline = spawnSync(process.execPath, ["scripts/verify-production-readiness.mjs", "--allow-dirty", "--ledger-record-file", file], {
      cwd: process.cwd(), encoding: "utf8", env: { ...process.env, PATH: "/usr/bin:/bin", VELOCE_RELEASE_LEDGER_BUCKET: "" },
    });
    expect(JSON.parse(offline.stdout).failures).toContain("release_gate:customer_journey_evidence");
    expect(inspect(report)).toContain("release_gate:customer_journey_evidence");

    const reportFile = join(dir, "journey.json");
    writeFileSync(reportFile, JSON.stringify(report));
    const publish = spawnSync(process.execPath, [
      "scripts/verify-production-readiness.mjs", "--publish-ledger", "--allow-dirty",
      "--environment", deployment.environment, "--vercel-deployment", deployment.vercelDeployment,
      "--cloud-run-revision", deployment.cloudRunRevision, "--image-digest", deployment.imageDigest,
      "--public-journey-result", "passed", "--customer-journey-report", reportFile,
    ], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, VELOCE_RELEASE_LEDGER_BUCKET: "" } });
    expect(publish.status).toBe(1);
    expect(JSON.parse(publish.stdout).failures).toContain("release_gate:customer_journey_evidence");
    expect(JSON.parse(publish.stdout).failures).toContain("release_gate:ledger_bucket_not_configured");
    expect(JSON.parse(publish.stdout).failures).toContain("release_gate:source_guard_schema_evidence");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("local Notebook journey receipt is candidate-bound and never substitutes for the full customer journey", () => {
  const dir = mkdtempSync(join(tmpdir(), "veloce-notebook-journey-ledger-"));
  try {
    const file = join(dir, "record.json");
    const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }).stdout.trim();
    const receipt = buildNotebookJourneyReceipt({
      sourceCommit: commit,
      candidateFingerprint: workingTreeFingerprintSha256(process.cwd()),
      sourceCommitAfter: commit, candidateFingerprintAfter: workingTreeFingerprintSha256(process.cwd()), runnerStatus: "passed",
      runtime: { browserName: "chromium", browserVersion: "150.0.0.1", playwrightVersion: "1.62.1", nodeVersion: "v24.18.0", platform: "darwin", arch: "arm64" },
      startedAt: "2026-10-16T00:00:00.000Z",
      checkedAt: "2026-10-16T00:01:00.000Z",
      scenarios: NOTEBOOK_JOURNEY_SCENARIOS.map((id) => ({ id, status: "passed", durationMs: 10 })),
    });
    const inspect = (notebookExecutionJourney: unknown) => {
      writeFileSync(file, JSON.stringify({ schemaVersion: 2, source: { commit }, notebookExecutionJourney }));
      const result = spawnSync(process.execPath, ["scripts/verify-production-readiness.mjs", "--allow-dirty", "--ledger-record-file", file], {
        cwd: process.cwd(), encoding: "utf8", env: { ...process.env, VELOCE_RELEASE_LEDGER_BUCKET: "" },
      });
      expect(result.status, result.stderr).toBe(0);
      return JSON.parse(result.stdout).failures as string[];
    };
    const validFailures = inspect(receipt);
    expect(validFailures).not.toContain("release_gate:notebook_execution_journey_local_evidence");
    expect(validFailures).toContain("release_gate:customer_journey_evidence");
    expect(inspect(null)).toContain("release_gate:notebook_execution_journey_local_evidence");
    expect(inspect({ ...receipt, candidateFingerprintSha256: "c".repeat(64) }))
      .toContain("release_gate:notebook_execution_journey_local_evidence");
    expect(inspect({ ...receipt, testConfigFingerprintSha256: "d".repeat(64) }))
      .toContain("release_gate:notebook_execution_journey_local_evidence");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("AI approval cannot substitute for a matching local evaluation receipt", () => {
  const dir = mkdtempSync(join(tmpdir(), "veloce-ai-ledger-"));
  try {
    const file = join(dir, "record.json");
    const fixture = readFileSync(resolve(process.cwd(), "evaluations/ai-release-local-v1.json"));
    const cases = JSON.parse(fixture.toString("utf8")).cases;
    const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }).stdout.trim();
    const fingerprint = workingTreeFingerprintSha256(process.cwd());
    const checkedAt = new Date().toISOString();
    const receipt = {
      schemaVersion: 2, suite: "ai-release-local-v1", mode: "deterministic-local", localGatePassed: true, productionReady: false,
      startedAt: checkedAt, checkedAt, runnerStatus: "passed", failures: [],
      workingTreeClean: true, workingTreeCleanAfter: true, nodeEngineSupported: true, nodeVersion: process.version,
      runnerExitCode: 0, sourceCommit: commit, sourceCommitAfter: commit,
      candidateFingerprintSchema: "agentos-working-tree-v1", candidateFingerprintSha256: workingTreeFingerprintSha256(process.cwd()),
      candidateFingerprintAfterSha256: fingerprint,
      unitConfigSha256: createHash("sha256").update(readFileSync("playwright.unit.config.ts")).digest("hex"),
      playwrightVersion: JSON.parse(readFileSync("node_modules/playwright/package.json", "utf8")).version,
      playwrightVersionAfter: JSON.parse(readFileSync("node_modules/playwright/package.json", "utf8")).version,
      runnerConfiguration: { workers: 1, retries: 0, reporter: "json", timeoutMs: 600000, environment: "allowlisted-offline-v1" },
      fixtureSha256: createHash("sha256").update(fixture).digest("hex"),
      metrics: { cases: cases.length, passed: cases.length, failed: 0, modelSamples: 0 },
      cases: cases.map(({ id, spec, title }: { id: string; spec: string; title: string }) => ({ id, spec, title, status: "passed" })),
    };
    const base = { schemaVersion: 2, source: { commit }, deployment: { environment: "staging", aiEngineeringResult: "passed" } };
    const inspect = (aiEvaluationLocal: unknown) => {
      writeFileSync(file, JSON.stringify({ ...base, aiEvaluationLocal }));
      const result = spawnSync(process.execPath, ["scripts/verify-production-readiness.mjs", "--allow-dirty", "--ledger-record-file", file], {
        cwd: process.cwd(), encoding: "utf8", env: { ...process.env, VELOCE_RELEASE_LEDGER_BUCKET: "" },
      });
      expect(result.status, result.stderr).toBe(0);
      return JSON.parse(result.stdout).failures as string[];
    };
    expect(inspect({ ...receipt, sourceCommit: "0".repeat(40) })).toContain("release_gate:ai_evaluation_local_evidence");
    expect(inspect({ ...receipt, workingTreeClean: false })).toContain("release_gate:ai_evaluation_local_evidence");
    expect(inspect({ ...receipt, candidateFingerprintSha256: "c".repeat(64) })).toContain("release_gate:ai_evaluation_local_evidence");
    for (const altered of [
      { ...receipt, schemaVersion: 1 },
      { ...receipt, sourceCommitAfter: "0".repeat(40) },
      { ...receipt, candidateFingerprintAfterSha256: "c".repeat(64) },
      { ...receipt, workingTreeCleanAfter: false },
      { ...receipt, unitConfigSha256: "d".repeat(64) },
      { ...receipt, playwrightVersionAfter: "0.0.0" },
      { ...receipt, startedAt: "2099-01-01T00:00:00.000Z" },
      { ...receipt, startedAt: undefined },
      { ...receipt, runnerStatus: "incomplete" },
      { ...receipt, failures: ["candidate_changed_during_run"] },
      { ...receipt, runnerConfiguration: { ...receipt.runnerConfiguration, retries: 1 } },
      { ...receipt, cases: [...receipt.cases, receipt.cases[0]] },
    ]) expect(inspect(altered)).toContain("release_gate:ai_evaluation_local_evidence");
    expect(inspect(receipt)).not.toContain("release_gate:ai_evaluation_local_evidence");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("production readiness source keeps live gates explicit", () => {
  const verifier = readFileSync(resolve(process.cwd(), "scripts/verify-production-readiness.mjs"), "utf8");
  const runbook = readFileSync(resolve(process.cwd(), "docs/public-launch-runbook.md"), "utf8");
  const checklist = readFileSync(resolve(process.cwd(), "docs/production-release-acceptance-checklist.md"), "utf8");
  const supportRoute = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/support/route.ts"), "utf8");
  const stripeDisposition = readFileSync(resolve(process.cwd(), "product-experience/supabase-v44-stripe-financial-event-dispositions.sql"), "utf8");
  const webhookReview = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/internal/billing/webhook-review/route.ts"), "utf8");
  expect(verifier).toContain("migrationApplied");
  expect(verifier).toContain("rollbackTarget");
  expect(verifier).toContain("configurationHash");
  expect(verifier).toContain("tenantIsolationResult");
  expect(verifier).toContain("managedOpenRouterResult");
  expect(verifier).toContain("shared runtime configuration digest");
  expect(verifier).toContain("cloud release evidence binds runtime configuration digest");
  expect(verifier).toContain("aiEngineeringResult");
  expect(verifier).toContain("OPENROUTER_MANAGED_SECRET_RESOURCE");
  expect(verifier).toContain("OPENROUTER_MANAGED_PRICING_SNAPSHOT_ID");
  expect(verifier).toContain("verify-content-os-video-pilot.mjs");
  expect(verifier).toContain("manual-pilot");
  expect(verifier).toContain("TURNSTILE_SECRET_KEY");
  expect(verifier).toContain("LEAD_NOTIFICATION_TO");
  expect(supportRoute).toContain("notifyLead");
  expect(supportRoute).toContain("teamNotification");
  expect(runbook).toContain("Do not point the public domain at a tenant runtime directly");
  expect(runbook).toContain("before live mode");
  expect(checklist).toContain("configure a $4");
  expect(checklist).toContain("lifetime cap");
  expect(checklist).toContain("verify:production-readiness -- --strict");
  expect(checklist).toContain("Personal video Content OS");
  expect(stripeDisposition).toContain("stripe_financial_event_dispositions");
  expect(stripeDisposition).toContain("revoke all");
  expect(stripeDisposition).toContain("append-only");
  expect(stripeDisposition).toContain("before update or delete");
  expect(webhookReview).toContain("x-control-plane-secret");
  expect(webhookReview).toContain("webhook_event_not_reviewable");
});

test("public onboarding wires Turnstile only through public site-key and server secret paths", () => {
  const form = readFileSync(resolve(process.cwd(), "product-experience/src/components/editions/StartIntakeForm.tsx"), "utf8");
  const route = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/deployment-request/route.ts"), "utf8");
  expect(form).toContain("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
  expect(form).toContain("challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");
  expect(form).toContain("captchaToken");
  expect(route).toContain("TURNSTILE_SECRET_KEY");
  expect(route).toContain("captcha_failed");
  expect(route).not.toContain("NEXT_PUBLIC_TURNSTILE_SECRET");
});

test("public launch migration fails closed for control-plane privileges", () => {
  const migration = readFileSync(resolve(process.cwd(), "product-experience/supabase-public-launch-control-plane.sql"), "utf8");
  expect(migration).toContain("from public, anon, authenticated;");
  expect(migration).toContain("revoke execute on function public.credit_client_managed_wallet(text, bigint, text, jsonb)");
  expect(migration).toContain("grant execute on function public.credit_client_managed_wallet(text, bigint, text, jsonb) to service_role;");
  expect(migration).not.toContain("revoke execute on function public.credit_client_managed_wallet(text, bigint, text, jsonb) from anon, authenticated;");
});

test("commercial scope remains separate from runtime manifest and billing", () => {
  const migration = readFileSync(resolve(process.cwd(), "product-experience/supabase-commercial-scope.sql"), "utf8");
  const intake = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/deployment-request/route.ts"), "utf8");
  const approval = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/onboarding/scope/approve/route.ts"), "utf8");
  const manifestApproval = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/onboarding/approve/route.ts"), "utf8");
  const checkout = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/billing/checkout/route.ts"), "utf8");
  expect(migration).toContain("commercial_scope_recommendation");
  expect(migration).toContain("commercial_scope_quote");
  expect(intake).toContain("recommendCommercialScope");
  expect(approval).toContain("commercial_scope_status: \"approved\"");
  expect(manifestApproval).toContain("applyCommercialScopeToManifest");
  expect(manifestApproval).toContain("commercial_scope_approval_required");
  expect(checkout).toContain("commercial_scope_pending");
  expect(checkout).toContain("metadata[commercial_scope]");
  expect(approval).toContain("providerCreditsIncluded: false");
});

test("the disposable Stripe fixture can only run under an explicit test key", () => {
  const launch = readFileSync(resolve(process.cwd(), "product-experience/src/lib/publicLaunch.ts"), "utf8");
  const approval = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/onboarding/scope/approve/route.ts"), "utf8");
  const checkout = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/billing/checkout/route.ts"), "utf8");
  const operatorTool = readFileSync(resolve(process.cwd(), "scripts/approve-stripe-test-fixture.mjs"), "utf8");

  expect(launch).toContain("function stripeTestFixtureConfig()");
  expect(launch).toContain('process.env.STRIPE_MODE?.trim() !== "test"');
  expect(launch).toContain('secret.startsWith("sk_test_")');
  expect(launch).toContain("STRIPE_TEST_FIXTURE_ENABLED");
  expect(approval).toContain("const testFixture = stripeTestFixtureConfig()");
  expect(approval).toContain("body.stripeTestFixture === true && !testFixture");
  expect(approval).toContain('error: "stripe_test_fixture_not_configured"');
  expect(approval).toContain("testFixture: true");
  expect(checkout).toContain("stripe_test_fixture_not_configured");
  expect(checkout).toContain('"metadata[test_fixture]": "true"');
  expect(checkout).toContain('"managed_payments[enabled]": "false"');
  expect(operatorTool).toContain("CONTROL_PLANE_OPERATOR_SECRET");
  expect(operatorTool).toContain("export CONTROL_PLANE_OPERATOR_SECRET");
  expect(operatorTool).toContain("stripeTestFixture: true");
  expect(operatorTool).toContain("quote?.testFixture !== true");
  expect(operatorTool).toContain("initialTotalCents !== 100");
});

test("tenant activation is bound to a deployed runtime smoke and the verified owner membership", () => {
  const deploy = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/onboarding/deploy/route.ts"), "utf8");
  const provisionResult = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/onboarding/provision-result/route.ts"), "utf8");
  const activate = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/onboarding/activate/route.ts"), "utf8");
  const setup = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/onboarding/setup/route.ts"), "utf8");
  const setupMigration = readFileSync(resolve(process.cwd(), "product-experience/supabase-v46-onboarding-setup-token.sql"), "utf8");
  const adapter = readFileSync(resolve(process.cwd(), "workers/gcp-provisioner/worker.mjs"), "utf8");

  expect(adapter).toContain("VELOCE_RUNTIME_URL");
  expect(adapter).toContain("async function smokeRuntime(runtimeUrl)");
  expect(adapter).toContain('"runtime_smoke"');
  expect(deploy).toContain('current_step: "eq.prepared"');
  expect(deploy).toContain('phase: "deploy"');
  expect(deploy).toContain('const initialDeployKey = `deploy:${requestId}`');
  expect(deploy).toContain("function isSafePreMutationFailure");
  expect(deploy).toContain("retry_of_run_id");
  expect(provisionResult).toContain("provisioning_callback_manifest_mismatch");
  expect(provisionResult).toContain('supabaseServiceUpsert("client_tenants"');
  expect(provisionResult).toContain("activationReady: true");
  expect(activate).toContain("runtime_smoke_required");
  expect(activate).not.toContain('["smoke_testing", "provisioning"]');
  expect(setup).toContain('supabaseServiceRpc("consume_client_onboarding_setup_token"');
  expect(setupMigration).toContain("insert into public.client_memberships");
  expect(setupMigration).toContain("'owner', 'active'");
  const setupPage = readFileSync(resolve(process.cwd(), "product-experience/src/app/setup/page.tsx"), "utf8");
  expect(setupPage).toContain("Continue securely");
  expect(setupPage).toContain("body?.error");
  expect(setupPage).toContain('window.history.replaceState(null, "", "/setup")');
  expect(setupPage).toContain("onClick={continueSetup}");
});

test("team support notification is server-side and contains no credential field", async () => {
  const saved = {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.LEAD_NOTIFICATION_FROM,
    to: process.env.LEAD_NOTIFICATION_TO,
    fetch: globalThis.fetch,
  };
  const requests: Array<{ body: Record<string, unknown> }> = [];
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.LEAD_NOTIFICATION_FROM = "support@example.com";
  process.env.LEAD_NOTIFICATION_TO = "team@example.com";
  globalThis.fetch = async (_url, init) => {
    requests.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return new Response("{}", { status: 200 });
  };
  try {
    expect(await notifyLead({
      kind: "support request",
      name: "Managed provider access · OPENROUTER_API_KEY",
      email: "client@example.com",
      source: "support:managed_provider_access",
      details: ["Provider: OPENROUTER_API_KEY", "Requested budget micros: 1000000"],
    })).toBe("sent");
    const body = requests[0]?.body;
    expect(body?.to).toEqual(["team@example.com"]);
    expect(String(body?.text)).toContain("Provider: OPENROUTER_API_KEY");
    expect(String(body?.text)).not.toContain("secretValue");
    expect(String(body?.text)).not.toContain("api_key:");
  } finally {
    if (saved.apiKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = saved.apiKey;
    if (saved.from === undefined) delete process.env.LEAD_NOTIFICATION_FROM; else process.env.LEAD_NOTIFICATION_FROM = saved.from;
    if (saved.to === undefined) delete process.env.LEAD_NOTIFICATION_TO; else process.env.LEAD_NOTIFICATION_TO = saved.to;
    globalThis.fetch = saved.fetch;
  }
});
