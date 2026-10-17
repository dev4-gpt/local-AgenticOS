#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { validCustomerJourneyReport } from "./lib/customer-journey-evidence.mjs";
import { captureBuyerPilotEvidence, validBuyerPilotCostEvidence, validBuyerPilotEvidence } from "./lib/buyer-pilot-evidence.mjs";
import { evaluateClientCloudConfigEvidence, validClientCloudConfigEvidence } from "./lib/client-cloud-config-evidence.mjs";
import { validClientStorageObjectInventoryReport } from "./lib/client-storage-object-inventory.mjs";
import { captureSourceGuardSchemaEvidence, validSourceGuardSchemaEvidence } from "./lib/source-guard-schema-evidence.mjs";
import { workingTreeFingerprintSha256 } from "./lib/working-tree-fingerprint.mjs";
import { validNotebookJourneyReceipt } from "./lib/notebook-journey-evidence.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const args = process.argv.slice(2);
let currentFingerprint;
const strict = args.includes("--strict") || args.includes("--publish-ledger");
const allowDirty = args.includes("--allow-dirty");
const publishLedger = args.includes("--publish-ledger");
const ledgerBucket = valueAfter("--ledger-bucket") || process.env.VELOCE_RELEASE_LEDGER_BUCKET?.trim() || null;
const ledgerRecordFile = valueAfter("--ledger-record-file");
const failures = [];
const warnings = [];
const ledgerBucketValid = !ledgerBucket || /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(ledgerBucket);
if (!ledgerBucketValid) failures.push("Release ledger bucket must be a bucket name, not a URI or path");

const commit = git(["rev-parse", "HEAD"]);
const branch = git(["branch", "--show-current"]);
const dirtyFiles = git(["status", "--short"]).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
if (!/^[0-9a-f]{40}$/i.test(commit)) failures.push("Unable to resolve the current Git commit");
if (dirtyFiles.length && !allowDirty) failures.push("Working tree is dirty; release evidence requires a clean source revision");
if (dirtyFiles.length) warnings.push(`Working tree contains ${dirtyFiles.length} uncommitted path(s)`);

const requiredFiles = [
  "src/lib/managedProviderAdapter.ts",
  "src/lib/openRouterManagedAdapter.ts",
  "src/lib/supabaseManagedCreditLedger.ts",
  "src/lib/publicProviderCatalog.ts",
  "src/lib/clientCredentialCatalog.ts",
  "scripts/verify-production-readiness.mjs",
  "scripts/verify-client-runtime-isolation.mjs",
  "scripts/verify-platform-environment-isolation.mjs",
  "product-experience/supabase-v36-platform-deploy-runs.sql",
  "scripts/verify-control-plane-cloud.mjs",
  "scripts/verify-managed-openrouter-cloud.mjs",
  "scripts/verify-vercel-production-env.mjs",
  "scripts/prepare-openrouter-pricing-snapshot.mjs",
  "scripts/verify-openreply-pilot.mjs",
  "scripts/verify-voxcpm-pilot.mjs",
  "scripts/verify-content-os-video-pilot.mjs",
  "scripts/verify-engineering-controls.mjs",
  "scripts/run-ai-release-evaluation.mjs",
  "scripts/lib/offline-test-environment.mjs",
  "scripts/lib/client-cloud-config-evidence.mjs",
  "src/lib/clientRuntimeConfigDigest.mjs",
  "src/lib/clientStorageRetentionClock.mjs",
  "scripts/lib/client-storage-object-inventory.mjs",
  "scripts/lib/client-storage-artifact-inventory.mjs",
  "scripts/lib/notebook-journey-evidence.mjs",
  "scripts/run-notebook-journey-evaluation.mjs",
  "scripts/verify-client-storage-object-inventory.mjs",
  "scripts/lib/source-guard-schema-evidence.mjs",
  "scripts/verify-client-storage-config.mjs",
  "evaluations/ai-release-local-v1.json",
  "scripts/verify-integration-governance.mjs",
  "scripts/control-plane-disposable-canary.mjs",
  "scripts/client-lifecycle.mjs",
  "scripts/lib/client-lifecycle-inventory.mjs",
  "scripts/lib/client-lifecycle-restore.mjs",
  "workers/public-provisioner/worker.mjs",
  "workers/gcp-provisioner/worker.mjs",
  "workers/gcp-provisioner/Dockerfile", "workers/managed-openrouter/worker.mjs", "workers/managed-openrouter/Dockerfile",
  "product-experience/supabase-v31-managed-credit-plans.sql",
  "product-experience/supabase-v32-managed-credit-readiness.sql",
  "product-experience/supabase-v33-managed-credit-lifecycle.sql",
  "product-experience/supabase-v34-managed-credit-execution-claims.sql",
  "product-experience/supabase-v44-stripe-financial-event-dispositions.sql",
  "product-experience/supabase-v45-onboarding-verify-token.sql",
  "product-experience/supabase-v46-onboarding-setup-token.sql",
  "product-experience/supabase-v47-financial-offboard-guard.sql",
  "product-experience/supabase-v48-ecc-learning-retention-references.sql",
  "product-experience/supabase-v49-managed-credit-retention.sql",
  "product-experience/supabase-client-retention-policy-28.sql",
  "product-experience/supabase-client-runtime-source-pack-graph.sql",
  "product-experience/supabase-client-runtime-source-pack-rpc-guard.sql",
  "product-experience/supabase-client-runtime-source-pack-published-date.sql",
  "product-experience/supabase-client-runtime-record-retention.sql",
  "product-experience/supabase-client-research-retention-28.sql",
  "product-experience/supabase-client-notebook-retention-28.sql",
  "product-experience/supabase-client-notebook-source-retention.sql",
  "product-experience/supabase-client-runtime-request-retention-28.sql",
  "product-experience/supabase-client-runtime-job-retention-28.sql",
  "product-experience/supabase-client-room-retention-28.sql",
  "product-experience/supabase-client-room-fixed-retention.sql",
  "product-experience/supabase-client-room-directive-review.sql",
  "product-experience/supabase-client-visual-qa-retention-28.sql",
  "product-experience/supabase-client-support-retention-28.sql",
  "product-experience/supabase-client-pipeline-retention-28.sql",
  "product-experience/supabase-client-hermes-content-factory-retention-28.sql",
  "product-experience/supabase-client-ruflo-retention-28.sql",
  "product-experience/supabase-client-runtime-artifact-owner-guard.sql",
  "product-experience/supabase-client-notebook-artifact-review.sql",
  "product-experience/supabase-client-notebook-source-reference-guard.sql",
  "product-experience/supabase-client-notebook-execution-sources.sql",
  "src/app/api/client-runtime/source-import/route.ts",
  "src/app/api/client-runtime/source-import/upload/route.ts",
  "src/app/api/client-runtime/build-identity/route.ts",
  "scripts/build-client-image.mjs",
  "scripts/lib/client-image-build.mjs",
  "product-experience/supabase-public-launch-control-plane.sql",
  "docs/public-launch-runbook.md",
  "docs/production-operations.md",
  "docs/production-release-acceptance-checklist.md",
  "docs/v3.3-current-release-audit.md",
  "docs/future-integrations/openreply.md",
  "docs/future-integrations/voxcpm.md",
  "docs/content-os-personal-video-pilot.md",
  "infrastructure/integration-control-plane.manifest.json",
  "infrastructure/openreply/openreply-pilot.manifest.example.json",
  "infrastructure/openreply/openreply.env.example",
  "infrastructure/voxcpm/voxcpm-pilot.manifest.example.json",
  "infrastructure/content-os/personal-video-pilot.manifest.json",
  "infrastructure/engineering-controls/agent-efficiency.manifest.json",
  "client-blueprints/control-plane-disposable-canary.gcp.json",
  "product-experience/src/app/api/internal/managed-provider/openrouter/route.ts",
  "product-experience/src/app/api/internal/control-plane/canary/route.ts",
];
for (const file of requiredFiles) {
  try { readFileSync(resolve(root, file)); } catch { failures.push(`Required readiness artifact missing: ${file}`); }
}

