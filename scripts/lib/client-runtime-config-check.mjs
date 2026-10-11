const REQUIRED_API_ROUTES = [
  "/api/client-runtime/source-import",
  "/api/client-runtime/build-identity",
];
const REQUIRED_PAGES = ["/", "/memory", "/notebook"];
const FORBIDDEN_PAGES = ["/classroom-research", "/social-research"];
const REQUIRED_CAPABILITIES = ["tenant-data", "artifacts"];

export function evaluateClientRuntimeConfig(service, expected) {
  const failures = [];
  const revision = service?.status?.latestReadyRevisionName;
  const traffic = service?.status?.traffic;
  const container = service?.spec?.template?.spec?.containers?.[0];
  const image = typeof container?.image === "string" ? container.image : "";
  const digest = image.match(/@sha256:([0-9a-f]{64})$/i)?.[1]?.toLowerCase() ?? null;
  if (service?.metadata?.name !== expected.service) failures.push("service_identity_mismatch");
  if (revision !== expected.revision) failures.push("revision_mismatch");
  if (service?.status?.latestCreatedRevisionName !== revision
      || service?.metadata?.generation !== service?.status?.observedGeneration) {
    failures.push("template_not_ready_revision");
  }
  if (!Array.isArray(traffic) || traffic.length !== 1 || traffic[0]?.revisionName !== expected.revision || traffic[0]?.percent !== 100) {
    failures.push("traffic_not_single_expected_revision");
  }
  if (digest !== expected.digest) failures.push("image_digest_mismatch");

  const env = Array.isArray(container?.env) ? container.env : [];
  const variables = new Map();
  for (const entry of env) {
    if (!entry || typeof entry.name !== "string") continue;
    if (variables.has(entry.name)) failures.push("duplicate_runtime_variable");
    variables.set(entry.name, typeof entry.value === "string" ? entry.value : null);
  }
  const list = (name) => new Set((variables.get(name) ?? "").split(",").map((item) => item.trim()).filter(Boolean));
  if (variables.get("CLIENT_SLUG") !== expected.tenant) failures.push("tenant_mismatch");
  if (variables.get("CLIENT_RUNTIME_ENFORCE_AUTH") !== "1") failures.push("runtime_auth_not_enforced");
  const expectedProviderCalls = expected.providerCallsEnabled === true ? "1" : "0";
  if (variables.get("CLIENT_PROVIDER_CALLS_ENABLED") !== expectedProviderCalls) failures.push("provider_calls_policy_mismatch");
  if (variables.get("CLIENT_RETENTION_DAYS") !== "45") failures.push("retention_days_not_45");
  const notebookDays = variables.get("CLIENT_NOTEBOOK_RETENTION_DAYS");
  if (notebookDays !== undefined && notebookDays !== "45") failures.push("notebook_retention_days_not_45");

  const apiRoutes = list("CLIENT_ALLOWED_API_ROUTES");
  for (const route of REQUIRED_API_ROUTES) if (!apiRoutes.has(route)) failures.push(`required_api_route_missing:${route}`);
  if (apiRoutes.has("/api/client-runtime/source-import")) {
    const workerToken = env.find((entry) => entry?.name === "CLIENT_WORKER_TOKEN");
    if (!workerToken?.valueFrom?.secretKeyRef?.name || workerToken.value) failures.push("source_import_worker_secret_missing");
  }
  const pages = list("CLIENT_ALLOWED_ROUTES");
  for (const route of REQUIRED_PAGES) if (!pages.has(route)) failures.push(`required_page_missing:${route}`);
  for (const route of FORBIDDEN_PAGES) if (pages.has(route)) failures.push(`operator_page_exposed:${route}`);
  const capabilities = list("CLIENT_ENABLED_CAPABILITIES");
  for (const capability of REQUIRED_CAPABILITIES) if (!capabilities.has(capability)) failures.push(`required_capability_missing:${capability}`);

  return {
    ok: failures.length === 0,
    service: expected.service,
    revision: typeof revision === "string" ? revision : null,
    imageDigest: digest ? `sha256:${digest}` : null,
    failures: [...new Set(failures)],
  };
}
