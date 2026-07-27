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
const recordsSql = await readFile(join(root, "product-experience/supabase-client-runtime-records.sql"), "utf8");
const lifecycleScript = await readFile(join(root, "scripts/client-lifecycle.mjs"), "utf8");
const providerAdapter = await readFile(join(root, "src/lib/clientProviderAdapter.ts"), "utf8");
const mediaAdapter = await readFile(join(root, "src/lib/clientMediaAdapter.ts"), "utf8");
const seoAdapter = await readFile(join(root, "src/lib/clientSeoAdapter.ts"), "utf8");
const deliveryAdapter = await readFile(join(root, "src/lib/clientDeliveryAdapter.ts"), "utf8");
const runtimePolicy = await readFile(join(root, "src/lib/clientRuntimePolicy.ts"), "utf8");
const cloudTasks = await readFile(join(root, "src/lib/cloudTasks.ts"), "utf8");
const alerts = await readFile(join(root, "scripts/provision-client-runtime-alerts.mjs"), "utf8");
const shell = await readFile(join(root, "src/components/Shell.tsx"), "utf8");
const briefWorkspace = await readFile(join(root, "src/components/ClientBriefWorkspace.tsx"), "utf8");

expect(workerRoute.includes("validClientTaskIdentity"), "worker route must verify Cloud Tasks identity");
expect(providerAdapter.includes("CLIENT_PROVIDER_MODEL_ALLOWLIST_JSON") && providerAdapter.includes("provider_model_not_allowlisted"), "provider adapter must enforce provider-specific model allowlists");
expect(workerRoute.includes("claim_client_runtime_job"), "worker route must claim jobs through Supabase");
expect(workerRoute.includes("retry_client_runtime_job"), "worker route must use bounded retry state");
expect(workerRoute.includes("complete_client_runtime_job"), "worker route must complete jobs through Supabase");
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
for (const marker of ["retry_client_runtime_job", "cancel_client_runtime_job", "reserve_client_runtime_budget_worker"]) {
  expect(controlsSql.includes(marker), `controls migration must contain ${marker}`);
}
for (const marker of ["create_client_runtime_artifact_worker", "checkpoint_client_runtime_job_worker", "create_client_delivery_action", "claim_client_delivery_action_worker", "complete_client_delivery_action_worker", "p_error_code", "client_runtime_delivery_actions"]) {
  expect(hostedSql.includes(marker), `hosted capability migration must contain ${marker}`);
}
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
expect(workflowsRoute.includes("CLIENT_WORKFLOW_PROVIDER") && workflowsRoute.includes("enqueueClientRuntimeJob"), "workflow dispatch must use a manifest-selected queued provider job");
expect(lifecycleScript.includes('"client_runtime_records"'), "lifecycle export/restore must include tenant records");
expect(lifecycleScript.includes("SUPABASE_SERVICE_ROLE_KEY") && lifecycleScript.includes("required for export/offboard"), "lifecycle export must require the service role key");
expect(lifecycleScript.includes("confirm-restore") && lifecycleScript.includes("artifact metadata; pass --objects"), "lifecycle restore must require explicit confirmation and matching objects for artifact metadata");
expect(lifecycleScript.includes("name~veloce-${slug}-") && lifecycleScript.includes("deleteRuntimeAlerts"), "lifecycle offboarding must enumerate all client secrets and remove client alert resources");
expect(promotion.includes("Source inbox secret must be inside the client namespace") && promotion.includes("Target secret must be a provider secret"), "credential promotion must enforce client-namespaced source and target secrets");
expect(credentialsRoute.includes("item.submitAllowed") && credentialSubmissionRoute.includes("clientCredentialSubmissionEnabled") && credentialSubmissionRoute.includes("option.submitAllowed"), "credential intake must be available before provider activation but limited to catalogued secrets");
expect(provisioner.includes("credentialInboxSecret") && provisioner.includes("requestInboxSecret") && provisioner.includes("CLIENT_CREDENTIAL_INBOX_SECRET"), "GCP provisioning must normalize inbox secret names into the client namespace");
expect(workerProvisioner.includes("worker_token_hash") && workerProvisioner.includes("base64url") && workerProvisioner.includes("SUPABASE_SERVICE_ROLE_KEY"), "worker provisioning must rotate a random token and persist only its hash with operator credentials");
expect(!workerProvisioner.includes("console.log(token") && !workerProvisioner.includes("console.log(hash"), "worker provisioning must never print the token or hash");
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
expect(provisioner.includes("CLIENT_RUNTIME_BASE_URL") && provisioner.includes("configureRuntimeBaseUrl"), "GCP provisioner must configure the Cloud Run task callback URL");
expect(cloudTasks.includes("CLIENT_RUNTIME_BASE_URL") && cloudTasks.includes("baseUrl"), "Cloud Tasks helper must use the approved runtime callback URL");
expect(cloudTasks.includes("randomUUID") && cloudTasks.includes("const taskName") && cloudTasks.includes("${identifier}-${randomUUID()}"), "Cloud Tasks retries must use unique dispatch names");
expect(provisioner.includes("secretVersionAdder") && provisioner.includes("CLIENT_CREDENTIAL_INBOX_SECRET"), "GCP provisioner must grant inbox version-write access explicitly");
expect(workerRoute.includes("runtime.provider_failed") && workerRoute.includes("runtime.budget_exceeded") && deliveryRoute.includes("runtime.delivery_failed") && alerts.includes("runtime_budget_denied") && alerts.includes("runtime_provider_failed"), "runtime must emit and provision redacted provider, budget, and delivery alerts");
expect(alerts.includes('mimeType: "text/markdown"') && alerts.includes("undefined, metricName"), "runtime alert policies must include valid documentation MIME metadata and idempotent metric checks");
expect(workerRoute.includes('provider: "elevenlabs"'), "speech failures must identify the speech provider in redacted logs");
expect(providerAdapter.includes("AbortSignal.timeout") && providerAdapter.includes("2_000_000"), "provider adapters must bound request time and response size");
expect(mediaAdapter.includes("runClientSpeechAdapter") && mediaAdapter.includes("runClientHeyGenAdapter") && mediaAdapter.includes("runClientMusicAdapter"), "media adapters must cover speech, video, and music contracts");
expect(seoAdapter.includes("safePublicUrl") && seoAdapter.includes("isPrivateAddress"), "SEO adapter must enforce public host and private-address blocking");
expect(deliveryAdapter.includes("approved-webhook") && deliveryAdapter.includes("safeDeliveryUrl"), "delivery adapter must require an allowlisted approved webhook");
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