const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
for (const script of ["typecheck", "verify:managed-credit", "verify:public-launch", "verify:public-provisioner", "verify:client-isolation", "verify:platform-isolation", "verify:control-plane-cloud", "verify:control-plane-canary", "verify:managed-openrouter-cloud", "verify:vercel-production-env", "prepare:openrouter-pricing", "verify:openreply-pilot", "verify:voxcpm-pilot", "verify:content-os-video-pilot", "verify:integration-governance", "verify:engineering-controls", "verify:ai-evaluation", "verify:production-readiness"]) {
  if (typeof packageJson.scripts?.[script] !== "string") failures.push(`package.json is missing ${script}`);
}

const sourceChecks = [
  ["managed credit reservation RPC", "product-experience/supabase-v33-managed-credit-lifecycle.sql", "reserve_client_credit"],
  ["managed credit settlement RPC", "product-experience/supabase-v33-managed-credit-lifecycle.sql", "settle_client_credit"],
  ["managed credit refund RPC", "product-experience/supabase-v33-managed-credit-lifecycle.sql", "refund_client_credit"],
  ["managed credit execution claim", "product-experience/supabase-v34-managed-credit-execution-claims.sql", "claim_client_credit_reservation"],
  ["public-launch Stripe refund disposition", "product-experience/supabase-v44-stripe-financial-event-dispositions.sql", "stripe_financial_event_dispositions"],
  ["transactional onboarding verification", "product-experience/supabase-v45-onboarding-verify-token.sql", "consume_client_onboarding_verify_token"],
  ["transactional onboarding setup", "product-experience/supabase-v46-onboarding-setup-token.sql", "consume_client_onboarding_setup_token"],
  ["financial offboarding deletion guard", "product-experience/supabase-v47-financial-offboard-guard.sql", "client_tenants_financial_delete_guard"],
  ["managed-credit financial retention", "product-experience/supabase-v49-managed-credit-retention.sql", "purge_expired_client_credit_records"],
  ["28-day tenant retention cap", "product-experience/supabase-client-retention-policy-28.sql", "client_tenants_retention_days_max_28"],
  ["tenant source graph import", "product-experience/supabase-client-runtime-source-pack-graph.sql", "import_client_runtime_source_pack"],
  ["tenant source RPC guard", "product-experience/supabase-client-runtime-source-pack-rpc-guard.sql", "source_pack_owned_by_other_member"],
  ["tenant source publication-date persistence", "product-experience/supabase-client-runtime-source-pack-published-date.sql", "source_published_at"],
  ["server-verified source import", "product-experience/supabase-client-runtime-source-pack-rpc-guard.sql", "p_worker_token"],
  ["tenant runtime-record retention", "product-experience/supabase-client-runtime-record-retention.sql", "purge_expired_client_runtime_records"],
  ["tenant research retention", "product-experience/supabase-client-research-retention-28.sql", "purge_expired_client_research"],
  ["tenant notebook-container retention", "product-experience/supabase-client-notebook-retention-28.sql", "purge_expired_client_notebooks"],
  ["tenant notebook-source retention", "product-experience/supabase-client-notebook-source-retention.sql", "purge_expired_client_notebook_sources"],
  ["tenant runtime-request and delivery-action retention", "product-experience/supabase-client-runtime-request-retention-28.sql", "purge_expired_client_runtime_requests"],
  ["tenant runtime-job retention", "product-experience/supabase-client-runtime-job-retention-28.sql", "purge_expired_client_runtime_jobs"],
  ["tenant Agent Room retention", "product-experience/supabase-client-room-retention-28.sql", "purge_expired_client_room_records"],
  ["tenant Visual QA retention", "product-experience/supabase-client-visual-qa-retention-28.sql", "purge_expired_client_visual_qa"],
  ["tenant support-request retention", "product-experience/supabase-client-support-retention-28.sql", "purge_expired_client_support_requests"],
  ["tenant Pipeline retention", "product-experience/supabase-client-pipeline-retention-28.sql", "purge_expired_client_pipeline_items"],
  ["tenant board and Loop retention", "product-experience/supabase-client-board-loop-retention-28.sql", "purge_expired_client_board_loop_records"],
  ["tenant Paperclip retention", "product-experience/supabase-client-paperclip-retention-28.sql", "purge_expired_client_paperclip_records"],
  ["tenant Hermes Content Factory retention", "product-experience/supabase-client-hermes-content-factory-retention-28.sql", "purge_expired_client_hermes_content_factory_records"],
  ["tenant Ruflo retention", "product-experience/supabase-client-ruflo-retention-28.sql", "purge_expired_client_ruflo_records"],
  ["member notebook-source retention guard", "product-experience/supabase-client-notebook-source-retention.sql", "guard_client_notebook_source_retention"],
  ["tenant artifact owner guard", "product-experience/supabase-client-runtime-artifact-owner-guard.sql", "created_by = auth.uid()"],
  ["tenant notebook reference guard", "product-experience/supabase-client-notebook-source-reference-guard.sql", "client_notebook_source_reference_allowed"],
  ["tenant notebook execution source guard", "product-experience/supabase-client-notebook-execution-sources.sql", "load_client_notebook_execution_sources_worker"],
  ["reviewed source import API", "src/app/api/client-runtime/source-import/route.ts", "permissionConfirmed"],
  ["source import storage proxy", "src/app/api/client-runtime/source-import/upload/route.ts", "uploadClientStorageObject"],
  ["authenticated client build identity", "src/app/api/client-runtime/build-identity/route.ts", "currentClientMember"],
  ["shared runtime configuration digest", "src/lib/clientRuntimeConfigDigest.mjs", "CLIENT_RUNTIME_CONFIG_KEYS"],
  ["runtime identity reports configuration digest", "src/app/api/client-runtime/build-identity/route.ts", "clientRuntimeConfigDigest"],
  ["cloud release evidence binds runtime configuration digest", "scripts/lib/client-cloud-config-evidence.mjs", "runtimeConfigDigest"],
  ["release verifier validates local Notebook journey evidence", "scripts/verify-production-readiness.mjs", "validNotebookJourneyReceipt"],
  ["Notebook journey evidence is collected across the whole run", "scripts/run-notebook-journey-evaluation.mjs", "collectNotebookJourneyResults"],
  ["clean client image build", "scripts/build-client-image.mjs", "status"],
  ["public-launch refund classification", "product-experience/src/app/api/billing/webhook/route.ts", "public_launch_review_required"],
  ["operator refund review boundary", "product-experience/src/app/api/internal/billing/webhook-review/route.ts", "public_launch_refund_reviewed"],
  ["Stripe signature verification", "product-experience/src/app/api/billing/webhook/route.ts", "verifyStripeSignature"],
  ["public provisioner scope checks", "workers/public-provisioner/worker.mjs", "allowedProject"],
  ["private GCP provisioner", "workers/gcp-provisioner/worker.mjs", "GCP_PROVISIONER_ALLOW_APPLY"],
  ["Vercel to Cloud Run OIDC", "product-experience/src/lib/cloudRunOidc.ts", "x-vercel-oidc-token"],
  ["provider-call manifest gate", "scripts/provision-gcp-client.mjs", "providerCallsEnabled"],
  ["tenant export column allowlist", "scripts/client-lifecycle.mjs", "const exportColumns = Object.freeze"],
  ["verified provider pricing gate", "src/lib/publicProviderCatalog.ts", "verifiedPricingSnapshotForCredential"],
  ["OpenRouter managed adapter", "src/lib/openRouterManagedAdapter.ts", "createOpenRouterManagedAdapter"],
  ["private managed OpenRouter route", "product-experience/src/app/api/internal/managed-provider/openrouter/route.ts", "CONTROL_PLANE_OPERATOR_SECRET"],
  ["managed OpenRouter disable persistence", "product-experience/src/app/api/internal/managed-provider/openrouter/route.ts", "managed_provider_disable_persist_failed"],
  ["managed OpenRouter restore gate", "product-experience/src/app/api/internal/managed-provider/openrouter/route.ts", "restore_requires_health_check"],
  ["managed route remains fail-closed by default", "src/lib/managedProviderAdapter.ts", "enabled: false"],
  ["OpenReply remains a disabled external connector", "client-blueprints/veloce-self-marketing.campaign.json", "human-approved-external-pilot"],
  ["OpenReply uses the current Instagram callback", "infrastructure/openreply/openreply-pilot.manifest.example.json", "/api/instagram/callback"],
  ["VoxCPM remains a private disabled GPU pilot", "infrastructure/voxcpm/voxcpm-pilot.manifest.example.json", "isolated-gpu-worker"],
  ["Content OS remains a consent-gated manual pilot", "infrastructure/content-os/personal-video-pilot.manifest.json", "manual-pilot"],
  ["Content OS keeps provider asset generation disabled", "infrastructure/content-os/personal-video-pilot.manifest.json", "geminiFlowVeo"],
  ["governed integrations are registered across pipeline and backend", "infrastructure/integration-control-plane.manifest.json", "native-enabled"],
  ["Ponytail and Headroom remain bounded engineering controls", "infrastructure/engineering-controls/agent-efficiency.manifest.json", "avoidUnrequestedRuntimeDependencies"],
  ["control-plane canary has a disposable manifest", "client-blueprints/control-plane-disposable-canary.gcp.json", "cp-canary-b903-rollback"],
];
for (const [label, file, marker] of sourceChecks) {
  const content = safeRead(file);
  if (!content.includes(marker)) failures.push(`Readiness contract missing: ${label}`);
}

