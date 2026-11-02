#!/usr/bin/env node
// Proof of model.call (ADR-020) through the real Supabase REST layer on the STAGING project only.
//
// Run it in your own terminal (the keys are typed there, never shown to anyone):
//   read -rs STAGING_SUPABASE_ANON_KEY && export STAGING_SUPABASE_ANON_KEY
//   read -rs STAGING_SUPABASE_SERVICE_ROLE_KEY && export STAGING_SUPABASE_SERVICE_ROLE_KEY
//   STAGING_SUPABASE_URL=https://edxznuovrevymmdvbarb.supabase.co node scripts/staging-model-call-proof.mjs
//
// It makes a fake tenant and adapter, opens a model grant with the real database functions, and runs the host's real
// model.call code against them with a throwaway signing key made in memory and a stand-in provider (no model key and no
// real prompt is used). It checks counting, reserve and settle, release on a failed call, limits, the wrong task, closing
// and that no prompt or answer reaches the database. It deletes everything it created at the end, even when a check
// fails, and prints only PASS or FAIL lines.
import { createHash, generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHostLibLoader } from "./lib/hostLibLoader.mjs";

const STAGING_REF = "edxznuovrevymmdvbarb";
const BASE = (process.env.STAGING_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const ANON = (process.env.STAGING_SUPABASE_ANON_KEY ?? "").trim();
const SERVICE = (process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

function refuse(reason) {
  console.error(`REFUSED: ${reason}`);
  process.exit(2);
}
let host = "";
try { host = new URL(BASE).hostname; } catch { refuse("STAGING_SUPABASE_URL is not a URL"); }
if (host !== `${STAGING_REF}.supabase.co`) refuse(`this script only runs against the staging project (${STAGING_REF})`);
if (!ANON || !SERVICE) refuse("set STAGING_SUPABASE_ANON_KEY and STAGING_SUPABASE_SERVICE_ROLE_KEY in this terminal first");

const loadLib = createHostLibLoader(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const grants = loadLib("adapterModelGrant");
const calls = loadLib("adapterModelCall");

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
}

async function call(urlPath, { method = "GET", key, body, headers = {} } = {}) {
  const response = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }).catch(() => null);
  if (!response) return { ok: false, status: 0, value: null };
  const text = await response.text();
  let value = null;
  try { value = text ? JSON.parse(text) : null; } catch { value = null; }
  return { ok: response.ok, status: response.status, value };
}
const service = (urlPath, options = {}) => call(urlPath, { ...options, key: SERVICE });
const insert = (table, row) => service(`/rest/v1/${table}`, { method: "POST", body: row, headers: { Prefer: "return=representation" } });
/** The host worker's database calls: publishable key, tenant worker token in the arguments (as workerRpc does). */
const workerRpc = (name, body) => call(`/rest/v1/rpc/${name}`, { method: "POST", key: ANON, body });
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

const run = randomBytes(4).toString("hex");
const slug = `zz-mg-${run}`;
const adapterId = "proof-adapter";
const workerToken = randomBytes(24).toString("base64url");
const taskKey = `zz-host-task-${run}`;
const adapterTaskId = `zz-wf-${run}`;
const grantId = randomUUID();
const { privateKey, publicKey } = generateKeyPairSync("ed25519"); // throwaway; not the host's real key
const PROMPT = `Made-up proof prompt ${run} about tide pools.`;

let providerMode = "ok";
const deps = {
  tenantSlug: slug,
  workerToken,
  publicKeys: publicKey,
  tenantMonthlyCapMicros: 100_000_000,
  rpc: workerRpc,
  policy: {
    clientAllows: (provider, model) => provider === "groq" && model === "proof-model",
    maxPromptChars: () => 10_000,
    secretLike: () => false,
    estimateMicros: (_model, messages, maxOut) => messages.reduce((n, m) => n + m.content.length, 0) + maxOut, // one micro per token
    usageMicros: (_model, usage) => usage.inputTokens + usage.outputTokens,
    safeOutput: (text) => text,
  },
  callProvider: async () => (providerMode === "ok"
    ? { ok: true, output: `Made-up proof answer ${run}.`, usage: { inputTokens: 40, outputTokens: 60 } }
    : { ok: false, status: 500 }),
};
const credential = (task = taskKey) => `Bearer ${grants.mintModelGrantCredential({ privateKey, tenant: slug, adapterId, taskKey: task, grantId }).token}`;
const body = (over = {}) => ({ taskKey, provider: "groq", model: "proof-model", messages: [{ role: "user", content: PROMPT }], maxOutputTokens: 200, ...over });
const estimate = PROMPT.length + 200;

