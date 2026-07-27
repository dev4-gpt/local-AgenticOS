#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

const root = new URL("..", import.meta.url).pathname;
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const workerRoute = await readFile(join(root, "src/app/api/internal/client-runtime/jobs/route.ts"), "utf8");
const deliveryRoute = await readFile(join(root, "src/app/api/internal/client-runtime/delivery/route.ts"), "utf8");
const jobRoute = await readFile(join(root, "src/app/api/client-runtime/jobs/route.ts"), "utf8");
const artifactsRoute = await readFile(join(root, "src/app/api/client-runtime/artifacts/route.ts"), "utf8");
const promotion = await readFile(join(root, "scripts/promote-client-credential.mjs"), "utf8");
const workerProvisioner = await readFile(join(root, "scripts/provision-client-worker-token.mjs"), "utf8");
const provisioner = await readFile(join(root, "scripts/provision-gcp-client.mjs"), "utf8");
const recordsRoute = await readFile(join(root, "src/app/api/client-runtime/records/route.ts"), "utf8");
const workflowsRoute = await readFile(join(root, "src/app/api/client-runtime/workflows/route.ts"), "utf8");
const credentialsRoute = await readFile(join(root, "src/app/api/client-runtime/credentials/route.ts"), "utf8");
const credentialSubmissionRoute = await readFile(join(root, "src/app/api/client-runtime/credential-submissions/route.ts"), "utf8");
const inputSafety = await readFile(join(root, "src/lib/clientInputSafety.ts"), "utf8");
const controlsSql = await readFile(join(root, "product-experience/supabase-client-runtime-controls.sql"), "utf8");
const hostedSql = await readFile(join(root, "product-experience/supabase-client-runtime-hosted-capabilities.sql"), "utf8");
const workflowReconciliationSql = await readFile(join(root, "product-experience/supabase-client-runtime-workflow-reconciliation.sql"), "utf8");
const finalVerificationSql = await readFile(join(root, "product-experience/supabase-client-runtime-final-verification.sql"), "utf8");
const recordsSql = await readFile(join(root, "product-experience/supabase-client-runtime-records.sql"), "utf8");
const lifecycleScript = await readFile(join(root, "scripts/client-lifecycle.mjs"), "utf8");
const providerAdapter = await readFile(join(root, "src/lib/clientProviderAdapter.ts"), "utf8");
const mediaAdapter = await readFile(join(root, "src/lib/clientMediaAdapter.ts"), "utf8");
const seoAdapter = await readFile(join(root, "src/lib/clientSeoAdapter.ts"), "utf8");
const deliveryAdapter = await readFile(join(root, "src/lib/clientDeliveryAdapter.ts"), "utf8");
const runtimePolicy = await readFile(join(root, "src/lib/clientRuntimePolicy.ts"), "utf8");
const cloudTasks = await readFile(join(root, "src/lib/cloudTasks.ts"), "utf8");
const alerts = await readFile(join(root, "scripts/provision-client-runtime-alerts.mjs"), "utf8");
const middleware = await readFile(join(root, "src/middleware.ts"), "utf8");
const observability = await readFile(join(root, "src/lib/clientRuntimeObservability.ts"), "utf8");
const shell = await readFile(join(root, "src/components/Shell.tsx"), "utf8");
const briefWorkspace = await readFile(join(root, "src/components/ClientBriefWorkspace.tsx"), "utf8");
const workflowRunner = await readFile(join(root, "src/lib/clientWorkflowRunner.ts"), "utf8");

