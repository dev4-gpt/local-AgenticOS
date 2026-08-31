#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { normalizeCapabilityProviderAllowlist, normalizeHostAllowlist, normalizeModelPricing, normalizeResearchWorkerConfig, validateProviderActivation, validateResearchWorkerConfig } from "./client-provider-policy.mjs";

const args = process.argv.slice(2);
const configPath = valueAfter("--config") ?? valueAfter("-c");
const phase = valueAfter("--phase") ?? "all";
const apply = args.includes("--apply");

if (!configPath) fail("Usage: npm run provision:gcp-client -- --config client-blueprints/acme.gcp.json [--phase prepare|deploy|all] [--apply]");
if (!["prepare", "deploy", "all"].includes(phase)) fail("--phase must be prepare, deploy, or all");
if (apply && phase === "all") fail("Use --phase prepare or --phase deploy for an apply. This keeps infrastructure creation separate from runtime deployment.");

const absoluteConfigPath = path.resolve(process.cwd(), configPath);
if (!existsSync(absoluteConfigPath)) fail(`Config not found: ${absoluteConfigPath}`);

const manifest = JSON.parse(readFileSync(absoluteConfigPath, "utf8"));
const slug = sanitizeSlug(required(manifest.clientSlug, "clientSlug"));
const clientName = required(manifest.clientName, "clientName");
const gcp = requiredObject(manifest.gcp, "gcp");
const projectId = required(gcp.projectId, "gcp.projectId");
const configuredProjectNumber = process.env.GCP_PROJECT_NUMBER?.trim() || "";
const projectNumberResult = configuredProjectNumber ? null : spawnSync("gcloud", ["projects", "describe", projectId, "--format=value(projectNumber)"], { encoding: "utf8" });
const projectNumber = configuredProjectNumber || (projectNumberResult?.status === 0 ? projectNumberResult.stdout.trim() : "");
if (!/^\d{6,}$/.test(projectNumber)) fail("GCP_PROJECT_NUMBER must be configured when Cloud Resource Manager is unavailable.");
const region = required(gcp.region, "gcp.region");
const serviceName = sanitizeServiceName(gcp.serviceName || `veloce-${slug}`);
const workspaceJobName = sanitizeServiceName(gcp.workspaceJobName || `${serviceName}-workspace`);
const visualQaJobName = sanitizeServiceName(gcp.visualQaJobName || `${serviceName}-visual-qa`);
const serviceAccount = sanitizeServiceAccount(gcp.runtimeServiceAccount || `veloce-${shorten(slug, 14)}-run`);
const serviceAccountEmail = `${serviceAccount}@${projectId}.iam.gserviceaccount.com`;
const bucket = sanitizeBucket(gcp.storageBucket || `${projectId}-veloce-${slug}`);
const repository = sanitizeRepository(gcp.artifactRegistryRepository || "veloce");
const image = required(gcp.image, "gcp.image");
let deployImage = image;
const accessMode = manifest.access?.mode || "app-auth";
if (!["app-auth", "cloud-run-iam"].includes(accessMode)) fail("access.mode must be app-auth or cloud-run-iam");
const invokerEmails = normalizeList(manifest.access?.invokerEmails);
const allowedUserEmails = normalizeList(manifest.access?.allowedUserEmails);
const secretEnv = normalizeSecretEnv(manifest.secretEnv ?? manifest.secretRefs ?? {});
const manifestRuntimeEnv = manifest.runtimeEnv && typeof manifest.runtimeEnv === "object" && !Array.isArray(manifest.runtimeEnv)
  ? manifest.runtimeEnv
  : {};
