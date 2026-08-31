#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(new URL("..", import.meta.url).pathname);
const args = process.argv.slice(2);
const strict = args.includes("--strict");
const allowDirty = args.includes("--allow-dirty");
const failures = [];
const warnings = [];

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
  "scripts/verify-control-plane-cloud.mjs",
  "scripts/verify-managed-openrouter-cloud.mjs",
  "scripts/verify-vercel-production-env.mjs",
  "scripts/prepare-openrouter-pricing-snapshot.mjs",
  "scripts/verify-openreply-pilot.mjs",
  "scripts/verify-voxcpm-pilot.mjs",
  "scripts/verify-engineering-controls.mjs",
  "scripts/control-plane-disposable-canary.mjs",
  "scripts/client-lifecycle.mjs",
  "workers/public-provisioner/worker.mjs",
  "workers/gcp-provisioner/worker.mjs",
  "workers/gcp-provisioner/Dockerfile", "workers/managed-openrouter/worker.mjs", "workers/managed-openrouter/Dockerfile",
  "product-experience/supabase-v31-managed-credit-plans.sql",
  "product-experience/supabase-v32-managed-credit-readiness.sql",
  "product-experience/supabase-v33-managed-credit-lifecycle.sql",
  "product-experience/supabase-v34-managed-credit-execution-claims.sql",
  "product-experience/supabase-public-launch-control-plane.sql",
  "docs/public-launch-runbook.md",
  "docs/production-operations.md",
  "docs/v3.3-current-release-audit.md",
  "docs/future-integrations/openreply.md",
  "docs/future-integrations/voxcpm.md",
  "infrastructure/openreply/openreply-pilot.manifest.example.json",
  "infrastructure/openreply/openreply.env.example",
  "infrastructure/voxcpm/voxcpm-pilot.manifest.example.json",
  "infrastructure/engineering-controls/agent-efficiency.manifest.json",
  "client-blueprints/control-plane-disposable-canary.gcp.json",
  "product-experience/src/app/api/internal/managed-provider/openrouter/route.ts",
  "product-experience/src/app/api/internal/control-plane/canary/route.ts",
];
for (const file of requiredFiles) {
  try { readFileSync(resolve(root, file)); } catch { failures.push(`Required readiness artifact missing: ${file}`); }
}

const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
for (const script of ["typecheck", "verify:managed-credit", "verify:public-launch", "verify:public-provisioner", "verify:client-isolation", "verify:control-plane-cloud", "verify:control-plane-canary", "verify:managed-openrouter-cloud", "verify:vercel-production-env", "prepare:openrouter-pricing", "verify:openreply-pilot", "verify:voxcpm-pilot", "verify:engineering-controls", "verify:production-readiness"]) {
  if (typeof packageJson.scripts?.[script] !== "string") failures.push(`package.json is missing ${script}`);
}

const sourceChecks = [
  ["managed credit reservation RPC", "product-experience/supabase-v33-managed-credit-lifecycle.sql", "reserve_client_credit"],
  ["managed credit settlement RPC", "product-experience/supabase-v33-managed-credit-lifecycle.sql", "settle_client_credit"],
  ["managed credit refund RPC", "product-experience/supabase-v33-managed-credit-lifecycle.sql", "refund_client_credit"],
  ["managed credit execution claim", "product-experience/supabase-v34-managed-credit-execution-claims.sql", "claim_client_credit_reservation"],
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
  ["Ponytail and Headroom remain bounded engineering controls", "infrastructure/engineering-controls/agent-efficiency.manifest.json", "avoidUnrequestedRuntimeDependencies"],
  ["control-plane canary has a disposable manifest", "client-blueprints/control-plane-disposable-canary.gcp.json", "cp-canary-a826-rollback"],
];
for (const [label, file, marker] of sourceChecks) {
  const content = safeRead(file);
  if (!content.includes(marker)) failures.push(`Readiness contract missing: ${label}`);
}

const testResults = Object.fromEntries(valuesAfter("--test-result").map((value) => {
  const separator = value.indexOf("=");
  return separator > 0 ? [value.slice(0, separator), value.slice(separator + 1)] : [value, "unknown"];
}));
if (!Object.keys(testResults).length) warnings.push("No test-result metadata supplied; run the focused suite and attach its results before release");
for (const [name, result] of Object.entries(testResults)) if (result !== "passed") failures.push(`Test result is not passed: ${name}=${result}`);

