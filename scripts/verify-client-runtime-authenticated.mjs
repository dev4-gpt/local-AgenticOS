#!/usr/bin/env node
import { readFile, stat, writeFile } from "node:fs/promises";
import process from "node:process";

const args = process.argv.slice(2);
const baseUrl = required("--url").replace(/\/$/, "");
const cookieFile = required("--cookie-file");
const runArtifacts = !args.includes("--workflow-only");
const runWorkspaceSmoke = args.includes("--workspace-smoke");
const runVisualQaSmoke = args.includes("--visual-qa-smoke");
const runProviderSmoke = args.includes("--provider-smoke");
const runIntentSmoke = args.includes("--intent-smoke");
let cookie = await readCookie(cookieFile);
const failures = [];
let workflowId = null;
let artifactId = null;
let visualQaArtifactId = null;

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
  if (runProviderSmoke) await verifyProviderCompression();
  if (runIntentSmoke) await verifyIntentRouting();
  if (runWorkspaceSmoke) await verifyWorkspaceExecution();
  if (runVisualQaSmoke) await verifyVisualQa();
} finally {
  if (artifactId) {
    const deletedArtifact = await api(`/api/client-runtime/artifacts/${artifactId}`, { method: "DELETE" });
    expect(deletedArtifact.status === 200, `artifact cleanup failed (${deletedArtifact.status})`);
  }
  if (visualQaArtifactId) {
    const deletedArtifact = await api(`/api/client-runtime/artifacts/${visualQaArtifactId}`, { method: "DELETE" });
    expect(deletedArtifact.status === 200, `visual QA artifact cleanup failed (${deletedArtifact.status})`);
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

console.log(`Authenticated client runtime verification passed for ${baseUrl}${runArtifacts ? " (workflow + artifact)" : " (workflow only)"}${runProviderSmoke ? " + provider compression" : ""}${runIntentSmoke ? " + intent routing" : ""}${runWorkspaceSmoke ? " + workspace execution" : ""}${runVisualQaSmoke ? " + visual QA" : ""}.`);

async function verifyIntentRouting() {
  const idempotencyKey = `intent-acceptance-${Date.now()}`;
  const request = "Create a short workflow plan for reviewing our next product launch.";
  const payload = { request, surface: "chat", idempotencyKey };
  const first = await api("/api/client-runtime/intent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const firstBody = await safeJson(first);
  expect(first.status === 202 && isUuid(firstBody?.planId), `intent plan enqueue failed (${first.status})`);
  const replay = await api("/api/client-runtime/intent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const replayBody = await safeJson(replay);
  expect(replay.status === 202 && replayBody?.planId === firstBody?.planId, "intent replay did not preserve the original plan identity");
  if (!isUuid(firstBody?.planId)) return;
  const plan = await waitForIntentPlan(firstBody.planId);
  expect(plan?.status === "dispatched", `low-risk intent did not dispatch (${String(plan?.status ?? "unknown")})`);
  expect(plan?.playbookId === "workflow-planning", `unexpected low-risk playbook ${String(plan?.playbookId ?? "missing")}`);
  expect(plan?.evidence && typeof plan.evidence.requestHash === "string", "intent plan omitted redacted request evidence");
  expect(!JSON.stringify(plan?.evidence ?? {}).includes(request), "intent evidence contained the raw request");

  const ambiguous = await api("/api/client-runtime/intent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request: "Help me with this", surface: "chat", idempotencyKey: `intent-ambiguous-${Date.now()}` }) });
  const ambiguousBody = await safeJson(ambiguous);
  expect(ambiguous.status === 202 && isUuid(ambiguousBody?.planId), `ambiguous intent enqueue failed (${ambiguous.status})`);
  if (isUuid(ambiguousBody?.planId)) {
    const ambiguousPlan = await waitForIntentPlan(ambiguousBody.planId);
    expect(ambiguousPlan?.status === "needs_clarification", `ambiguous intent did not ask for clarification (${String(ambiguousPlan?.status ?? "unknown")})`);
    expect(typeof ambiguousPlan?.clarificationQuestion === "string", "ambiguous intent omitted its focused question");
    expect(!ambiguousPlan?.dispatchedJobId, "ambiguous intent dispatched work");
  }

  const gated = await api("/api/client-runtime/intent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request: "Run a security assessment against a staging target", surface: "chat", idempotencyKey: `intent-gated-${Date.now()}` }) });
  const gatedBody = await safeJson(gated);
  expect(gated.status === 202 && isUuid(gatedBody?.planId), `gated intent enqueue failed (${gated.status})`);
  if (isUuid(gatedBody?.planId)) {
    const gatedPlan = await waitForIntentPlan(gatedBody.planId);
    expect(gatedPlan?.status === "needs_clarification" || gatedPlan?.status === "blocked", `gated intent was not held (${String(gatedPlan?.status ?? "unknown")})`);
    expect(!gatedPlan?.dispatchedJobId, "gated intent dispatched work");
  }
}

async function waitForIntentPlan(id) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const response = await api(`/api/client-runtime/intent?planId=${encodeURIComponent(id)}`);
    const body = await safeJson(response);
    const plan = body?.plan;
    if (plan?.status === "dispatched" || plan?.status === "ready" || plan?.status === "needs_clarification" || plan?.status === "blocked") return plan;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  return null;
}

async function verifyProviderCompression() {
  const repeatedContext = "Reusable tenant-safe context for compression evidence. ".repeat(18);
  const payload = {
    provider: "openrouter",
    prompt: "Return exactly the word compression-ok.",
    history: [
      { role: "system", content: "Follow the approved provider policy and preserve the current request." },
      { role: "assistant", content: repeatedContext },
      { role: "assistant", content: repeatedContext },
      { role: "user", content: "Keep citations https://example.com/reference and identifier job-compression-acceptance-1." },
    ],
    idempotencyKey: `compression-acceptance-${Date.now()}`,
  };
  const first = await api("/api/client-runtime/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const firstBody = await safeJson(first);
  expect(first.status === 202 && isUuid(firstBody?.jobId), `provider compression enqueue failed (${first.status})`);
  const replay = await api("/api/client-runtime/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const replayBody = await safeJson(replay);
  expect(replay.status === 202 && replayBody?.jobId === firstBody?.jobId, "provider compression replay did not preserve the original job identity");
  if (!isUuid(firstBody?.jobId)) return;

  const job = await waitForJob(firstBody.jobId);
  expect(job?.status === "succeeded", `provider compression job ended as ${String(job?.status ?? "unknown")}: ${String(job?.error_code ?? "")}`);
  const output = job?.output_metadata && typeof job.output_metadata === "object" ? job.output_metadata : {};
  const compression = output.compression && typeof output.compression === "object" ? output.compression : null;
  expect(Boolean(compression), "provider job did not persist compression evidence");
  expect(compression?.policyVersion === "v96-context-compression-1", "provider job persisted an unexpected compression policy version");
  expect(Number(compression?.originalChars) > 0 && Number(compression?.compressedChars) > 0, "provider compression evidence omitted character counts");
  expect(Number(compression?.compressedChars) < Number(compression?.originalChars), "provider compression did not reduce repeated context");
  expect(typeof compression?.inputHash === "string" && /^[a-f0-9]{64}$/.test(compression.inputHash), "provider compression evidence omitted a redacted input hash");
  expect(!JSON.stringify(compression).includes(repeatedContext), "provider compression evidence contained raw context");
}

async function verifyVisualQa() {
  const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAF0lEQVR42mNkYPj/n4GBgYGJAAAEAQEAH0ECAwAAAABJRU5ErkJggg==", "base64"));
  const created = await api("/api/client-runtime/artifacts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileName: "visual-qa-acceptance.png", contentType: "image/png", byteSize: png.byteLength }),
  });
  const createdBody = await safeJson(created);
  visualQaArtifactId = isUuid(createdBody?.artifactId) ? createdBody.artifactId : null;
  const uploadUrl = typeof createdBody?.uploadUrl === "string" ? createdBody.uploadUrl : null;
  expect(created.status === 201 && visualQaArtifactId && uploadUrl, `visual QA artifact allocation failed (${created.status})`);
  if (!visualQaArtifactId || !uploadUrl) return;
  const upload = await fetch(uploadUrl, { method: "PUT", headers: createdBody.uploadHeaders ?? {}, body: png, cache: "no-store" }).catch(() => null);
  expect(upload?.ok === true, `visual QA artifact upload failed (${upload?.status ?? 503})`);
  if (upload?.ok !== true) return;
  const completed = await api(`/api/client-runtime/artifacts/${visualQaArtifactId}/complete`, { method: "POST" });
  expect(completed.status === 200, `visual QA artifact completion failed (${completed.status})`);
  if (completed.status !== 200) return;

  const idempotencyKey = `visual-qa-acceptance-${Date.now()}`;
  const payload = { artifactId: visualQaArtifactId, frames: [Buffer.from(png).toString("base64")], maxFrames: 1, idempotencyKey };
  const first = await api("/api/client-runtime/visual-qa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const firstBody = await safeJson(first);
  expect(first.status === 202 && isUuid(firstBody?.jobId), `visual QA enqueue failed (${first.status})`);
  const replay = await api("/api/client-runtime/visual-qa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const replayBody = await safeJson(replay);
  expect(replay.status === 202 && replayBody?.jobId === firstBody?.jobId, "visual QA replay did not preserve the original job identity");
  if (!isUuid(firstBody?.jobId)) return;

  const job = await waitForJob(firstBody.jobId);
  expect(job?.status === "succeeded", `visual QA job ended as ${String(job?.status ?? "unknown")}: ${String(job?.error_code ?? "")}`);
  const output = job?.output_metadata && typeof job.output_metadata === "object" ? job.output_metadata : {};
  expect(output.status === "review" || output.status === "passed", `visual QA output status was ${String(output.status ?? "missing")}`);
  expect(isUuid(output.reportId), "visual QA did not persist a report id");
  expect(Array.isArray(output.traitEvidence) && output.traitEvidence.length >= 10, "visual QA did not persist trait evidence");
  expect(output.failureDisposition === "review" || output.failureDisposition === "succeeded", "visual QA failure disposition was not review-safe");
  const listed = await api(`/api/client-runtime/visual-qa?artifactId=${encodeURIComponent(visualQaArtifactId)}`);
  const listedBody = await safeJson(listed);
  expect(listed.status === 200 && Array.isArray(listedBody?.reports) && listedBody.reports.some((report) => report?.id === output.reportId), "visual QA report was not durable or tenant-readable");
}

async function waitForJob(id) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const response = await api(`/api/client-runtime/jobs/${id}`);
    const body = await safeJson(response);
    const job = body?.job;
    if (job?.status === "succeeded" || job?.status === "failed" || job?.status === "cancelled") return job;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  return null;
}

async function verifyWorkspaceExecution() {
  const title = `Web Studio execution acceptance ${Date.now()}`;
  const created = await api("/api/client-runtime/executions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      surface: "web-studio",
      title,
      artifactIntent: "preview",
      goal: "Create a complete, self-contained HTML landing page with one heading that says Veloce hosted workspace acceptance. Use inline CSS only and return only the requested HTML fence.",
      idempotencyKey: `workspace-acceptance-${Date.now()}`,
    }),
  });
  const createdBody = await safeJson(created);
  expect(created.status === 202 && isUuid(createdBody?.jobId), `workspace execution enqueue failed (${created.status}: ${String(createdBody?.error ?? "no error")})`);
  if (!isUuid(createdBody?.jobId)) return;

  const execution = await waitForWorkspaceExecution(createdBody.jobId);
  expect(execution !== null, "workspace execution did not reach a terminal state within 150 seconds");
  if (!execution) return;
  expect(execution.status === "succeeded", `workspace execution ended as ${String(execution.status ?? "unknown")}: ${String(execution.errorCode ?? "")}`);
  expect(Array.isArray(execution.terminalEvents) && execution.terminalEvents.length >= 3, "workspace execution did not retain a terminal trail");
  expect(isUuid(execution.artifactId), "workspace execution did not retain a tenant artifact");
  expect(typeof execution.previewHtml === "string" && /veloce hosted workspace acceptance/i.test(execution.previewHtml), "workspace execution did not retain the expected preview output");
  if (!isUuid(execution.artifactId)) return;

  const artifact = await api(`/api/client-runtime/artifacts?id=${encodeURIComponent(execution.artifactId)}`);
  const artifactBody = await safeJson(artifact);
  const downloadUrl = typeof artifactBody?.downloadUrl === "string" ? artifactBody.downloadUrl : null;
  expect(artifact.status === 200 && Boolean(downloadUrl), `workspace artifact signed download failed (${artifact.status})`);
  if (!downloadUrl) return;
  const downloaded = await fetch(downloadUrl, { cache: "no-store" }).catch(() => null);
  const html = downloaded?.ok ? await downloaded.text().catch(() => "") : "";
  expect(downloaded?.ok === true && /veloce hosted workspace acceptance/i.test(html), "workspace artifact download did not contain the expected preview output");
}

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

async function waitForWorkspaceExecution(id) {
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    const response = await api("/api/client-runtime/executions?surface=web-studio");
    const body = await safeJson(response);
    const execution = Array.isArray(body?.executions) ? body.executions.find((item) => item?.id === id) : null;
    if (execution?.status === "succeeded" || execution?.status === "failed" || execution?.status === "cancelled") return execution;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  return null;
}

async function api(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { accept: "application/json", cookie, ...(options.headers || {}) },
    redirect: options.redirect || "manual",
    cache: "no-store",
  }).catch(() => new Response(null, { status: 503 }));
  await persistRotatedCookies(response);
  return response;
}

async function safeJson(response) {
  return response.json().catch(() => null);
}

async function readCookie(filePath) {
  const mode = (await stat(filePath)).mode & 0o777;
  if ((mode & 0o077) !== 0) fail("--cookie-file must not be readable by group or other users");
  const value = (await readFile(filePath, "utf8")).trim();
  if (!value || !/\bveloce_access_token=/.test(value) || !/\bveloce_refresh_token=/.test(value)) fail("--cookie-file must contain both runtime session cookies");
  return value.replace(/^cookie:\s*/i, "").replace(/^['"]|['"]$/g, "").trim();
}

async function persistRotatedCookies(response) {
  const headers = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : splitSetCookieHeader(response.headers.get("set-cookie") ?? "");
  if (!headers.length) return;

  const jar = new Map();
  for (const pair of cookie.split(";")) {
    const separator = pair.indexOf("=");
    if (separator > 0) jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
  for (const header of headers) {
    const match = /^(veloce_(?:access|refresh)_token)=([^;]*)/i.exec(header.trim());
    if (match && match[2]) jar.set(match[1], match[2]);
  }
  if (!jar.has("veloce_access_token") || !jar.has("veloce_refresh_token")) return;
  const nextCookie = `veloce_access_token=${jar.get("veloce_access_token")}; veloce_refresh_token=${jar.get("veloce_refresh_token")}`;
  if (nextCookie === cookie) return;
  cookie = nextCookie;
  await writeFile(cookieFile, `${cookie}\n`, { mode: 0o600 });
}

function splitSetCookieHeader(value) {
  return value.split(/,(?=\s*veloce_(?:access|refresh)_token=)/i).map((item) => item.trim()).filter(Boolean);
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
