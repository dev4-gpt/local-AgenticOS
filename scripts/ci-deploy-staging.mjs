#!/usr/bin/env node
// Deploys an already-built, already-pushed, already-signed image digest to
// the staging control-plane Cloud Run services, and records the attempt
// durably via the platform-deploy callback route. Dry-run by default;
// --apply is required for any mutating gcloud/HTTP call. House style
// matches scripts/control-plane-disposable-canary.mjs.
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const action = valueAfter("--action");
const apply = args.includes("--apply");
const project = valueAfter("--project") || "veloce-agenticos-2026";
const region = valueAfter("--region") || "asia-south1";
const impersonate = valueAfter("--impersonate-service-account") || process.env.VELOCE_CI_DEPLOYER_STAGING;
const callbackUrl = valueAfter("--callback-url") || "https://app.veloceos.cloud/api/internal/platform-deploy";
const operatorSecretName = valueAfter("--operator-secret-name") || "control-plane-operator-secret-staging";

if (!["start", "deploy", "record-result"].includes(action)) fail("--action must be start, deploy, or record-result");

if (action === "start") await runStart();
if (action === "deploy") await runDeploy();
if (action === "record-result") await runRecordResult();

async function runStart() {
  const workflow = required("--workflow");
  const gitCommit = required("--git-commit");
  if (!/^[0-9a-f]{40}$/i.test(gitCommit)) fail("--git-commit must be a full 40-character commit SHA");
  const idempotencyKey = required("--idempotency-key");
  const triggeredBy = valueAfter("--triggered-by") || "ci-auto";
  const promotedFromRunId = valueAfter("--promoted-from-run-id") || null;
  const result = await callback({ action: "start", workflow, gitCommit, triggeredBy, idempotencyKey, promotedFromRunId });
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
  if (!apply) return { ok: true, dryRun: true, body, next: "re-run with --apply to call the platform-deploy route" };
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
