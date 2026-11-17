#!/usr/bin/env node
// One REAL model call end to end on STAGING (ADR-020): the host starts one content.draft on the real Content OS service with a
// model grant; Content OS asks the real host for every model answer; the host calls Groq with the client's key, reserves and
// settles each call. Run it only after the host service and Content OS (host mode) are deployed on staging.
//
// Run it in your own terminal; the keys go into this terminal only and are never printed:
//   read -rs STAGING_SUPABASE_ANON_KEY && export STAGING_SUPABASE_ANON_KEY
//   read -rs STAGING_SUPABASE_SERVICE_ROLE_KEY && export STAGING_SUPABASE_SERVICE_ROLE_KEY
//   export ADAPTER_TOKEN_SIGNING_KEY_PEM="$(gcloud secrets versions access latest --secret ADAPTER_TOKEN_SIGNING_KEY --project agentos-mvp)"
//   export CLIENT_WORKER_TOKEN="$(gcloud secrets versions access latest --secret veloce-agentos-staging-worker-token --project agentos-mvp)"
//   STAGING_SUPABASE_URL=https://edxznuovrevymmdvbarb.supabase.co \
//   HOST_URL=https://<veloce-host-agentos-staging URL> CONTENT_OS_URL=https://<veloce-creator-os-agentos-staging URL> \
//   node scripts/staging-content-e2e.mjs
//
// It prints only PASS or FAIL lines and ids, never a key, the brief's answer or the draft. It leaves one real staging task
// behind (by design: it is the proof); its grant rows are purged by the lifecycle job after 35 days.
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHostLibLoader } from "./lib/hostLibLoader.mjs";

const STAGING_REF = "edxznuovrevymmdvbarb";
const TENANT = "agentos-staging";
const ADAPTER = "creator-os";
const MODEL = "groq:openai/gpt-oss-120b";
const BUDGET_MICROS = 500_000;
const POLL_MS = 10_000;
const MAX_WAIT_MS = 10 * 60_000;
const env = (name) => (process.env[name] ?? "").trim();
const BASE = env("STAGING_SUPABASE_URL").replace(/\/$/, "");
const ANON = env("STAGING_SUPABASE_ANON_KEY");
const SERVICE = env("STAGING_SUPABASE_SERVICE_ROLE_KEY");
const PEM = env("ADAPTER_TOKEN_SIGNING_KEY_PEM");
const WORKER = env("CLIENT_WORKER_TOKEN");
const HOST_URL = env("HOST_URL").replace(/\/$/, "");
const CONTENT_OS_URL = env("CONTENT_OS_URL").replace(/\/$/, "");

function refuse(reason) {
  console.error(`REFUSED: ${reason}`);
  process.exit(2);
}
const urlOf = (url) => { try { return new URL(url); } catch { return null; } };
const supabase = urlOf(BASE);
if (!supabase || supabase.hostname !== `${STAGING_REF}.supabase.co`) refuse(`this script only runs against the staging project (${STAGING_REF})`);
for (const [name, url] of [["HOST_URL", HOST_URL], ["CONTENT_OS_URL", CONTENT_OS_URL]]) {
  const u = urlOf(url);
  if (!u || u.protocol !== "https:") refuse(`${name} must be an https address`);
}
const missing = ["STAGING_SUPABASE_ANON_KEY", "STAGING_SUPABASE_SERVICE_ROLE_KEY", "ADAPTER_TOKEN_SIGNING_KEY_PEM", "CLIENT_WORKER_TOKEN"].filter((name) => !env(name));
if (missing.length) refuse(`set ${missing.join(", ")} in this terminal first`);

