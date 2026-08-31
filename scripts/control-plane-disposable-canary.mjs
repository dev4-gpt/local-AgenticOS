#!/usr/bin/env node
// The only mutable provisioning drill this tool permits is the tracked,
// prepare-only canary manifest. It deliberately cannot target a client tenant.
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);
const mode = valueAfter("--mode") || "inventory";
const manifestPath = valueAfter("--manifest") || "client-blueprints/control-plane-disposable-canary.gcp.json";
const apply = args.includes("--apply");
const failures = [];

if (!["inventory", "preflight", "start", "status", "cleanup", "record-cleanup"].includes(mode)) fail("--mode must be inventory, preflight, start, status, cleanup, or record-cleanup");
if (apply && !["start", "cleanup", "record-cleanup"].includes(mode)) fail("--apply is only valid for start, cleanup, or record-cleanup");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const inventory = deriveInventory(manifest);
validateManifest(manifest, inventory);
if (failures.length) finish({ ok: false, mode, failures });

if (mode === "inventory") finish({ ok: true, mode, inventory });
if (mode === "preflight") {
  const checks = readChecks(inventory);
  const roleCheck = adapterRoleCheck(inventory);
  const clean = checks.every((check) => check.absent === true) && roleCheck.present === true;
  finish({ ok: clean, mode, inventory, checks, roleCheck, failures: clean ? [] : ["canary resource collision, unreadable GCP state, or missing adapter provisioner role"] });
}

if (mode === "status") finish(await readStatus());

if (mode === "start") {
  if (!apply) finish({
    ok: true,
    mode,
    dryRun: true,
    inventory,
    next: `Re-run with --apply --confirm-slug ${inventory.slug} only after the adapter has been explicitly enabled for this bounded canary window.`,
  });
  if (valueAfter("--confirm-slug") !== inventory.slug) fail(`start requires --confirm-slug ${inventory.slug}`);
  const checks = readChecks(inventory);
  const roleCheck = adapterRoleCheck(inventory);
  if (!checks.every((check) => check.absent === true) || roleCheck.present !== true) {
    finish({ ok: false, mode, inventory, checks, roleCheck, failures: ["canary preflight failed; refusing to dispatch"] });
  }
  finish(await startCanary());
}

if (!apply) {
  finish({
    ok: true,
    mode,
    dryRun: true,
    inventory,
    next: `Re-run with --apply --confirm-slug ${inventory.slug} only after the run callback reports a succeeded prepare phase.`,
  });
}
if (valueAfter("--confirm-slug") !== inventory.slug) fail(`cleanup requires --confirm-slug ${inventory.slug}`);

const before = readChecks(inventory);
if (before.some((check) => check.absent === null)) finish({ ok: false, mode, inventory, checks: before, failures: ["cannot prove resource state; refusing cleanup"] });
if (mode === "cleanup" || mode === "record-cleanup") removeResources(inventory, before);
const after = readChecks(inventory);
if (!after.every((check) => check.absent === true)) finish({ ok: false, mode, inventory, checks: after, failures: ["cleanup did not prove every exact canary resource is absent"] });

const cleanupEvidence = {
  schemaVersion: 1,
  canarySlug: inventory.slug,
  verifiedAt: new Date().toISOString(),
  resources: after.map(({ kind, name, absent }) => ({ kind, name, absent })),
};
if (mode === "record-cleanup") await recordCleanup(cleanupEvidence);
finish({ ok: true, mode, applied: true, inventory, cleanupEvidence });