const credentialInboxSecret = normalizeClientSecretName(slug, String(manifestRuntimeEnv.CLIENT_CREDENTIAL_INBOX_SECRET || "client-credential-inbox"));
const requestInboxSecret = normalizeClientSecretName(slug, String(manifestRuntimeEnv.CLIENT_REQUEST_INBOX_SECRET || credentialInboxSecret));
const inboxSecretNames = [...new Set([
  credentialInboxSecret,
  requestInboxSecret,
])];
const enabledCapabilities = normalizeList(manifest.enabledCapabilities);
const enabledTraits = normalizeList(manifest.enabledTraits);
const providerAllowlist = normalizeList(manifest.providerAllowlist, Object.keys(secretEnv));
const modelAllowlist = normalizeList(manifest.modelAllowlist);
const providerModelAllowlist = normalizeProviderModelAllowlist(manifest.providerModelAllowlist);
const capabilityProviderAllowlist = normalizeCapabilityProviderAllowlist(manifest.capabilityProviderAllowlist);
const researchProvider = String(manifest.researchProvider || manifestRuntimeEnv.CLIENT_RESEARCH_PROVIDER || "firecrawl").trim().toLowerCase();
if (!["firecrawl", "brave"].includes(researchProvider)) fail("researchProvider must be firecrawl or brave");
const providerCallsEnabled = manifest.providerCallsEnabled === true;
const modelPricing = normalizeModelPricing(manifest.modelPricing);
const seoAllowedHosts = normalizeHostAllowlist(manifest.seoAllowedHosts);
const deliveryAllowedHosts = normalizeHostAllowlist(manifest.deliveryAllowedHosts);
const researchWorkerConfig = normalizeResearchWorkerConfig(manifest.researchWorkerConfig);
validateResearchWorkerConfig({ value: manifest.researchWorkerConfig, secretNames: Object.keys(secretEnv), providerAllowlist, fail });
validateProviderActivation({
  enabled: providerCallsEnabled,
  providerAllowlist,
  secretNames: Object.keys(secretEnv),
  modelAllowlist,
  providerModelAllowlist,
  modelPricing,
  enabledCapabilities,
  capabilityProviderAllowlist,
  researchProvider,
  seoAllowedHosts,
  deliveryAllowedHosts,
  fail,
});
const configuredStorageNamespace = manifest.storage?.namespace;
if (configuredStorageNamespace != null && sanitizeSlug(String(configuredStorageNamespace)) !== slug) {
  fail("storage.namespace must equal clientSlug so Supabase and Cloud Storage namespaces cannot diverge");
}
const retentionDays = normalizeRetentionDays(manifest.retention?.days);
const storageCorsOrigins = normalizeCorsOrigins(manifest.storage?.corsOrigins);
const storageCorsFile = `/tmp/veloce-${slug}-storage-cors.json`;
writeFileSync(storageCorsFile, JSON.stringify([{
  origin: storageCorsOrigins,
  method: ["GET", "PUT", "OPTIONS"],
  responseHeader: ["Content-Type", "ETag"],
  maxAgeSeconds: 900,
}], null, 2), { mode: 0o600 });
const storageLifecycleFile = `/tmp/veloce-${slug}-storage-lifecycle.json`;
writeFileSync(storageLifecycleFile, JSON.stringify({
  rule: [{
    action: { type: "Delete" },
    condition: { age: retentionDays, matchesPrefix: [`${slug}/`] },
  }],
}, null, 2), { mode: 0o600 });
process.on("exit", () => {
  try { unlinkSync(storageCorsFile); } catch {}
  try { unlinkSync(storageLifecycleFile); } catch {}
});
const protectedRuntimeEnv = {
  GOOGLE_CLOUD_PROJECT: projectId,
  VELOCE_CLIENT_EDITION: "1",
  AGENTIC_OS_DISABLE_LOCAL_CLI: "1",
  AGENTIC_OS_DISABLE_LOCAL_FILES: "1",
  AGENTIC_OS_REQUIRE_APPROVALS: "1",
  CLIENT_SLUG: slug,
  CLIENT_NAME: clientName,
  CLIENT_RUNTIME_ENFORCE_AUTH: "1",
  CLIENT_CREDENTIAL_INBOX_SECRET: credentialInboxSecret,
  CLIENT_REQUEST_INBOX_SECRET: requestInboxSecret,
  CLIENT_ALLOWED_USER_EMAILS: allowedUserEmails.join(","),
  CLIENT_ALLOWED_ROUTES: "/,/provider-catalog,/credits,/context,/orchestrate,/create,/credentials,/capabilities,/deliver,/paperclip,/room,/pipeline,/claude,/openclaw,/hermes,/antigravity,/codex,/kimi,/glm,/glm-code,/grok,/freeclaude,/fusion,/sakana,/local,/engine,/agent-kanban,/loop,/ruflo,/goals,/journal,/seo,/seo-guide,/opendesign,/web-studio,/flow-lab,/integrations,/video,/studio,/openmontage,/music,/games,/thumbnails,/notebook,/kanban,/memory,/leads,/radar,/guide",
  CLIENT_ALLOWED_API_ROUTES: "/api/capabilities,/api/speech/transcribe,/api/client-runtime/credentials,/api/client-runtime/credits,/api/client-runtime/credits/checkout,/api/client-runtime/manifest-proposals,/api/client-runtime/credential-submissions,/api/client-runtime/requests,/api/client-runtime/artifacts,/api/client-runtime/visual-qa,/api/client-runtime/hosted-jobs,/api/client-runtime/executions,/api/client-runtime/intent,/api/client-runtime/delivery,/api/client-runtime/memory-import,/api/client-runtime/memory-graph,/api/client-runtime/provider-history,/api/client-runtime/telemetry,/api/client-runtime/observability,/api/client-runtime/records,/api/client-runtime/research,/api/client-runtime/notebooks,/api/client-runtime/notebook-sources,/api/client-runtime/budget,/api/client-runtime/skills,/api/client-runtime/workflows,/api/client-runtime/paperclip,/api/client-runtime/room,/api/client-runtime/pipeline,/api/client-runtime/boards,/api/client-runtime/loop,/api/client-runtime/ruflo,/api/client-runtime/hermes-content-factory,/api/client-runtime/jobs,/api/internal/client-runtime/jobs,/api/internal/client-runtime/dispatch,/api/internal/client-runtime/visual-qa-dispatch,/api/internal/client-runtime/delivery,/api/client-auth/session",
  CLIENT_ENABLED_CAPABILITIES: enabledCapabilities.join(","),
  CLIENT_ENABLED_TRAITS: enabledTraits.join(","),
  CLIENT_INTENT_ROUTING_ENABLED: manifest.intentRoutingEnabled === false ? "0" : "1",
  CLIENT_RESEARCH_PROVIDER: researchProvider,
  CLIENT_RESEARCH_WORKER_CONFIG_JSON: JSON.stringify(researchWorkerConfig),
  CLIENT_PROVIDER_ALLOWLIST: providerAllowlist.join(","),
  ...(modelAllowlist.length > 0 ? { CLIENT_MODEL_ALLOWLIST: modelAllowlist.join(",") } : {}),
  ...(Object.keys(providerModelAllowlist).length > 0 ? { CLIENT_PROVIDER_MODEL_ALLOWLIST_JSON: JSON.stringify(providerModelAllowlist) } : {}),
  ...(Object.keys(capabilityProviderAllowlist).length > 0 ? { CLIENT_CAPABILITY_PROVIDER_ALLOWLIST_JSON: JSON.stringify(capabilityProviderAllowlist) } : {}),
  ...(manifest.budget?.monthlyCap ? { CLIENT_BUDGET_CAP: String(manifest.budget.monthlyCap) } : {}),
  ...(manifest.budget?.warningThreshold ? { CLIENT_BUDGET_WARNING_THRESHOLD: String(manifest.budget.warningThreshold) } : {}),
  CLIENT_STORAGE_NAMESPACE: slug,
  CLIENT_RUNTIME_DATA_MODE: "supabase",
  CLIENT_RETENTION_DAYS: String(retentionDays),
  ...(manifest.approvalPolicy ? { CLIENT_APPROVAL_POLICY: String(manifest.approvalPolicy) } : {}),
  CLIENT_STORAGE_BUCKET: bucket,
  CLIENT_RUNTIME_SERVICE_ACCOUNT: serviceAccountEmail,
  CLIENT_RUNTIME_TASK_REGION: region,
  CLIENT_RUNTIME_TASK_QUEUE: `veloce-${slug}`,
  CLIENT_TASK_INVOKER_SERVICE_ACCOUNT: serviceAccountEmail,
  CLIENT_EXECUTION_BACKEND: "cloud-run-job",
  CLIENT_WORKSPACE_RUN_JOB: workspaceJobName,
  CLIENT_VISUAL_QA_RUN_JOB: visualQaJobName,
  CLIENT_PROVIDER_CALLS_ENABLED: providerCallsEnabled ? "1" : "0",
  ...(providerCallsEnabled ? { CLIENT_MODEL_PRICING_JSON: JSON.stringify(modelPricing) } : {}),
  ...(seoAllowedHosts.length > 0 ? { CLIENT_SEO_ALLOWED_HOSTS: seoAllowedHosts.join(",") } : {}),
  ...(deliveryAllowedHosts.length > 0 ? { CLIENT_DELIVERY_ALLOWED_HOSTS: deliveryAllowedHosts.join(",") } : {}),
};
const runtimeEnv = { ...manifestRuntimeEnv, ...protectedRuntimeEnv };

