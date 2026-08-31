#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);
const controlProject = valueAfter("--control-project") || "veloce-agenticos-2026";
const adapterProject = valueAfter("--adapter-project") || process.env.VELOCE_ADAPTER_PROJECT?.trim() || controlProject;
const region = valueAfter("--region") || "asia-south1";
const publicService = valueAfter("--public-service") || "veloce-public-provisioner";
const adapterService = valueAfter("--adapter-service") || "veloce-gcp-provisioner";
const taskQueue = valueAfter("--task-queue") || "veloce-control-plane-provisioning";
const probe = args.includes("--probe");
const allowApply = args.includes("--allow-apply");
const failures = [];
const warnings = [];

const [publicConfig, adapterConfig, adapterIam, adapterProjectInfo, queueConfig, queueIam] = [
  gcloudJson(["run", "services", "describe", publicService, "--project", controlProject, "--region", region, "--format=json"]),
  gcloudJson(["run", "services", "describe", adapterService, "--project", adapterProject, "--region", region, "--format=json"]),
  gcloudJson(["run", "services", "get-iam-policy", adapterService, "--project", adapterProject, "--region", region, "--format=json"]),
  gcloudJson(["projects", "describe", adapterProject, "--format=json"]),
  gcloudJson(["tasks", "queues", "describe", taskQueue, "--project", controlProject, "--location", region, "--format=json"]),
  gcloudJson(["tasks", "queues", "get-iam-policy", taskQueue, "--project", controlProject, "--location", region, "--format=json"]),
];

const publicEnv = envMap(publicConfig);
const adapterEnv = envMap(adapterConfig);
const projectNumber = String(adapterProjectInfo?.projectNumber || "");
const expectedOrigin = `https://${adapterService}-${projectNumber}.${region}.run.app`;
const expectedProvisionUrl = `${expectedOrigin}/provision`;
const audience = valueAfter("--audience") || expectedOrigin;
const expectedPublicIdentity = `veloce-public-provisioner-run@${controlProject}.iam.gserviceaccount.com`;
const expectedAdapterIdentity = `veloce-gcp-provisioner-run@${adapterProject}.iam.gserviceaccount.com`;
const expectedCallbackUrl = "https://app.veloceos.cloud/api/onboarding/provision-result";
const annotations = adapterConfig?.metadata?.annotations || {};

expect(projectNumber.length > 0, "unable to resolve adapter project number");
expect(publicEnv.GCP_PROVISIONER_URL === expectedProvisionUrl, `public provisioner target must be ${expectedProvisionUrl}`);
expect(publicEnv.GCP_PROVISIONER_AUDIENCE === audience, `public provisioner audience must be ${audience}`);
expect(publicEnv.GCP_PROVISIONER_ID_TOKEN_SOURCE === "metadata", "public provisioner must use metadata ID tokens");
expect(publicEnv.GCP_PROVISIONER_TASK_PROJECT === controlProject, `public queue project must be ${controlProject}`);
expect(publicEnv.GCP_PROVISIONER_TASK_LOCATION === region, `public queue location must be ${region}`);
expect(publicEnv.GCP_PROVISIONER_TASK_QUEUE === taskQueue, `public queue must be ${taskQueue}`);
expect(publicEnv.GCP_PROVISIONER_TASK_SERVICE_ACCOUNT === expectedPublicIdentity, `public task identity must be ${expectedPublicIdentity}`);
expect(publicConfig?.spec?.template?.spec?.serviceAccountName === expectedPublicIdentity, `public provisioner identity must be ${expectedPublicIdentity}`);
expect(adapterConfig?.spec?.template?.spec?.serviceAccountName === expectedAdapterIdentity, `adapter identity must be ${expectedAdapterIdentity}`);
expect(annotations["run.googleapis.com/ingress"] === "all", "adapter ingress must be all; IAM remains the privacy boundary");
expect(annotations["run.googleapis.com/invoker-iam-disabled"] !== "true", "adapter IAM invoker check must remain enabled");
expect(parseJsonArray(annotations["run.googleapis.com/custom-audiences"]).length === 0, "adapter must not accept extra custom audiences; Cloud Tasks uses the canonical target URL");
expect(adapterEnv.GCP_ALLOWED_PROJECT === controlProject, `adapter allowed project must be ${controlProject}`);
expect(adapterEnv.GCP_ALLOWED_REGION === region, `adapter allowed region must be ${region}`);
expect(adapterEnv.GCP_ALLOWED_ARTIFACT_REPOSITORY === "veloce", "adapter repository allowlist must be veloce");
expect(allowApply ? adapterEnv.GCP_PROVISIONER_ALLOW_APPLY === "1" : adapterEnv.GCP_PROVISIONER_ALLOW_APPLY === "0", `adapter apply mode must be ${allowApply ? "1" : "0"}`);
expect(adapterEnv.CONTROL_PLANE_CALLBACK_URL === expectedCallbackUrl, `adapter callback URL must be ${expectedCallbackUrl}`);
expect(secretRefName(adapterConfig, "CONTROL_PLANE_OPERATOR_SECRET") === "control-plane-operator-secret", "adapter must receive the operator callback secret from Secret Manager");
expect(secretRefName(adapterConfig, "CONTROL_PLANE_WORKER_TOKEN") === "control-plane-worker-token", "adapter must receive the dispatcher worker token from Secret Manager");
expect(Number(adapterConfig?.spec?.template?.spec?.timeoutSeconds || 0) >= 900, "adapter timeout must be at least 900 seconds");
expect(imageOf(adapterConfig).includes("@sha256:"), "adapter must deploy an immutable image digest");