const testResults = Object.fromEntries(valuesAfter("--test-result").map((value) => {
  const separator = value.indexOf("=");
  return separator > 0 ? [value.slice(0, separator), value.slice(separator + 1)] : [value, "unknown"];
}));
if (publishLedger) {
  if (!Object.keys(testResults).length) warnings.push("No test-result metadata supplied; run the focused suite and attach its results before publishing");
  for (const [name, result] of Object.entries(testResults)) if (result !== "passed") failures.push(`Test result is not passed: ${name}=${result}`);
} else if (Object.keys(testResults).length) {
  warnings.push("--test-result is ignored outside --publish-ledger; run 'npm run publish:release-ledger' to record test results in the ledger");
}

const migrationFiles = valuesAfter("--migration-file");
const migrationApplied = migrationFiles.map((file) => {
  const content = safeRead(file);
  return { file, sha256: content ? sha256(content) : null };
});
const requiredMigrations = [
  { file: "product-experience/supabase-v45-onboarding-verify-token.sql", gate: "verification_migration_attached" },
  { file: "product-experience/supabase-v46-onboarding-setup-token.sql", gate: "setup_migration_attached" },
  { file: "product-experience/supabase-v47-financial-offboard-guard.sql", gate: "financial_offboard_guard_migration_attached" },
  { file: "product-experience/supabase-v48-ecc-learning-retention-references.sql", gate: "learning_retention_reference_migration_attached" },
  { file: "product-experience/supabase-v49-managed-credit-retention.sql", gate: "managed_credit_retention_migration_attached" },
  { file: "product-experience/supabase-client-retention-policy-28.sql", gate: "tenant_retention_policy_migration_attached" },
  { file: "product-experience/supabase-client-runtime-source-pack-graph.sql", gate: "source_graph_migration_attached" },
  { file: "product-experience/supabase-client-runtime-source-pack-rpc-guard.sql", gate: "source_rpc_guard_migration_attached" },
  { file: "product-experience/supabase-client-runtime-source-pack-published-date.sql", gate: "source_published_date_migration_attached" },
  { file: "product-experience/supabase-client-runtime-record-retention.sql", gate: "record_retention_migration_attached" },
  { file: "product-experience/supabase-client-onboarding-token-retention.sql", gate: "onboarding_token_retention_migration_attached" },
  { file: "product-experience/supabase-client-runtime-rate-limit-retention.sql", gate: "runtime_rate_limit_retention_migration_attached" },
  { file: "product-experience/supabase-client-research-retention-28.sql", gate: "research_retention_migration_attached" },
  { file: "product-experience/supabase-client-notebook-retention-28.sql", gate: "notebook_retention_migration_attached" },
  { file: "product-experience/supabase-client-notebook-source-retention.sql", gate: "notebook_source_retention_migration_attached" },
  { file: "product-experience/supabase-client-runtime-request-retention-28.sql", gate: "runtime_request_retention_migration_attached" },
  { file: "product-experience/supabase-client-runtime-job-retention-28.sql", gate: "runtime_job_retention_migration_attached" },
  { file: "product-experience/supabase-client-room-retention-28.sql", gate: "room_retention_migration_attached" },
  { file: "product-experience/supabase-client-room-fixed-retention.sql", gate: "room_fixed_retention_migration_attached" },
  { file: "product-experience/supabase-client-room-directive-review.sql", gate: "room_directive_review_migration_attached" },
  { file: "product-experience/supabase-client-visual-qa-retention-28.sql", gate: "visual_qa_retention_migration_attached" },
  { file: "product-experience/supabase-client-support-retention-28.sql", gate: "support_retention_migration_attached" },
  { file: "product-experience/supabase-client-pipeline-retention-28.sql", gate: "pipeline_retention_migration_attached" },
  { file: "product-experience/supabase-client-board-loop-retention-28.sql", gate: "board_loop_retention_migration_attached" },
  { file: "product-experience/supabase-client-paperclip-retention-28.sql", gate: "paperclip_retention_migration_attached" },
  { file: "product-experience/supabase-client-hermes-content-factory-retention-28.sql", gate: "hermes_content_factory_retention_migration_attached" },
  { file: "product-experience/supabase-client-ruflo-retention-28.sql", gate: "ruflo_retention_migration_attached" },
  { file: "product-experience/supabase-client-runtime-artifact-owner-guard.sql", gate: "artifact_owner_guard_migration_attached" },
  { file: "product-experience/supabase-client-notebook-artifact-review.sql", gate: "notebook_artifact_review_migration_attached" },
  { file: "product-experience/supabase-client-notebook-source-reference-guard.sql", gate: "notebook_reference_guard_migration_attached" },
  { file: "product-experience/supabase-client-notebook-execution-sources.sql", gate: "notebook_execution_sources_migration_attached" },
];
const deploymentIdentityKeys = ["vercelDeployment", "cloudRunRevision", "imageDigest", "supabaseProjectRef"];
const releaseOutcomeKeys = ["publicJourneyResult", "stripeSmokeResult", "providerCatalogResult", "byokLifecycleResult", "tenantIsolationResult", "sourceImportResult", "uiParityResult", "buyerSimulationResult", "aiEngineeringResult", "managedOpenRouterResult", "operationsApproval", "legalApproval"];
const ledgerOnlyGates = [
  "ai_evaluation_local_evidence", "buyer_pilot_evidence", "buyer_pilot_cost_evidence", "customer_journey_evidence", "notebook_execution_journey_local_evidence", "migration_evidence_attached",
  "client_cloud_config_evidence", "source_guard_schema_evidence",
  ...requiredMigrations.map(({ gate }) => gate), "test_results_attached", "all_tests_passed",
  ...deploymentIdentityKeys, ...releaseOutcomeKeys.map((key) => `${key}_approved`), "rollback_target",
];
const MAX_JOURNEY_EVIDENCE_BYTES = 1_000_000;
function missingMigrationGates(applied) {
  return requiredMigrations.filter(({ file }) => {
    const content = safeRead(file);
    return !content || !applied.some((item) => item.file === file && item.sha256 === sha256(content));
  }).map(({ gate }) => gate);
}
if (publishLedger && !migrationFiles.length) warnings.push("No --migration-file supplied; attach the applied schema file(s) before publishing");

