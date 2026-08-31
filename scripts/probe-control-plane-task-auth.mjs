#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

const project = "veloce-agenticos-2026";
const region = "asia-south1";
const publicService = "veloce-public-provisioner";
const adapterService = "veloce-gcp-provisioner";
const appUrl = process.env.CONTROL_PLANE_APP_URL || "https://app.veloceos.cloud";
const startedAt = new Date(Date.now() - 5_000).toISOString();

const publicConfig = gcloudJson(["run", "services", "describe", publicService, "--project", project, "--region", region, "--format=json"]);
const adapterConfig = gcloudJson(["run", "services", "describe", adapterService, "--project", project, "--region", region, "--format=json"]);
const adapterUrl = env(publicConfig, "GCP_PROVISIONER_URL");
const adapterAudience = env(publicConfig, "GCP_PROVISIONER_AUDIENCE");
const applyEnabled = env(adapterConfig, "GCP_PROVISIONER_ALLOW_APPLY") === "1";

if (!adapterUrl || !adapterAudience) fail("control-plane queue probe is not configured");
if (applyEnabled) fail("refusing queue-authz probe while GCP_PROVISIONER_ALLOW_APPLY=1");
if (adapterAudience !== new URL(adapterUrl).origin) fail("public provisioner audience does not match its canonical adapter target URL");

const workerToken = gcloudText(["secrets", "versions", "access", "latest", "--project", project, "--secret", "control-plane-worker-token"]);
if (!workerToken) fail("unable to read the dispatcher worker token");

const response = await fetch(new URL("/api/internal/control-plane/task-authz", appUrl), {
  method: "POST",
  headers: { authorization: `Bearer ${workerToken}` },
  signal: AbortSignal.timeout(20_000),
}).catch(() => null);
const body = await response?.json().catch(() => null);
if (response?.status !== 202 || body?.ok !== true || typeof body?.taskId !== "string") {
  fail(`dispatcher did not queue the non-mutating authorization probe (HTTP ${response?.status || "network"})`);
}

const targetUrl = new URL("/queue-authz", adapterUrl).toString();
for (let attempt = 0; attempt < 18; attempt += 1) {
  const rows = gcloudJson([
    "logging", "read",
    `resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${adapterService}\" AND httpRequest.requestUrl=\"${targetUrl}\" AND timestamp>=\"${startedAt}\"`,
    "--project", project,
    "--limit", "20",
    "--order", "desc",
    "--format=json",
  ]);
  const matching = Array.isArray(rows) ? rows.find((row) => row?.httpRequest?.userAgent === "Google-Cloud-Tasks") : null;
  if (matching) {
    const status = Number(matching.httpRequest?.status || 0);
    const result = { ok: status === 200, taskId: body.taskId, adapterStatus: status, applyEnabled: false };
    console.log(JSON.stringify(result, null, 2));
    if (status === 200) process.exit(0);
    fail(`Cloud Tasks reached the adapter but received HTTP ${status}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 5_000));
}

fail("timed out waiting for the Cloud Tasks queue-authz request log");

function env(service, name) {
  const entry = service?.spec?.template?.spec?.containers?.[0]?.env?.find((item) => item?.name === name);
  return typeof entry?.value === "string" ? entry.value : "";
}

function gcloudJson(command) {
  const text = gcloudText(command);
  try { return JSON.parse(text); } catch { return {}; }
}

function gcloudText(command) {
  const result = spawnSync("gcloud", command, { encoding: "utf8", maxBuffer: 5_000_000 });
  if (result.status !== 0) fail(`gcloud command failed: ${command.slice(0, 4).join(" ")}`);
  return result.stdout.trim();
}

function fail(message) {
  console.error(`control-plane task-auth probe failed: ${message}`);
  process.exit(1);
}