const immutableRuntimeKeys = [
  "GOOGLE_CLOUD_PROJECT",
  "VELOCE_CLIENT_EDITION",
  "AGENTIC_OS_DISABLE_LOCAL_CLI",
  "AGENTIC_OS_DISABLE_LOCAL_FILES",
  "AGENTIC_OS_REQUIRE_APPROVALS",
  "CLIENT_SLUG",
  "CLIENT_NAME",
  "CLIENT_RUNTIME_ENFORCE_AUTH",
  "CLIENT_CREDENTIAL_INBOX_SECRET",
  "CLIENT_REQUEST_INBOX_SECRET",
  "CLIENT_ALLOWED_USER_EMAILS",
  "CLIENT_ENABLED_CAPABILITIES",
  "CLIENT_ENABLED_TRAITS",
  "CLIENT_INTENT_ROUTING_ENABLED",
  "CLIENT_RESEARCH_PROVIDER",
  "CLIENT_RESEARCH_WORKER_CONFIG_JSON",
  "CLIENT_PROVIDER_ALLOWLIST",
  "CLIENT_MODEL_ALLOWLIST",
  "CLIENT_PROVIDER_MODEL_ALLOWLIST_JSON",
  "CLIENT_CAPABILITY_PROVIDER_ALLOWLIST_JSON",
  "CLIENT_BUDGET_CAP",
  "CLIENT_BUDGET_WARNING_THRESHOLD",
  "CLIENT_STORAGE_NAMESPACE",
  "CLIENT_STORAGE_BUCKET",
  "CLIENT_RUNTIME_SERVICE_ACCOUNT",
  "CLIENT_RUNTIME_TASK_REGION",
  "CLIENT_RUNTIME_TASK_QUEUE",
  "CLIENT_TASK_INVOKER_SERVICE_ACCOUNT",
  "CLIENT_EXECUTION_BACKEND",
  "CLIENT_WORKSPACE_RUN_JOB",
  "CLIENT_VISUAL_QA_RUN_JOB",
  "CLIENT_PROVIDER_CALLS_ENABLED",
  "CLIENT_MODEL_PRICING_JSON",
  "CLIENT_ALLOWED_ROUTES",
  "CLIENT_ALLOWED_API_ROUTES",
  "CLIENT_RUNTIME_DATA_MODE",
  "CLIENT_SEO_ALLOWED_HOSTS",
  "CLIENT_DELIVERY_ALLOWED_HOSTS",
];
for (const key of immutableRuntimeKeys) {
  if (Object.hasOwn(manifestRuntimeEnv, key) && String(manifestRuntimeEnv[key]) !== String(runtimeEnv[key])) {
    fail(`runtimeEnv.${key} cannot override the derived client isolation value`);
  }
}

