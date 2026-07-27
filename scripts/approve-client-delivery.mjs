#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);
const project = required("--project");
const slug = required("--slug");
const actionId = required("--action-id");
const serviceUrl = required("--service-url").replace(/\/$/, "");
const region = required("--region");
const queue = required("--queue");
const serviceAccount = required("--service-account");
const apply = args.includes("--apply");
const enqueue = args.includes("--enqueue");
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!/^[a-z][a-z0-9-]{2,40}$/.test(slug)) fail("Invalid client slug");
if (!/^[0-9a-f-]{36}$/i.test(actionId)) fail("Invalid action id");
if (!supabaseUrl || !serviceKey) fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in the operator shell");
if (!/^https:\/\//i.test(serviceUrl) || /localhost|127\.0\.0\.1/i.test(serviceUrl)) fail("--service-url must be the public HTTPS Cloud Run URL");
if (enqueue && !apply) fail("--enqueue requires --apply");

const action = await readAction();
if (!action) fail("Delivery action not found in this tenant");
if (action.status !== "pending_approval" && action.status !== "approved") fail(`Delivery action is ${action.status}; it cannot be approved`);

console.log(`Delivery action ${actionId}: ${action.status}`);
console.log(`Tenant: ${slug}`);
console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
console.log(`Queue: ${queue}`);
console.log("No provider value or service-role key is printed.");

if (!apply) {
  console.log("Dry run only. Add --apply to approve the action.");
  process.exit(0);
}

if (action.status === "pending_approval") {
  await patchAction("approved");
  await recordAudit("delivery.approved", { action: action.action, approvalSource: "operator-cli" }, action.request_id);
}
if (enqueue) {
  await enqueueTask();
  await recordAudit("delivery.queued", { action: action.action, approvalSource: "operator-cli" }, action.request_id);
}
console.log(enqueue ? "Delivery approved and queued." : "Delivery approved. Run with --enqueue to dispatch it through the reviewed worker.");

async function readAction() {
  const response = await fetch(`${supabaseUrl}/rest/v1/client_runtime_delivery_actions?select=id,status,tenant_slug,action,destination,artifact_ids&id=eq.${encodeURIComponent(actionId)}&tenant_slug=eq.${encodeURIComponent(slug)}&limit=1`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) fail(`Could not read delivery action (${response?.status ?? "no response"})`);
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : null;
}

async function patchAction(status) {
  const response = await fetch(`${supabaseUrl}/rest/v1/client_runtime_delivery_actions?id=eq.${encodeURIComponent(actionId)}&tenant_slug=eq.${encodeURIComponent(slug)}`, {
    method: "PATCH", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ status, updated_at: new Date().toISOString() }), cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) fail(`Could not approve delivery action (${response?.status ?? "no response"})`);
}

async function enqueueTask() {
  const access = spawnSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" });
  if (access.status !== 0 || !access.stdout.trim()) fail("gcloud authentication is required to enqueue the approved delivery");
  const taskName = `projects/${project}/locations/${region}/queues/${queue}/tasks/${actionId}`;
  const response = await fetch(`https://cloudtasks.googleapis.com/v2/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(region)}/queues/${encodeURIComponent(queue)}/tasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access.stdout.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ task: { name: taskName, httpRequest: { httpMethod: "POST", url: `${serviceUrl}/api/internal/client-runtime/delivery`, headers: { "Content-Type": "application/json" }, body: Buffer.from(JSON.stringify({ actionId, tenantSlug: slug }), "utf8").toString("base64"), oidcToken: { serviceAccountEmail: serviceAccount, audience: serviceUrl } } } }),
    cache: "no-store",
  }).catch(() => null);
  if (response?.status === 409) return;
  if (!response?.ok) fail(`Could not enqueue approved delivery (${response?.status ?? "no response"})`);
}

async function recordAudit(eventType, metadata, requestId) {
  const response = await fetch(`${supabaseUrl}/rest/v1/client_runtime_audit_events`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ tenant_slug: slug, actor_id: null, event_type: eventType, request_id: requestId || actionId, metadata }),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) fail(`Could not record ${eventType} audit event (${response?.status ?? "no response"})`);
}

function required(flag) {
  const index = args.indexOf(flag);
  const value = index >= 0 ? args[index + 1] : null;
  if (!value) fail(`${flag} is required`);
  return value.trim();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