function validateManifest(value, expected) {
  const canary = value?.canary;
  const gcp = value?.gcp;
  if (value?.schemaVersion !== 1 || canary?.disposable !== true) failures.push("manifest must be a schemaVersion 1 disposable canary");
  if (value?.provisioning?.phase !== "prepare") failures.push("canary must be prepare-only");
  if (value?.providerCallsEnabled !== false) failures.push("canary must keep provider calls disabled");
  if (value?.approved !== true || value?.acknowledgeClientSafeRuntime !== true) failures.push("canary must retain explicit approval flags");
  if (!String(value?.clientSlug || "").startsWith("cp-canary-")) failures.push("canary slug must begin cp-canary-");
  if (gcp?.projectId !== "veloce-agenticos-2026" || gcp?.region !== "asia-south1" || gcp?.artifactRegistryRepository !== "veloce") failures.push("canary project, region, or repository is not allowlisted");
  if (gcp?.serviceName || gcp?.workspaceJobName || gcp?.visualQaJobName || gcp?.runtimeServiceAccount || gcp?.storageBucket) failures.push("canary must use only deterministic default resource names");
  if (JSON.stringify(canonicalInventory(canary?.expectedInventory)) !== JSON.stringify(canonicalInventory(expected.resources))) failures.push("manifest expectedInventory does not match deterministic canary resources");
}

function deriveInventory(value) {
  const slug = value.clientSlug;
  const project = value.gcp.projectId;
  const region = value.gcp.region;
  const accountId = `veloce-${shorten(slug, 14)}-run`;
  return {
    slug,
    project,
    region,
    resources: {
      serviceAccount: `${accountId}@${project}.iam.gserviceaccount.com`,
      storageBucket: `${project}-veloce-${slug}`,
      taskQueue: `veloce-${slug}`,
      secrets: [`veloce-${slug}-client-credential-inbox`],
      cloudRunService: null,
      cloudRunJobs: [],
    },
  };
}

function canonicalInventory(value) {
  return {
    serviceAccount: value?.serviceAccount || null,
    storageBucket: value?.storageBucket || null,
    taskQueue: value?.taskQueue || null,
    secrets: Array.isArray(value?.secrets) ? [...value.secrets].sort() : [],
    cloudRunService: value?.cloudRunService || null,
    cloudRunJobs: Array.isArray(value?.cloudRunJobs) ? [...value.cloudRunJobs].sort() : [],
  };
}

function readChecks(value) {
  const { project, region, resources } = value;
  return [
    state("serviceAccount", resources.serviceAccount, ["iam", "service-accounts", "describe", resources.serviceAccount, "--project", project]),
    state("storageBucket", resources.storageBucket, ["storage", "buckets", "describe", `gs://${resources.storageBucket}`, "--project", project]),
    state("taskQueue", resources.taskQueue, ["tasks", "queues", "describe", resources.taskQueue, "--project", project, "--location", region]),
    ...resources.secrets.map((name) => state("secret", name, ["secrets", "describe", name, "--project", project])),
  ];
}

function state(kind, name, command) {
  const result = spawnSync("gcloud", command, { encoding: "utf8" });
  if (result.status === 0) return { kind, name, absent: false };
  const detail = `${result.stderr || ""}\n${result.stdout || ""}`.toLowerCase();
  if (/not[ _-]found|does not exist|status=404|\b404\b/.test(detail)) return { kind, name, absent: true };
  return { kind, name, absent: null, error: detail.trim().slice(-500) || "gcloud command failed" };
}

function adapterRoleCheck(value) {
  const identity = `serviceAccount:veloce-gcp-provisioner-run@${value.project}.iam.gserviceaccount.com`;
  const role = `projects/${value.project}/roles/veloceTenantProvisioner`;
  const result = spawnSync("gcloud", ["projects", "get-iam-policy", value.project, "--format=json"], { encoding: "utf8" });
  if (result.status !== 0) return { role, identity, present: null, error: `${result.stderr || result.stdout || "gcloud command failed"}`.trim().slice(-500) };
  try {
    const policy = JSON.parse(result.stdout);
    const members = policy.bindings?.find((binding) => binding.role === role)?.members || [];
    return { role, identity, present: members.includes(identity) };
  } catch {
    return { role, identity, present: null, error: "unable to parse project IAM policy" };
  }
}