if (apply) {
  if (manifest.approved !== true) fail("Refusing --apply: manifest.approved must be true after Veloce approval.");
  if (manifest.acknowledgeClientSafeRuntime !== true) fail("Refusing --apply: acknowledgeClientSafeRuntime must be true. Do not deploy raw private 3939.");
  if (allowedUserEmails.length === 0) fail("Refusing --apply: access.allowedUserEmails must include at least one approved runtime user.");
  if (accessMode === "cloud-run-iam" && invokerEmails.length === 0) fail("Refusing --apply: access.invokerEmails must include at least one approved IAM invoker.");
  if (phase === "deploy" && Object.keys(secretEnv).length === 0) fail("Refusing --apply: deploy phase requires at least the Supabase anon key in secretEnv.");
  if (phase === "deploy" || phase === "all") deployImage = resolveImageDigest(image);
}

const prepareCommands = [
  ["gcloud", ["config", "set", "project", projectId]],
  ["gcloud", ["iam", "service-accounts", "create", serviceAccount, "--project", projectId, "--display-name", `Veloce ${clientName} runtime`]],
  ["gcloud", ["storage", "buckets", "create", `gs://${bucket}`, "--project", projectId, "--location", region, "--uniform-bucket-level-access"]],
  ["gcloud", ["storage", "buckets", "update", `gs://${bucket}`, `--cors-file=${storageCorsFile}`]],
  ["gcloud", ["storage", "buckets", "update", `gs://${bucket}`, `--lifecycle-file=${storageLifecycleFile}`]],
  ["gcloud", ["storage", "buckets", "add-iam-policy-binding", `gs://${bucket}`, "--member", `serviceAccount:${serviceAccountEmail}`, "--role", "roles/storage.objectAdmin"]],
  ["gcloud", ["iam", "service-accounts", "add-iam-policy-binding", serviceAccountEmail, "--project", projectId, "--member", `serviceAccount:${serviceAccountEmail}`, "--role", "roles/iam.serviceAccountTokenCreator"]],
  ["gcloud", ["iam", "service-accounts", "add-iam-policy-binding", serviceAccountEmail, "--project", projectId, "--member", `serviceAccount:service-${projectNumber}@gcp-sa-cloudtasks.iam.gserviceaccount.com`, "--role", "roles/iam.serviceAccountTokenCreator"]],
  ["gcloud", ["tasks", "queues", "create", `veloce-${slug}`, "--location", region, "--project", projectId, "--max-concurrent-dispatches", "1", "--max-attempts", "10"]],
  ["gcloud", ["tasks", "queues", "add-iam-policy-binding", `veloce-${slug}`, "--location", region, "--project", projectId, "--member", `serviceAccount:${serviceAccountEmail}`, "--role", "roles/cloudtasks.enqueuer"]],
  ...Object.values(secretEnv).flatMap((secretRef) => {
    const secretName = secretNameFor(slug, secretRef);
    return [
      ["gcloud", ["secrets", "create", secretName, "--project", projectId, "--replication-policy", "automatic"]],
      ["gcloud", ["secrets", "add-iam-policy-binding", secretName, "--project", projectId, "--member", `serviceAccount:${serviceAccountEmail}`, "--role", "roles/secretmanager.secretAccessor"]],
    ];
  }),
  ...inboxSecretNames.flatMap((secretName) => [
    ["gcloud", ["secrets", "create", secretName, "--project", projectId, "--replication-policy", "automatic"]],
    ["gcloud", ["secrets", "add-iam-policy-binding", secretName, "--project", projectId, "--member", `serviceAccount:${serviceAccountEmail}`, "--role", "roles/secretmanager.secretVersionAdder"]],
  ]),
];