const deployment = {
  environment: valueAfter("--environment") || process.env.VELOCE_RELEASE_ENVIRONMENT || "unknown",
  vercelDeployment: valueAfter("--vercel-deployment") || process.env.VELOCE_VERCEL_DEPLOYMENT || null,
  cloudRunRevision: valueAfter("--cloud-run-revision") || process.env.VELOCE_CLOUD_RUN_REVISION || null,
  imageDigest: valueAfter("--image-digest") || process.env.VELOCE_IMAGE_DIGEST || null,
  supabaseProjectRef: valueAfter("--supabase-project-ref") || process.env.VELOCE_SUPABASE_PROJECT_REF || null,
  publicJourneyResult: valueAfter("--public-journey-result") || process.env.VELOCE_PUBLIC_JOURNEY_RESULT || null,
  stripeSmokeResult: valueAfter("--stripe-smoke-result") || process.env.VELOCE_STRIPE_SMOKE_RESULT || null,
  providerCatalogResult: valueAfter("--provider-catalog-result") || process.env.VELOCE_PROVIDER_CATALOG_RESULT || null,
  byokLifecycleResult: valueAfter("--byok-lifecycle-result") || process.env.VELOCE_BYOK_LIFECYCLE_RESULT || null,
  tenantIsolationResult: valueAfter("--tenant-isolation-result") || process.env.VELOCE_TENANT_ISOLATION_RESULT || null,
  sourceImportResult: valueAfter("--source-import-result") || process.env.VELOCE_SOURCE_IMPORT_RESULT || null,
  uiParityResult: valueAfter("--ui-parity-result") || process.env.VELOCE_UI_PARITY_RESULT || null,
  buyerSimulationResult: valueAfter("--buyer-simulation-result") || process.env.VELOCE_BUYER_SIMULATION_RESULT || null,
  aiEngineeringResult: valueAfter("--ai-engineering-result") || process.env.VELOCE_AI_ENGINEERING_RESULT || null,
  managedOpenRouterResult: valueAfter("--managed-openrouter-result") || process.env.VELOCE_MANAGED_OPENROUTER_RESULT || null,
  operationsApproval: valueAfter("--operations-approval") || process.env.VELOCE_OPERATIONS_APPROVAL || null,
  legalApproval: valueAfter("--legal-approval") || process.env.VELOCE_LEGAL_APPROVAL || null,
};
if (deployment.imageDigest && !/^sha256:[0-9a-f]{64}$/i.test(deployment.imageDigest)) failures.push("Image digest must be sha256:<64 hex characters>");

const rollbackTarget = {
  cloudRunRevision: valueAfter("--rollback-cloud-run-revision") || process.env.VELOCE_ROLLBACK_CLOUD_RUN_REVISION || null,
  vercelDeploymentId: valueAfter("--rollback-vercel-deployment") || process.env.VELOCE_ROLLBACK_VERCEL_DEPLOYMENT || null,
  imageDigest: valueAfter("--rollback-image-digest") || process.env.VELOCE_ROLLBACK_IMAGE_DIGEST || null,
  note: valueAfter("--rollback-note") || process.env.VELOCE_ROLLBACK_NOTE || null,
};
const releaseGateFailures = [];
const customerJourneyReportFile = valueAfter("--customer-journey-report");
let customerJourneyReport = null;
if (publishLedger && customerJourneyReportFile) {
  try { customerJourneyReport = JSON.parse(readFileSync(resolve(root, customerJourneyReportFile), "utf8")); }
  catch { warnings.push(`No readable customer journey report at ${customerJourneyReportFile}.`); }
}
const notebookJourneyReceiptFile = valueAfter("--notebook-journey-receipt") || "tmp/customer-journey/local-browser-receipt.json";
let notebookExecutionJourney = null;
try { notebookExecutionJourney = JSON.parse(readFileSync(resolve(root, notebookJourneyReceiptFile), "utf8")); }
catch {
  if (publishLedger) warnings.push(`No readable local Notebook journey receipt at ${notebookJourneyReceiptFile}.`);
}
const candidateFingerprint = currentCandidateFingerprint();
const notebookJourneyValid = validNotebookJourneyReceipt(notebookExecutionJourney, commit, candidateFingerprint);
if (publishLedger) {
  if (!notebookJourneyValid) {
    releaseGateFailures.push("notebook_execution_journey_local_evidence");
  }
}
if (publishLedger) {
  for (const [key, value] of Object.entries(deployment)) if (key !== "environment" && !value) warnings.push(`Ledger record is missing deployment.${key}`);
  if (!rollbackTarget.cloudRunRevision && !rollbackTarget.vercelDeploymentId) warnings.push("Ledger record is missing a rollback target");
}

if (dirtyFiles.length) releaseGateFailures.push("working_tree_clean");
if (ledgerRecordFile) releaseGateFailures.push("published_ledger_required");
if (!strict && ledgerRecordFile) warnings.push("Local ledger record file is for inspection only; it is not published release evidence.");