const external = {
  environment: valueAfter("--environment") || process.env.VELOCE_RELEASE_ENVIRONMENT || "unknown",
  vercelDeployment: valueAfter("--vercel-deployment") || process.env.VELOCE_VERCEL_DEPLOYMENT || null,
  cloudRunRevision: valueAfter("--cloud-run-revision") || process.env.VELOCE_CLOUD_RUN_REVISION || null,
  imageDigest: valueAfter("--image-digest") || process.env.VELOCE_IMAGE_DIGEST || null,
  migrationResult: valueAfter("--migration-result") || process.env.VELOCE_MIGRATION_RESULT || null,
  rollbackTarget: valueAfter("--rollback-target") || process.env.VELOCE_ROLLBACK_TARGET || null,
  publicJourneyResult: valueAfter("--public-journey-result") || process.env.VELOCE_PUBLIC_JOURNEY_RESULT || null,
  stripeSmokeResult: valueAfter("--stripe-smoke-result") || process.env.VELOCE_STRIPE_SMOKE_RESULT || null,
  providerCatalogResult: valueAfter("--provider-catalog-result") || process.env.VELOCE_PROVIDER_CATALOG_RESULT || null,
  byokLifecycleResult: valueAfter("--byok-lifecycle-result") || process.env.VELOCE_BYOK_LIFECYCLE_RESULT || null,
  tenantIsolationResult: valueAfter("--tenant-isolation-result") || process.env.VELOCE_TENANT_ISOLATION_RESULT || null,
  managedOpenRouterResult: valueAfter("--managed-openrouter-result") || process.env.VELOCE_MANAGED_OPENROUTER_RESULT || null,
  operationsApproval: valueAfter("--operations-approval") || process.env.VELOCE_OPERATIONS_APPROVAL || null,
  legalApproval: valueAfter("--legal-approval") || process.env.VELOCE_LEGAL_APPROVAL || null,
};
if (external.imageDigest && !/^sha256:[0-9a-f]{64}$/i.test(external.imageDigest)) failures.push("Image digest must be sha256:<64 hex characters>");
const releaseGateFailures = [];
if (dirtyFiles.length) releaseGateFailures.push("working_tree_clean");
for (const [key, value] of Object.entries(external)) if (!value) releaseGateFailures.push(key);
if (external.migrationResult !== "passed") releaseGateFailures.push("migration_result_passed");
if (!Object.keys(testResults).length) releaseGateFailures.push("test_results_attached");
if (Object.values(testResults).some((result) => result !== "passed")) releaseGateFailures.push("all_tests_passed");
for (const key of ["publicJourneyResult", "stripeSmokeResult", "providerCatalogResult", "byokLifecycleResult", "tenantIsolationResult", "managedOpenRouterResult", "operationsApproval", "legalApproval"]) {
  if (external[key] !== "approved" && external[key] !== "passed") releaseGateFailures.push(`${key}_approved`);
}
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
if (strict && external.environment === "production" && configurationShape.nonSecretModes.stripeMode !== "live") failures.push("Production release requires STRIPE_MODE=live");
const configurationHash = valueAfter("--config-hash") || process.env.VELOCE_CONFIGURATION_HASH || sha256(JSON.stringify(configurationShape));
if (!/^[0-9a-f]{64}$/i.test(configurationHash)) failures.push("Configuration hash must be 64 hexadecimal characters");

const evidence = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: { commit, branch, dirtyFiles },
  deployment: external,
  migration: { result: external.migrationResult },
  tests: testResults,
  configurationHash,
  configurationShape: { requiredServerVariables: configurationShape.requiredServerVariables, present: configurationShape.present, publicSecretNames: configurationShape.publicSecretNames },
  rollbackTarget: external.rollbackTarget,
  releaseReady: failures.length === 0 && releaseGateFailures.length === 0,
  failures,
  releaseGateFailures,
  warnings,
};
assertNoSecretLikeValues(evidence);

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
  warnings,
}, null, 2));
if (strict && failures.length) process.exit(1);

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