const deployCommands = [
  ["gcloud", [
    "run", "deploy", serviceName,
    "--project", projectId,
    "--region", region,
    "--image", deployImage,
    "--service-account", serviceAccountEmail,
    accessMode === "app-auth" ? "--allow-unauthenticated" : "--no-allow-unauthenticated",
    "--min-instances", String(gcp.minInstances ?? 0),
    "--max-instances", String(gcp.maxInstances ?? 1),
    "--cpu", String(gcp.cpu ?? "1"),
    "--memory", String(gcp.memory ?? "1Gi"),
    "--concurrency", String(gcp.concurrency ?? 8),
    "--timeout", String(gcp.timeout ?? "900s"),
    "--set-env-vars", envString(runtimeEnv),
    "--set-secrets", secretString(slug, secretEnv),
  ]],
  ...(accessMode === "cloud-run-iam" ? invokerEmails : []).map((email) => [
    "gcloud",
    ["run", "services", "add-iam-policy-binding", serviceName, "--project", projectId, "--region", region, "--member", `user:${email}`, "--role", "roles/run.invoker"],
  ]),
];

console.log(`Veloce GCP client runtime: ${clientName} (${slug})`);
console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
console.log(`Phase: ${phase}`);
console.log("");
console.log("Derived resources:");
console.log(`  project: ${projectId}`);
console.log(`  region: ${region}`);
console.log(`  repository: ${repository}`);
console.log(`  service: ${serviceName}`);
console.log(`  workspace job: ${workspaceJobName}`);
if (enabledCapabilities.includes("visual-qa")) console.log(`  visual QA job: ${visualQaJobName}`);
console.log(`  service account: ${serviceAccountEmail}`);
console.log(`  bucket: gs://${bucket}`);
console.log(`  storage CORS origins: ${storageCorsOrigins.join(",")}`);
console.log(`  image: ${image}`);
if (apply && (phase === "deploy" || phase === "all")) console.log(`  deploy digest: ${deployImage}`);
console.log(`  access: ${accessMode}`);
console.log(`  approved users: ${allowedUserEmails.length}`);
console.log(`  secret slots: ${Object.keys(secretEnv).length}`);
console.log(`  inbox secrets: ${inboxSecretNames.length}`);
console.log("");

