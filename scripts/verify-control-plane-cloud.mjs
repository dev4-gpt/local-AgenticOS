#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);
const controlProject = valueAfter("--control-project") || "veloce-agenticos-2026";
const adapterProject = valueAfter("--adapter-project") || process.env.VELOCE_ADAPTER_PROJECT?.trim() || controlProject;
const region = valueAfter("--region") || "asia-south1";
const publicService = valueAfter("--public-service") || "veloce-public-provisioner";
const adapterService = valueAfter("--adapter-service") || "veloce-gcp-provisioner";
const audience = valueAfter("--audience") || "veloce-gcp-provisioner";
const probe = args.includes("--probe");
const allowApply = args.includes("--allow-apply");
const failures = [];
const warnings = [];

const [publicConfig, adapterConfig, adapterIam, adapterProjectInfo] = [
  gcloudJson(["run", "services", "describe", publicService, "--project", controlProject, "--region", region, "--format=json"]),
  gcloudJson(["run", "services", "describe", adapterService, "--project", adapterProject, "--region", region, "--format=json"]),
  gcloudJson(["run", "services", "get-iam-policy", adapterService, "--project", adapterProject, "--region", region, "--format=json"]),
  gcloudJson(["projects", "describe", adapterProject, "--format=json"]),
];

const publicEnv = envMap(publicConfig);
const adapterEnv = envMap(adapterConfig);
const projectNumber = String(adapterProjectInfo?.projectNumber || "");
const expectedOrigin = `https://${adapterService}-${projectNumber}.${region}.run.app`;
const expectedProvisionUrl = `${expectedOrigin}/provision`;
const expectedPublicIdentity = `veloce-public-provisioner-run@${controlProject}.iam.gserviceaccount.com`;
const expectedAdapterIdentity = `veloce-gcp-provisioner-run@${adapterProject}.iam.gserviceaccount.com`;
const annotations = adapterConfig?.metadata?.annotations || {};
const customAudiences = parseJsonArray(annotations["run.googleapis.com/custom-audiences"]);

expect(projectNumber.length > 0, "unable to resolve adapter project number");
expect(publicEnv.GCP_PROVISIONER_URL === expectedProvisionUrl, `public provisioner target must be ${expectedProvisionUrl}`);
expect(publicEnv.GCP_PROVISIONER_AUDIENCE === audience, `public provisioner audience must be ${audience}`);
expect(publicEnv.GCP_PROVISIONER_ID_TOKEN_SOURCE === "metadata", "public provisioner must use metadata ID tokens");
expect(publicConfig?.spec?.template?.spec?.serviceAccountName === expectedPublicIdentity, `public provisioner identity must be ${expectedPublicIdentity}`);
expect(adapterConfig?.spec?.template?.spec?.serviceAccountName === expectedAdapterIdentity, `adapter identity must be ${expectedAdapterIdentity}`);
expect(annotations["run.googleapis.com/ingress"] === "all", "adapter ingress must be all; IAM remains the privacy boundary");
expect(annotations["run.googleapis.com/invoker-iam-disabled"] !== "true", "adapter IAM invoker check must remain enabled");
expect(customAudiences.includes(audience), `adapter must accept custom audience ${audience}`);
expect(adapterEnv.GCP_ALLOWED_PROJECT === controlProject, `adapter allowed project must be ${controlProject}`);
expect(adapterEnv.GCP_ALLOWED_REGION === region, `adapter allowed region must be ${region}`);
expect(adapterEnv.GCP_ALLOWED_ARTIFACT_REPOSITORY === "veloce", "adapter repository allowlist must be veloce");
expect(allowApply ? adapterEnv.GCP_PROVISIONER_ALLOW_APPLY === "1" : adapterEnv.GCP_PROVISIONER_ALLOW_APPLY === "0", `adapter apply mode must be ${allowApply ? "1" : "0"}`);
expect(imageOf(adapterConfig).includes("@sha256:"), "adapter must deploy an immutable image digest");

const invokers = membersForRole(adapterIam, "roles/run.invoker");
expect(invokers.includes(`serviceAccount:${expectedPublicIdentity}`), "adapter is missing the public provisioner invoker binding");
for (const broad of ["allUsers", "allAuthenticatedUsers"]) expect(!invokers.includes(broad), `adapter has forbidden broad invoker: ${broad}`);

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
