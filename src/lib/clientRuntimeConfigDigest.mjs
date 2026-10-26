import { createHash } from "node:crypto";

export function clientTenantScopeDigest(supabaseUrl, tenantSlug) {
  if (typeof supabaseUrl !== "string" || typeof tenantSlug !== "string" || !tenantSlug.trim()) return null;
  try {
    const endpoint = new URL(supabaseUrl.trim());
    const projectEndpoint = `${endpoint.origin.toLowerCase()}${endpoint.pathname.replace(/\/+$/, "")}`;
    if (!projectEndpoint) return null;
    return createHash("sha256").update(`${projectEndpoint}\n${tenantSlug.trim()}`).digest("hex");
  } catch {
    return null;
  }
}

export const CLIENT_RUNTIME_CONFIG_KEYS = [
  "VELOCE_CLIENT_EDITION",
  "CLIENT_SLUG",
  "CLIENT_RUNTIME_DATA_MODE",
  "CLIENT_RUNTIME_ENFORCE_AUTH",
  "CLIENT_RUNTIME_WORKER_ENABLED",
  "CLIENT_PROVIDER_CALLS_ENABLED",
  "CLIENT_CREDENTIAL_SUBMISSIONS_ENABLED",
  "CLIENT_INTENT_ROUTING_ENABLED",
  "CLIENT_RESEARCH_ROUTING_ENABLED",
  "CLIENT_POSTHOG_CAPTURE_ENABLED",
  "CLIENT_RETENTION_DAYS",
  "CLIENT_NOTEBOOK_RETENTION_DAYS",
  "CLIENT_BUDGET_CAP",
  "CLIENT_BUDGET_WARNING_THRESHOLD",
  "CLIENT_APPROVAL_POLICY",
  "CLIENT_RESEARCH_PROVIDER",
  "CLIENT_RESEARCH_WORKER_CONFIG_JSON",
  "CLIENT_WORKFLOW_PROVIDER",
  "CLIENT_WORKSPACE_PROVIDER",
  "CLIENT_LOOP_JUDGE_PROVIDER",
  "CLIENT_LOOP_JUDGE_MODEL",
  "CLIENT_BRAVE_COST_MICROS",
  "CLIENT_FIRECRAWL_COST_MICROS",
  "CLIENT_STORAGE_BUCKET",
  "CLIENT_STORAGE_NAMESPACE",
  "CLIENT_RUNTIME_BASE_URL",
  "CLIENT_RUNTIME_SERVICE_ACCOUNT",
  "CLIENT_RUNTIME_TASK_REGION",
  "CLIENT_RUNTIME_TASK_QUEUE",
  "CLIENT_TASK_INVOKER_SERVICE_ACCOUNT",
  "CLIENT_EXECUTION_BACKEND",
  "CLIENT_WORKSPACE_RUN_JOB",
  "CLIENT_VISUAL_QA_RUN_JOB",
  "CLIENT_ALLOWED_ROUTES",
  "CLIENT_ALLOWED_API_ROUTES",
  "CLIENT_ENABLED_CAPABILITIES",
  "CLIENT_PREVIEW_CAPABILITIES",
  "CLIENT_ENABLED_TRAITS",
  "CLIENT_SEO_ALLOWED_HOSTS",
  "CLIENT_DELIVERY_ALLOWED_HOSTS",
  "CLIENT_PROVIDER_ALLOWLIST",
  "CLIENT_MODEL_ALLOWLIST",
  "CLIENT_PROVIDER_MODEL_ALLOWLIST_JSON",
  "CLIENT_CAPABILITY_PROVIDER_ALLOWLIST_JSON",
  "CLIENT_MODEL_PRICING_JSON",
];

const LIST_CONFIG_KEYS = new Set([
  "CLIENT_ALLOWED_ROUTES",
  "CLIENT_ALLOWED_API_ROUTES",
  "CLIENT_ENABLED_CAPABILITIES",
  "CLIENT_PREVIEW_CAPABILITIES",
  "CLIENT_ENABLED_TRAITS",
  "CLIENT_SEO_ALLOWED_HOSTS",
  "CLIENT_DELIVERY_ALLOWED_HOSTS",
  "CLIENT_PROVIDER_ALLOWLIST",
  "CLIENT_MODEL_ALLOWLIST",
]);

const JSON_CONFIG_KEYS = new Set([
  "CLIENT_RESEARCH_WORKER_CONFIG_JSON",
  "CLIENT_PROVIDER_MODEL_ALLOWLIST_JSON",
  "CLIENT_CAPABILITY_PROVIDER_ALLOWLIST_JSON",
  "CLIENT_MODEL_PRICING_JSON",
]);

export function clientRuntimeConfigDigest(values) {
  const config = Object.fromEntries(CLIENT_RUNTIME_CONFIG_KEYS.map((key) => {
    const value = typeof values?.[key] === "string" ? values[key].trim() : "";
    if (!value) return [key, null];
    if (LIST_CONFIG_KEYS.has(key)) {
      return [key, [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))].sort()];
    }
    if (JSON_CONFIG_KEYS.has(key)) {
      try {
        return [key, canonicalizeJson(JSON.parse(value))];
      } catch {
        return [key, value];
      }
    }
    return [key, value];
  }));
  return createHash("sha256").update(JSON.stringify(config)).digest("hex");
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalizeJson(entry)]));
  }
  return value;
}