const aiEvaluationReportFile = valueAfter("--ai-evaluation-report") || "tmp/ai-release-local-v1-report.json";
let aiEvaluationLocal = null;
try { aiEvaluationLocal = JSON.parse(readFileSync(resolve(root, aiEvaluationReportFile), "utf8")); }
catch {
  if (publishLedger) warnings.push(`No readable AI evaluation report at ${aiEvaluationReportFile}.`);
}
const aiEvaluationCandidateValid = validLocalAiEvaluation(aiEvaluationLocal, commit, { requireCleanTree: false });
if (publishLedger) {
  if (!validLocalAiEvaluation(aiEvaluationLocal, commit)) releaseGateFailures.push("ai_evaluation_local_evidence");
}
const buyerSimulationDir = valueAfter("--buyer-simulation-dir");
const buyerAuthorizationEvidenceFile = valueAfter("--buyer-authorization-evidence-file");
const buyerCostEvidenceFile = valueAfter("--buyer-cost-evidence-file");
const buyerPilot = publishLedger && buyerSimulationDir
  ? captureBuyerPilotEvidence({
    root, simulationDir: buyerSimulationDir, sourceCommit: commit,
    authorizationEvidenceFile: buyerAuthorizationEvidenceFile, costEvidenceFile: buyerCostEvidenceFile,
  })
  : null;
if (publishLedger && !validBuyerPilotEvidence(buyerPilot, commit, root)) releaseGateFailures.push("buyer_pilot_evidence");
if (publishLedger && !validBuyerPilotCostEvidence(buyerPilot, commit)) releaseGateFailures.push("buyer_pilot_cost_evidence");
const supabaseReadOnlyToken = process.env.VELOCE_SUPABASE_READ_ONLY_TOKEN?.trim() || null;
const sourceGuardSchema = publishLedger ? await captureSourceGuardSchemaEvidence({
  projectRef: deployment.supabaseProjectRef, token: supabaseReadOnlyToken,
}) : null;
if (publishLedger && !validSourceGuardSchemaEvidence(sourceGuardSchema, null, deployment.supabaseProjectRef)) {
  releaseGateFailures.push("source_guard_schema_evidence");
  if (sourceGuardSchema?.failures?.length) warnings.push(`Source guard schema check failed: ${sourceGuardSchema.failures.join(", ")}`);
}
const clientCloudAccount = valueAfter("--client-cloud-account") || process.env.VELOCE_CLIENT_CLOUD_ACCOUNT || null;
const clientStorageInventoryFile = valueAfter("--client-storage-object-inventory");
let clientStorageInventory = null;
if (clientStorageInventoryFile) {
  try { clientStorageInventory = JSON.parse(readFileSync(resolve(root, clientStorageInventoryFile), "utf8")); }
  catch { warnings.push(`No readable client storage object inventory at ${clientStorageInventoryFile}.`); }
}
const clientCloudConfig = publishLedger ? captureLiveClientCloudConfig({
  project: valueAfter("--client-cloud-project"),
  region: valueAfter("--client-cloud-region"),
  service: valueAfter("--client-cloud-service"),
  bucket: valueAfter("--client-storage-bucket"),
  namespace: valueAfter("--client-storage-namespace"),
  account: clientCloudAccount,
  revision: deployment.cloudRunRevision,
  imageDigest: deployment.imageDigest,
  supabaseProjectRef: deployment.supabaseProjectRef,
}, clientCloudAccount, clientStorageInventory) : null;
if (publishLedger && !validClientCloudConfigEvidence(clientCloudConfig, null, deployment)) {
  releaseGateFailures.push("client_cloud_config_evidence");
  if (clientCloudConfig?.failures?.length) warnings.push(`Client cloud config failed: ${clientCloudConfig.failures.join(", ")}`);
}