expect(workerRoute.includes("validClientTaskIdentity"), "worker route must verify Cloud Tasks identity");
expect(providerAdapter.includes("CLIENT_PROVIDER_MODEL_ALLOWLIST_JSON") && providerAdapter.includes("provider_model_not_allowlisted"), "provider adapter must enforce provider-specific model allowlists");
expect(workerRoute.includes("claim_client_runtime_job"), "worker route must claim jobs through Supabase");
expect(workerRoute.includes("retry_client_runtime_job"), "worker route must use bounded retry state");
expect(workerRoute.includes("complete_client_runtime_job"), "worker route must complete jobs through Supabase");
expect(workerRoute.includes("update_client_runtime_record_worker") && workerRoute.includes("workflowIdFrom"), "worker must reconcile workflow execution state through the worker-only RPC");
expect(workerRoute.includes("runClientWorkflowRunner") && workerRoute.includes("workflow_input_invalid"), "worker must run and fail closed on invalid provider-free workflow inputs");
expect(workflowRunner.includes("deterministic-free") && workflowRunner.includes("externalActions: \"approval_required\""), "provider-free workflow runner must be explicit about its mode and approval boundary");
expect(workflowRunner.includes("slice(0, 8)") && workflowRunner.includes("slice(0, 5000)"), "workflow runner must bound steps and goal content");
expect(jobRoute.includes("enqueueClientRuntimeTask"), "client job route must enqueue a durable task");
expect(jobRoute.includes("cancelClientRuntimeJob"), "client job route must cancel orphaned queue rows");
expect(jobRoute.includes("clientProviderRequestAllowed"), "client job route must enforce provider and model allowlists before enqueue");
expect(workerRoute.includes("processMediaJob") && workerRoute.includes("processSeoJob"), "worker must have hosted media and SEO branches");
expect(workerRoute.includes("processSunoJob") && workerRoute.includes("runClientMusicAdapter"), "worker must have a queued Suno music branch");
expect(mediaAdapter.includes('clientProviderEnabled("SUNO_API_KEY")') && mediaAdapter.includes("record-info"), "Suno adapter must use an allowlisted server-side key and durable status polling");
expect(workerRoute.includes("create_client_runtime_artifact_worker"), "media worker must create tenant artifact records through RPC");
expect(workerRoute.includes("checkpoint_client_runtime_job_worker"), "async media worker must checkpoint provider job state through RPC");
expect(deliveryRoute.includes("claim_client_delivery_action_worker") && deliveryRoute.includes("runClientDeliveryAdapter"), "delivery worker must claim and execute only approved actions");
for (const marker of ["SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY=", "OPENAI_API_KEY="]) {
  expect(!workerRoute.includes(marker) && !jobRoute.includes(marker), `worker boundary must not contain ${marker}`);
}
for (const marker of ["retry_client_runtime_job", "cancel_client_runtime_job", "reserve_client_runtime_budget_worker", "settle_client_runtime_budget_worker"]) {
  expect(controlsSql.includes(marker), `controls migration must contain ${marker}`);
}
for (const marker of ["create_client_runtime_artifact_worker", "checkpoint_client_runtime_job_worker", "create_client_delivery_action", "claim_client_delivery_action_worker", "complete_client_delivery_action_worker", "p_error_code", "client_runtime_delivery_actions"]) {
  expect(hostedSql.includes(marker), `hosted capability migration must contain ${marker}`);
}
expect(workflowReconciliationSql.includes("update_client_runtime_record_worker") && workflowReconciliationSql.includes("worker_token_hash"), "workflow reconciliation migration must be worker-authenticated");
expect(finalVerificationSql.includes("has_column_privilege") && finalVerificationSql.includes("worker_hash_select"), "final verification must prove the worker hash is not client-readable");
expect(finalVerificationSql.includes("update_client_runtime_record_worker"), "final verification must include workflow reconciliation");
expect(workerRoute.includes("confirm_client_runtime_artifact_worker"), "worker artifact path must confirm storage metadata through the worker RPC");
expect(artifactsRoute.includes('clientRpc("create_client_runtime_artifact"'), "client uploads must create artifact metadata through an authenticated RPC");
expect(!artifactsRoute.includes("CLIENT_WORKER_TOKEN"), "authenticated artifact uploads must not depend on the worker token");
expect(hostedSql.includes("create_client_runtime_artifact(") && hostedSql.includes("p_object_key not like"), "client artifact RPC must enforce tenant and user object namespaces");
expect(recordsRoute.includes("clientCapabilityEnabled(\"tenant-data\")"), "tenant records route must be capability gated");
expect(recordsRoute.includes("client_runtime_records"), "tenant records route must use the hosted records table");
expect(recordsRoute.includes("SECRET_LIKE"), "tenant records route must reject secret-like content");
expect(workflowsRoute.includes("clientCapabilityEnabled(\"orchestration\")"), "hosted workflow route must be capability gated");
expect(workflowsRoute.includes("client_runtime_records") && workflowsRoute.includes("workflow"), "hosted workflow route must use tenant records");
expect(workflowsRoute.includes("SECRET_LIKE"), "hosted workflow route must reject secret-like content");
expect(workflowsRoute.includes("approval_required") && workflowsRoute.includes("updateExecution"), "denied workflow dispatch must retain an auditable execution state");
expect(workflowsRoute.includes("CLIENT_WORKFLOW_PROVIDER") && workflowsRoute.includes("enqueueClientRuntimeJob"), "workflow dispatch must use a manifest-selected queued provider job");
expect(workflowsRoute.includes('capability: "orchestration"') && workflowsRoute.includes("workflow-${workflowId}"), "non-provider workflow operations must use a durable orchestration job");
expect(workflowsRoute.includes('action !== "retry_execution"') && workflowsRoute.includes("workflow_retry_not_allowed") && workflowsRoute.includes("workflow-${id}-retry-${randomUUID()}"), "failed provider-free workflows must support a fresh tenant-scoped retry job");
expect(workflowReconciliationSql.includes("jsonb_typeof(p_execution->'steps') = 'array'") && workflowReconciliationSql.includes("'{steps}'"), "worker reconciliation must mirror bounded step state onto the workflow card");
expect(!workerRoute.includes("output: result.output"), "provider output must not be copied into workflow execution metadata");
expect(lifecycleScript.includes('"client_runtime_records"'), "lifecycle export/restore must include tenant records");
expect(lifecycleScript.includes("SUPABASE_SERVICE_ROLE_KEY") && lifecycleScript.includes("required for export/offboard"), "lifecycle export must require the service role key");
expect(lifecycleScript.includes("confirm-restore") && lifecycleScript.includes("artifact metadata; pass --objects"), "lifecycle restore must require explicit confirmation and matching objects for artifact metadata");
expect(lifecycleScript.includes("name~veloce-${slug}-") && lifecycleScript.includes("deleteRuntimeAlerts"), "lifecycle offboarding must enumerate all client secrets and remove client alert resources");
expect(promotion.includes("Source inbox secret must be inside the client namespace") && promotion.includes("Target secret must be a provider secret") && promotion.includes("disable-source-version") && promotion.includes("latestEnabledVersion"), "credential promotion must enforce client-namespaced source and target secrets and support post-promotion inbox cleanup");
expect(credentialsRoute.includes("item.submitAllowed") && credentialSubmissionRoute.includes("clientCredentialSubmissionEnabled") && credentialSubmissionRoute.includes("option.submitAllowed"), "credential intake must be available before provider activation but limited to catalogued secrets");
expect(provisioner.includes("credentialInboxSecret") && provisioner.includes("requestInboxSecret") && provisioner.includes("CLIENT_CREDENTIAL_INBOX_SECRET"), "GCP provisioning must normalize inbox secret names into the client namespace");
expect(workerProvisioner.includes("worker_token_hash") && workerProvisioner.includes("base64url") && workerProvisioner.includes("SUPABASE_SERVICE_ROLE_KEY"), "worker provisioning must rotate a random token and persist only its hash with operator credentials");
expect(!workerProvisioner.includes("console.log(token") && !workerProvisioner.includes("console.log(hash"), "worker provisioning must never print the token or hash");
expect(controlsSql.includes("revoke select on public.client_tenants from authenticated") && controlsSql.includes("grant select (slug, name, status, retention_days, created_at, updated_at)"), "worker token verifier must be excluded from client-readable tenant columns");
expect(provisioner.includes("immutableRuntimeKeys") && provisioner.includes("cannot override the derived client isolation value"), "GCP provisioning must protect derived tenant isolation values");
expect(provisioner.includes("storage.namespace must equal clientSlug") && provisioner.includes("CLIENT_STORAGE_NAMESPACE: slug"), "GCP provisioning must keep storage and tenant namespaces identical");
expect(provisioner.includes("normalizeCorsOrigins") && provisioner.includes("--cors-file="), "GCP provisioning must configure bucket CORS for signed browser uploads");
expect(provisioner.includes("SUPABASE_SERVICE_ROLE_KEY") && provisioner.includes("Operator-only secret cannot be placed"), "GCP provisioning must reject operator-only secret slots");
expect(inputSafety.includes("SECRET_LIKE") && inputSafety.includes("containsClientSecretLike"), "client input safety helper must reject secret-like text");
for (const provider of ["anthropic", "codex", "openrouter", "openclaw", "hermes", "kimi", "glm", "glm-code", "grok", "antigravity", "freeclaude", "fusion", "sakana"]) {
  const marker = provider.includes("-") ? `"${provider}"` : `${provider}:`;
  expect(providerAdapter.includes(marker), `provider adapter must explicitly register ${provider}`);
}
expect(!runtimePolicy.includes('"/api/client-runtime/provider-chat"'), "client policy must not allow the synchronous provider-chat bypass");
expect(!provisioner.includes("/api/client-runtime/provider-chat"), "GCP client manifest must not allow the synchronous provider-chat bypass");
expect(provisioner.includes("GOOGLE_CLOUD_PROJECT: projectId"), "GCP provisioner must inject the project identifier required by Cloud Tasks");
expect(provisioner.includes("roles/cloudtasks.enqueuer"), "GCP provisioner must grant the runtime service account Cloud Tasks enqueue permission");
expect(provisioner.includes("CLIENT_RUNTIME_BASE_URL") && provisioner.includes("configureRuntimeBaseUrl"), "GCP provisioner must configure the Cloud Run task callback URL");
expect(cloudTasks.includes("CLIENT_RUNTIME_BASE_URL") && cloudTasks.includes("baseUrl"), "Cloud Tasks helper must use the approved runtime callback URL");
expect(cloudTasks.includes("randomUUID") && cloudTasks.includes("const taskName") && cloudTasks.includes("${identifier}-${randomUUID()}"), "Cloud Tasks retries must use unique dispatch names");
expect(provisioner.includes("secretVersionAdder") && provisioner.includes("CLIENT_CREDENTIAL_INBOX_SECRET"), "GCP provisioner must grant inbox version-write access explicitly");
expect(workerRoute.includes("runtime.provider_failed") && workerRoute.includes("runtime.budget_exceeded") && deliveryRoute.includes("runtime.delivery_failed") && alerts.includes("runtime_budget_denied") && alerts.includes("runtime_provider_failed") && alerts.includes("runtime_delivery_failed"), "runtime must emit and provision redacted provider, budget, and delivery alerts");
expect(workerRoute.includes("settleClientRuntimeBudgetWorker") && providerAdapter.includes("clientTextUsageCostMicros"), "successful text provider calls must settle bounded budget reservations using normalized usage");
expect((workerRoute.match(/actualAmountMicros: result\.estimatedCostMicros/g) ?? []).length >= 4, "successful speech, music, video, and SEO jobs must settle fixed provider budget reservations");
expect(workerRoute.includes("settleTerminalBudget") && workerRoute.includes("providerFailure: 1") && workerRoute.includes("artifactStoreFailure: 1"), "terminal provider failures and artifact failures must settle their budget reservation explicitly");
expect(workerRoute.includes("provider_retryable") && workerRoute.includes("retryJob(tenantSlug, jobId, workerToken"), "retryable provider failures must retain the reservation for the next bounded attempt");
expect(workerRoute.includes("safeClientProviderOutput") && providerAdapter.includes("Provider output withheld"), "provider output must be bounded and withheld when it matches secret-like content");
expect(providerAdapter.includes("prompt_tokens") && providerAdapter.includes("input_tokens") && providerAdapter.includes("promptTokenCount"), "provider adapters must normalize OpenAI-compatible, Anthropic, and Gemini usage");
expect(alerts.includes('mimeType: "text/markdown"') && alerts.includes("undefined, metricName"), "runtime alert policies must include valid documentation MIME metadata and idempotent metric checks");
expect(middleware.includes("x-request-id") && middleware.includes("crypto.randomUUID") && middleware.includes("response.headers.set(\"x-request-id\""), "client responses must carry generated request correlation IDs");
expect(observability.includes("SAFE_ID") && observability.includes("SAFE_CODE") && observability.includes("classifyClientRuntimeFailure") && observability.includes("provider_rate_limited"), "runtime observability must strictly redact values and classify provider failures");
expect(alerts.includes('"monitoring", "policies", "update"') && alerts.includes("add-notification-channels"), "rerunning alert provisioning with a channel must attach it to existing policies");
expect(workerRoute.includes('provider: "elevenlabs"'), "speech failures must identify the speech provider in redacted logs");
expect(providerAdapter.includes("AbortSignal.timeout") && providerAdapter.includes("2_000_000"), "provider adapters must bound request time and response size");
expect(mediaAdapter.includes("runClientSpeechAdapter") && mediaAdapter.includes("runClientHeyGenAdapter") && mediaAdapter.includes("runClientMusicAdapter"), "media adapters must cover speech, video, and music contracts");
expect(seoAdapter.includes("safePublicUrl") && seoAdapter.includes("isPrivateAddress"), "SEO adapter must enforce public host and private-address blocking");
expect(deliveryAdapter.includes("approved-webhook") && deliveryAdapter.includes("safeDeliveryUrl") && deliveryAdapter.includes('parsed.protocol === "https:"'), "delivery adapter must require an allowlisted HTTPS approved webhook");
expect(hostedSql.includes("p_namespace <> p_tenant_slug"), "artifact RPC must enforce the tenant storage namespace");
for (const surface of ["opendesign", "web-studio", "flow-lab", "openmontage", "games", "thumbnails", "integrations", "leads", "radar", "guide"]) {
  expect(shell.includes(`"/${surface}"`), `client shell must route ${surface}`);
  expect(briefWorkspace.includes(`${surface}:`) || briefWorkspace.includes(`"${surface}"`), `brief workspace must define ${surface}`);
}
expect(shell.includes('"/local": { provider: "openrouter"') && shell.includes('"/engine": { provider: "openrouter"'), "local and engine must use the hosted API replacement");
for (const marker of ["client_runtime_records", "client_runtime_records_member_select", "client_runtime_records_member_insert", "client_runtime_records_owner_update", "client_runtime_records_owner_delete"]) {
  expect(hostedSql.includes(marker), `hosted capability migration must contain ${marker}`);
  expect(recordsSql.includes(marker), `standalone records migration must contain ${marker}`);
}

const base = (process.env.CLIENT_RUNTIME_URL || "").replace(/\/$/, "");
if (base) {
  const unauthJob = await fetch(`${base}/api/client-runtime/jobs`, { method: "POST", body: "{}", headers: { "content-type": "application/json" }, redirect: "manual" }).catch(() => null);
  expect(unauthJob && [401, 403].includes(unauthJob.status), `unauthenticated jobs endpoint must reject access (got ${unauthJob?.status ?? "no response"})`);
  const workerProbe = await fetch(`${base}/api/internal/client-runtime/jobs`, { method: "POST", body: "{}", headers: { "content-type": "application/json" }, redirect: "manual" }).catch(() => null);
  expect(workerProbe && [401, 403, 404].includes(workerProbe.status), `worker endpoint must reject an unsigned request (got ${workerProbe?.status ?? "no response"})`);
}

if (failures.length) {
  console.error("Client worker verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Client worker verification passed${base ? ` for ${base}` : " (static boundary checks)"}.`);