async function events(task) {
  const rows = await service(`/rest/v1/client_adapter_budget_events?tenant_slug=eq.${slug}&task_id=eq.${encodeURIComponent(task)}&select=kind,amount_micros&order=created_at.asc`);
  return Array.isArray(rows.value) ? rows.value.map((r) => `${r.kind}:${r.amount_micros}`) : [];
}

let userId = null;

async function proof() {
  // The registry records who registered an adapter, so one throwaway user is made (and deleted in cleanup).
  const user = await service("/auth/v1/admin/users", { method: "POST", body: { email: `proof-${slug}@example.invalid`, password: randomBytes(24).toString("base64url"), email_confirm: true } });
  if (user.status >= 300 || !user.value?.id) throw new Error(`could not create the throwaway user (${user.status})`);
  userId = user.value.id;
  const tenant = await insert("client_tenants", { slug, name: "Model call proof (fake)", status: "active", retention_days: 28, worker_token_hash: sha256(workerToken) });
  if (tenant.status >= 300) throw new Error(`could not create the fake tenant (${tenant.status})`);
  const registry = await insert("client_adapter_registry", {
    tenant_slug: slug, adapter_id: adapterId, display_name: "Proof adapter", contract_version: "h1", manifest_sha256: "a".repeat(64),
    state: "enabled", budget_cap_micros: 10_000_000, budget_period: "month", created_by: userId,
  });
  if (registry.status >= 300) throw new Error(`could not register the fake adapter (${registry.status})`);

  const openInput = { tenantSlug: slug, workerToken, adapterId, taskKey, grantId, allowed: ["groq:proof-model"], maxCalls: 3, maxTokens: 100_000, expiresAt: new Date(Date.now() + 10 * 60_000) };
  check("the host worker opens a grant for the task", (await grants.openModelGrant(workerRpc, openInput)).status === "opened");
  check("opening it again is harmless", (await grants.openModelGrant(workerRpc, openInput)).status === "already_open");
  check("a second grant for the same task is refused", (await grants.openModelGrant(workerRpc, { ...openInput, grantId: randomUUID() })).status === "task_has_grant");
  check("a wrong worker token cannot open a grant", (await grants.openModelGrant(workerRpc, { ...openInput, workerToken: randomBytes(24).toString("base64url"), taskKey: `${taskKey}-x`, grantId: randomUUID() })).status === "refused");
  check("the adapter's task id is recorded on the grant", (await grants.bindModelGrant(workerRpc, { tenantSlug: slug, workerToken, grantId, adapterTaskId })).status === "bound");

  const first = await calls.handleModelCall(credential(), body(), deps);
  check("call 1 is answered", first.status === 200 && first.body.ok === true && first.body.call === 1, JSON.stringify(first.body).slice(0, 80));
  const m1 = await events(`${taskKey}/m1`);
  check("call 1 was reserved at the estimate and settled at the real cost", JSON.stringify(m1) === JSON.stringify([`reserve:${estimate}`, "settle:100"]), JSON.stringify(m1));

  providerMode = "fail";
  const second = await calls.handleModelCall(credential(), body(), deps);
  check("a failed provider call returns only a code", second.status === 502 && second.body.error === "provider_request_failed");
  const m2 = await events(`${taskKey}/m2`);
  check("its reservation was released", JSON.stringify(m2) === JSON.stringify([`reserve:${estimate}`, `release:${estimate}`]), JSON.stringify(m2));
  providerMode = "ok";

  const wrongTask = await calls.handleModelCall(credential(`${taskKey}-other`), body({ taskKey: `${taskKey}-other` }), deps);
  check("a credential for another task is refused by the database", wrongTask.status === 403 && wrongTask.body.error === "grant_not_found");
  const mismatch = await calls.handleModelCall(credential(), body({ taskKey: `${taskKey}-other` }), deps);
  check("a request naming another task than its credential is refused", mismatch.status === 403 && mismatch.body.error === "task_mismatch");

  const third = await calls.handleModelCall(credential(), body(), deps);
  check("call 3 is answered", third.status === 200 && third.body.call === 3);
  const fourth = await calls.handleModelCall(credential(), body(), deps);
  check("call 4 is refused: the grant allows 3", fourth.status === 429 && fourth.body.error === "call_limit");

  const grant = await service(`/rest/v1/client_adapter_model_grants?grant_id=eq.${grantId}&select=calls_used,tokens_used,closed_at`);
  const row = Array.isArray(grant.value) ? grant.value[0] : null;
  check("the grant counted 3 calls and only the real tokens (failed call 0)", row && row.calls_used === 3 && Number(row.tokens_used) === 200, JSON.stringify(row));

  const closed = await call("/rest/v1/rpc/client_adapter_model_grant_close", { method: "POST", key: SERVICE, body: { p_tenant_slug: slug, p_adapter_id: adapterId, p_task_id: adapterTaskId } });
  check("the sync job's close by the adapter's task id works", closed.value === "closed", JSON.stringify(closed.value));
  const afterClose = await calls.handleModelCall(credential(), body(), deps);
  check("a call after the task ended is refused", afterClose.status === 403 && afterClose.body.error === "grant_closed");

  const anonRead = await call(`/rest/v1/client_adapter_model_grants?select=grant_id`, { key: ANON });
  check("the grants table cannot be read with the publishable key", anonRead.status >= 400 || (Array.isArray(anonRead.value) && anonRead.value.length === 0));
  const anonClose = await call("/rest/v1/rpc/client_adapter_model_grant_close", { method: "POST", key: ANON, body: { p_tenant_slug: slug, p_adapter_id: adapterId, p_task_id: adapterTaskId } });
  check("only the service role can close a grant", anonClose.status >= 400);

  const stored = JSON.stringify([
    (await service(`/rest/v1/client_adapter_model_grants?tenant_slug=eq.${slug}&select=*`)).value,
    (await service(`/rest/v1/client_adapter_model_calls?tenant_slug=eq.${slug}&select=*`)).value,
    (await service(`/rest/v1/client_adapter_budget_events?tenant_slug=eq.${slug}&select=*`)).value,
  ]);
  check("no prompt or answer text is stored anywhere", !stored.includes("tide pools") && !stored.includes("proof answer"));
}

async function cleanup() {
  await service(`/rest/v1/client_tenants?slug=eq.${slug}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  const queries = [
    `client_tenants?slug=eq.${slug}&select=slug`,
    ...["client_adapter_registry", "client_adapter_model_grants", "client_adapter_model_calls", "client_adapter_budget_events", "client_runtime_budget_ledger"]
      .map((table) => `${table}?tenant_slug=eq.${slug}&select=tenant_slug`),
  ];
  const left = await Promise.all(queries.map((query) => service(`/rest/v1/${query}`)));
  const userGone = userId === null || (await service(`/auth/v1/admin/users/${userId}`, { method: "DELETE" })).status < 300;
  const clean = userGone && left.every((r) => Array.isArray(r.value) && r.value.length === 0);
  console.log(clean ? "CLEANUP  fake tenant, user, adapter, grant, calls and ledger rows deleted" : `CLEANUP  INCOMPLETE: rows for ${slug} remain (tell Claude; it will remove them)`);
}

try {
  await proof();
} catch (error) {
  check("setup", false, error instanceof Error ? error.message : "unexpected error");
} finally {
  await cleanup();
}
const failed = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
