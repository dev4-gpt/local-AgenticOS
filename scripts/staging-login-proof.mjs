#!/usr/bin/env node
// Phase 1 proof through the REAL login layer on the hosted STAGING project (tracker 5a2, 4a, and the database half of 10h).
// It refuses any project other than veloce-agentos-staging. Run it yourself, with the three staging keys in your own
// terminal; it never prints them:
//
//   read -rs STAGING_SUPABASE_ANON_KEY && export STAGING_SUPABASE_ANON_KEY
//   read -rs STAGING_SUPABASE_SERVICE_ROLE_KEY && export STAGING_SUPABASE_SERVICE_ROLE_KEY
//   STAGING_SUPABASE_URL=https://edxznuovrevymmdvbarb.supabase.co node scripts/staging-login-proof.mjs
//
// What it does: creates two throwaway users (random passwords, never shown) and one fake tenant, signs both users in
// through Supabase's real login (GoTrue), then checks approvals, promotions, row-level security, adapter tokens, the
// activity view and 20 budget reservations fired at the same moment, all through the real REST layer (PostgREST).
// It deletes everything it created at the end, even when a check fails, and prints only PASS or FAIL lines.

import { createHash, randomBytes, randomUUID } from "node:crypto";

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

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
}

async function call(path, { method = "GET", key, token, body, headers = {} } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }).catch(() => null);
  if (!response) return { status: 0, json: null };
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: response.status, json };
}
const service = (path, options = {}) => call(path, { ...options, key: SERVICE });
const asUser = (token) => (path, options = {}) => call(path, { ...options, key: ANON, token });
const worker = (path, options = {}) => call(path, { ...options, key: ANON });
const rpc = (caller, name, args) => caller(`/rest/v1/rpc/${name}`, { method: "POST", body: args });
const insert = (table, row) => service(`/rest/v1/${table}`, { method: "POST", body: row, headers: { Prefer: "return=representation" } });
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
// A database refusal comes back as a short code in the message; only that code is shown.
const code = (response) => (typeof response.json?.message === "string" ? response.json.message.slice(0, 80) : `http ${response.status}`);

const run = randomBytes(4).toString("hex");
const slug = `zz-login-${run}`;
const adapterId = "proof-adapter";
const workerToken = randomBytes(24).toString("base64url");
const users = {};

