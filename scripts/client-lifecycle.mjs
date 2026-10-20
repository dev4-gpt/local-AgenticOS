#!/usr/bin/env node
import { readClientExportPages } from "./lib/client-export-pages.mjs";
import { eccLifecycleColumns } from "./lib/ecc-lifecycle.mjs";
import { assertClientArtifactRestoreWindow, clientLifecycleRestoreRow } from "./lib/client-lifecycle-restore.mjs";
import { verifyClientObjectBackup, writeClientObjectBackupManifest } from "./lib/client-lifecycle-backup.mjs";
import { listedClientObjectPaths, objectBackupCoversListing, sameClientObjectInventory, queueListingContains, requireReviewedSecretInventory, reviewedClientSecretNames } from "./lib/client-lifecycle-inventory.mjs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, lstatSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { clientStorageRetentionClock } from "../src/lib/clientStorageRetentionClock.mjs";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const mode = valueAfter("--mode") || "export";
const apply = args.includes("--apply");
const slug = required(valueAfter("--slug"), "--slug");
if (!/^[a-z][a-z0-9-]{2,40}$/.test(slug)) fail("--slug must be a canonical client slug");
const configPath = valueAfter("--config");
const manifestSha256 = valueAfter("--manifest-sha256");
const outputPath = path.resolve(process.cwd(), valueAfter("--out") || `.private-client-kits/exports/${slug}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
const inputPath = valueAfter("--input");
const objectsPath = valueAfter("--objects");
const project = valueAfter("--project") || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
const bucket = valueAfter("--bucket");
const namespace = valueAfter("--namespace") || slug;
const includeObjects = args.includes("--include-objects");
const objectBackupPath = /\.json$/i.test(outputPath) ? outputPath.replace(/\.json$/i, "-objects") : `${outputPath}-objects`;
const confirmRestore = args.includes("--confirm-restore");
const destroySecrets = args.includes("--destroy-secrets");
const notificationChannel = valueAfter("--notification-channel");
const deleteNotificationChannel = args.includes("--delete-notification-channel");
// The fully-automated provisioning pipeline (provision-gcp-client.mjs) never
// creates a per-tenant Monitoring notification channel -- that's a separate,
// currently-manual setup step some tenants (e.g. veloce-cloud-test-b) have
// had done for them and others (e.g. every tenant onboarded through the
// disposable-acceptance pipeline) never have. Requiring --delete-notification-channel
// unconditionally wrongly assumed every tenant has one. --no-notification-channel
// is the explicit, auditable acknowledgement that none exists for this
// tenant -- it does not silently skip a channel that IS there.
const noNotificationChannel = args.includes("--no-notification-channel");
const deleteService = args.includes("--delete-service");
const deleteBucket = args.includes("--delete-bucket");
const deleteQueue = args.includes("--delete-queue");

if (!["export", "restore", "offboard", "retention"].includes(mode)) fail("--mode must be export, restore, offboard, or retention");
if (mode === "restore" && !inputPath) fail("--input is required for restore");
if (mode !== "restore" && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for export/offboard");
if ((mode === "offboard" || mode === "restore") && !process.env.SUPABASE_SERVICE_ROLE_KEY) fail("SUPABASE_SERVICE_ROLE_KEY is required for operator lifecycle actions");
if (mode === "offboard" && apply && !args.includes("--confirm-offboard")) fail("Refusing offboard apply without --confirm-offboard");
if (mode === "offboard" && apply && !destroySecrets) fail("Refusing offboard apply without --destroy-secrets");
if (mode === "offboard" && apply && !deleteQueue) fail("Refusing offboard apply without --delete-queue");
if (mode === "offboard" && apply && deleteNotificationChannel === noNotificationChannel) fail("Refusing offboard apply: pass exactly one of --delete-notification-channel or --no-notification-channel");
if (mode === "offboard" && apply && deleteNotificationChannel && !notificationChannel) fail("--notification-channel is required when deleting the client alert channel");
if (mode === "offboard" && apply && !project) fail("--project is required for offboard apply");
if (mode === "restore" && apply && !confirmRestore) fail("Refusing restore apply without --confirm-restore");
if (mode === "retention" && apply && !args.includes("--confirm-retention-records")) fail("Refusing retention apply without --confirm-retention-records");
if (mode === "retention" && apply && !args.includes("--confirm-retention-learning")) fail("Refusing learning retention apply without --confirm-retention-learning");
if (mode === "retention" && apply && !args.includes("--confirm-retention-sources")) fail("Refusing Notebook source retention apply without --confirm-retention-sources");
if (mode === "retention" && apply && !args.includes("--confirm-retention-notebooks")) fail("Refusing notebook retention apply without --confirm-retention-notebooks");
if (mode === "retention" && apply && !args.includes("--confirm-retention-research")) fail("Refusing research retention apply without --confirm-retention-research");
if (mode === "retention" && apply && !args.includes("--confirm-retention-runtime")) fail("Refusing runtime request retention apply without --confirm-retention-runtime");
if (mode === "retention" && apply && !args.includes("--confirm-retention-room")) fail("Refusing Agent Room retention apply without --confirm-retention-room");
if (mode === "retention" && apply && !args.includes("--confirm-retention-visual-qa")) fail("Refusing Visual QA retention apply without --confirm-retention-visual-qa");
if (mode === "retention" && apply && !args.includes("--confirm-retention-support")) fail("Refusing tenant support retention apply without --confirm-retention-support");
if (mode === "retention" && apply && !args.includes("--confirm-retention-pipeline")) fail("Refusing Pipeline retention apply without --confirm-retention-pipeline");
if (mode === "retention" && apply && !args.includes("--confirm-retention-board-loop")) fail("Refusing Board and Loop retention apply without --confirm-retention-board-loop");
if (mode === "retention" && apply && !args.includes("--confirm-retention-paperclip")) fail("Refusing Paperclip retention apply without --confirm-retention-paperclip");
if (mode === "retention" && apply && !args.includes("--confirm-retention-hermes")) fail("Refusing Hermes Content Factory retention apply without --confirm-retention-hermes");
if (mode === "retention" && apply && !args.includes("--confirm-retention-ruflo")) fail("Refusing Ruflo retention apply without --confirm-retention-ruflo");
if (mode === "retention" && apply && !args.includes("--confirm-retention-onboarding-tokens")) fail("Refusing onboarding-token retention apply without --confirm-retention-onboarding-tokens");
if (mode === "retention" && apply && !args.includes("--confirm-retention-rate-limits")) fail("Refusing runtime rate-limit retention apply without --confirm-retention-rate-limits");
if (mode === "retention" && apply && !args.includes("--confirm-retention-audit-budget")) fail("Refusing audit and budget retention apply without --confirm-retention-audit-budget");
// The adapter host is not installed on every deployment, so its purge is opt-in until it is.
const includeAdapterHost = args.includes("--include-adapter-host");
// A scheduled retention run names its deployment, and only the recorded background owner may run (QM-6c). A manual
// operator run leaves this out. If the check cannot be answered the run stops; it never guesses.
const deploymentId = valueAfter("--deployment-id");
if (deploymentId !== null && !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(deploymentId ?? "")) fail("--deployment-id is not a valid deployment id");
if (mode === "retention" && apply && includeAdapterHost && !args.includes("--confirm-retention-adapter")) fail("Refusing adapter host retention apply without --confirm-retention-adapter");
if (mode === "retention" && apply && !args.includes("--confirm-retention-jobs")) fail("Refusing runtime job retention apply without --confirm-retention-jobs");
if (mode === "retention" && apply && !args.includes("--confirm-retention-credit")) fail("Refusing managed-credit retention apply without --confirm-retention-credit");

if (mode === "offboard" && apply && !configPath) fail("Offboard apply requires --config with a reviewed client manifest");
const manifestBytes = configPath ? await readFile(path.resolve(process.cwd(), configPath)) : null;
const manifest = manifestBytes ? JSON.parse(manifestBytes.toString("utf8")) : {};
const gcp = manifest.gcp && typeof manifest.gcp === "object" ? manifest.gcp : {};
const resolvedBucket = bucket || gcp.storageBucket;
const resolvedNamespace = manifest.storage?.namespace || namespace;
const serviceName = gcp.serviceName || `veloce-${slug}`;
if (namespace !== slug || resolvedNamespace !== slug) fail("storage namespace must equal the client slug");
if (mode === "offboard" && apply) {
  if (!/^[0-9a-f]{64}$/.test(manifestSha256 ?? "") || createHash("sha256").update(manifestBytes).digest("hex") !== manifestSha256) {
    fail("Offboard apply requires the reviewed manifest SHA-256");
  }
  if (manifest.clientSlug !== slug || gcp.projectId !== project || gcp.storageBucket !== resolvedBucket
    || manifest.storage?.namespace !== slug || (gcp.taskQueue && gcp.taskQueue !== `veloce-${slug}`)) {
    fail("Offboard target does not match the reviewed tenant manifest");
  }
  if (deleteBucket && resolvedBucket !== `${project}-veloce-${slug}`) {
    fail("Whole-bucket deletion requires the canonical tenant-dedicated bucket");
  }
}

if ((mode === "offboard" || includeObjects) && !resolvedBucket) fail("--bucket or a manifest storageBucket is required for bucket lifecycle work");
if (mode === "restore" && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for restore");
if (mode === "restore" && objectsPath && !resolvedBucket) fail("--objects restore requires --bucket or a manifest storageBucket");

const tables = [
  "client_tenants",
  "client_memberships",
  "client_manifest_proposals",
  "client_provider_connections",
  "client_support_requests",
  "client_runtime_requests",
  "client_runtime_audit_events",
  "client_runtime_jobs",
  "client_runtime_artifacts",
  "client_notebooks",
  "client_notebook_sources",
  "client_notebook_chunks",
  "client_runtime_records",
  "client_research_runs",
  "client_research_records",
  "client_research_citations",
  "client_research_worker_failures",
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
  ...Object.keys(eccLifecycleColumns),
  // Adapter host data. Parents first, and after the tables above, to match the restore order in the database.
  // The outbox and token-use rows are short-lived operational state and are deliberately not exported.
  "client_adapter_registry",
  "client_adapter_memory_items",
  "client_adapter_memory_promotions",
  "client_adapter_memory_provenance",
  "client_adapter_approvals",
  "client_adapter_budget_events",
];

// Lifecycle exports are portable backups, not credential backups. Keep this
// list explicit so a newly-added sensitive column cannot silently enter an
// export through a wildcard query.
const exportColumns = Object.freeze({
  ...eccLifecycleColumns,
  client_tenants: "slug,name,status,retention_days,created_at,updated_at",
  client_memberships: "tenant_slug,user_id,role,status,created_at",
  client_manifest_proposals: "id,tenant_slug,requested_by,catalog_ids,provider_keys,credential_modes,pricing_snapshot_ids,idempotency_key,manifest_hash,status,metadata,created_at,updated_at",
  client_provider_connections: "id,tenant_slug,catalog_id,provider_key,credential_mode,status,pricing_snapshot_id,manifest_version,last_validated_at,revoked_at,created_at,updated_at",
  client_support_requests: "id,tenant_slug,email,subject,message,status,request_id,request_type,provider_key,requested_budget_micros,created_at,updated_at",
  client_runtime_requests: "id,tenant_slug,submitted_by,request_type,title,details,fields,status,created_at,updated_at",
  client_runtime_audit_events: "id,tenant_slug,actor_id,event_type,request_id,metadata,created_at",
  client_runtime_jobs: "id,tenant_slug,requested_by,capability,provider,model,idempotency_key,status,attempt_count,input_metadata,output_metadata,error_code,created_at,started_at,finished_at",
  client_runtime_artifacts: "id,tenant_slug,job_id,created_by,object_key,original_name,content_type,byte_size,status,retention_expires_at,created_at,review_decision,review_sha256,reviewed_by,reviewed_at",
  client_runtime_records: "id,tenant_slug,created_by,kind,title,content,status,metadata,notebook_id,created_at,updated_at",
  client_notebooks: "id,tenant_slug,created_by,title,summary,status,created_at,updated_at",
  client_notebook_sources: "id,tenant_slug,notebook_id,created_by,kind,title,source_url,artifact_id,source_hash,status,failure_reason,retention_expires_at,deleted_at,created_at,updated_at",
  client_notebook_chunks: "id,tenant_slug,source_id,ordinal,content,content_hash,metadata,created_at",
  client_research_runs: "id,tenant_slug,notebook_id,job_id,created_by,provider,query,status,idempotency_key,result_count,created_at,updated_at",
  client_research_records: "id,tenant_slug,research_run_id,notebook_id,source_url,retrieved_at,fields,confidence,status,failure_reason,created_at",
  client_research_citations: "id,tenant_slug,research_run_id,research_record_id,url,title,retrieved_at,evidence,created_at",
  client_research_worker_failures: "id,tenant_slug,job_id,idempotency_key,phase,sqlstate,record_count,created_at",
  client_visual_qa_reports: "id,tenant_slug,artifact_id,job_id,worker,frames_sampled,runtime_ms,status,warnings,created_at",
  client_visual_qa_findings: "id,tenant_slug,report_id,code,severity,frame,confidence,message",
  client_runtime_memory_graph_nodes: "id,tenant_slug,record_id,graph_key,label,kind,metadata,created_at,updated_at",
  client_runtime_memory_graph_edges: "id,tenant_slug,source_node_id,target_node_id,relation,weight,metadata,created_at",
  client_runtime_budget_ledger: "id,tenant_slug,job_id,provider,model,amount_micros,usage_metadata,created_at",
  client_runtime_delivery_actions: "id,tenant_slug,request_id,requested_by,action,destination,artifact_ids,status,error_code,idempotency_key,created_at,updated_at",
  client_paperclip_companies: "tenant_slug,name,description,issue_prefix,issue_counter,brand_color,budget_monthly_micros,status,retention_expires_at,created_at,updated_at",
  client_paperclip_projects: "id,tenant_slug,created_by,name,url_key,description,color,icon,status,target_date,retention_expires_at,created_at,updated_at",
  client_paperclip_agents: "id,tenant_slug,created_by,name,role,title,icon,status,reports_to,provider,model,budget_monthly_micros,last_heartbeat_at,url_key,retention_expires_at,created_at,updated_at",
  // build_preview_html is a provider-generated copy of the artifact already
  // captured in Cloud Storage; the artifact id is the durable reference, so the
  // export keeps the pointer rather than duplicating the payload.
  client_paperclip_issues: "id,tenant_slug,created_by,issue_number,identifier,title,description,status,priority,project_id,assignee_agent_id,labels,execution_state,execution_job_id,build_artifact_id,started_at,completed_at,retention_expires_at,created_at,updated_at",
  client_paperclip_comments: "id,tenant_slug,issue_id,created_by,author_agent_id,body,retention_expires_at,created_at",
  client_paperclip_runs: "id,tenant_slug,created_by,issue_id,agent_id,job_id,status,provider,model,summary,error_code,cost_micros,started_at,finished_at,retention_expires_at,created_at,updated_at",
  client_room_conversations: "id,tenant_slug,created_by,title,status,present_agents,created_at,updated_at,retention_expires_at",
  client_room_messages: "id,tenant_slug,conversation_id,created_by,role,kind,agent_id,agent_name,agent_color,content,provider,model,cost_micros,error_code,linked_record_id,seq,created_at,retention_expires_at",
  client_room_rounds: "id,tenant_slug,conversation_id,created_by,job_id,status,agent_ids,speaking_agent_id,completed_agents,cost_micros,error_code,created_at,updated_at,retention_expires_at",
  // build_preview_html duplicates a Cloud Storage artifact; the id is the durable reference.
  client_pipeline_items: "id,tenant_slug,created_by,slug,title,stage,route,confidence,tags,idea,classification,plan,tasks,pinned,build_artifact_id,execution_state,execution_job_id,execution_error,decided_by,decided_at,retention_expires_at,created_at,updated_at",
  client_board_tasks: "id,tenant_slug,created_by,board,title,body,status,assignee,priority,labels,build_artifact_id,execution_state,execution_job_id,execution_error,result,started_at,completed_at,retention_expires_at,created_at,updated_at",
  client_board_comments: "id,tenant_slug,task_id,created_by,author,body,retention_expires_at,created_at",
  client_board_events: "id,tenant_slug,task_id,kind,detail,retention_expires_at,created_at",
  client_loop_runs: "id,tenant_slug,created_by,goal,title,status,job_id,builder_provider,builder_model,judge_provider,judge_model,max_rounds,rounds_completed,best_score,final_summary,build_artifact_id,cost_micros,error_code,retention_expires_at,created_at,updated_at",
  client_loop_rounds: "id,tenant_slug,run_id,round,passed,score,issues,summary,artifact_chars,cost_micros,error_code,retention_expires_at,created_at",
  client_hermes_content_factory_runs: "id,tenant_slug,created_by,workflow_id,idempotency_key,content_type,brief,plan,stages,citations,quality_report,approval,delivery,status,current_stage,job_id,error_code,retention_expires_at,created_at,updated_at",
  client_hermes_content_factory_stage_outputs: "id,run_id,tenant_slug,stage,status,output_record_id,artifact_id,citation_record_id,quality_report_id,error_code,output,retention_expires_at,created_at,updated_at",
  client_hermes_content_factory_citations: "id,run_id,tenant_slug,url,title,retrieved_at,evidence,retention_expires_at,created_at",
  client_hermes_content_factory_quality_reports: "id,run_id,tenant_slug,passed,score,citation_count,findings,checked_at,retention_expires_at,created_at",
  client_hermes_content_factory_approvals: "id,run_id,tenant_slug,workflow_id,approved_by,approved_at,retention_expires_at,created_at",
  client_hermes_content_factory_deliveries: "id,run_id,tenant_slug,workflow_id,destination,status,approval_id,artifact_id,retention_expires_at,created_at",
  client_ruflo_swarms: "id,tenant_slug,created_by,objective,topology,preset,status,job_id,provider,model,agent_count,completed_count,failed_count,report_artifact_id,cost_micros,error_code,retention_expires_at,created_at,updated_at",
  client_ruflo_agents: "id,tenant_slug,swarm_id,agent_type,name,task,position,status,output,error_code,cost_micros,started_at,finished_at,retention_expires_at,created_at",
  client_adapter_registry: "id,tenant_slug,adapter_id,display_name,contract_version,manifest_sha256,state,side_effect_ceiling,deletion_guarantee,budget_cap_micros,budget_period,created_by,created_at,updated_at",
  client_adapter_memory_items: "id,tenant_slug,namespace,origin_adapter_id,status,content,content_sha256,trust_level,idempotency_key,promotion_id,supersedes_id,valid_from,tombstoned_at,created_at,retention_expires_at",
  client_adapter_memory_promotions: "id,tenant_slug,source_item_id,origin_adapter_id,content_sha256,status,scan_result,requested_by,reviewed_by,reviewed_at,approved_content_sha256,decision_note,created_at,retention_expires_at",
  client_adapter_memory_provenance: "id,tenant_slug,item_id,adapter_id,adapter_version,agent_principal,source_task_id,source_url,source_sha256,confidence,actor_user,created_at,retention_expires_at",
  client_adapter_approvals: "id,tenant_slug,adapter_id,action_kind,action_hash,action_canonical,destination,policy_version,requested_by,decided_by,approved_action_hash,status,expires_at,decided_at,executed_at,execution_receipt_sha256,created_at,retention_expires_at",
  client_adapter_budget_events: "id,tenant_slug,adapter_id,task_id,kind,amount_micros,provider,model,runtime_budget_ref,idempotency_key,created_at,retention_expires_at",
});

const forbiddenExportFields = new Set([
  "worker_token_hash",
  "credential_value",
  "api_key",
  "access_token",
  "refresh_token",
  "private_key",
  "secret_resource",
]);
const secretLikeValue = /(?:api[_ -]?key|secret|password|private[_ -]?key|access[_ -]?token)\s*[:=]\s*[^\s]{4,}|\b(?:sk|rk|ghp|xai)-[A-Za-z0-9_-]{16,}\b/i;

if (mode === "export") {
  const snapshot = await exportSnapshot();
  await writeSnapshot(snapshot, outputPath);
  if (includeObjects) await exportObjects(objectBackupPath, snapshot);
  console.log(`Client export written: ${outputPath}`);
  process.exit(0);
}

if (mode === "retention") {
  if (deploymentId !== null) {
    const ownerResponse = await supabaseRequest("rpc/client_adapter_background_owner_may_run", { method: "POST", body: JSON.stringify({ p_deployment_id: deploymentId }) });
    if (!ownerResponse.ok) fail(`Background owner check failed (${ownerResponse.status}); verify the background-owner migration`);
    if ((await ownerResponse.json()) !== true) {
      console.log(JSON.stringify({ tenant: slug, skipped: true, reason: "this deployment is not the background owner", deploymentId }));
      process.exit(0);
    }
  }
  const tokenResponse = await supabaseRequest("rpc/purge_expired_client_onboarding_tokens", {
    method: "POST",
    body: JSON.stringify({ p_apply: apply, p_batch_limit: 500 }),
  });
  if (!tokenResponse.ok) fail(`Onboarding token retention failed (${tokenResponse.status}); verify the onboarding-token retention migration`);
  const onboardingTokens = await tokenResponse.json();
  const rateLimitResponse = await supabaseRequest("rpc/purge_expired_client_runtime_rate_limits", {
    method: "POST",
    body: JSON.stringify({ p_apply: apply, p_batch_limit: 500 }),
  });
  if (!rateLimitResponse.ok) fail(`Runtime rate-limit retention failed (${rateLimitResponse.status}); verify the runtime rate-limit retention migration`);
  const runtimeRateLimits = await rateLimitResponse.json();
  const referenceCheck = await supabaseRequest("rpc/client_learning_retention_references_ready", { method: "POST", body: "{}" });
  if (!referenceCheck.ok || await referenceCheck.json().catch(() => false) !== true) {
    fail("Learning retention reference guard is not applied; refusing record purge");
  }
  const tenantQuery = new URLSearchParams({ slug: `eq.${slug}`, select: "retention_days", limit: "2" });
  const tenantResponse = await supabaseRequest(`client_tenants?${tenantQuery}`);
  if (!tenantResponse.ok) fail(`Tenant retention lookup failed (${tenantResponse.status})`);
  const tenants = await tenantResponse.json().catch(() => null);
  const retentionDays = Array.isArray(tenants) && tenants.length === 1 ? Number(tenants[0]?.retention_days) : NaN;
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 28) {
    fail("Tenant retention is missing or exceeds the 28-day content-retention maximum");
  }
  const now = new Date();
  const purgeCutoff = new Date(now.getTime() - (retentionDays + 7) * 24 * 60 * 60 * 1000);
  const filter = new URLSearchParams({ tenant_slug: `eq.${slug}`, retention_expires_at: `lte.${new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()}` });
  const learningBatchLimit = 100;
  const selection = await supabaseRequest(`client_learning_items?${filter}&select=id&order=id&limit=${learningBatchLimit}`);
  if (!selection.ok) fail(`Learning retention selection failed (${selection.status})`);
  const learning = await selection.json().catch(() => null);
  const ids = Array.isArray(learning) ? learning.map((item) => item?.id) : null;
  if (!ids || ids.length > learningBatchLimit || new Set(ids).size !== ids.length
    || ids.some((id) => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    fail("Learning retention selection returned invalid IDs");
  }
  const recordResponse = await supabaseRequest("rpc/purge_expired_client_runtime_records", {
    method: "POST",
    body: JSON.stringify({ p_tenant_slug: slug, p_apply: apply, p_batch_limit: 500 }),
  });
  if (!recordResponse.ok) fail(`Client record retention failed (${recordResponse.status}); verify the 28-day policy migration and tenant configuration`);
  const records = await recordResponse.json();
  const sourceResponse = await supabaseRequest("rpc/purge_expired_client_notebook_sources", {
    method: "POST",
    body: JSON.stringify({ p_tenant_slug: slug, p_apply: apply, p_batch_limit: 100 }),
  });
  if (!sourceResponse.ok) fail(`Notebook source retention failed (${sourceResponse.status}); verify the 28-day policy and source-retention migrations`);
  const sources = await sourceResponse.json();
  const notebookResponse = await supabaseRequest("rpc/purge_expired_client_notebooks", {
    method: "POST",
    body: JSON.stringify({ p_tenant_slug: slug, p_apply: apply, p_batch_limit: 100 }),
  });
  if (!notebookResponse.ok) fail(`Notebook retention failed (${notebookResponse.status}); verify the notebook retention migration`);
  const notebooks = await notebookResponse.json();
  const researchResponse = await supabaseRequest("rpc/purge_expired_client_research", {
    method: "POST",
    body: JSON.stringify({ p_tenant_slug: slug, p_apply: apply, p_batch_limit: 100 }),
  });
  if (!researchResponse.ok) fail(`Research retention failed (${researchResponse.status}); verify the research retention migration`);
  const research = await researchResponse.json();
  const runtimeResponse = await supabaseRequest("rpc/purge_expired_client_runtime_requests", {
    method: "POST",
    body: JSON.stringify({ p_tenant_slug: slug, p_apply: apply, p_batch_limit: 100 }),
  });
  if (!runtimeResponse.ok) fail(`Runtime request retention failed (${runtimeResponse.status}); verify the runtime-request retention migration`);
  const runtimeRequests = await runtimeResponse.json();
  const roomResponse = await supabaseRequest("rpc/purge_expired_client_room_records", {
    method: "POST",
    body: JSON.stringify({ p_tenant_slug: slug, p_apply: apply, p_batch_limit: 100 }),
  });
  if (!roomResponse.ok) fail(`Agent Room retention failed (${roomResponse.status}); verify the room-retention migration`);
  const room = await roomResponse.json();
  const visualQaResponse = await supabaseRequest("rpc/purge_expired_client_visual_qa", {
    method: "POST",
    body: JSON.stringify({ p_tenant_slug: slug, p_apply: apply, p_batch_limit: 100 }),
  });
  if (!visualQaResponse.ok) fail(`Visual QA retention failed (${visualQaResponse.status}); verify the Visual-QA retention migration`);
  const visualQa = await visualQaResponse.json();
  const supportResponse = await supabaseRequest("rpc/purge_expired_client_support_requests", {
    method: "POST",
    body: JSON.stringify({ p_tenant_slug: slug, p_apply: apply, p_batch_limit: 100 }),
  });
  if (!supportResponse.ok) fail(`Tenant support retention failed (${supportResponse.status}); verify the support-retention migration`);
  const supportRequests = await supportResponse.json();
  const pipelineResponse = await supabaseRequest("rpc/purge_expired_client_pipeline_items", {
    method: "POST",
    body: JSON.stringify({ p_tenant_slug: slug, p_apply: apply, p_batch_limit: 100 }),
  });
  if (!pipelineResponse.ok) fail(`Pipeline retention failed (${pipelineResponse.status}); verify the Pipeline retention migration`);
  const pipeline = await pipelineResponse.json();
  const boardLoopResponse = await supabaseRequest("rpc/purge_expired_client_board_loop_records", {
    method: "POST",
    body: JSON.stringify({ p_tenant_slug: slug, p_apply: apply, p_batch_limit: 100 }),
  });
  if (!boardLoopResponse.ok) fail(`Board and Loop retention failed (${boardLoopResponse.status}); verify the board/loop-retention migration`);
  const boardLoop = await boardLoopResponse.json();
  const paperclipResponse = await supabaseRequest("rpc/purge_expired_client_paperclip_records", {
    method: "POST",
    body: JSON.stringify({ p_tenant_slug: slug, p_apply: apply, p_batch_limit: 100 }),
  });
  if (!paperclipResponse.ok) fail(`Paperclip retention failed (${paperclipResponse.status}); verify the Paperclip-retention migration`);
  const paperclip = await paperclipResponse.json();
  const hermesResponse = await supabaseRequest("rpc/purge_expired_client_hermes_content_factory_records", {
    method: "POST",
    body: JSON.stringify({ p_tenant_slug: slug, p_apply: apply, p_batch_limit: 100 }),
  });
  if (!hermesResponse.ok) fail(`Hermes Content Factory retention failed (${hermesResponse.status}); verify the Hermes retention migration`);
  const hermes = await hermesResponse.json();
  const rufloResponse = await supabaseRequest("rpc/purge_expired_client_ruflo_records", {
    method: "POST",
    body: JSON.stringify({ p_tenant_slug: slug, p_apply: apply, p_batch_limit: 100 }),
  });
  if (!rufloResponse.ok) fail(`Ruflo retention failed (${rufloResponse.status}); verify the Ruflo-retention migration`);
  const ruflo = await rufloResponse.json();
  let adapterHost = { included: false };
  if (includeAdapterHost) {
    const adapterResponse = await supabaseRequest("rpc/purge_expired_client_adapter_records", {
      method: "POST",
      body: JSON.stringify({ p_tenant_slug: slug, p_apply: apply, p_batch_limit: 100 }),
    });
    if (!adapterResponse.ok) fail(`Adapter host retention failed (${adapterResponse.status}); verify the adapter retention migration`);
    adapterHost = { included: true, ...(await adapterResponse.json()) };
  }
  // The two housekeeping jobs change rows, so a dry run reports them as not run. They are bounded and safe to repeat.
  if (adapterHost.included) {
    adapterHost.approvalsExpired = null;
    adapterHost.tokenUsesPurged = null;
    adapterHost.tokenCountsPurged = null;
    if (apply) {
      const expireResponse = await supabaseRequest("rpc/client_adapter_expire_approvals", { method: "POST", body: JSON.stringify({ p_limit: 1000 }) });
      if (!expireResponse.ok) fail(`Adapter approval expiry failed (${expireResponse.status}); verify the approval gateway migration`);
      adapterHost.approvalsExpired = await expireResponse.json();
      const tokenResponse = await supabaseRequest("rpc/client_adapter_purge_token_uses", { method: "POST", body: JSON.stringify({ p_limit: 1000 }) });
      if (!tokenResponse.ok) fail(`Adapter token purge failed (${tokenResponse.status}); verify the token migration`);
      adapterHost.tokenUsesPurged = await tokenResponse.json();
      const countsResponse = await supabaseRequest("rpc/client_adapter_purge_token_counts", { method: "POST", body: JSON.stringify({ p_limit: 1000 }) });
      if (!countsResponse.ok) fail(`Adapter token-count purge failed (${countsResponse.status}); verify the token migration`);
      adapterHost.tokenCountsPurged = await countsResponse.json();
    }
  }
  if (apply && ids.length) {
    const deletion = new URLSearchParams(filter);
    deletion.set("id", `in.(${ids.join(",")})`);
    deletion.set("select", "id");
    const response = await supabaseRequest(`client_learning_items?${deletion}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
    if (!response.ok) fail(`Learning retention delete failed (${response.status})`);
    const deleted = await response.json().catch(() => null);
    if (!Array.isArray(deleted) || deleted.length !== ids.length || deleted.some((item) => !ids.includes(item?.id))) {
      fail("Learning retention delete did not match the reviewed batch");
    }
  }
  const jobResponse = await supabaseRequest("rpc/purge_expired_client_runtime_jobs", {
    method: "POST",
    body: JSON.stringify({ p_tenant_slug: slug, p_apply: apply, p_batch_limit: 500 }),
  });
  if (!jobResponse.ok) fail(`Runtime job retention failed (${jobResponse.status}); verify the runtime-job and fixed Room retention migrations`);
  const runtimeJobs = await jobResponse.json();
  const creditResponse = await supabaseRequest("rpc/purge_expired_client_credit_records", {
    method: "POST",
    body: JSON.stringify({ p_tenant_slug: slug, p_apply: apply, p_batch_limit: 100 }),
  });
  if (!creditResponse.ok) fail(`Managed-credit retention failed (${creditResponse.status}); verify the V49 credit-retention migration and reviewed financial policy`);
  const creditRetention = await creditResponse.json();
  const auditBudgetResponse = await supabaseRequest("rpc/purge_expired_client_runtime_audit_and_budget", {
    method: "POST",
    body: JSON.stringify({ p_tenant_slug: slug, p_apply: apply, p_batch_limit: 500 }),
  });
  if (!auditBudgetResponse.ok) fail(`Audit and budget retention failed (${auditBudgetResponse.status}); verify the audit/budget retention migration`);
  const auditBudget = await auditBudgetResponse.json();
  console.log(JSON.stringify({ tenant: slug, onboardingTokens, runtimeRateLimits, auditBudget, runtimeJobs, creditRetention, runtimeRecords: records, runtimeRequests, room, visualQa, supportRequests, pipeline, boardLoop, paperclip, hermes, ruflo, adapterHost, notebookSources: sources, notebooks, research, purgeDueLearningItems: ids.length,
    retentionDays, recoveryDays: 7, purgeAfterDays: retentionDays + 7, purgeCutoff: purgeCutoff.toISOString(),
    learningBatchLimit, moreLearningItemsMayRemain: ids.length === learningBatchLimit,
    applied: apply, learningRevisionsCascade: true }));
  process.exit(0);
}

