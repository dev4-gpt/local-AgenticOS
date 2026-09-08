#!/usr/bin/env node
// Reverts a disposable tenant's live Cloud Run traffic to a previously-good
// revision. Dry-run by default; --apply is required for any mutating
// gcloud/HTTP call. House style matches scripts/approve-client-manifest.mjs
// and scripts/deploy-client-manifest.mjs.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const configPath = required("--config");
const requestId = required("--request-id");
const explicitTarget = valueAfter("--to-revision");
const reason = valueAfter("--reason");
const apply = args.includes("--apply");
const appUrl = (valueAfter("--url") || process.env.PUBLIC_APP_URL || "https://app.veloceos.cloud").replace(/\/$/, "");

const absoluteConfigPath = path.resolve(process.cwd(), configPath);
if (!existsSync(absoluteConfigPath)) fail(`Config not found: ${absoluteConfigPath}`);
const manifest = JSON.parse(readFileSync(absoluteConfigPath, "utf8"));
const slug = sanitizeSlug(requiredField(manifest.clientSlug, "clientSlug"));
const gcp = manifest.gcp;
if (!gcp || typeof gcp !== "object") fail("Missing required object: gcp");
const projectId = requiredField(gcp.projectId, "gcp.projectId");
const region = requiredField(gcp.region, "gcp.region");
const serviceName = sanitizeServiceName(gcp.serviceName || `veloce-${slug}`);

if (!/^https:\/\//i.test(appUrl)) fail("--url must use HTTPS");

const describeResult = spawnSync("gcloud", [
  "run", "services", "describe", serviceName,
  "--project", projectId, "--region", region, "--format=json",
], { encoding: "utf8" });
if (describeResult.status !== 0) fail((describeResult.stderr || describeResult.stdout || "gcloud describe failed").trim().slice(-1000));
const service = JSON.parse(describeResult.stdout);
const currentRevision = Array.isArray(service.status?.traffic)
  ? service.status.traffic.find((t) => t.percent === 100)?.revisionName || service.status?.latestReadyRevisionName
  : service.status?.latestReadyRevisionName;
if (!currentRevision) fail("Unable to determine the revision currently serving traffic");

const listResult = spawnSync("gcloud", [
  "run", "revisions", "list", "--service", serviceName,
  "--project", projectId, "--region", region,
  "--sort-by=~metadata.creationTimestamp", "--format=json",
], { encoding: "utf8" });
if (listResult.status !== 0) fail((listResult.stderr || listResult.stdout || "gcloud revisions list failed").trim().slice(-1000));
const revisions = JSON.parse(listResult.stdout).map((r) => ({ name: r.metadata.name, createdAt: r.metadata.creationTimestamp }));

let targetRevision = explicitTarget;
if (!targetRevision) {
  const candidate = revisions.find((r) => r.name !== currentRevision);
  if (!candidate) fail("No prior revision found to roll back to -- deploy at least twice before rolling back");
  targetRevision = candidate.name;
}
if (!revisions.some((r) => r.name === targetRevision)) fail(`--to-revision ${targetRevision} is not a known revision of ${serviceName}`);
if (targetRevision === currentRevision) fail("Target revision is already serving 100% traffic -- nothing to roll back");

console.log(JSON.stringify({
  service: serviceName, project: projectId, region,
  revisions, currentRevision, targetRevision, dryRun: !apply,
}, null, 2));

if (!apply) {
  console.log("Dry run only. Re-run with --apply to move traffic.");
  process.exit(0);
}

const secret = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim() || "";
if (!secret) fail("CONTROL_PLANE_OPERATOR_SECRET is required. After using read, run: export CONTROL_PLANE_OPERATOR_SECRET");

const startResponse = await fetch(`${appUrl}/api/onboarding/rollback`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-control-plane-secret": secret },
  body: JSON.stringify({ action: "start", requestId, targetRevision, previousRevision: currentRevision, reason }),
  signal: AbortSignal.timeout(15_000),
}).catch(() => null);
const startBody = await startResponse?.json().catch(() => null);
if (!startResponse?.ok || !startBody?.ok || typeof startBody.runId !== "string") {
  fail(`rollback start was not accepted (${startResponse?.status || "network"})${typeof startBody?.error === "string" ? `: ${startBody.error}` : ""}`);
}
const runId = startBody.runId;
if (startBody.idempotent === true) {
  console.log(JSON.stringify({ runId, idempotent: true, status: startBody.status, priorStatus: startBody.priorStatus }, null, 2));
  console.log("Rollback already recorded for this target revision; traffic was not moved again.");
  process.exit(0);
}

const trafficResult = spawnSync("gcloud", [
  "run", "services", "update-traffic", serviceName,
  "--project", projectId, "--region", region,
  `--to-revisions=${targetRevision}=100`, "--quiet",
], { encoding: "utf8" });
const trafficOk = trafficResult.status === 0;

const confirmResult = spawnSync("gcloud", [
  "run", "services", "describe", serviceName,
  "--project", projectId, "--region", region,
  "--format=value(status.traffic[0].revisionName)",
], { encoding: "utf8" });
const confirmedRevision = confirmResult.status === 0 ? confirmResult.stdout.trim() : null;
const succeeded = trafficOk && confirmedRevision === targetRevision;

const resultResponse = await fetch(`${appUrl}/api/onboarding/rollback`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-control-plane-secret": secret },
  body: JSON.stringify({
    action: "record-result",
    requestId, runId,
    status: succeeded ? "succeeded" : "failed",
    currentTrafficRevision: confirmedRevision,
    evidence: { fromRevision: currentRevision, toRevision: targetRevision, confirmedRevision },
    errorMessage: succeeded ? undefined : (trafficResult.stderr || trafficResult.stdout || "traffic update did not confirm").trim().slice(-800),
  }),
  signal: AbortSignal.timeout(15_000),
}).catch(() => null);
const resultBody = await resultResponse?.json().catch(() => null);

console.log(JSON.stringify({
  runId, succeeded, fromRevision: currentRevision, toRevision: targetRevision,
  confirmedRevision, restoredAccountStatus: resultBody?.accountStatus ?? null,
}, null, 2));
if (!succeeded || !resultResponse?.ok || resultBody?.ok !== true) process.exit(1);

function sanitizeSlug(value) {
  const slug = value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!/^[a-z][a-z0-9-]{2,40}$/.test(slug)) fail(`Invalid clientSlug after sanitization: ${slug}`);
  return slug;
}

function sanitizeServiceName(value) {
  const name = value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(name)) fail(`Invalid Cloud Run service name: ${name}`);
  return name;
}

function requiredField(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) fail(`Missing required field: ${name}`);
  return value.trim();
}

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1].trim() : null;
}

function required(flag) {
  const value = valueAfter(flag);
  if (!value) fail(`${flag} is required`);
  return value;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