let ledgerRecord = null;
let ledgerRecordPath = null;
if (!publishLedger) {
  const releaseKey = valueAfter("--release-id") || commit;
  const lookup = (ledgerRecordFile || (ledgerBucket && ledgerBucketValid)) ? fetchLatestLedgerRecord(releaseKey) : null;
  if (!ledgerRecordFile && !ledgerBucket) {
    releaseGateFailures.push("ledger_bucket_not_configured");
    warnings.push("Release ledger bucket is not configured; pass --ledger-bucket or set VELOCE_RELEASE_LEDGER_BUCKET after verifying the target project.");
  } else if (lookup?.status === "missing") {
    releaseGateFailures.push("release_ledger_record_missing");
    warnings.push(ledgerRecordFile
      ? `No valid release ledger record found in ${ledgerRecordFile}.`
      : `No published release ledger record found for ${releaseKey} in gs://${ledgerBucket}/releases/${releaseKey}/.`);
  } else if (lookup?.status === "unavailable") {
    releaseGateFailures.push("release_ledger_lookup_unavailable");
    warnings.push("Could not verify the release ledger listing or record contents; check Cloud SDK credentials and read access.");
  } else if (lookup?.status === "invalid") {
    releaseGateFailures.push("release_ledger_record_invalid");
    warnings.push("The release ledger record could not be parsed as valid JSON.");
  } else if (!lookup) {
    releaseGateFailures.push("release_ledger_lookup_unavailable");
    warnings.push("Could not verify the release ledger because its bucket configuration is invalid.");
  } else {
    ledgerRecord = lookup.record;
    ledgerRecordPath = lookup.path;
    assertNoSecretLikeValues(ledgerRecord, "ledgerRecord");
    if (ledgerRecord.schemaVersion !== 2) releaseGateFailures.push("release_ledger_schema_version");
    if (!valueAfter("--release-id") && ledgerRecord.source?.commit !== commit) releaseGateFailures.push("release_ledger_commit_mismatch");
    if (!validLocalAiEvaluation(ledgerRecord.aiEvaluationLocal, ledgerRecord.source?.commit)) releaseGateFailures.push("ai_evaluation_local_evidence");
    if (!validBuyerPilotEvidence(ledgerRecord.buyerPilot, ledgerRecord.source?.commit, root)) releaseGateFailures.push("buyer_pilot_evidence");
    if (!validBuyerPilotCostEvidence(ledgerRecord.buyerPilot, ledgerRecord.source?.commit)) releaseGateFailures.push("buyer_pilot_cost_evidence");
    if (!validCustomerJourneyReport(ledgerRecord.customerJourneyReport, ledgerRecord.source?.commit, ledgerRecord.deployment, evidenceBytes)) releaseGateFailures.push("customer_journey_evidence");
    if (!validNotebookJourneyReceipt(ledgerRecord.notebookExecutionJourney, ledgerRecord.source?.commit, currentCandidateFingerprint())) {
      releaseGateFailures.push("notebook_execution_journey_local_evidence");
    }
    const storedCloudConfig = ledgerRecord.clientCloudConfig;
    if (ledgerRecordFile) {
      const inventoryIdentity = {
        project: storedCloudConfig?.project,
        bucket: storedCloudConfig?.bucket,
        namespace: storedCloudConfig?.namespace,
        account: clientCloudAccount,
        supabaseProjectRef: ledgerRecord.deployment?.supabaseProjectRef,
      };
      if (!validClientStorageObjectInventoryReport(clientStorageInventory, inventoryIdentity)
          || clientStorageInventory.objectInventorySha256 !== storedCloudConfig?.objectInventorySha256
          || clientStorageInventory.liveListingSha256 !== storedCloudConfig?.liveListingSha256
          || clientStorageInventory.softDeletedListingSha256 !== storedCloudConfig?.softDeletedListingSha256
          || clientStorageInventory.artifactSnapshotSha256 !== storedCloudConfig?.artifactSnapshotSha256
          || clientStorageInventory.artifactCrosswalk !== storedCloudConfig?.artifactCrosswalk
          || clientStorageInventory.artifactRows !== storedCloudConfig?.artifactRows
          || clientStorageInventory.account !== storedCloudConfig?.objectInventoryAccount) {
        releaseGateFailures.push("client_storage_object_inventory_evidence");
      }
    }
    const currentCloudConfig = !ledgerRecordFile && validClientCloudConfigEvidence(storedCloudConfig, null, ledgerRecord.deployment)
      ? captureLiveClientCloudConfig({ ...storedCloudConfig, account: clientCloudAccount }, clientCloudAccount, clientStorageInventory) : null;
    if (!validClientCloudConfigEvidence(storedCloudConfig, ledgerRecordFile ? null : currentCloudConfig,
      ledgerRecord.deployment, { requireCurrent: !ledgerRecordFile })) {
      releaseGateFailures.push("client_cloud_config_evidence");
    }
    const storedSourceGuard = ledgerRecord.sourceGuardSchema;
    const currentSourceGuard = !ledgerRecordFile && validSourceGuardSchemaEvidence(storedSourceGuard, null, ledgerRecord.deployment?.supabaseProjectRef)
      ? await captureSourceGuardSchemaEvidence({ projectRef: storedSourceGuard.projectRef, token: supabaseReadOnlyToken }) : null;
    if (!validSourceGuardSchemaEvidence(storedSourceGuard, ledgerRecordFile ? null : currentSourceGuard,
      ledgerRecord.deployment?.supabaseProjectRef, { requireCurrent: !ledgerRecordFile })) {
      releaseGateFailures.push("source_guard_schema_evidence");
    }
    for (const key of deploymentIdentityKeys) {
      if (!ledgerRecord.deployment?.[key]) releaseGateFailures.push(key);
    }
    if (!ledgerRecord.migration?.applied?.length) releaseGateFailures.push("migration_evidence_attached");
    releaseGateFailures.push(...missingMigrationGates(ledgerRecord.migration?.applied || []));
    if (!Object.keys(ledgerRecord.tests || {}).length) releaseGateFailures.push("test_results_attached");
    if (Object.values(ledgerRecord.tests || {}).some((result) => result !== "passed")) releaseGateFailures.push("all_tests_passed");
    for (const key of releaseOutcomeKeys) {
      const value = ledgerRecord.deployment?.[key];
      if (value !== "approved" && value !== "passed") releaseGateFailures.push(`${key}_approved`);
    }
    if (!ledgerRecord.rollbackTarget?.cloudRunRevision && !ledgerRecord.rollbackTarget?.vercelDeploymentId) releaseGateFailures.push("rollback_target");
  }
}
if (publishLedger) {
  if (!ledgerBucket) releaseGateFailures.push("ledger_bucket_not_configured");
  if (!validCustomerJourneyReport(customerJourneyReport, commit, deployment, evidenceBytes)) releaseGateFailures.push("customer_journey_evidence");
  for (const key of deploymentIdentityKeys) {
    if (!deployment[key]) releaseGateFailures.push(key);
  }
  if (!migrationApplied.length || migrationApplied.some((item) => !item.sha256)) releaseGateFailures.push("migration_evidence_attached");
  releaseGateFailures.push(...missingMigrationGates(migrationApplied));
  if (!Object.keys(testResults).length) releaseGateFailures.push("test_results_attached");
  for (const key of releaseOutcomeKeys) {
    if (!["approved", "passed"].includes(deployment[key])) releaseGateFailures.push(`${key}_approved`);
  }
  if (!rollbackTarget.cloudRunRevision && !rollbackTarget.vercelDeploymentId) releaseGateFailures.push("rollback_target");
}
const evidenceEnvironment = publishLedger ? deployment.environment : ledgerRecord?.deployment?.environment;
const notEvaluated = !publishLedger && !ledgerRecord ? ledgerOnlyGates : [];
if (strict && !["production", "staging"].includes(evidenceEnvironment)) releaseGateFailures.push("release_environment");
if (strict && !publishLedger && deployment.environment !== "unknown" && evidenceEnvironment !== deployment.environment) releaseGateFailures.push("release_environment_mismatch");
if (strict) for (const gate of releaseGateFailures) failures.push(`Strict release evidence missing or failed: ${gate}`);

const configurationShape = {
  requiredServerVariables: [
    "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "PUBLIC_EMAIL_FROM",
    "PUBLIC_APP_URL", "PUBLIC_SITE_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
    "STRIPE_SETUP_PRICE_ID", "STRIPE_PLATFORM_PRICE_ID", "STRIPE_CREDIT_PRICE_ID",
    "CONTROL_PLANE_OPERATOR_SECRET", "CONTROL_PLANE_WORKER_TOKEN", "CONTROL_PLANE_PROVISIONER_URL",
    "CONTROL_PLANE_CALLBACK_URL", "GCP_PROVISIONER_URL", "GCP_ALLOWED_PROJECT", "GCP_ALLOWED_REGION", "GCP_PROJECT_NUMBER", "GCP_WORKLOAD_IDENTITY_POOL_ID", "GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID", "GCP_CONTROL_PLANE_INVOKER_SERVICE_ACCOUNT", "LEAD_NOTIFICATION_FROM", "LEAD_NOTIFICATION_TO",
    "TURNSTILE_SECRET_KEY", "OPENROUTER_MANAGED_SECRET_RESOURCE", "OPENROUTER_MANAGED_GATEWAY_URL", "OPENROUTER_MANAGED_PRICING_SNAPSHOT_ID", "OPENROUTER_MANAGED_PRICING_JSON",
  ],
  present: Object.fromEntries([
    "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "PUBLIC_EMAIL_FROM",
    "PUBLIC_APP_URL", "PUBLIC_SITE_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
    "STRIPE_SETUP_PRICE_ID", "STRIPE_PLATFORM_PRICE_ID", "STRIPE_CREDIT_PRICE_ID",
    "CONTROL_PLANE_OPERATOR_SECRET", "CONTROL_PLANE_WORKER_TOKEN", "CONTROL_PLANE_PROVISIONER_URL",
    "CONTROL_PLANE_CALLBACK_URL", "GCP_PROVISIONER_URL", "GCP_ALLOWED_PROJECT", "GCP_ALLOWED_REGION", "GCP_PROJECT_NUMBER", "GCP_WORKLOAD_IDENTITY_POOL_ID", "GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID", "GCP_CONTROL_PLANE_INVOKER_SERVICE_ACCOUNT", "LEAD_NOTIFICATION_FROM", "LEAD_NOTIFICATION_TO",
    "TURNSTILE_SECRET_KEY", "OPENROUTER_MANAGED_SECRET_RESOURCE", "OPENROUTER_MANAGED_GATEWAY_URL", "OPENROUTER_MANAGED_PRICING_SNAPSHOT_ID", "OPENROUTER_MANAGED_PRICING_JSON",
  ].map((key) => [key, Boolean(process.env[key]?.trim())])),
  nonSecretModes: { stripeMode: process.env.STRIPE_MODE?.trim() || null },
  publicSecretNames: Object.keys(process.env).filter((key) => /^NEXT_PUBLIC_.*(SECRET|PASSWORD|PRIVATE_KEY|ACCESS_TOKEN|API_KEY)$/i.test(key) && key !== "NEXT_PUBLIC_TURNSTILE_SITE_KEY"),
};
if (configurationShape.publicSecretNames.length) failures.push("Secret-like NEXT_PUBLIC_* variables are present in the release environment");
if (strict && evidenceEnvironment === "production" && configurationShape.nonSecretModes.stripeMode !== "live") failures.push("Production release requires STRIPE_MODE=live");
const configurationHash = valueAfter("--config-hash") || process.env.VELOCE_CONFIGURATION_HASH || sha256(JSON.stringify(configurationShape));
if (!/^[0-9a-f]{64}$/i.test(configurationHash)) failures.push("Configuration hash must be 64 hexadecimal characters");