if (mode === "restore") {
  const snapshotBytes = await readFile(path.resolve(process.cwd(), inputPath));
  const snapshot = JSON.parse(snapshotBytes.toString("utf8"));
  validateSnapshot(snapshot);
  const restoreBatches = prepareRestoreBatches(snapshot);
  if (snapshot.tables.client_runtime_artifacts?.length && !objectsPath) {
    fail("Restore contains artifact metadata; pass --objects with the matching Cloud Storage backup");
  }
  let objectPlan = null;
  if (objectsPath) {
    validateObjectBackupDirectory(objectsPath);
    objectPlan = await verifyClientObjectBackup(objectsPath, resolvedNamespace, snapshotBytes, snapshot.tables.client_runtime_artifacts ?? []);
  }
  assertClientArtifactRestoreWindow(snapshot, objectPlan ?? []);
  if (apply && objectPlan?.length) {
    if (!manifestBytes || !/^[0-9a-f]{64}$/.test(manifestSha256 ?? "")
      || createHash("sha256").update(manifestBytes).digest("hex") !== manifestSha256) {
      fail("Object restore apply requires --config and its reviewed --manifest-sha256");
    }
    if (manifest.clientSlug !== slug || gcp.storageBucket !== resolvedBucket || manifest.storage?.namespace !== slug
      || !Number.isSafeInteger(manifest.storage?.retentionDays) || manifest.storage.retentionDays < 1 || manifest.storage.retentionDays > 28) {
      fail("Object restore destination does not match the reviewed tenant storage policy");
    }
    const artifactByKey = new Map(snapshot.tables.client_runtime_artifacts.map((artifact) => [artifact.object_key, artifact]));
    if (objectPlan.some((file) => !clientStorageRetentionClock(artifactByKey.get(file.objectKey)?.retention_expires_at, manifest.storage.retentionDays))) {
      fail("Object restore deadline is incompatible with the reviewed destination policy");
    }
  }
  if (!apply) {
    console.log(`Dry run restore for ${snapshot.slug} from ${inputPath}`);
    console.log(`Tables: ${Object.keys(snapshot.tables).join(", ")}`);
    console.log("Local preflight only; database constraints and the restore migration are not verified by this dry run.");
    process.exit(0);
  }
  if (objectPlan) {
    restoreObjects(objectPlan, snapshot);
    await verifyClientObjectBackup(objectsPath, resolvedNamespace, snapshotBytes, snapshot.tables.client_runtime_artifacts ?? []);
  }
  await restoreSnapshot(snapshot, objectPlan ?? [], restoreBatches);
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

await assertNoFinancialOffboardRows();
await assertNoResidualControlPlaneRows();
const objectPaths = listBucketObjects();
const queuePresent = deleteQueue ? clientQueueExists() : false;
const alertResources = listRuntimeAlerts();
let secretNames;
try { secretNames = requireReviewedSecretInventory(listSecretNames(), reviewedClientSecretNames(manifest, slug)); }
catch (error) { fail(error.message); }
if (objectPaths.length) {
  if (!includeObjects) fail("Refusing offboard: tenant objects require --include-objects backup before deletion");
  await exportObjects(objectBackupPath, snapshot);
  if (!objectBackupCoversListing(objectBackupPath, resolvedNamespace, objectPaths)) {
    fail("Refusing offboard: object backup does not cover the reviewed tenant inventory");
  }
}
if (!sameClientObjectInventory(objectPaths, listBucketObjects())) {
  fail("Refusing offboard: tenant object inventory changed during backup");
}
if (objectPaths.length) await verifyClientObjectBackup(objectBackupPath, resolvedNamespace, await readFile(outputPath), snapshot.tables.client_runtime_artifacts ?? []);
await supabasePatch("client_tenants", `slug=eq.${encodeURIComponent(slug)}`, { status: "offboarding", updated_at: new Date().toISOString() });
if (!sameClientObjectInventory(objectPaths, listBucketObjects())) {
  fail("Refusing offboard: tenant object inventory changed after suspension");
}
if (objectPaths.length) await verifyClientObjectBackup(objectBackupPath, resolvedNamespace, await readFile(outputPath), snapshot.tables.client_runtime_artifacts ?? []);
if (objectPaths.length) runGcloud(["storage", "rm", "--recursive", `gs://${resolvedBucket}/${resolvedNamespace}/**`, "--quiet"]);
if (listBucketObjects().length) fail("Refusing offboard: tenant objects remain after deletion");
if (deleteBucket) runGcloud(["storage", "buckets", "delete", `gs://${resolvedBucket}`, "--project", project, "--quiet"]);
if (deleteQueue) deleteQueueIfPresent(queuePresent);
deleteRuntimeAlerts(alertResources);
if (deleteNotificationChannel) await deleteClientNotificationChannel(notificationChannel);
for (const name of secretNames) runGcloud(["secrets", "delete", name, "--project", project, "--quiet"]);
if (deleteService) runGcloud(["run", "services", "delete", serviceName, "--region", gcp.region || "asia-south1", "--project", project, "--quiet"]);
if (!deleteBucket && listBucketObjects().length) fail("Refusing offboard: tenant objects reappeared before tenant deletion");
await supabaseDelete("client_tenants", `slug=eq.${encodeURIComponent(slug)}`);
console.log(`Client offboarding completed: ${slug}`);

async function exportSnapshot() {
  const result = { schemaVersion: 3, slug, exportedAt: new Date().toISOString(), tables: {} };
  for (const table of tables) {
    const filter = new URLSearchParams(table === "client_tenants" ? { slug: `eq.${slug}` } : { tenant_slug: `eq.${slug}` });
    if (table === "client_runtime_audit_events" || table === "client_runtime_budget_ledger") {
      const tenantDays = Number(result.tables.client_tenants?.[0]?.retention_days);
      const activeDays = table === "client_runtime_audit_events" ? Math.min(28, tenantDays) : 28;
      if (!Number.isSafeInteger(tenantDays) || tenantDays < 1 || !Number.isSafeInteger(activeDays) || activeDays < 1) fail("Cannot export audit or budget detail without a valid 28-day retention policy");
      filter.set("created_at", `gt.${new Date(Date.now() - activeDays * 24 * 60 * 60 * 1000).toISOString()}`);
    }
    const rows = await supabaseSelect(table, filter.toString(), exportColumns[table]);
    if (table === "client_tenants" && (rows.length !== 1 || rows[0].slug !== slug)) fail("Client tenant not found in lifecycle database");
    assertSnapshotSafe(table, rows);
    result.tables[table] = rows;
  }
  return result;
}

function prepareRestoreBatches(snapshot) {
  const batches = [];
  for (const table of tables) {
    const rows = Array.isArray(snapshot.tables[table]) ? snapshot.tables[table] : [];
    if (!rows.length) continue;
    const tenantRows = rows.filter((row) => table === "client_tenants" ? row.slug === slug : row.tenant_slug === slug);
    if (tenantRows.length !== rows.length) fail(`Restore contains rows outside requested tenant: ${table}`);
    assertSnapshotSafe(table, tenantRows);
    const restoredRows = orderForRestore(table, tenantRows).map((row) => clientLifecycleRestoreRow(table, row));
    for (let offset = 0; offset < restoredRows.length; offset += 500) {
      batches.push({ table, rows: restoredRows.slice(offset, offset + 500).map((row) => pickExportColumns(table, row)) });
    }
  }
  if (batches.reduce((count, batch) => count + batch.rows.length, 0) > 50000
    || Buffer.byteLength(JSON.stringify(batches)) > 33554432) fail("Restore exceeds the bounded metadata transaction limit");
  return batches;
}

async function restoreSnapshot(snapshot, objectPlan, batches) {
  assertClientArtifactRestoreWindow(snapshot, objectPlan);
  const response = await supabaseRequest("rpc/restore_client_lifecycle_metadata", {
    method: "POST", body: JSON.stringify({ p_tenant_slug: slug, p_batches: batches }),
  });
  if (!response.ok) fail(`Atomic metadata restore failed (${response.status}); verify the lifecycle restore migration before retrying`);
  const receipt = await response.json();
  const expected = {};
  for (const batch of batches) expected[batch.table] = (expected[batch.table] ?? 0) + batch.rows.length;
  if (receipt?.atomicMetadata !== true || receipt.restoredRows !== batches.reduce((count, batch) => count + batch.rows.length, 0)
    || !receipt.tables || Object.keys(receipt.tables).length !== Object.keys(expected).length
    || Object.entries(expected).some(([table, count]) => receipt.tables[table] !== count)) {
    fail("Atomic metadata restore returned an unverified receipt; inspect the target before retrying");
  }
}

async function assertNoFinancialOffboardRows() {
  // Tenant deletion cascades these ledgers, but the credential-safe lifecycle
  // snapshot is not an accounting archive. Require a separate reviewed path.
  const historyTables = [
    "client_credit_transactions",
    "client_credit_purchase_plans",
    "client_credit_purchase_plan_allocations",
    "client_credit_reservations",
    "client_credit_reservation_events",
    "client_credit_execution_claims",
  ];
  for (const table of historyTables) {
    const response = await supabaseRequest(`${table}?tenant_slug=eq.${encodeURIComponent(slug)}&select=tenant_slug&limit=1`);
    if (!response.ok) fail(`Cannot verify financial history for ${table} (${response.status})`);
    const rows = await response.json().catch(() => null);
    if (!Array.isArray(rows)) fail(`Cannot verify financial history for ${table}`);
    if (rows.length) fail(`Refusing offboard: ${table} contains financial history requiring reviewed retention and reconciliation`);
  }
  for (const [table, amountFields] of [
    ["client_credit_accounts", ["balance_micros", "reserved_micros"]],
    ["client_credit_budgets", ["purchased_micros", "reserved_micros", "spent_micros"]],
  ]) {
    const rows = await supabaseSelect(table, `tenant_slug=eq.${encodeURIComponent(slug)}`, `tenant_slug,${amountFields.join(",")}`);
    if (rows.some((row) => amountFields.some((field) => !/^0$/.test(String(row[field]))))) {
      fail(`Refusing offboard: ${table} has a nonzero or unverified credit balance`);
    }
  }
}

async function assertNoResidualControlPlaneRows() {
  // These rows survive client_tenants deletion; support tickets also lose
  // their tenant link, making later tenant-scoped cleanup impossible.
  for (const table of ["client_support_requests", "client_onboarding_accounts"]) {
    const response = await supabaseRequest(`${table}?tenant_slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`);
    if (!response.ok) fail(`Cannot verify retained control-plane rows for ${table} (${response.status})`);
    const rows = await response.json().catch(() => null);
    if (!Array.isArray(rows)) fail(`Cannot verify retained control-plane rows for ${table}`);
    if (rows.length) fail(`Refusing offboard: ${table} requires a reviewed retention and reconciliation decision`);
  }
}

function validateSnapshot(snapshot) {
  if (!snapshot || ![1, 2, 3].includes(snapshot.schemaVersion) || snapshot.slug !== slug || !snapshot.tables || typeof snapshot.tables !== "object" || Array.isArray(snapshot.tables)) fail("Invalid lifecycle snapshot or slug mismatch");
  for (const [table, rows] of Object.entries(snapshot.tables)) {
    if (!tables.includes(table) || !Array.isArray(rows)) fail(`Invalid lifecycle table: ${table}`);
    // Validate every table before the first insert, not just as it is restored.
    if (rows.some((row) => !row || typeof row !== "object" || Array.isArray(row)
      || (table === "client_tenants" ? row.slug !== slug : row.tenant_slug !== slug))) {
      fail(`Restore contains rows outside requested tenant: ${table}`);
    }
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

function validateObjectBackupDirectory(input) {
  const source = path.resolve(process.cwd(), input);
  const isDirectory = (directory) => {
    try { return lstatSync(directory).isDirectory(); }
    catch { return false; }
  };
  if (!isDirectory(source)) fail(`Object backup directory not found or not a directory: ${source}`);
  if (!path.basename(source).startsWith(`${slug}-`)) fail("Object backup directory must begin with the requested client slug");
  const namespacedSource = existsSync(path.join(source, resolvedNamespace)) ? path.join(source, resolvedNamespace) : source;
  if (!isDirectory(namespacedSource)) fail(`Object backup directory is invalid: ${namespacedSource}`);
  return namespacedSource;
}

function restoreObjects(plan, snapshot) {
  const artifacts = new Map((snapshot.tables.client_runtime_artifacts ?? []).map((artifact) => [artifact.object_key, artifact]));
  for (const file of plan) {
    const clock = clientStorageRetentionClock(artifacts.get(file.objectKey)?.retention_expires_at, manifest.storage.retentionDays);
    if (!clock) fail("Restore object has no valid original retention deadline");
    runGcloud(["storage", "cp", file.source, `gs://${resolvedBucket}/${file.objectKey}`,
      "--if-generation-match=0", `--content-md5=${file.md5}`, `--custom-time=${clock.customTime}`,
      `--custom-metadata=agentos-retention-expires-at=${clock.retentionExpiresAt},agentos-retention-clock=${clock.policy}`,
      "--cache-control=private,no-store"]);
  }
  console.log(`Client objects transferred: ${plan.length}`);
}

async function writeSnapshot(snapshot, filePath) {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  try {
    await writeFile(filePath, JSON.stringify(snapshot, null, 2), { mode: 0o600, flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") fail("Lifecycle export already exists; choose a fresh --out path");
    throw error;
  }
  await chmod(filePath, 0o600);
}

async function supabaseSelect(table, filter, columns) {
  if (!columns) fail(`No export column allowlist for ${table}`);
  return readClientExportPages({ table, filter, columns, request: supabaseRequest });
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

async function exportObjects(destination, snapshot) {
  try {
    await mkdir(destination, { mode: 0o700 });
  } catch (error) {
    if (error?.code === "EEXIST") fail("Object backup already exists; choose a fresh --out path");
    throw error;
  }
  runGcloud(["storage", "cp", "--recursive", `gs://${resolvedBucket}/${resolvedNamespace}`, destination]);
  await writeClientObjectBackupManifest(destination, resolvedNamespace, await readFile(outputPath), snapshot.tables.client_runtime_artifacts ?? []);
}

function listBucketObjects() {
  const result = spawnSync("gcloud", ["storage", "ls", `gs://${resolvedBucket}/${resolvedNamespace}/**`], { encoding: "utf8" });
  try { return listedClientObjectPaths(result, resolvedBucket, resolvedNamespace); }
  catch (error) { fail(error.message); }
}

function clientQueueExists() {
  const queue = gcp.taskQueue || `veloce-${slug}`;
  const region = gcp.region || "asia-south1";
  const existing = spawnSync("gcloud", ["tasks", "queues", "list", "--location", region, "--project", project, "--format=value(name)"], { encoding: "utf8" });
  try { return queueListingContains(existing, queue); }
  catch (error) { fail(error.message); }
}

function deleteQueueIfPresent(found) {
  const queue = gcp.taskQueue || `veloce-${slug}`;
  const region = gcp.region || "asia-south1";
  if (!found) {
    console.log(`Cloud Tasks queue not found; continuing: ${queue}`);
    return;
  }
  runGcloud(["tasks", "queues", "delete", queue, "--location", region, "--project", project, "--quiet"]);
}

function listRuntimeAlerts() {
  const policies = spawnSync("gcloud", ["monitoring", "policies", "list", "--project", project, `--filter=displayName~^Veloce ${slug} `, "--format=value(name)"], { encoding: "utf8" });
  if (policies.status !== 0) fail("Unable to enumerate client alert policies");
  const metrics = spawnSync("gcloud", ["logging", "metrics", "list", "--project", project, `--filter=name~veloce_${slug}_runtime_`, "--format=value(name)"], { encoding: "utf8" });
  if (metrics.status !== 0) fail("Unable to enumerate client log metrics");
  const names = (output) => output.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  return { policies: names(policies.stdout), metrics: names(metrics.stdout) };
}

function deleteRuntimeAlerts(resources) {
  for (const name of resources.policies) {
    runGcloud(["monitoring", "policies", "delete", name, "--project", project, "--quiet"]);
  }
  for (const name of resources.metrics) {
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
