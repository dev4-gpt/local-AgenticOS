#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import process from "node:process";

const args = process.argv.slice(2);
const baseUrl = required("--url").replace(/\/$/, "");
const cookieFile = required("--cookie-file");
const runArtifacts = !args.includes("--workflow-only");
const cookie = await readCookie(cookieFile);
const failures = [];
let workflowId = null;
let artifactId = null;

try {
  const capabilities = await api("/api/capabilities");
  expect(capabilities.status === 200, `capabilities request failed (${capabilities.status})`);

  const title = `Authenticated runtime acceptance ${Date.now()}`;
  const created = await api("/api/client-runtime/workflows", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      surface: "orchestrate",
      operation: "plan",
      title,
      goal: "Verify the hosted tenant workflow runner and its four bounded completion steps.",
    }),
  });
  const createdBody = await safeJson(created);
  expect(created.status === 202 && isUuid(createdBody?.workflowId), `workflow creation failed (${created.status})`);
  workflowId = isUuid(createdBody?.workflowId) ? createdBody.workflowId : null;

  if (workflowId) {
    const completed = await waitForWorkflow(workflowId);
    expect(completed !== null, "workflow did not reach a terminal state within 90 seconds");
    if (completed) {
      const execution = completed.metadata?.execution;
      const steps = Array.isArray(completed.metadata?.steps) ? completed.metadata.steps : [];
      expect(execution?.status === "completed", `workflow ended as ${String(execution?.status ?? "unknown")}`);
      expect(execution?.completedSteps === 4, `workflow completed step count was ${String(execution?.completedSteps ?? "unknown")}`);
      expect(steps.length === 4 && steps.every((step) => step?.status === "done"), "workflow did not persist four completed steps");
    }
  }

  if (runArtifacts) await verifyArtifactRoundTrip();
} finally {
  if (artifactId) {
    const deletedArtifact = await api(`/api/client-runtime/artifacts/${artifactId}`, { method: "DELETE" });
    expect(deletedArtifact.status === 200, `artifact cleanup failed (${deletedArtifact.status})`);
  }
  if (workflowId) {
    const deletedWorkflow = await api(`/api/client-runtime/workflows?id=${encodeURIComponent(workflowId)}`, { method: "DELETE" });
    expect(deletedWorkflow.status === 200, `workflow cleanup failed (${deletedWorkflow.status})`);
  }
}

if (failures.length) {
  console.error("Authenticated client runtime verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Authenticated client runtime verification passed for ${baseUrl}${runArtifacts ? " (workflow + artifact)" : " (workflow only)"}.`);

async function verifyArtifactRoundTrip() {
  const bytes = new TextEncoder().encode("veloce-client-runtime-acceptance\n");
  const created = await api("/api/client-runtime/artifacts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileName: "runtime-acceptance.txt", contentType: "text/plain", byteSize: bytes.byteLength }),
  });
  const createdBody = await safeJson(created);
  expect(created.status === 201 && isUuid(createdBody?.artifactId), `artifact allocation failed (${created.status})`);
  artifactId = isUuid(createdBody?.artifactId) ? createdBody.artifactId : null;
  const uploadUrl = typeof createdBody?.uploadUrl === "string" ? createdBody.uploadUrl : null;
  const uploadHeaders = createdBody?.uploadHeaders && typeof createdBody.uploadHeaders === "object" ? createdBody.uploadHeaders : {};
  expect(Boolean(uploadUrl), "artifact allocation did not return a signed upload URL");
  if (!artifactId || !uploadUrl) return;

  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: uploadHeaders,
    body: bytes,
    cache: "no-store",
  }).catch(() => null);
  expect(upload?.ok === true, `signed artifact upload failed (${upload?.status ?? 503})`);
  if (upload?.ok !== true) return;

  const completed = await api(`/api/client-runtime/artifacts/${artifactId}/complete`, { method: "POST" });
  expect(completed.status === 200, `artifact completion failed (${completed.status})`);
  if (completed.status !== 200) return;

  const download = await api(`/api/client-runtime/artifacts/${artifactId}/download`, { redirect: "manual" });
  const signedDownloadUrl = download.headers.get("location");
  expect(download.status === 302 && Boolean(signedDownloadUrl), `signed artifact download was not issued (${download.status})`);
  if (!signedDownloadUrl) return;
  const downloaded = await fetch(signedDownloadUrl, { cache: "no-store" }).catch(() => null);
  const downloadedBytes = downloaded ? new Uint8Array(await downloaded.arrayBuffer()) : null;
  expect(downloaded?.ok === true && downloadedBytes && equalBytes(downloadedBytes, bytes), "signed artifact download did not match uploaded bytes");
}

async function waitForWorkflow(id) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const response = await api("/api/client-runtime/workflows?surface=orchestrate");
    const body = await safeJson(response);
    const workflow = Array.isArray(body?.workflows) ? body.workflows.find((item) => item?.id === id) : null;
    const status = workflow?.metadata?.execution?.status;
    if (status === "completed" || status === "failed") return workflow;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  return null;
}

async function api(pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { accept: "application/json", cookie, ...(options.headers || {}) },
    redirect: options.redirect || "manual",
    cache: "no-store",
  }).catch(() => new Response(null, { status: 503 }));
}

async function safeJson(response) {
  return response.json().catch(() => null);
}

async function readCookie(filePath) {
  const mode = (await stat(filePath)).mode & 0o777;
  if ((mode & 0o077) !== 0) fail("--cookie-file must not be readable by group or other users");
  const value = (await readFile(filePath, "utf8")).trim();
  if (!value || !/\bveloce_access_token=/.test(value)) fail("--cookie-file must contain the runtime access cookie");
  return value.replace(/^cookie:\s*/i, "").replace(/^['"]|['"]$/g, "").trim();
}

function equalBytes(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function required(flag) {
  const index = args.indexOf(flag);
  const value = index >= 0 ? args[index + 1] : null;
  if (!value) fail(`${flag} is required`);
  return value.trim();
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