const invokers = membersForRole(adapterIam, "roles/run.invoker");
expect(invokers.includes(`serviceAccount:${expectedPublicIdentity}`), "adapter is missing the public provisioner invoker binding");
for (const broad of ["allUsers", "allAuthenticatedUsers"]) expect(!invokers.includes(broad), `adapter has forbidden broad invoker: ${broad}`);

expect(queueConfig?.name === `projects/${controlProject}/locations/${region}/queues/${taskQueue}`, "dedicated provisioning queue is missing or mis-scoped");
expect(Number(queueConfig?.rateLimits?.maxConcurrentDispatches || 0) === 1, "provisioning queue must allow exactly one concurrent dispatch before canary approval");
expect(Number(queueConfig?.retryConfig?.maxAttempts || 0) === 1, "provisioning queue must not auto-retry mutable work before canary approval");
const queueEnqueuers = membersForRole(queueIam, "roles/cloudtasks.enqueuer");
expect(queueEnqueuers.includes(`serviceAccount:${expectedPublicIdentity}`), "provisioning queue is missing the public provisioner enqueuer binding");
const publicIdentityIam = gcloudJson(["iam", "service-accounts", "get-iam-policy", expectedPublicIdentity, "--project", controlProject, "--format=json"]);
const publicUsers = membersForRole(publicIdentityIam, "roles/iam.serviceAccountUser");
expect(publicUsers.includes(`serviceAccount:${expectedPublicIdentity}`), "public provisioner needs iam.serviceAccounts.actAs on its task identity");
const taskServiceAgent = `service-${projectNumber}@gcp-sa-cloudtasks.iam.gserviceaccount.com`;
const taskTokenCreators = membersForRole(publicIdentityIam, "roles/iam.serviceAccountTokenCreator");
expect(taskTokenCreators.includes(`serviceAccount:${taskServiceAgent}`), "Cloud Tasks service agent needs token creator on the public task identity");

let health = null;
if (probe && failures.length === 0) {
  const secret = gcloudText(["secrets", "versions", "access", "latest", "--project", controlProject, "--secret", "control-plane-operator-secret"]);
  if (!secret) {
    failures.push("unable to read the operator secret for the health bridge probe");
  } else {
    try {
      const response = await fetch("https://app.veloceos.cloud/api/internal/control-plane/provisioner-health", {
        method: "POST",
        headers: { "X-Control-Plane-Secret": secret },
        signal: AbortSignal.timeout(20000),
      });
      const body = await response.json().catch(() => null);
      health = { status: response.status, ok: body?.ok === true, adapterWorker: body?.adapter?.worker || null };
      expect(response.status === 200, `health bridge returned HTTP ${response.status}`);
      expect(body?.ok === true, "health bridge did not return ok=true");
      expect(body?.adapter?.worker === "gcp-provisioner", "health bridge did not reach the GCP adapter");
    } catch (error) {
      failures.push(`health bridge probe failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} else if (!probe) {
  warnings.push("End-to-end health bridge not checked; pass --probe after deployment");
}

console.log(JSON.stringify({
  ok: failures.length === 0,
  controlProject,
  adapterProject,
  region,
  expectedProvisionUrl,
  audience,
  expectedCallbackUrl,
  taskQueue,
  publicRevision: publicConfig?.status?.latestReadyRevisionName || null,
  adapterRevision: adapterConfig?.status?.latestReadyRevisionName || null,
  adapterImage: imageOf(adapterConfig) || null,
  applyEnabled: adapterEnv.GCP_PROVISIONER_ALLOW_APPLY === "1",
  health,
  failures,
  warnings,
}, null, 2));
if (failures.length) process.exit(1);

function gcloudJson(command) {
  const text = gcloudText(command);
  try { return JSON.parse(text); } catch { return {}; }
}

function gcloudText(command) {
  const result = spawnSync("gcloud", command, { encoding: "utf8", maxBuffer: 5_000_000 });
  if (result.status !== 0) {
    failures.push(`gcloud command failed: ${command.slice(0, 4).join(" ")}: ${(result.stderr || "").trim().split("\n").at(-1) || "unknown error"}`);
    return "";
  }
  return result.stdout.trim();
}

function envMap(service) {
  const env = service?.spec?.template?.spec?.containers?.[0]?.env || [];
  return Object.fromEntries(env.filter((item) => typeof item?.name === "string").map((item) => [item.name, typeof item.value === "string" ? item.value : "[secret-reference]"]));
}

function imageOf(service) {
  return service?.spec?.template?.spec?.containers?.[0]?.image || "";
}

function secretRefName(service, envName) {
  const env = service?.spec?.template?.spec?.containers?.[0]?.env || [];
  const item = env.find((entry) => entry?.name === envName);
  return item?.valueFrom?.secretKeyRef?.name || null;
}

function membersForRole(policy, role) {
  return policy?.bindings?.find((binding) => binding.role === role)?.members || [];
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function valueAfter(flag) {
  const direct = args.find((item) => item.startsWith(`${flag}=`));
  if (direct) return direct.slice(flag.length + 1).trim() || null;
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1].trim() : null;
}