const loadLib = createHostLibLoader(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const starter = loadLib("adapterTaskStarter");
const tokens = loadLib("adapterTokens");

const results = [];
function check(name, ok, detail = "") {
  results.push(Boolean(ok));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
}
const authHeaders = (key) => (key.startsWith("sb_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` });
async function call(url, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "manual" }).catch(() => null);
  if (!response) return { ok: false, status: 0, value: null };
  const text = await response.text();
  let value = null;
  try { value = text ? JSON.parse(text) : null; } catch { value = null; }
  return { ok: response.ok, status: response.status, value };
}
const db = (urlPath, key, options = {}) => call(`${BASE}${urlPath}`, { ...options, headers: { ...authHeaders(key), ...(options.headers ?? {}) } });
/** The host worker's database calls, as the deployed host makes them: publishable key, worker token in the arguments. */
const workerRpc = (name, body) => db(`/rest/v1/rpc/${name}`, ANON, { method: "POST", body });
const serviceGet = (urlPath) => db(urlPath, SERVICE);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = randomBytes(4).toString("hex");
const taskKey = `zz-e2e-${run}`;
const brief = "Write a short made-up explainer on why replying to new leads within five minutes matters.";

// 1. The host's model.call route is deployed and on, and refuses a caller with no grant.
const bare = await call(`${HOST_URL}/api/adapter-host/model-call`, { method: "POST", body: {} });
check("the host's model.call route is on and refuses a call with no grant", bare.status === 401 && bare.value?.error === "credential_required", `status ${bare.status} ${bare.value?.error ?? ""}`);

// 2. Start one real content.draft through the real starter.
const started = await starter.startAdapterTaskWithGrant(
  { tenantSlug: TENANT, adapterId: ADAPTER, baseUrl: CONTENT_OS_URL, hostModelUrl: `${HOST_URL}/api/adapter-host/model-call` },
  { rpc: workerRpc, workerToken: WORKER, privateKey: PEM },
  { task: "content.draft", idempotencyKey: taskKey, budgetMaxMicros: BUDGET_MICROS, input: { brief }, models: [MODEL] },
);
check("the host opened a grant and Content OS accepted the task", started.ok === true, `${started.reason ?? ""} ${started.status ?? ""}`);
if (!started.ok) {
  console.log(`\nStopped: nothing more to check. Task key ${taskKey}.`);
  process.exit(1);
}
const taskId = started.taskId;
console.log(`      task key ${taskKey}, Content OS task ${taskId}`);
check("the grant was bound to Content OS's task id", started.grantBound !== false);

// 3. Wait for the final state, reading task.get with single-use host tokens.
const mint = (scope) => tokens.mintAdapterToken({ privateKey: PEM, tenant: TENANT, adapterId: ADAPTER, scope: [scope], ttlSeconds: 60 }).token;
let state = "queued";
const deadline = Date.now() + MAX_WAIT_MS;
while (Date.now() < deadline) {
  const view = await call(`${CONTENT_OS_URL}/h1/task.get?id=${encodeURIComponent(taskId)}`, { headers: { authorization: `Bearer ${mint("task.get")}` } });
  if (view.ok && typeof view.value?.state === "string") state = view.value.state;
  if (["succeeded", "failed", "cancelled"].includes(state)) break;
  await sleep(POLL_MS);
}
check("the task finished and succeeded", state === "succeeded", `state ${state}`);

// 4. What the host's database recorded: counts and money only.
const grantRows = await serviceGet(`/rest/v1/client_adapter_model_grants?tenant_slug=eq.${TENANT}&task_id=eq.${taskKey}&select=grant_id,adapter_task_id,calls_used,tokens_used,closed_at`);
const grant = Array.isArray(grantRows.value) ? grantRows.value[0] : null;
check("one grant for the task, bound to Content OS's task id", grant && grant.adapter_task_id === taskId, JSON.stringify(grantRows.value)?.slice(0, 120));
check("Content OS's model calls went through the host (the grant counted at least one call)", grant && grant.calls_used >= 1, `calls ${grant?.calls_used}`);
const callRows = await serviceGet(`/rest/v1/client_adapter_model_calls?grant_id=eq.${grant?.grant_id}&select=seq,reserved_tokens,actual_tokens,finished_at`);
const calls = Array.isArray(callRows.value) ? callRows.value : [];
check("every counted call finished", calls.length >= 1 && calls.every((c) => c.finished_at !== null), `${calls.length} calls`);
const events = await serviceGet(`/rest/v1/client_adapter_budget_events?tenant_slug=eq.${TENANT}&adapter_id=eq.${ADAPTER}&task_id=like.${taskKey}/m*&select=task_id,kind,amount_micros`);
const rows = Array.isArray(events.value) ? events.value : [];
const perCall = new Map();
for (const row of rows) perCall.set(row.task_id, [...(perCall.get(row.task_id) ?? []), row.kind]);
check("every model call was reserved before it ran", perCall.size >= 1 && [...perCall.values()].every((kinds) => kinds.includes("reserve")), `${perCall.size} call keys`);
check("every reservation was settled or released afterwards", [...perCall.values()].every((kinds) => kinds.includes("settle") || kinds.includes("release")));
check("at least one call was settled at its real cost", rows.some((row) => row.kind === "settle"));

// 5. Nothing the model was asked or answered is in the host's records.
const dump = JSON.stringify([grantRows.value, callRows.value, events.value]);
check("no prompt or answer text is stored in the host's records", !dump.includes("five minutes") && !dump.includes("explainer"));

// 6. The grant ends with the task: the sync job closes it; close it here if the job has not run yet.
if (grant && grant.closed_at === null) {
  const closed = await db("/rest/v1/rpc/client_adapter_model_grant_close", SERVICE, { method: "POST", body: { p_tenant_slug: TENANT, p_adapter_id: ADAPTER, p_task_id: taskId } });
  check("the grant closes now that the task has ended", closed.ok && ["closed", "already_closed"].includes(closed.value), String(closed.value));
} else {
  check("the sync job already closed the grant", Boolean(grant?.closed_at));
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed. Task key ${taskKey}.`);
process.exit(failed ? 1 : 0);