if (phase === "prepare" || phase === "all") runCommands(prepareCommands);
if (phase === "deploy" || phase === "all") {
  if (apply) verifySecretVersions();
  runCommands(deployCommands);
  if (apply) {
    const serviceUrl = configureRuntimeBaseUrl();
    deployWorkspaceJob(serviceUrl);
    if (enabledCapabilities.includes("visual-qa")) deployVisualQaJob(serviceUrl);
    routeTrafficToLatestRevision();
  } else {
    printWorkspaceJobCommand("DEPLOYED_SERVICE_URL");
    if (enabledCapabilities.includes("visual-qa")) printVisualQaJobCommand("DEPLOYED_SERVICE_URL");
  }
}

if (!apply) console.log("Dry run only. Use --apply --phase prepare, then add secret versions, then use --apply --phase deploy.");

function runCommands(commands) {
  for (const [cmd, cmdArgs] of commands) {
    const createCheck = createCheckFor(cmd, cmdArgs);
    if (apply && createCheck && resourceExists(createCheck.cmd, createCheck.args)) {
      console.log(`skip existing ${cmd} ${cmdArgs[cmdArgs.length - 1] ?? "resource"}`);
      continue;
    }
    printCommand(cmd, cmdArgs);
    if (!apply) continue;
    const result = spawnSync(cmd, cmdArgs, { stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

function createCheckFor(cmd, cmdArgs) {
  if (cmd === "gcloud" && cmdArgs[0] === "artifacts" && cmdArgs[1] === "repositories") return { cmd, args: ["artifacts", "repositories", "describe", repository, "--location", region, "--project", projectId] };
  if (cmd === "gcloud" && cmdArgs[0] === "iam" && cmdArgs[1] === "service-accounts" && cmdArgs[2] === "create") return { cmd, args: ["iam", "service-accounts", "describe", serviceAccountEmail, "--project", projectId] };
  if (cmd === "gcloud" && cmdArgs[0] === "storage" && cmdArgs[1] === "buckets" && cmdArgs[2] === "create") return { cmd, args: ["storage", "buckets", "describe", `gs://${bucket}`, "--project", projectId] };
  if (cmd === "gcloud" && cmdArgs[0] === "secrets" && cmdArgs[1] === "create") return { cmd, args: ["secrets", "describe", cmdArgs[2], "--project", projectId] };
  if (cmd === "gcloud" && cmdArgs[0] === "tasks" && cmdArgs[1] === "queues" && cmdArgs[2] === "create") return { cmd, args: ["tasks", "queues", "describe", cmdArgs[3], "--location", region, "--project", projectId] };
  return null;
}

function resourceExists(cmd, cmdArgs) {
  return spawnSync(cmd, [...cmdArgs, "--format=value(name)"], { stdio: "ignore" }).status === 0;
}

function verifySecretVersions() {
  for (const secretRef of Object.values(secretEnv)) {
    const secretName = secretNameFor(slug, secretRef);
    const result = spawnSync("gcloud", ["secrets", "versions", "list", secretName, "--project", projectId, "--filter=state=ENABLED", "--limit=1", "--format=value(name)"], { encoding: "utf8" });
    if (result.status !== 0 || !result.stdout.trim()) fail(`Missing enabled secret version for ${secretName}. Add it before deploy.`);
  }
}

function resolveImageDigest(imageRef) {
  if (/@sha256:[a-f0-9]{64}$/i.test(imageRef)) return imageRef;
  const result = spawnSync("gcloud", ["artifacts", "docker", "images", "describe", imageRef, "--project", projectId, "--format=value(image_summary.digest)"], { encoding: "utf8" });
  const digest = result.status === 0 ? result.stdout.trim() : "";
  if (!/^sha256:[a-f0-9]{64}$/i.test(digest)) {
    fail(`Image ${imageRef} is not available in Artifact Registry yet. Wait for Cloud Build to finish, then rerun the deploy.`);
  }
  const repositoryRef = imageRef.replace(/@sha256:[a-f0-9]{64}$/i, "").replace(/:[^/:]+$/, "");
  return `${repositoryRef}@${digest}`;
}

function configureRuntimeBaseUrl() {
  const result = spawnSync("gcloud", ["run", "services", "describe", serviceName, "--project", projectId, "--region", region, "--format=value(status.url)"], { encoding: "utf8" });
  const serviceUrl = result.status === 0 ? result.stdout.trim().replace(/\/$/, "") : "";
  if (!/^https:\/\//i.test(serviceUrl)) fail("Could not resolve the deployed Cloud Run HTTPS URL for CLIENT_RUNTIME_BASE_URL");
  if (runtimeEnv.CLIENT_RUNTIME_BASE_URL !== serviceUrl) {
    console.log(`Configuring task callback base URL: ${serviceUrl}`);
    const update = spawnSync("gcloud", ["run", "services", "update", serviceName, "--project", projectId, "--region", region, "--update-env-vars", `CLIENT_RUNTIME_BASE_URL=${serviceUrl}`], { stdio: "inherit" });
    if (update.status !== 0) process.exit(update.status ?? 1);
  }
  return serviceUrl;
}

function workspaceJobArgs(serviceUrl) {
  return [
    "run", "jobs", "deploy", workspaceJobName,
    "--project", projectId,
    "--region", region,
    "--service-account", serviceAccountEmail,
    "--tasks", "1",
    "--max-retries", "2",
    "--task-timeout", String(gcp.timeout ?? "900s"),
    "--container", "workspace-runner",
    "--image", deployImage,
    "--cpu", String(gcp.cpu ?? "1"),
    "--memory", String(gcp.memory ?? "1Gi"),
    "--command", "node",
    "--args", "scripts/run-client-workspace-job.mjs",
    "--set-env-vars", `CLIENT_RUNTIME_BASE_URL=${serviceUrl}`,
  ];
}

function visualQaJobArgs(serviceUrl) {
  return [
    "run", "jobs", "deploy", visualQaJobName,
    "--project", projectId,
    "--region", region,
    "--service-account", serviceAccountEmail,
    "--tasks", "1",
    "--max-retries", "2",
    "--task-timeout", String(gcp.timeout ?? "900s"),
    "--container", "visual-qa-runner",
    "--image", deployImage,
    "--cpu", "1",
    "--memory", "1Gi",
    "--command", "node",
    "--args", "scripts/run-client-visual-qa-job.mjs",
    "--set-env-vars", `CLIENT_RUNTIME_BASE_URL=${serviceUrl}`,
  ];
}

function printWorkspaceJobCommand(serviceUrl) {
  printCommand("gcloud", workspaceJobArgs(serviceUrl));
  printCommand("gcloud", ["run", "jobs", "add-iam-policy-binding", workspaceJobName, "--project", projectId, "--region", region, "--member", `serviceAccount:${serviceAccountEmail}`, "--role", "roles/run.jobsExecutorWithOverrides"]);
}

function printVisualQaJobCommand(serviceUrl) {
  printCommand("gcloud", visualQaJobArgs(serviceUrl));
  printCommand("gcloud", ["run", "jobs", "add-iam-policy-binding", visualQaJobName, "--project", projectId, "--region", region, "--member", `serviceAccount:${serviceAccountEmail}`, "--role", "roles/run.jobsExecutorWithOverrides"]);
}

function deployWorkspaceJob(serviceUrl) {
  console.log(`Deploying isolated workspace job: ${workspaceJobName}`);
  const deploy = spawnSync("gcloud", workspaceJobArgs(serviceUrl), { stdio: "inherit" });
  if (deploy.status !== 0) process.exit(deploy.status ?? 1);
  const binding = spawnSync("gcloud", ["run", "jobs", "add-iam-policy-binding", workspaceJobName, "--project", projectId, "--region", region, "--member", `serviceAccount:${serviceAccountEmail}`, "--role", "roles/run.jobsExecutorWithOverrides"], { stdio: "inherit" });
  if (binding.status !== 0) process.exit(binding.status ?? 1);
}

function deployVisualQaJob(serviceUrl) {
  console.log(`Deploying isolated Visual QA job: ${visualQaJobName}`);
  const deploy = spawnSync("gcloud", visualQaJobArgs(serviceUrl), { stdio: "inherit" });
  if (deploy.status !== 0) process.exit(deploy.status ?? 1);
  const binding = spawnSync("gcloud", ["run", "jobs", "add-iam-policy-binding", visualQaJobName, "--project", projectId, "--region", region, "--member", `serviceAccount:${serviceAccountEmail}`, "--role", "roles/run.jobsExecutorWithOverrides"], { stdio: "inherit" });
  if (binding.status !== 0) process.exit(binding.status ?? 1);
}

function routeTrafficToLatestRevision() {
  console.log("Routing client traffic to the latest ready Cloud Run revision");
  const update = spawnSync("gcloud", ["run", "services", "update-traffic", serviceName, "--project", projectId, "--region", region, "--to-latest"], { stdio: "inherit" });
  if (update.status !== 0) process.exit(update.status ?? 1);
}

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function required(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) fail(`Missing required field: ${name}`);
  return value.trim();
}

function requiredObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`Missing required object: ${name}`);
  return value;
}

function normalizeList(value, fallback = []) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return fallback;
}

function sanitizeSlug(value) {
  const slug = value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!/^[a-z][a-z0-9-]{2,40}$/.test(slug)) fail(`Invalid clientSlug after sanitization: ${slug}`);
  return slug;
}

