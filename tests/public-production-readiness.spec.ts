import { expect, test } from "@playwright/test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { notifyLead } from "../product-experience/src/lib/leadNotification";

test("release verifier records the current revision without secrets", () => {
  const script = resolve(process.cwd(), "scripts/verify-production-readiness.mjs");
  const result = spawnSync(process.execPath, [script, "--allow-dirty", "--test-result", "typecheck=passed"], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, VELOCE_RELEASE_LEDGER_BUCKET: "" } });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('"releaseReady": false');
  expect(result.stdout).toContain("release_gate:ledger_bucket_not_configured");
  const report = JSON.parse(result.stdout);
  expect(report.notEvaluated).toContain("customer_journey_evidence");
  expect(report.notEvaluated).toContain("client_cloud_config_evidence");
  expect(report.notEvaluated).toContain("source_guard_schema_evidence");
  expect(report.notEvaluated).toContain("buyer_pilot_evidence");
  expect(report.notEvaluated).toContain("sourceImportResult_approved");
  expect(report.notEvaluated).toContain("tenantIsolationResult_approved");
  expect(report.notEvaluated).toContain("buyerSimulationResult_approved");
  expect(report.notEvaluated).toContain("legalApproval_approved");
  expect(result.stdout).not.toContain("veloce-agenticos-2026-veloce-release-ledger");
  expect(result.stdout).not.toMatch(/sk-[A-Za-z0-9_-]{16,}|service_role|api[_ -]?key\s*[:=]/i);
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

test("release evidence requires the setup, financial, learning-retention, source-graph, artifact-owner, and notebook-reference migrations", () => {
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
    expect(failures).toContain("release_gate:record_retention_migration_attached");
    expect(failures).toContain("release_gate:artifact_owner_guard_migration_attached");
    expect(failures).toContain("release_gate:notebook_reference_guard_migration_attached");
    expect(failures).toContain("release_gate:sourceImportResult_approved");
    expect(failures).toContain("release_gate:uiParityResult_approved");
    expect(failures).toContain("release_gate:buyerSimulationResult_approved");
    expect(failures).toContain("release_gate:aiEngineeringResult_approved");
    expect(failures).toContain("release_gate:ai_evaluation_local_evidence");
    expect(failures).toContain("release_gate:buyer_pilot_evidence");
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

test("AI approval cannot substitute for a matching local evaluation receipt", () => {
  const dir = mkdtempSync(join(tmpdir(), "veloce-ai-ledger-"));
  try {
    const file = join(dir, "record.json");
    const fixture = readFileSync(resolve(process.cwd(), "evaluations/ai-release-local-v1.json"));
    const cases = JSON.parse(fixture.toString("utf8")).cases;
    const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }).stdout.trim();
    const receipt = {
      schemaVersion: 1, suite: "ai-release-local-v1", localGatePassed: true, productionReady: false,
      workingTreeClean: true, nodeEngineSupported: true, runnerExitCode: 0, sourceCommit: commit,
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
      expect(result.status).toBe(0);
      return JSON.parse(result.stdout).failures as string[];
    };
    expect(inspect({ ...receipt, sourceCommit: "0".repeat(40) })).toContain("release_gate:ai_evaluation_local_evidence");
    expect(inspect({ ...receipt, workingTreeClean: false })).toContain("release_gate:ai_evaluation_local_evidence");
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
