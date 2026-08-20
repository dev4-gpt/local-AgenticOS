#!/usr/bin/env node
import { readFile, stat, writeFile } from "node:fs/promises";
import process from "node:process";

const args = process.argv.slice(2);
const baseUrl = required("--url").replace(/\/$/, "");
const cookieFile = required("--cookie-file");
const runProviderSmoke = args.includes("--provider-smoke");
const providerOnly = args.includes("--provider-only");
// Workflow creation and brief capture both require the runtime to be inside
// GCP: 15 client routes either enqueue a Cloud Task -- which is a *push* queue,
// so Google must be able to call the runtime back over public HTTPS -- or read
// a GCP metadata identity. Client edition deliberately refuses a localhost base
// URL (cloudTasks.ts: task_base_url_not_public), so these can never pass from a
// laptop. That is architecture, not configuration. Routes, capabilities,
// credentials and tenant records have no such dependency and are the real local
// parity surface.
const skipGcpDependent = args.includes("--no-gcp-dependent");
let cookie = await readCookie(cookieFile);
const failures = [];
const cleanup = [];

const routes = [
  "/", "/claude", "/openclaw", "/hermes", "/antigravity", "/codex", "/kimi", "/glm", "/glm-code", "/grok",
  "/freeclaude", "/fusion", "/sakana", "/local", "/engine", "/context", "/memory", "/journal", "/goals",
  "/notebook", "/orchestrate", "/paperclip", "/room", "/pipeline", "/agent-kanban", "/kanban", "/loop",
  "/ruflo", "/create", "/opendesign", "/web-studio", "/flow-lab", "/studio", "/openmontage", "/games",
  "/thumbnails", "/capabilities", "/credentials", "/integrations", "/seo", "/seo-guide", "/guide",
  "/deliver", "/leads", "/radar",
];

const workflowSurfaces = ["orchestrate", "paperclip", "room", "pipeline", "agent-kanban", "kanban", "loop", "ruflo"];
const recordKinds = ["memory", "journal", "goal", "notebook"];
const briefSurfaces = ["opendesign", "web-studio", "flow-lab", "studio", "openmontage", "games", "thumbnails", "integrations", "leads", "radar", "guide"];
const providerSmokes = [
  { provider: "anthropic", prompt: "Reply exactly: Claude owner-cloud smoke passed.", expected: "Claude owner-cloud smoke passed." },
  { provider: "antigravity", prompt: "Create a bounded reviewed plan for launching Veloce to AI product teams.", expectedKind: "reviewed_plan" },
  { provider: "openrouter", prompt: "Reply exactly: OpenRouter owner-cloud smoke passed.", expected: "OpenRouter owner-cloud smoke passed." },
];

try {
  for (const route of routes) await verifyRoute(route);
  if (providerOnly && !runProviderSmoke) fail("--provider-only requires --provider-smoke");
  if (!providerOnly) {
    await verifyApi("/api/capabilities");
    await verifyApi("/api/client-runtime/credentials");
    await verifyApi("/api/client-runtime/provider-history?provider=anthropic");
    for (const kind of recordKinds) await verifyRecord(kind);
    if (skipGcpDependent) {
      console.log(`Skipping ${workflowSurfaces.length} workflow and ${briefSurfaces.length} brief surfaces: they require Cloud Tasks or a GCP metadata identity.`);
    } else {
      for (const surface of workflowSurfaces) await verifyWorkflow(surface);
      for (const surface of briefSurfaces) await verifyBrief(surface);
    }
  }
  if (runProviderSmoke) {
    for (const smoke of providerSmokes) await verifyProvider(smoke);
  }
} finally {
  for (const item of cleanup.reverse()) {
    await item().catch(() => null);
  }
}

if (failures.length) {
  console.error("Client runtime surface-map verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Client runtime surface-map verification passed for ${baseUrl}${runProviderSmoke ? " with provider smoke" : ""}${skipGcpDependent ? " (routes, capabilities and records only; GCP-dependent surfaces skipped)" : ""}.`);

async function verifyRoute(route) {
  const response = await api(route, { headers: { accept: "text/html" } });
  const body = await response.text().catch(() => "");
  expect(response.status === 200, `${route} returned HTTP ${response.status}`);
  expect(body.includes("Veloce AgenticOS") || body.includes("Mission Control"), `${route} did not render the client shell`);
}

async function verifyApi(pathname) {
  const response = await api(pathname);
  const body = await safeJson(response);
  expect(response.status === 200 && body?.ok !== false, `${pathname} failed (${response.status})`);
}

async function verifyRecord(kind) {
  const title = `surface-map ${kind} ${Date.now()}`;
  const created = await api("/api/client-runtime/records", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, title, content: `Tenant ${kind} surface-map smoke record.` }),
  });
  expect(created.status === 201, `${kind} record create failed (${created.status})`);
  const listed = await api(`/api/client-runtime/records?kind=${encodeURIComponent(kind)}`);
  const body = await safeJson(listed);
  const record = Array.isArray(body?.records) ? body.records.find((item) => item?.title === title) : null;
  expect(Boolean(record?.id), `${kind} record was not listed after create`);
  if (record?.id) cleanup.push(() => api(`/api/client-runtime/records?id=${encodeURIComponent(record.id)}`, { method: "DELETE" }));
}