function sanitizeServiceName(value) {
  const name = value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(name)) fail(`Invalid Cloud Run service name: ${name}`);
  return name;
}

function sanitizeServiceAccount(value) {
  const name = value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
  if (!/^[a-z][a-z0-9-]{4,29}$/.test(name)) fail(`Invalid service account id: ${name}`);
  return name;
}

function sanitizeBucket(value) {
  const name = value.toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (name.length < 3 || name.length > 63) fail(`Invalid bucket name length: ${name}`);
  return name;
}

function normalizeRetentionDays(value) {
  const days = Number(value);
  if (!Number.isSafeInteger(days) || days < 1 || days > 3650) fail("retention.days must be an integer between 1 and 3650");
  return days;
}

function sanitizeRepository(value) {
  const name = String(value).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(name)) fail(`Invalid Artifact Registry repository: ${name}`);
  return name;
}

function sanitizeSecret(value) {
  const name = value.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!/^[a-z][a-z0-9_-]{1,120}$/.test(name)) fail(`Invalid secret ref: ${name}`);
  return name;
}

function normalizeSecretEnv(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.map((ref) => {
      const secret = sanitizeSecret(String(ref));
      return [secret.toUpperCase().replace(/-/g, "_"), secret];
    }));
  }
  if (!value || typeof value !== "object") return {};
  const out = {};
  for (const [envName, secretRef] of Object.entries(value)) {
    const cleanEnv = envName.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,120}$/.test(cleanEnv)) fail(`Invalid secret env name: ${envName}`);
    if (["SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "AWS_SECRET_ACCESS_KEY", "CLAUDE_CODE_SESSION", "CODEX_SESSION"].includes(cleanEnv)) {
      fail(`Operator-only secret cannot be placed in a client manifest: ${cleanEnv}`);
    }
    out[cleanEnv] = sanitizeSecret(String(secretRef));
  }
  return out;
}