const generatedAt = new Date().toISOString();
const evidence = {
  schemaVersion: 2,
  releaseId: `${commit}@${generatedAt}`,
  generatedAt,
  source: { commit, branch, dirtyFiles },
  deployment: publishLedger ? deployment : (ledgerRecord?.deployment ?? deployment),
  migration: publishLedger
    ? { applied: migrationApplied, appliedAt: migrationApplied.length ? generatedAt : null, appliedBy: valueAfter("--applied-by") || process.env.VELOCE_MIGRATION_APPLIED_BY || null }
    : (ledgerRecord?.migration ?? { applied: [], appliedAt: null, appliedBy: null }),
  tests: publishLedger ? testResults : (ledgerRecord?.tests ?? {}),
  aiEvaluationLocal: publishLedger ? aiEvaluationLocal : (ledgerRecord?.aiEvaluationLocal ?? null),
  buyerPilot: publishLedger ? buyerPilot : (ledgerRecord?.buyerPilot ?? null),
  customerJourneyReport: publishLedger ? customerJourneyReport : (ledgerRecord?.customerJourneyReport ?? null),
  notebookExecutionJourney: publishLedger ? notebookExecutionJourney : (ledgerRecord?.notebookExecutionJourney ?? null),
  localCandidateChecks: publishLedger || ledgerRecord ? null : {
    candidateFingerprintSchema: "agentos-working-tree-v1",
    candidateFingerprintSha256: candidateFingerprint,
    workingTreeClean: dirtyFiles.length === 0,
    aiEvaluation: {
      status: aiEvaluationCandidateValid
        ? (aiEvaluationLocal.workingTreeClean ? "passed_candidate_bound" : "passed_candidate_bound_dirty_tree")
        : (aiEvaluationLocal ? "failed_or_stale" : "missing"),
      productionReady: aiEvaluationLocal?.productionReady ?? null,
      cases: aiEvaluationLocal?.metrics?.cases ?? null,
      passed: aiEvaluationLocal?.metrics?.passed ?? null,
      modelSamples: aiEvaluationLocal?.metrics?.modelSamples ?? null,
    },
    notebookExecutionJourney: {
      status: notebookJourneyValid ? "passed_candidate_bound" : (notebookExecutionJourney ? "failed_or_stale" : "missing"),
      scenarios: notebookExecutionJourney?.scenarios?.length ?? null,
      passed: notebookJourneyValid ? notebookExecutionJourney.scenarios.length : null,
    },
  },
  clientCloudConfig: publishLedger ? clientCloudConfig : (ledgerRecord?.clientCloudConfig ?? null),
  sourceGuardSchema: publishLedger ? sourceGuardSchema : (ledgerRecord?.sourceGuardSchema ?? null),
  configurationHash,
  configurationShape: { requiredServerVariables: configurationShape.requiredServerVariables, present: configurationShape.present, publicSecretNames: configurationShape.publicSecretNames },
  rollbackTarget: publishLedger ? rollbackTarget : (ledgerRecord?.rollbackTarget ?? rollbackTarget),
  releaseReady: failures.length === 0 && releaseGateFailures.length === 0,
  failures,
  releaseGateFailures,
  notEvaluated,
  warnings,
  ledgerRecordUsed: ledgerRecord ? { path: ledgerRecordPath, generatedAt: ledgerRecord.generatedAt } : null,
};
assertNoSecretLikeValues(evidence);

if (publishLedger && evidence.releaseReady) publishToLedger(evidence);
// A storage failure is part of the result, not a successful release.
evidence.releaseReady = failures.length === 0 && releaseGateFailures.length === 0;

const outputPath = valueAfter("--out");
if (outputPath) {
  const target = resolve(outputPath);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  writeFileSync(target, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
  chmodSync(target, 0o600);
}

console.log(JSON.stringify({
  releaseReady: evidence.releaseReady,
  commit,
  branch,
  evidencePath: outputPath ? resolve(outputPath) : null,
  failures: [...failures, ...releaseGateFailures.map((gate) => `release_gate:${gate}`)],
  localCandidateChecks: evidence.localCandidateChecks,
  notEvaluated,
  warnings,
}, null, 2));
if (strict && failures.length) process.exit(1);

function validLocalAiEvaluation(report, expectedCommit, { requireCleanTree = true } = {}) {
  if (!report || report.schemaVersion !== 2 || report.suite !== "ai-release-local-v1" || report.localGatePassed !== true
    || report.runnerStatus !== "passed" || !Array.isArray(report.failures) || report.failures.length !== 0
    || report.productionReady !== false || typeof report.workingTreeClean !== "boolean" || typeof report.workingTreeCleanAfter !== "boolean"
    || (requireCleanTree && (report.workingTreeClean !== true || report.workingTreeCleanAfter !== true)) || report.nodeEngineSupported !== true
    || !/^v(?:22|23|24|25)\.\d+\.\d+$/.test(report.nodeVersion ?? "")
    || report.runnerExitCode !== 0 || report.sourceCommit !== expectedCommit || report.sourceCommitAfter !== expectedCommit
    || report.candidateFingerprintSchema !== "agentos-working-tree-v1"
    || !/^[0-9a-f]{64}$/.test(report.candidateFingerprintSha256 ?? "")
    || report.candidateFingerprintSha256 !== currentCandidateFingerprint()
    || report.candidateFingerprintAfterSha256 !== report.candidateFingerprintSha256
    || ![report.startedAt, report.checkedAt].every((value) => typeof value === "string"
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value)))
    || Date.parse(report.startedAt) > Date.parse(report.checkedAt)
    || report.unitConfigSha256 !== sha256(readFileSync(resolve(root, "playwright.unit.config.ts")))
    || report.playwrightVersion !== JSON.parse(readFileSync(resolve(root, "node_modules/playwright/package.json"), "utf8")).version
    || report.playwrightVersionAfter !== report.playwrightVersion
    || report.runnerConfiguration?.workers !== 1 || report.runnerConfiguration.retries !== 0
    || report.runnerConfiguration.reporter !== "json" || report.runnerConfiguration.timeoutMs !== 600000
    || report.runnerConfiguration.environment !== "allowlisted-offline-v1"
    || Object.keys(report.runnerConfiguration).length !== 5
    || !/^[0-9a-f]{64}$/.test(report.fixtureSha256 ?? "")) return false;
  const fixture = readFileSync(resolve(root, "evaluations/ai-release-local-v1.json"));
  if (sha256(fixture) !== report.fixtureSha256 || !Array.isArray(report.cases)) return false;
  const expectedFixture = JSON.parse(fixture.toString("utf8"));
  const expectedCases = expectedFixture.cases;
  return report.mode === expectedFixture.mode && report.cases.length === expectedCases.length
    && report.metrics?.cases === expectedCases.length && report.metrics?.passed === expectedCases.length && report.metrics?.failed === 0
    && report.metrics?.modelSamples === 0 && expectedCases.every((expected, index) => {
      const actual = report.cases[index];
      return actual?.id === expected.id && actual.spec === expected.spec && actual.title === expected.title && actual.status === "passed";
    });
}

