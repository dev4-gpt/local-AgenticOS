#!/usr/bin/env node
// Promotes an already-verified staging image digest to production, after
// re-verifying its cosign signature against the pinned workflow OIDC
// identity. Dry-run by default; --apply is required for any mutating
// gcloud/HTTP call. House style matches scripts/control-plane-disposable-canary.mjs.
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const action = valueAfter("--action");
const apply = args.includes("--apply");
const project = valueAfter("--project") || "veloce-agenticos-2026";
const region = valueAfter("--region") || "asia-south1";
const impersonate = valueAfter("--impersonate-service-account") || process.env.VELOCE_CI_DEPLOYER_PRODUCTION;
const callbackUrl = valueAfter("--callback-url") || "https://app.veloceos.cloud/api/internal/platform-deploy";
const operatorSecretName = valueAfter("--operator-secret-name") || "control-plane-operator-secret";
const workflowIdentityRegexp = valueAfter("--certificate-identity-regexp")
  || "^https://github.com/dev4-gpt/local-AgenticOS/\\.github/workflows/control-plane-image-deploy\\.yml@refs/heads/.+$";

if (!["verify", "start", "deploy", "record-result"].includes(action)) fail("--action must be verify, start, deploy, or record-result");

if (action === "verify") await runVerify();
if (action === "start") await runStart();
if (action === "deploy") await runDeploy();
if (action === "record-result") await runRecordResult();

async function runVerify() {
  const stagingRunId = required("--staging-run-id");
  const lookup = await callback({ action: "status", runId: stagingRunId });
  if (!lookup.ok) finish({ ok: false, failures: ["unable to look up the staging run"], lookup });
  const run = lookup.run;
  if (run?.environment !== "staging" || run?.status !== "succeeded") {
    finish({ ok: false, failures: [`staging run ${stagingRunId} is not a succeeded staging deploy (status=${run?.status}, environment=${run?.environment})`] });
  }
  const imageDigest = run.image_digest;
  if (!imageDigest || !/@sha256:[0-9a-f]{64}$/i.test(imageDigest)) finish({ ok: false, failures: ["staging run has no immutable image digest recorded"] });
  if (!apply) finish({ ok: true, dryRun: true, stagingRunId, imageDigest, gitCommit: run.git_commit, next: "re-run with --apply to verify the cosign signature" });
  const result = spawnSync("cosign", [
    "verify", imageDigest,
    "--certificate-identity-regexp", workflowIdentityRegexp,
    "--certificate-oidc-issuer", "https://token.actions.githubusercontent.com",
  ], { encoding: "utf8" });
  if (result.status !== 0) finish({ ok: false, imageDigest, failures: [(result.stderr || result.stdout || "cosign verify failed").trim().slice(-1000)] });
  finish({ ok: true, verified: true, stagingRunId, imageDigest, gitCommit: run.git_commit, cloudRunService: run.evidence_bundle?.cloudRunService ?? null });
}

async function runStart() {
  const stagingRunId = required("--staging-run-id");
  const workflow = valueAfter("--workflow") || "control-plane-image-deploy";
  const gitCommit = required("--git-commit");
  const idempotencyKey = required("--idempotency-key");
  const result = await callback({ action: "start", workflow, gitCommit, triggeredBy: "ci-manual-promotion", idempotencyKey, promotedFromRunId: stagingRunId });
  finish(result);
}

async function runDeploy() {
  const service = required("--service");
  const image = required("--image");
  if (!/@sha256:[0-9a-f]{64}$/i.test(image)) fail("--image must reference an immutable digest (@sha256:...), not a mutable tag");
  if (!apply) finish({ ok: true, dryRun: true, service, image, next: "re-run with --apply to deploy" });
  const command = ["run", "deploy", service, "--project", project, "--region", region, "--image", image, "--quiet"];
  if (impersonate) command.push(`--impersonate-service-account=${impersonate}`);
  const result = spawnSync("gcloud", command, { encoding: "utf8" });
  if (result.status !== 0) finish({ ok: false, service, image, failures: [(result.stderr || result.stdout || "gcloud deploy failed").trim().slice(-1000)] });
  finish({ ok: true, applied: true, service, image });
}

async function runRecordResult() {
  const runId = required("--run-id");
  const status = required("--status");
  const imageDigest = valueAfter("--image-digest");
  const cloudRunRevision = valueAfter("--cloud-run-revision");
  const errorCode = valueAfter("--error-code");
  const errorMessage = valueAfter("--error-message");
  const result = await callback({ action: "record-result", runId, status, imageDigest, cloudRunRevision, errorCode, errorMessage });
  finish(result);
}

async function callback(body) {
  if (!apply && body.action !== "status") return { ok: true, dryRun: true, body, next: "re-run with --apply to call the platform-deploy route" };
  const secretResult = spawnSync("gcloud", [
    "secrets", "versions", "access", "latest",
    "--project", project, "--secret", operatorSecretName,
    ...(impersonate ? [`--impersonate-service-account=${impersonate}`] : []),
  ], { encoding: "utf8" });
  if (secretResult.status !== 0 || !secretResult.stdout.trim()) {
    return { ok: false, failures: [`unable to obtain the operator secret: ${(secretResult.stderr || "no stderr").trim().slice(-800)}`] };
  }
  const secret = secretResult.stdout.trim();
  const response = await fetch(callbackUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-control-plane-secret": secret },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  const parsed = await response?.json().catch(() => null);
  if (!response || response.status !== 200 || parsed?.ok !== true) {
    return { ok: false, status: response?.status ?? 503, response: parsed, failures: ["platform-deploy callback did not confirm success"] };
  }
  return { ok: true, ...parsed };
}

function required(flag) {
  const value = valueAfter(flag);
  if (!value) fail(`${flag} is required`);
  return value;
}

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1].trim() : null;
}

function finish(value) {
  console.log(JSON.stringify(value, null, 2));
  process.exit(value.ok ? 0 : 1);
}

function fail(message) {
  finish({ ok: false, failures: [message] });
}