async function createUser(label) {
  const email = `proof-${run}-${label}@example.invalid`;
  const password = randomBytes(24).toString("base64url");
  const created = await service("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } });
  if (created.status >= 300 || !created.json?.id) throw new Error(`could not create test user ${label} (${created.status})`);
  const signedIn = await call("/auth/v1/token?grant_type=password", { method: "POST", key: ANON, body: { email, password } });
  if (signedIn.status >= 300 || !signedIn.json?.access_token) throw new Error(`real sign-in failed for test user ${label} (${signedIn.status})`);
  users[label] = { id: created.json.id, token: signedIn.json.access_token };
}

async function proof() {
  await createUser("requester");
  await createUser("reviewer");
  check("two throwaway users signed in through the real Supabase login", users.requester.token && users.reviewer.token);
  const A = asUser(users.requester.token);
  const B = asUser(users.reviewer.token);

  const tenant = await insert("client_tenants", { slug, name: "Login proof (fake)", status: "active", retention_days: 28, worker_token_hash: sha256(workerToken) });
  if (tenant.status >= 300) throw new Error(`could not create the fake tenant (${tenant.status})`);
  await insert("client_memberships", [
    { tenant_slug: slug, user_id: users.requester.id, role: "member", status: "active" },
    { tenant_slug: slug, user_id: users.reviewer.id, role: "admin", status: "active" },
  ]);
  const registry = await insert("client_adapter_registry", {
    tenant_slug: slug, adapter_id: adapterId, display_name: "Proof adapter", contract_version: "h1", manifest_sha256: "a".repeat(64),
    state: "preview", side_effect_ceiling: "publish", created_by: users.reviewer.id,
  });
  if (registry.status >= 300) throw new Error(`could not register the fake adapter (${registry.status})`);

  // Approvals: requester asks, cannot decide, an admin cannot approve their own request, a different admin approves once.
  const canonical = JSON.stringify({ adapterId, destination: "staging-proof", kind: "publish", payload: { note: "fake" }, policyVersion: "proof-v1", v: "approval-action-h1" });
  const hash = sha256(canonical);
  const requested = await rpc(A, "client_adapter_request_approval", { p_tenant_slug: slug, p_adapter_id: adapterId, p_action_kind: "publish", p_action_hash: hash, p_action_canonical: canonical, p_destination: "staging-proof", p_policy_version: "proof-v1", p_ttl_seconds: 3600 });
  const approvalId = typeof requested.json === "string" ? requested.json : null;
  check("a signed-in member can request an approval", approvalId, code(requested));
  const selfDecide = await rpc(A, "client_adapter_decide_approval", { p_approval_id: approvalId, p_decision: "approve", p_expected_action_hash: hash });
  check("the requester cannot decide it", selfDecide.status >= 400, code(selfDecide));
  const canonical2 = canonical.replace("fake", "fake-2");
  const ownRequest = await rpc(B, "client_adapter_request_approval", { p_tenant_slug: slug, p_adapter_id: adapterId, p_action_kind: "publish", p_action_hash: sha256(canonical2), p_action_canonical: canonical2, p_destination: "staging-proof", p_policy_version: "proof-v1", p_ttl_seconds: 3600 });
  const ownDecide = await rpc(B, "client_adapter_decide_approval", { p_approval_id: ownRequest.json, p_decision: "approve", p_expected_action_hash: sha256(canonical2) });
  check("an admin cannot approve their own request", ownDecide.status >= 400 && code(ownDecide).includes("requester_cannot_decide"), code(ownDecide));
  const tampered = await rpc(A, "client_adapter_request_approval", { p_tenant_slug: slug, p_adapter_id: adapterId, p_action_kind: "publish", p_action_hash: hash, p_action_canonical: canonical.replace("fake", "other"), p_destination: "staging-proof", p_policy_version: "proof-v1", p_ttl_seconds: 3600 });
  check("text that does not match its fingerprint is refused", tampered.status >= 400 && code(tampered).includes("canonical_mismatch"), code(tampered));
  const wrongHash = await rpc(B, "client_adapter_decide_approval", { p_approval_id: approvalId, p_decision: "approve", p_expected_action_hash: "0".repeat(64) });
  check("approving a different fingerprint is refused", wrongHash.status >= 400, code(wrongHash));
  const approved = await rpc(B, "client_adapter_decide_approval", { p_approval_id: approvalId, p_decision: "approve", p_expected_action_hash: hash });
  check("a different admin approves", approved.json === "approved", code(approved));
  const executeArgs = { p_tenant_slug: slug, p_worker_token: workerToken, p_approval_id: approvalId, p_expected_action_hash: hash, p_receipt_sha256: "c".repeat(64) };
  const badWorker = await rpc(worker, "client_adapter_execute_approval", { ...executeArgs, p_worker_token: randomBytes(24).toString("base64url") });
  check("a wrong worker token cannot execute", badWorker.json === false, code(badWorker));
  const first = await rpc(worker, "client_adapter_execute_approval", executeArgs);
  const again = await rpc(worker, "client_adapter_execute_approval", executeArgs);
  check("the worker executes the approval exactly once", first.json === true && again.json === false, `${code(first)} / ${code(again)}`);

  // Promotions: reviewed, labelled, and the shared note takes the reviewer's label.
  const content = "Fake fact for the login proof.";
  const note = await insert("client_adapter_memory_items", { tenant_slug: slug, namespace: `adapter:${adapterId}`, origin_adapter_id: adapterId, content, content_sha256: sha256(content), idempotency_key: `login-${run}-1` });
  const noteId = note.json?.[0]?.id;
  await insert("client_adapter_memory_provenance", { tenant_slug: slug, item_id: noteId, adapter_id: adapterId, adapter_version: "0.0.1", agent_principal: "proof-agent", source_task_id: "task-1", confidence: 0.9 });
  const promotion = await insert("client_adapter_memory_promotions", { tenant_slug: slug, source_item_id: noteId, origin_adapter_id: adapterId, content_sha256: sha256(content), scan_result: { scanner: "proof", content_sha256: sha256(content), verdict: "clean" }, requested_by: users.requester.id });
  const promotionId = promotion.json?.[0]?.id;
  check("a promotion is queued for review", promotionId, code(promotion));
  const memberDecide = await rpc(A, "client_adapter_decide_promotion", { p_promotion_id: promotionId, p_decision: "approve", p_expected_content_sha256: sha256(content), p_note: null, p_sensitivity: "ordinary" });
  check("a plain member cannot decide a promotion", memberDecide.status >= 400, code(memberDecide));
  const unlabelled = await rpc(B, "client_adapter_decide_promotion", { p_promotion_id: promotionId, p_decision: "approve", p_expected_content_sha256: sha256(content), p_note: null, p_sensitivity: null });
  check("approving without a label is refused", unlabelled.status >= 400 && code(unlabelled).includes("sensitivity_required"), code(unlabelled));
  const promoted = await rpc(B, "client_adapter_decide_promotion", { p_promotion_id: promotionId, p_decision: "approve", p_expected_content_sha256: sha256(content), p_note: null, p_sensitivity: "ordinary" });
  check("an admin approves the promotion with a label", promoted.json === "approved", code(promoted));
  const shared = await insert("client_adapter_memory_items", { tenant_slug: slug, namespace: "shared", origin_adapter_id: adapterId, content, content_sha256: sha256(content), trust_level: "reviewed", idempotency_key: `login-${run}-2`, promotion_id: promotionId, sensitivity: "restricted" });
  const sharedId = shared.json?.[0]?.id;
  check("the shared note carries the reviewer's label, not the caller's", shared.json?.[0]?.sensitivity === "ordinary", code(shared));

  // Row-level security through real sessions.
  const memberView = await A(`/rest/v1/client_adapter_memory_items?tenant_slug=eq.${slug}&select=namespace`);
  check("a member sees only the shared note", JSON.stringify((memberView.json ?? []).map((row) => row.namespace)) === '["shared"]', code(memberView));
  const adminView = await B(`/rest/v1/client_adapter_memory_items?tenant_slug=eq.${slug}&select=namespace`);
  check("an admin sees the private and the shared note", Array.isArray(adminView.json) && adminView.json.length === 2, code(adminView));
  const anonView = await worker(`/rest/v1/client_adapter_memory_items?tenant_slug=eq.${slug}&select=id`);
  check("an anonymous visitor reads nothing", anonView.status >= 400 || (Array.isArray(anonView.json) && anonView.json.length === 0), code(anonView));
  const tokenTable = await A(`/rest/v1/client_adapter_token_uses?select=jti&limit=1`);
  check("a member cannot read the token table", tokenTable.status >= 400, code(tokenTable));
  const memberApprovals = await A(`/rest/v1/client_adapter_approvals?tenant_slug=eq.${slug}&select=id`);
  check("a member sees only their own approval requests", Array.isArray(memberApprovals.json) && memberApprovals.json.length === 1, code(memberApprovals));
  const otherTenant = await A(`/rest/v1/client_adapter_registry?tenant_slug=neq.${slug}&select=tenant_slug`);
  check("a member sees no other tenant's adapters", Array.isArray(otherTenant.json) && otherTenant.json.length === 0, code(otherTenant));

  // Adapter tokens and scoped reads.
  const jti = randomUUID();
  const expires = new Date(Date.now() + 4 * 60_000).toISOString();
  const tokenArgs = { p_tenant_slug: slug, p_worker_token: workerToken, p_adapter_id: adapterId, p_jti: jti, p_expires_at: expires };
  const used = await rpc(worker, "client_adapter_consume_token", tokenArgs);
  const replay = await rpc(worker, "client_adapter_consume_token", tokenArgs);
  check("an adapter token is accepted once and its replay refused", used.json === true && replay.json === false, `${code(used)} / ${code(replay)}`);
  const scoped = await rpc(worker, "client_adapter_read_scoped", { p_tenant_slug: slug, p_worker_token: workerToken, p_adapter_id: adapterId, p_item_ids: [sharedId, noteId] });
  check("a scoped read returns only the named notes", Array.isArray(scoped.json) && scoped.json.length === 2, code(scoped));
  const activity = await rpc(A, "client_adapter_activity_counts", { p_tenant_slug: slug });
  const counts = Object.fromEntries((activity.json ?? []).map((row) => [row.event_type, row.event_count]));
  check("the activity view counts what happened", counts["approval.executed"] === 1 && counts["promotion.decided"] === 1 && counts["token.use"] === 1, code(activity));

  // Concurrency (4a): 20 reservations at once against a cap that fits exactly 10.
  await service(`/rest/v1/client_adapter_registry?tenant_slug=eq.${slug}&adapter_id=eq.${adapterId}`, { method: "PATCH", body: { budget_cap_micros: 1_000_000, budget_period: "month" } });
  const outcomes = await Promise.all(Array.from({ length: 20 }, (_, index) => rpc(worker, "client_adapter_budget_reserve", {
    p_tenant_slug: slug, p_worker_token: workerToken, p_adapter_id: adapterId, p_task_id: `race-${index}`, p_idempotency_key: `race-key-${run}-${index}`,
    p_amount_micros: 100_000, p_provider: "openai", p_model: "proof-model", p_tenant_monthly_cap_micros: 100_000_000,
  })));
  const tally = outcomes.reduce((acc, outcome) => ({ ...acc, [String(outcome.json)]: (acc[String(outcome.json)] ?? 0) + 1 }), {});
  check("20 simultaneous reservations: exactly 10 fit under the cap", tally.reserved === 10 && tally.adapter_cap_exceeded === 10, JSON.stringify(tally));
  const ledger = await service(`/rest/v1/client_runtime_budget_ledger?tenant_slug=eq.${slug}&select=amount_micros`);
  const spent = (ledger.json ?? []).reduce((sum, row) => sum + Number(row.amount_micros), 0);
  check("the ledger never goes over the cap", spent === 1_000_000, `spent ${spent}`);
}

async function cleanup() {
  const removed = await service(`/rest/v1/client_tenants?slug=eq.${slug}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  const tenantGone = removed.status < 300;
  let usersGone = true;
  for (const user of Object.values(users)) {
    const deleted = await service(`/auth/v1/admin/users/${user.id}`, { method: "DELETE" });
    usersGone &&= deleted.status < 300;
  }
  console.log(tenantGone && usersGone ? "CLEANUP  fake tenant and users deleted" : `CLEANUP  INCOMPLETE: tenant ${slug} ${tenantGone ? "deleted" : "left behind"}, users ${usersGone ? "deleted" : "left behind"} (tell Claude; it will remove them)`);
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