function currentCandidateFingerprint() {
  if (currentFingerprint === undefined) {
    try { currentFingerprint = workingTreeFingerprintSha256(root); }
    catch { currentFingerprint = null; }
  }
  return currentFingerprint;
}

function evidenceBytes(ref) {
  let bytes = null;
  if (ref.startsWith("docs/evidence/")) {
    try { bytes = readFileSync(resolve(root, ref)); } catch { /* A missing receipt fails the gate. */ }
  } else if (ref.startsWith("gs://")) {
    const result = spawnSync("gcloud", ["storage", "cat", ref], { timeout: 15_000, maxBuffer: MAX_JOURNEY_EVIDENCE_BYTES });
    if (result.status === 0) bytes = result.stdout;
  }
  return bytes;
}

function valuesAfter(flag) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) if (args[index] === flag && args[index + 1]) values.push(args[++index]);
  return values;
}

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1].trim() : null;
}

function safeRead(file) {
  try { return readFileSync(resolve(root, file), "utf8"); } catch { return ""; }
}

function git(command) {
  const result = spawnSync("git", command, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function captureLiveClientCloudConfig(expected, account, objectInventory) {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(expected?.project ?? "")
      || !/^[a-z]+-[a-z]+[0-9]+$/.test(expected?.region ?? "")
      || !/^[a-z][a-z0-9-]{2,62}$/.test(expected?.service ?? "")
      || !/^[a-z0-9][a-z0-9._-]{2,221}$/.test(expected?.bucket ?? "")
      || !/^[a-z][a-z0-9-]{2,40}$/.test(expected?.namespace ?? "")
      || !/^[a-z0-9]{20}$/.test(expected?.supabaseProjectRef ?? "")
      || !/^sha256:[0-9a-f]{64}$/i.test(expected?.imageDigest ?? "")
      || !expected?.revision || (account && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account))) return null;
  const accountArg = account ? [`--account=${account}`] : [];
  const service = gcloudJson(["run", "services", "describe", expected.service,
    "--project", expected.project, "--region", expected.region, "--format=json", ...accountArg]);
  const bucket = gcloudJson(["storage", "buckets", "describe", `gs://${expected.bucket}`,
    "--project", expected.project, "--format=json", ...accountArg]);
  if (!service || !bucket) return null;
  return evaluateClientCloudConfigEvidence(service, bucket, { ...expected, account: account ?? null }, new Date().toISOString(), objectInventory);
}

function gcloudJson(command) {
  const result = spawnSync("gcloud", command, { encoding: "utf8", timeout: 20_000, maxBuffer: 2_000_000 });
  if (result.status !== 0) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}

function publishToLedger(evidenceRecord) {
  const environment = evidenceRecord.deployment?.environment;
  const environmentPrefix = environment && environment !== "unknown" ? `${environment}-` : "";
  const objectPath = `releases/${commit}/${environmentPrefix}${evidenceRecord.generatedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}.json`;
  const tmp = resolve(root, `tmp/release-ledger-${commit}.json`);
  mkdirSync(dirname(tmp), { recursive: true, mode: 0o700 });
  writeFileSync(tmp, JSON.stringify(evidenceRecord, null, 2) + "\n", { mode: 0o600 });
  const impersonate = valueAfter("--impersonate-service-account") || process.env.VELOCE_RELEASE_LEDGER_WRITER;
  const command = ["storage", "cp", tmp, `gs://${ledgerBucket}/${objectPath}`, "--if-generation-match=0"];
  if (impersonate) command.push(`--impersonate-service-account=${impersonate}`);
  const result = spawnSync("gcloud", command, { stdio: "inherit" });
  try { unlinkSync(tmp); } catch {}
  if (result.status !== 0) {
    failures.push(`Failed to publish release ledger record to gs://${ledgerBucket}/${objectPath}`);
    return;
  }
  console.log(`Published release ledger record: gs://${ledgerBucket}/${objectPath}`);
}

function fetchLatestLedgerRecord(forCommit) {
  const override = ledgerRecordFile;
  if (override) {
    try { return { status: "found", record: JSON.parse(readFileSync(resolve(override), "utf8")), path: override }; }
    catch { return { status: "invalid" }; }
  }
  const listing = runGcloudRead(["storage", "ls", `gs://${ledgerBucket}/releases/${forCommit}/`]);
  if (!listing.ok) {
    return /matched no objects|no urls matched/i.test(listing.output)
      ? { status: "missing" }
      : { status: "unavailable" };
  }
  let objects = listing.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).sort();
  const environmentFilter = valueAfter("--environment");
  if (environmentFilter) objects = objects.filter((path) => path.includes(`/${environmentFilter}-`));
  const latest = objects[objects.length - 1];
  if (!latest) return { status: "missing" };
  const contents = runGcloudRead(["storage", "cat", latest]);
  if (!contents.ok) return { status: "unavailable" };
  try { return { status: "found", record: JSON.parse(contents.stdout), path: latest }; }
  catch { return { status: "invalid" }; }
}

function runGcloudRead(command) {
  const result = spawnSync("gcloud", command, { encoding: "utf8", timeout: 15_000, maxBuffer: 2_000_000 });
  if (result.error || result.status !== 0) {
    return { ok: false, output: `${result.stderr ?? ""}\n${result.stdout ?? ""}` };
  }
  return { ok: true, stdout: result.stdout.trim() };
}

function assertNoSecretLikeValues(value, path = "evidence") {
  if (Array.isArray(value)) return value.forEach((item, index) => assertNoSecretLikeValues(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && /(?:api[_ -]?key|secret|password|private[_ -]?key|access[_ -]?token)\s*[:=]\s*[^\s]{4,}|\b(?:sk|rk|ghp|xai)-[A-Za-z0-9_-]{16,}\b/i.test(value)) throw new Error(`Secret-like evidence value at ${path}`);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (!(path.endsWith("configurationShape.present") && typeof child === "boolean") && /credential_value|api_key|access_token|private_key|password/i.test(key)) throw new Error(`Sensitive evidence field at ${path}.${key}`);
    assertNoSecretLikeValues(child, `${path}.${key}`);
  }
}