async function verifyWorkflow(surface) {
  const title = `surface-map ${surface} ${Date.now()}`;
  const created = await api("/api/client-runtime/workflows", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ surface, operation: "plan", title, goal: `Verify ${surface} workflow creation and deterministic completion.` }),
  });
  const body = await safeJson(created);
  // Include the server's error code, not just the status. A 503 alone cannot
  // distinguish "the limit service is down" from "this runtime cannot enqueue
  // from a localhost base URL", and the two need completely different fixes.
  expect(created.status === 202 && isUuid(body?.workflowId), `${surface} workflow create failed (${created.status}: ${String(body?.error ?? "no error")})`);
  const workflowId = isUuid(body?.workflowId) ? body.workflowId : null;
  if (!workflowId) return;
  cleanup.push(() => api(`/api/client-runtime/workflows?id=${encodeURIComponent(workflowId)}`, { method: "DELETE" }));
  const workflow = await waitForWorkflow(surface, workflowId);
  expect(workflow !== null, `${surface} workflow did not reach a terminal state`);
  expect(workflow?.metadata?.execution?.status === "completed", `${surface} workflow ended as ${String(workflow?.metadata?.execution?.status ?? "unknown")}`);
}

async function verifyBrief(surface) {
  const response = await api("/api/client-runtime/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: surface === "leads" || surface === "radar" ? "deliver" : surface === "integrations" || surface === "guide" ? "create" : "create",
      title: `surface-map ${surface}`,
      details: `Verify that ${surface} can capture a tenant-owned approved brief without provider execution.`,
      fields: { surface, adapter: "tenant-brief", approvalRequired: true, providerExecution: "separate-approved-adapter" },
    }),
  });
  const briefBody = await safeJson(response);
  expect(response.status === 200, `${surface} brief capture failed (${response.status}: ${String(briefBody?.error ?? "no error")})`);
}

async function verifyProvider({ provider, prompt, expected, expectedKind }) {
  const created = await api("/api/client-runtime/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider, prompt, history: [] }),
  });
  const body = await safeJson(created);
  expect(created.status === 202 && isUuid(body?.jobId), `${provider} job enqueue failed (${created.status}: ${String(body?.error ?? "no error")})`);
  if (!isUuid(body?.jobId)) return;
  const job = await waitForJob(body.jobId);
  expect(job !== null, `${provider} job did not reach a terminal state`);
  expect(job?.status === "succeeded", `${provider} job ended as ${String(job?.status ?? "unknown")}: ${String(job?.error_code ?? "")}`);
  const output = typeof job?.output_metadata?.output === "string" ? job.output_metadata.output : "";
  if (expectedKind === "reviewed_plan") {
    const reviewed = parseReviewedPlan(output);
    expect(Boolean(reviewed), `${provider} output was not a reviewed plan`);
    expect(reviewed?.type === "reviewed_plan", `${provider} output has unexpected plan type`);
    expect(reviewed?.tool === "propose_reviewed_plan", `${provider} output used an unexpected plan tool`);
    expect(reviewed?.plan?.approvalRequired === true, `${provider} reviewed plan did not require approval`);
  } else {
    expect(output.includes(expected), `${provider} output did not include expected smoke phrase`);
  }
}

function parseReviewedPlan(output) {
  try {
    const value = JSON.parse(output);
    return value && typeof value === "object" ? value : null;
  } catch {
    const line = output.split("\n").map((item) => item.trim()).find((item) => item.startsWith("{\"type\":\"reviewed_plan\""));
    if (!line) return null;
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }
}

async function waitForWorkflow(surface, id) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const response = await api(`/api/client-runtime/workflows?surface=${encodeURIComponent(surface)}`);
    const body = await safeJson(response);
    const workflow = Array.isArray(body?.workflows) ? body.workflows.find((item) => item?.id === id) : null;
    const status = workflow?.metadata?.execution?.status;
    if (status === "completed" || status === "failed") return workflow;
    await sleep(3_000);
  }
  return null;
}

async function waitForJob(id) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const response = await api(`/api/client-runtime/jobs/${encodeURIComponent(id)}`);
    const body = await safeJson(response);
    const status = body?.job?.status;
    if (status === "succeeded" || status === "failed" || status === "cancelled") return body.job;
    await sleep(2_000);
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
  let file;
  try {
    file = await stat(filePath);
  } catch {
    fail(`--cookie-file could not be read: ${filePath}. Create a mode-600 file containing both runtime session cookies.`);
  }
  const mode = file.mode & 0o777;
  if ((mode & 0o077) !== 0) fail("--cookie-file must not be readable by group or other users");
  let value;
  try {
    value = (await readFile(filePath, "utf8")).trim();
  } catch {
    fail(`--cookie-file could not be read: ${filePath}`);
  }
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
  if (nextCookie !== cookie) {
    cookie = nextCookie;
    await writeFile(cookieFile, `${cookie}\n`, { mode: 0o600 });
  }
}

function splitSetCookieHeader(value) {
  return value.split(/,(?=\s*veloce_(?:access|refresh)_token=)/i).map((item) => item.trim()).filter(Boolean);
}

function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
