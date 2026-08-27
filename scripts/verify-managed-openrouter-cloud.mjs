#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const project = valueAfter("--project") || "veloce-agenticos-2026";
const region = valueAfter("--region") || "asia-south1";
const service = valueAfter("--service") || "veloce-managed-openrouter";
const runtimeAccount = valueAfter("--runtime-account") || `veloce-managed-openrouter-run@${project}.iam.gserviceaccount.com`;
const invokerAccount = valueAfter("--invoker-account") || `veloce-vercel-control-plane@${project}.iam.gserviceaccount.com`;
const expectedDigest = valueAfter("--expected-digest");
const expectedModels = (valueAfter("--expected-models") || "").split(",").map((value) => value.trim()).filter(Boolean).sort();
const probe = args.includes("--probe");
const failures = [];
const warnings = [];

const openRouterSecret = "openrouter-managed-api-key";
const operatorSecret = "control-plane-operator-secret";
const [serviceConfig, serviceIam, runtimeIdentity, projectIam, openRouterIam, operatorIam, openRouterLatest, operatorLatest] = [
  gcloudJson(["run", "services", "describe", service, "--project", project, "--region", region, "--format=json"]),
  gcloudJson(["run", "services", "get-iam-policy", service, "--project", project, "--region", region, "--format=json"]),
  gcloudJson(["iam", "service-accounts", "describe", runtimeAccount, "--project", project, "--format=json"]),
  gcloudJson(["projects", "get-iam-policy", project, "--format=json"]),
  gcloudJson(["secrets", "get-iam-policy", openRouterSecret, "--project", project, "--format=json"]),
  gcloudJson(["secrets", "get-iam-policy", operatorSecret, "--project", project, "--format=json"]),
  gcloudJson(["secrets", "versions", "describe", "latest", "--secret", openRouterSecret, "--project", project, "--format=json"]),
  gcloudJson(["secrets", "versions", "describe", "latest", "--secret", operatorSecret, "--project", project, "--format=json"]),
];

const image = imageOf(serviceConfig);
const env = envMap(serviceConfig);
const invokers = membersForRole(serviceIam, "roles/run.invoker");
const runtimeMember = `serviceAccount:${runtimeAccount}`;
const invokerMember = `serviceAccount:${invokerAccount}`;
const projectRoles = rolesForMember(projectIam, runtimeMember);
const openRouterAccessors = membersForRole(openRouterIam, "roles/secretmanager.secretAccessor");
const operatorAccessors = membersForRole(operatorIam, "roles/secretmanager.secretAccessor");
const ready = serviceConfig?.status?.conditions?.find((condition) => condition.type === "Ready")?.status === "True";

expect(ready, "managed OpenRouter service must be Ready");
expect(serviceConfig?.spec?.template?.spec?.serviceAccountName === runtimeAccount, `runtime identity must be ${runtimeAccount}`);
expect(runtimeIdentity?.disabled !== true && runtimeIdentity?.email === runtimeAccount, "dedicated runtime service account must exist and be enabled");
expect(serviceConfig?.metadata?.annotations?.["run.googleapis.com/invoker-iam-disabled"] !== "true", "Cloud Run IAM invoker check must remain enabled");
expect(image.includes("@sha256:"), "managed OpenRouter must deploy an immutable image digest");
if (expectedDigest) expect(image.endsWith(`@${expectedDigest}`), `managed OpenRouter image must use expected digest ${expectedDigest}`);
expect(env.PUBLIC_SITE_URL?.value === "https://app.veloceos.cloud", "PUBLIC_SITE_URL must be https://app.veloceos.cloud");
expect(secretRef(env.OPENROUTER_API_KEY, openRouterSecret), `OPENROUTER_API_KEY must reference ${openRouterSecret}:latest`);
expect(secretRef(env.CONTROL_PLANE_OPERATOR_SECRET, operatorSecret), `CONTROL_PLANE_OPERATOR_SECRET must reference ${operatorSecret}:latest`);
expect(env.OPENROUTER_VIDEO_GENERATION_ENABLED?.value !== "1", "billable video generation must remain disabled until separately approved");
const configuredModels = (env.OPENROUTER_MODEL_ALLOWLIST?.value || "").split(",").map((value) => value.trim()).filter(Boolean).sort();
expect(configuredModels.length > 0, "OPENROUTER_MODEL_ALLOWLIST must contain at least one reviewed text model");
if (expectedModels.length) expect(JSON.stringify(configuredModels) === JSON.stringify(expectedModels), `text model allowlist must exactly match: ${expectedModels.join(",")}`);
expect(invokers.length === 1 && invokers[0] === invokerMember, `roles/run.invoker must be granted only to ${invokerMember}`);
for (const broad of ["allUsers", "allAuthenticatedUsers"]) expect(!invokers.includes(broad), `managed gateway has forbidden broad invoker: ${broad}`);
expect(projectRoles.length === 0, `managed runtime service account must have no project-level roles (found: ${projectRoles.join(", ")})`);
expect(openRouterAccessors.length === 1 && openRouterAccessors[0] === runtimeMember, "OpenRouter key accessor must be limited to the managed runtime service account");
expect(operatorAccessors.includes(runtimeMember), "managed runtime service account must access the operator secret");
for (const broad of ["allUsers", "allAuthenticatedUsers"]) {
  expect(!openRouterAccessors.includes(broad), `OpenRouter secret has forbidden broad accessor: ${broad}`);
  expect(!operatorAccessors.includes(broad), `operator secret has forbidden broad accessor: ${broad}`);
}
expect(openRouterLatest?.state === "ENABLED", "latest OpenRouter key secret version must be enabled");
expect(operatorLatest?.state === "ENABLED", "latest operator secret version must be enabled");