function removeResources(value, checks) {
  const { project, region, resources } = value;
  const present = new Set(checks.filter((check) => check.absent === false).map((check) => `${check.kind}:${check.name}`));
  if (present.has(`storageBucket:${resources.storageBucket}`)) {
    const objects = spawnSync("gcloud", ["storage", "ls", "--recursive", `gs://${resources.storageBucket}/**`], { encoding: "utf8" });
    if (objects.status !== 0 || objects.stdout.trim()) fail("refusing to delete a non-empty or unreadable canary bucket");
    run(["storage", "buckets", "delete", `gs://${resources.storageBucket}`, "--project", project, "--quiet"]);
  }
  if (present.has(`taskQueue:${resources.taskQueue}`)) run(["tasks", "queues", "delete", resources.taskQueue, "--project", project, "--location", region, "--quiet"]);
  for (const secret of resources.secrets) if (present.has(`secret:${secret}`)) run(["secrets", "delete", secret, "--project", project, "--quiet"]);
  if (present.has(`serviceAccount:${resources.serviceAccount}`)) run(["iam", "service-accounts", "delete", resources.serviceAccount, "--project", project, "--quiet"]);
}

async function recordCleanup(cleanupEvidence) {
  const url = canaryUrl("--record-url");
  const runId = valueAfter("--run-id");
  const onboardingId = valueAfter("--onboarding-id");
  if (!url || !runId || !onboardingId) fail("record-cleanup requires --record-url, --run-id, and --onboarding-id");
  const result = await operatorPost(url, { action: "record_cleanup", runId, onboardingId, cleanupEvidence });
  if (!result.ok || result.body?.status !== "rolled_back") fail(`cleanup evidence recording failed with HTTP ${result.status}`);
}

async function startCanary() {
  const url = canaryUrl("--start-url");
  const result = await operatorPost(url, { action: "start", manifest });
  const runId = typeof result.body?.runId === "string" ? result.body.runId : null;
  const onboardingId = typeof result.body?.onboardingId === "string" ? result.body.onboardingId : null;
  if (!result.ok || result.body?.ok !== true || result.body?.status !== "queued" || !runId || !onboardingId) {
    return { ok: false, mode, inventory, status: result.status, response: result.body, failures: ["canary dispatch was not queued"] };
  }
  return { ok: true, mode, applied: true, inventory, runId, onboardingId, status: "queued" };
}

async function readStatus() {
  const url = canaryUrl("--status-url");
  const runId = valueAfter("--run-id");
  const onboardingId = valueAfter("--onboarding-id");
  if (!runId || !onboardingId) fail("status requires --status-url, --run-id, and --onboarding-id");
  const result = await operatorPost(url, { action: "status", runId, onboardingId });
  if (!result.ok || result.body?.ok !== true) return { ok: false, mode, status: result.status, response: result.body, failures: ["canary status lookup failed"] };
  return { ok: true, mode, response: result.body };
}

function canaryUrl(flag) {
  const url = valueAfter(flag);
  if (url !== "https://app.veloceos.cloud/api/internal/control-plane/canary") {
    fail(`${flag} must be https://app.veloceos.cloud/api/internal/control-plane/canary`);
  }
  return url;
}

async function operatorPost(url, body) {
  const secretResult = spawnSync("gcloud", ["secrets", "versions", "access", "latest", "--project", inventory.project, "--secret", "control-plane-operator-secret"], { encoding: "utf8" });
  if (secretResult.status !== 0 || !secretResult.stdout.trim()) fail("unable to obtain the operator secret");
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-control-plane-secret": secretResult.stdout.trim() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  const status = response?.status || 503;
  const result = await response?.json().catch(() => null);
  return { ok: response?.ok === true, status, body: result && typeof result === "object" ? result : null };
}

function run(command) {
  const result = spawnSync("gcloud", command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) fail(`cleanup command failed: gcloud ${command.slice(0, 3).join(" ")}`);
}

function shorten(value, max) {
  return value.length <= max ? value : value.slice(0, max).replace(/-$/g, "");
}

function valueAfter(flag) {
  const direct = args.find((item) => item.startsWith(`${flag}=`));
  if (direct) return direct.slice(flag.length + 1).trim() || null;
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1].trim() : null;
}

function fail(message) {
  finish({ ok: false, mode, failures: [message] });
}

function finish(value) {
  console.log(JSON.stringify(value, null, 2));
  process.exit(value.ok ? 0 : 1);
}
