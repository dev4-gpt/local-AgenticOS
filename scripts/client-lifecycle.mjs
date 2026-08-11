#!/usr/bin/env node
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const mode = valueAfter("--mode") || "export";
const apply = args.includes("--apply");
const slug = required(valueAfter("--slug"), "--slug");
const configPath = valueAfter("--config");
const outputPath = path.resolve(process.cwd(), valueAfter("--out") || `.private-client-kits/exports/${slug}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
const inputPath = valueAfter("--input");
const objectsPath = valueAfter("--objects");
const project = valueAfter("--project") || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
const bucket = valueAfter("--bucket");
const namespace = valueAfter("--namespace") || slug;
const includeObjects = args.includes("--include-objects");
const confirmRestore = args.includes("--confirm-restore");
const destroySecrets = args.includes("--destroy-secrets");
const notificationChannel = valueAfter("--notification-channel");
const deleteNotificationChannel = args.includes("--delete-notification-channel");
const deleteService = args.includes("--delete-service");
const deleteBucket = args.includes("--delete-bucket");
const deleteQueue = args.includes("--delete-queue");

if (!["export", "restore", "offboard"].includes(mode)) fail("--mode must be export, restore, or offboard");
if (mode === "restore" && !inputPath) fail("--input is required for restore");
if (mode !== "restore" && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for export/offboard");
if ((mode === "offboard" || mode === "restore") && !process.env.SUPABASE_SERVICE_ROLE_KEY) fail("SUPABASE_SERVICE_ROLE_KEY is required for operator lifecycle actions");
if (mode === "offboard" && apply && !args.includes("--confirm-offboard")) fail("Refusing offboard apply without --confirm-offboard");
if (mode === "offboard" && apply && !destroySecrets) fail("Refusing offboard apply without --destroy-secrets");
if (mode === "offboard" && apply && !deleteQueue) fail("Refusing offboard apply without --delete-queue");
if (mode === "offboard" && apply && !deleteNotificationChannel) fail("Refusing offboard apply without --delete-notification-channel");
if (mode === "offboard" && apply && deleteNotificationChannel && !notificationChannel) fail("--notification-channel is required when deleting the client alert channel");
if (mode === "offboard" && apply && !project) fail("--project is required for offboard apply");
if (mode === "restore" && apply && !confirmRestore) fail("Refusing restore apply without --confirm-restore");

const manifest = configPath ? JSON.parse(await readFile(path.resolve(process.cwd(), configPath), "utf8")) : {};
const gcp = manifest.gcp && typeof manifest.gcp === "object" ? manifest.gcp : {};
const resolvedBucket = bucket || gcp.storageBucket;
const resolvedNamespace = manifest.storage?.namespace || namespace;
const serviceName = gcp.serviceName || `veloce-${slug}`;

if ((mode === "offboard" || includeObjects) && !resolvedBucket) fail("--bucket or a manifest storageBucket is required for bucket lifecycle work");
if (mode === "restore" && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for restore");
if (mode === "restore" && objectsPath && !resolvedBucket) fail("--objects restore requires --bucket or a manifest storageBucket");

const tables = [
  "client_tenants",
  "client_memberships",
  "client_runtime_requests",
  "client_runtime_audit_events",
  "client_runtime_jobs",
  "client_runtime_artifacts",
  "client_runtime_records",
  "client_notebooks",
  "client_research_runs",
  "client_research_records",
  "client_research_citations",
  "client_visual_qa_reports",
  "client_visual_qa_findings",
  "client_runtime_memory_graph_nodes",
  "client_runtime_memory_graph_edges",
  "client_runtime_budget_ledger",
  "client_runtime_delivery_actions",
  // Ordered parent-first so a restore can satisfy foreign keys.
  "client_paperclip_companies",
  "client_paperclip_projects",
  "client_paperclip_agents",
  "client_paperclip_issues",
  "client_paperclip_comments",
  "client_paperclip_runs",
  "client_room_conversations",
  "client_room_messages",
  "client_room_rounds",
  "client_pipeline_items",
  "client_board_tasks",
  "client_board_comments",
  "client_board_events",
  "client_loop_runs",
  "client_loop_rounds",
  "client_hermes_content_factory_runs",
  "client_hermes_content_factory_stage_outputs",
  "client_hermes_content_factory_citations",
  "client_hermes_content_factory_quality_reports",
  "client_hermes_content_factory_approvals",
  "client_hermes_content_factory_deliveries",
  "client_ruflo_swarms",
  "client_ruflo_agents",
];

// Lifecycle exports are portable backups, not credential backups. Keep this
// list explicit so a newly-added sensitive column cannot silently enter an
// export through a wildcard query.
const exportColumns = Object.freeze({
  client_tenants: "slug,name,status,retention_days,created_at,updated_at",
  client_memberships: "tenant_slug,user_id,role,status,created_at",
  client_runtime_requests: "id,tenant_slug,submitted_by,request_type,title,details,fields,status,created_at,updated_at",
  client_runtime_audit_events: "id,tenant_slug,actor_id,event_type,request_id,metadata,created_at",
  client_runtime_jobs: "id,tenant_slug,requested_by,capability,provider,model,idempotency_key,status,attempt_count,input_metadata,output_metadata,error_code,created_at,started_at,finished_at",
  client_runtime_artifacts: "id,tenant_slug,job_id,created_by,object_key,original_name,content_type,byte_size,status,retention_expires_at,created_at",
  client_runtime_records: "id,tenant_slug,created_by,kind,title,content,status,metadata,notebook_id,created_at,updated_at",
  client_notebooks: "id,tenant_slug,created_by,title,summary,status,created_at,updated_at",
  client_research_runs: "id,tenant_slug,notebook_id,job_id,created_by,provider,query,status,idempotency_key,result_count,created_at,updated_at",
  client_research_records: "id,tenant_slug,research_run_id,notebook_id,source_url,retrieved_at,fields,confidence,status,failure_reason",
  client_research_citations: "id,tenant_slug,research_run_id,research_record_id,url,title,retrieved_at,evidence",
  client_visual_qa_reports: "id,tenant_slug,artifact_id,job_id,worker,frames_sampled,runtime_ms,status,warnings,created_at",
  client_visual_qa_findings: "id,tenant_slug,report_id,code,severity,frame,confidence,message",
  client_runtime_memory_graph_nodes: "id,tenant_slug,record_id,graph_key,label,kind,metadata,created_at,updated_at",
  client_runtime_memory_graph_edges: "id,tenant_slug,source_node_id,target_node_id,relation,weight,metadata,created_at",
  client_runtime_budget_ledger: "id,tenant_slug,job_id,provider,model,amount_micros,usage_metadata,created_at",
  client_runtime_delivery_actions: "id,tenant_slug,request_id,requested_by,action,destination,artifact_ids,status,error_code,idempotency_key,created_at,updated_at",
  client_paperclip_companies: "tenant_slug,name,description,issue_prefix,issue_counter,brand_color,budget_monthly_micros,status,created_at,updated_at",
  client_paperclip_projects: "id,tenant_slug,created_by,name,url_key,description,color,icon,status,target_date,created_at,updated_at",
  client_paperclip_agents: "id,tenant_slug,created_by,name,role,title,icon,status,reports_to,provider,model,budget_monthly_micros,last_heartbeat_at,url_key,created_at,updated_at",
  // build_preview_html is a provider-generated copy of the artifact already
  // captured in Cloud Storage; the artifact id is the durable reference, so the
  // export keeps the pointer rather than duplicating the payload.
  client_paperclip_issues: "id,tenant_slug,created_by,issue_number,identifier,title,description,status,priority,project_id,assignee_agent_id,labels,execution_state,execution_job_id,build_artifact_id,started_at,completed_at,created_at,updated_at",
  client_paperclip_comments: "id,tenant_slug,issue_id,created_by,author_agent_id,body,created_at",
  client_paperclip_runs: "id,tenant_slug,created_by,issue_id,agent_id,job_id,status,provider,model,summary,error_code,cost_micros,started_at,finished_at,created_at,updated_at",
  client_room_conversations: "id,tenant_slug,created_by,title,status,present_agents,created_at,updated_at",
  client_room_messages: "id,tenant_slug,conversation_id,created_by,role,kind,agent_id,agent_name,agent_color,content,provider,model,cost_micros,error_code,linked_record_id,seq,created_at",
  client_room_rounds: "id,tenant_slug,conversation_id,created_by,job_id,status,agent_ids,speaking_agent_id,completed_agents,cost_micros,error_code,created_at,updated_at",
  // build_preview_html duplicates a Cloud Storage artifact; the id is the durable reference.
  client_pipeline_items: "id,tenant_slug,created_by,slug,title,stage,route,confidence,tags,idea,classification,plan,tasks,pinned,build_artifact_id,execution_state,execution_job_id,execution_error,decided_by,decided_at,created_at,updated_at",
  client_board_tasks: "id,tenant_slug,created_by,board,title,body,status,assignee,priority,labels,build_artifact_id,execution_state,execution_job_id,execution_error,result,started_at,completed_at,created_at,updated_at",
  client_board_comments: "id,tenant_slug,task_id,created_by,author,body,created_at",
  client_board_events: "id,tenant_slug,task_id,kind,detail,created_at",
  client_loop_runs: "id,tenant_slug,created_by,goal,title,status,job_id,builder_provider,builder_model,judge_provider,judge_model,max_rounds,rounds_completed,best_score,final_summary,build_artifact_id,cost_micros,error_code,created_at,updated_at",
  client_loop_rounds: "id,tenant_slug,run_id,round,passed,score,issues,summary,artifact_chars,cost_micros,error_code,created_at",
  client_hermes_content_factory_runs: "id,tenant_slug,created_by,workflow_id,idempotency_key,content_type,brief,plan,stages,citations,quality_report,approval,delivery,status,current_stage,job_id,error_code,created_at,updated_at",
  client_hermes_content_factory_stage_outputs: "id,run_id,tenant_slug,stage,status,output_record_id,artifact_id,citation_record_id,quality_report_id,error_code,output,created_at,updated_at",
  client_hermes_content_factory_citations: "id,run_id,tenant_slug,url,title,retrieved_at,evidence,created_at",
  client_hermes_content_factory_quality_reports: "id,run_id,tenant_slug,passed,score,citation_count,findings,checked_at,created_at",
  client_hermes_content_factory_approvals: "id,run_id,tenant_slug,workflow_id,approved_by,approved_at,created_at",
  client_hermes_content_factory_deliveries: "id,run_id,tenant_slug,workflow_id,destination,status,approval_id,artifact_id,created_at",
  client_ruflo_swarms: "id,tenant_slug,created_by,objective,topology,preset,status,job_id,provider,model,agent_count,completed_count,failed_count,report_artifact_id,cost_micros,error_code,created_at,updated_at",
  client_ruflo_agents: "id,tenant_slug,swarm_id,agent_type,name,task,position,status,output,error_code,cost_micros,started_at,finished_at,created_at",
});

const forbiddenExportFields = new Set([
  "worker_token_hash",
  "credential_value",
  "api_key",
  "access_token",
  "refresh_token",
  "private_key",
]);
const secretLikeValue = /(?:api[_ -]?key|secret|password|private[_ -]?key|access[_ -]?token)\s*[:=]\s*[^\s]{4,}|\b(?:sk|rk|ghp|xai)-[A-Za-z0-9_-]{16,}\b/i;

if (mode === "export") {
  const snapshot = await exportSnapshot();
  await writeSnapshot(snapshot, outputPath);
  if (includeObjects) exportObjects(outputPath.replace(/\.json$/i, "-objects"));
  console.log(`Client export written: ${outputPath}`);
  process.exit(0);
}

if (mode === "restore") {
  const snapshot = JSON.parse(await readFile(path.resolve(process.cwd(), inputPath), "utf8"));
  validateSnapshot(snapshot);
  if (!apply) {
    console.log(`Dry run restore for ${snapshot.slug} from ${inputPath}`);
    console.log(`Tables: ${Object.keys(snapshot.tables).join(", ")}`);
    process.exit(0);
  }
  if (snapshot.tables.client_runtime_artifacts?.length && !objectsPath) {
    fail("Restore contains artifact metadata; pass --objects with the matching Cloud Storage backup");
  }
  await restoreSnapshot(snapshot);
  if (objectsPath) restoreObjects(objectsPath);
  console.log(`Client metadata restored: ${snapshot.slug}`);
  process.exit(0);
}

const snapshot = await exportSnapshot();
await writeSnapshot(snapshot, outputPath);
console.log(`Pre-offboarding export written: ${outputPath}`);
console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
console.log(`Tenant: ${slug}`);
console.log(`Bucket: ${resolvedBucket}`);
console.log(`Secrets: veloce-${slug}-*`);
console.log(`Service: ${serviceName}`);
if (!apply) {
  console.log("Dry run only. Add --apply --confirm-offboard --destroy-secrets after reviewing the export.");
  process.exit(0);
}

await supabasePatch("client_tenants", `slug=eq.${encodeURIComponent(slug)}`, { status: "offboarding", updated_at: new Date().toISOString() });
if (bucketHasObjects()) runGcloud(["storage", "rm", "--recursive", `gs://${resolvedBucket}/${resolvedNamespace}/**`, "--quiet"]);
if (deleteBucket) runGcloud(["storage", "buckets", "delete", `gs://${resolvedBucket}`, "--project", project, "--quiet"]);
if (deleteQueue) deleteQueueIfPresent();
deleteRuntimeAlerts();
if (deleteNotificationChannel) await deleteClientNotificationChannel(notificationChannel);
const secretNames = listSecretNames();
for (const name of secretNames) runGcloud(["secrets", "delete", name, "--project", project, "--quiet"]);
if (deleteService) runGcloud(["run", "services", "delete", serviceName, "--region", gcp.region || "asia-south1", "--project", project, "--quiet"]);
await supabaseDelete("client_tenants", `slug=eq.${encodeURIComponent(slug)}`);
console.log(`Client offboarding completed: ${slug}`);

async function exportSnapshot() {
  const result = { schemaVersion: 3, slug, exportedAt: new Date().toISOString(), tables: {} };
  for (const table of tables) {
    const rows = await supabaseSelect(table, table === "client_tenants" ? `slug=eq.${encodeURIComponent(slug)}` : `tenant_slug=eq.${encodeURIComponent(slug)}`, exportColumns[table]);
    assertSnapshotSafe(table, rows);
    result.tables[table] = rows;
  }
  return result;
}

async function restoreSnapshot(snapshot) {
  const ordered = ["client_tenants", "client_memberships", "client_runtime_requests", "client_runtime_audit_events", "client_runtime_jobs", "client_runtime_artifacts", "client_notebooks", "client_runtime_records", "client_research_runs", "client_research_records", "client_research_citations", "client_visual_qa_reports", "client_visual_qa_findings", "client_runtime_memory_graph_nodes", "client_runtime_memory_graph_edges", "client_runtime_budget_ledger", "client_runtime_delivery_actions", "client_paperclip_companies", "client_paperclip_projects", "client_paperclip_agents", "client_paperclip_issues", "client_paperclip_comments", "client_paperclip_runs", "client_room_conversations", "client_room_messages", "client_room_rounds", "client_pipeline_items", "client_board_tasks", "client_board_comments", "client_board_events", "client_loop_runs", "client_loop_rounds", "client_ruflo_swarms", "client_ruflo_agents"];
  for (const table of ordered) {
    const rows = Array.isArray(snapshot.tables[table]) ? snapshot.tables[table] : [];
    if (!rows.length) continue;
    const tenantRows = rows.filter((row) => table === "client_tenants" ? row.slug === slug : row.tenant_slug === slug);
    if (tenantRows.length !== rows.length) fail(`Restore contains rows outside requested tenant: ${table}`);
    assertSnapshotSafe(table, tenantRows);
    await supabaseInsert(table, orderForRestore(table, tenantRows).map((row) => pickExportColumns(table, row)));
  }
}

function validateSnapshot(snapshot) {
  if (!snapshot || ![1, 2, 3].includes(snapshot.schemaVersion) || snapshot.slug !== slug || !snapshot.tables || typeof snapshot.tables !== "object") fail("Invalid lifecycle snapshot or slug mismatch");
  for (const [table, rows] of Object.entries(snapshot.tables)) {
    if (!tables.includes(table) || !Array.isArray(rows)) fail(`Invalid lifecycle table: ${table}`);
    assertSnapshotSafe(table, rows);
  }
}

function assertSnapshotSafe(table, rows) {
  for (const row of Array.isArray(rows) ? rows : []) {
    scanSnapshotValue(table, row, "row");
  }
}

function scanSnapshotValue(table, value, pathLabel) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSnapshotValue(table, item, `${pathLabel}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && secretLikeValue.test(value)) fail(`Refusing to export or restore secret-like value in ${table}.${pathLabel}`);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenExportFields.has(key.toLowerCase())) fail(`Refusing to export or restore sensitive field ${table}.${pathLabel}.${key}`);
    scanSnapshotValue(table, child, `${pathLabel}.${key}`);
  }
}

function pickExportColumns(table, row) {
  const columns = exportColumns[table]?.split(",") ?? [];
  return Object.fromEntries(columns.filter((column) => Object.prototype.hasOwnProperty.call(row, column)).map((column) => [column, row[column]]));
}

/**
 * client_paperclip_agents.reports_to points at the same table, so a manager has
 * to be inserted before anyone reporting to them. Export order is not
 * guaranteed, so sort managers first and append any row whose manager is
 * missing or cyclic rather than dropping it.
 */
function orderForRestore(table, rows) {
  if (table !== "client_paperclip_agents") return rows;
  const remaining = [...rows];
  const placed = new Set();
  const ordered = [];
  let progressed = true;
  while (remaining.length && progressed) {
    progressed = false;
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const row = remaining[index];
      const manager = row.reports_to;
      if (!manager || placed.has(manager)) {
        ordered.push(row);
        placed.add(row.id);
        remaining.splice(index, 1);
        progressed = true;
      }
    }
  }
  return [...ordered, ...remaining];
}

function restoreObjects(input) {
  const source = path.resolve(process.cwd(), input);
  if (!existsSync(source)) fail(`Object backup directory not found: ${source}`);
  if (!path.basename(source).startsWith(`${slug}-`)) fail("Object backup directory must begin with the requested client slug");
  const namespacedSource = existsSync(path.join(source, resolvedNamespace)) ? path.join(source, resolvedNamespace) : source;
  runGcloud(["storage", "cp", "--recursive", namespacedSource, `gs://${resolvedBucket}/${resolvedNamespace}`]);
  console.log(`Client objects restored from ${namespacedSource}`);
}

async function writeSnapshot(snapshot, filePath) {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await writeFile(filePath, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  await chmod(filePath, 0o600);
}

async function supabaseSelect(table, filter, columns) {
  if (!columns) fail(`No export column allowlist for ${table}`);
  const response = await supabaseRequest(`${table}?${filter}&select=${encodeURIComponent(columns)}`);
  if (!response.ok) fail(`Export failed for ${table} (${response.status})`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

async function supabaseInsert(table, rows) {
  const response = await supabaseRequest(table, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) });
  if (!response.ok) fail(`Restore failed for ${table} (${response.status})`);
}

async function supabasePatch(table, query, record) {
  const response = await supabaseRequest(`${table}?${query}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(record) });
  if (!response.ok) fail(`Supabase lifecycle update failed (${response.status})`);
}

async function supabaseDelete(table, query) {
  const response = await supabaseRequest(`${table}?${query}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  if (!response.ok) fail(`Supabase lifecycle delete failed (${response.status})`);
}

async function supabaseRequest(pathname, options = {}) {
  const url = process.env.SUPABASE_URL.replace(/\/$/, "");
  return fetch(`${url}/rest/v1/${pathname}`, {
    ...options,
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...(options.headers || {}) },
    cache: "no-store",
  });
}

function exportObjects(destination) {
  spawnSync("mkdir", ["-p", destination], { stdio: "ignore" });
  spawnSync("chmod", ["700", destination], { stdio: "ignore" });
  runGcloud(["storage", "cp", "--recursive", `gs://${resolvedBucket}/${resolvedNamespace}`, destination]);
}

function bucketHasObjects() {
  const result = spawnSync("gcloud", ["storage", "ls", `gs://${resolvedBucket}/${resolvedNamespace}/**`], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim().length > 0;
}

function deleteQueueIfPresent() {
  const queue = gcp.taskQueue || `veloce-${slug}`;
  const region = gcp.region || "asia-south1";
  const existing = spawnSync("gcloud", ["tasks", "queues", "describe", queue, "--location", region, "--project", project], { stdio: "ignore" });
  if (existing.status !== 0) {
    console.log(`Cloud Tasks queue not found; continuing: ${queue}`);
    return;
  }
  runGcloud(["tasks", "queues", "delete", queue, "--location", region, "--project", project, "--quiet"]);
}

function deleteRuntimeAlerts() {
  const policies = spawnSync("gcloud", ["monitoring", "policies", "list", "--project", project, `--filter=displayName~^Veloce ${slug} `, "--format=value(name)"], { encoding: "utf8" });
  if (policies.status !== 0) fail("Unable to enumerate client alert policies");
  for (const name of policies.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    runGcloud(["monitoring", "policies", "delete", name, "--project", project, "--quiet"]);
  }
  const metrics = spawnSync("gcloud", ["logging", "metrics", "list", "--project", project, `--filter=name~veloce_${slug}_runtime_`, "--format=value(name)"], { encoding: "utf8" });
  if (metrics.status !== 0) fail("Unable to enumerate client log metrics");
  for (const name of metrics.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    runGcloud(["logging", "metrics", "delete", name, "--project", project, "--quiet"]);
  }
}

async function deleteClientNotificationChannel(resource) {
  if (!resource || !/^projects\/[^/]+\/notificationChannels\/\d+$/.test(resource)) fail("--notification-channel must be a Monitoring notification channel resource");
  const tokenResult = spawnSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" });
  const token = tokenResult.status === 0 ? tokenResult.stdout.trim() : "";
  if (!token) fail("Unable to obtain a Google Cloud access token for notification-channel deletion");
  const base = "https://monitoring.googleapis.com/v3/";
  const channelResponse = await fetch(`${base}${resource}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
  if (!channelResponse?.ok) fail(`Unable to inspect notification channel (${channelResponse?.status ?? 503})`);
  const channel = await channelResponse.json().catch(() => null);
  if (channel?.displayName !== `Veloce ${slug} runtime alerts`) fail("Refusing to delete a notification channel that is not owned by this client");
  const response = await fetch(`${base}${resource}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
  if (!response?.ok) fail(`Notification-channel deletion failed (${response?.status ?? 503})`);
  console.log("Client notification channel deleted.");
}

function listSecretNames() {
  const result = spawnSync("gcloud", ["secrets", "list", "--project", project, `--filter=name~veloce-${slug}-`, "--format=value(name)"], { encoding: "utf8" });
  if (result.status !== 0) fail("Unable to enumerate client secrets");
  return result.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).map((value) => value.split("/").pop()).filter(Boolean);
}

function runGcloud(command) {
  console.log(`gcloud ${command[0]} ${command[1] || ""} [client-scoped action]`);
  const result = spawnSync("gcloud", command, { stdio: "inherit" });
  if (result.status !== 0) fail(`gcloud action failed: ${command[0]}`);
}

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function required(value, flag) {
  if (!value) fail(`${flag} is required`);
  return value.trim();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