let health = null;
if (probe && ready) {
  const audience = serviceConfig?.status?.url || "";
  const token = audience ? gcloudText(["auth", "print-identity-token", `--audiences=${audience}`], { sensitive: true }) : "";
  if (!audience || !token) {
    failures.push("unable to mint a caller identity token for the read-only /readyz probe");
  } else {
    try {
      const response = await fetch(`${audience}/readyz`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      });
      const body = await response.json().catch(() => null);
      health = { status: response.status, ok: body?.ok === true, worker: body?.worker || null, configured: body?.configured === true };
      expect(response.status === 200, `/readyz returned HTTP ${response.status}`);
      expect(body?.ok === true && body?.worker === "managed-openrouter", "/readyz did not reach the managed OpenRouter worker");
      expect(body?.configured === true, "/readyz reports that the managed OpenRouter key is not configured");
    } catch (error) {
      failures.push(`/readyz probe failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} else if (!probe) {
  warnings.push("Runtime /readyz not checked; pass --probe after deploying the immutable image");
}

console.log(JSON.stringify({
  ok: failures.length === 0,
  project,
  region,
  service,
  revision: serviceConfig?.status?.latestReadyRevisionName || null,
  image: image || null,
  runtimeAccount,
  invokerAccount,
  configuredModels,
  projectRoles,
  secretBindings: {
    openRouterAccessorCount: openRouterAccessors.length,
    operatorAccessorCount: operatorAccessors.length,
    openRouterLatestEnabled: openRouterLatest?.state === "ENABLED",
    operatorLatestEnabled: operatorLatest?.state === "ENABLED",
  },
  health,
  failures,
  warnings,
}, null, 2));
if (failures.length) process.exit(1);

function gcloudJson(command) {
  const text = gcloudText(command);
  try { return JSON.parse(text); } catch { return {}; }
}

function gcloudText(command, options = {}) {
  const result = spawnSync("gcloud", command, { encoding: "utf8", maxBuffer: 5_000_000 });
  if (result.status !== 0) {
    failures.push(`gcloud command failed: ${command.slice(0, 4).join(" ")}: ${(result.stderr || "").trim().split("\n").at(-1) || "unknown error"}`);
    return "";
  }
  const output = result.stdout.trim();
  return options.sensitive ? output : output;
}

function envMap(config) {
  const rows = config?.spec?.template?.spec?.containers?.[0]?.env || [];
  return Object.fromEntries(rows.filter((row) => typeof row?.name === "string").map((row) => [row.name, row]));
}

function imageOf(config) {
  return config?.spec?.template?.spec?.containers?.[0]?.image || "";
}

function secretRef(row, name) {
  return row?.valueFrom?.secretKeyRef?.name === name && row?.valueFrom?.secretKeyRef?.key === "latest";
}

function membersForRole(policy, role) {
  return [...(policy?.bindings?.find((binding) => binding.role === role)?.members || [])].sort();
}

function rolesForMember(policy, member) {
  return (policy?.bindings || []).filter((binding) => binding?.members?.includes(member)).map((binding) => binding.role).filter(Boolean).sort();
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