function normalizeProviderModelAllowlist(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [provider, models] of Object.entries(value)) {
    const cleanProvider = provider.trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(cleanProvider) || !Array.isArray(models)) fail(`Invalid providerModelAllowlist entry: ${provider}`);
    const cleanModels = models.map((model) => String(model).trim()).filter(Boolean);
    if (cleanModels.length === 0) fail(`providerModelAllowlist.${provider} must contain at least one model`);
    out[cleanProvider] = [...new Set(cleanModels)];
  }
  return out;
}

function normalizeCorsOrigins(value) {
  if (value == null) return ["*"];
  if (!Array.isArray(value) || value.length === 0) fail("storage.corsOrigins must be a non-empty array when provided");
  const origins = value.map((origin) => String(origin).trim()).filter(Boolean);
  if (origins.includes("*")) return ["*"];
  if (origins.some((origin) => !/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(origin))) {
    fail("storage.corsOrigins entries must be HTTPS origins or '*'");
  }
  return [...new Set(origins)];
}

function shorten(value, max) {
  return value.length <= max ? value : value.slice(0, max).replace(/-$/g, "");
}

function secretNameFor(clientSlug, secretRef) {
  return `veloce-${clientSlug}-${secretRef}`;
}

function normalizeClientSecretName(clientSlug, value) {
  const raw = value.trim();
  const prefix = `veloce-${clientSlug}-`;
  return raw.startsWith(prefix) ? raw : secretNameFor(clientSlug, sanitizeSecret(raw));
}

function envString(values) {
  return `^|^${Object.entries(values)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("|")}`;
}

function secretString(clientSlug, values) {
  return Object.entries(values)
    .map(([envName, secretRef]) => `${envName}=${secretNameFor(clientSlug, secretRef)}:latest`)
    .join(",");
}

function printCommand(cmd, cmdArgs) {
  const rendered = [cmd, ...cmdArgs].map((part) => {
    if (/^[A-Za-z0-9_./:=@-]+$/.test(part)) return part;
    return JSON.stringify(part);
  }).join(" ");
  console.log(rendered);
}
