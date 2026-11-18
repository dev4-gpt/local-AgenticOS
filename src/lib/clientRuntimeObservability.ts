import { createHash } from "node:crypto";
import { CAPABILITIES } from "./capabilities";
import { clientProviderContractNames } from "./clientProviderContracts";

const SAFE_KEYS = new Set(["tenant", "bucket", "route", "provider", "status", "reason", "classification", "requestId", "jobId", "attempt", "capability", "result", "source", "messageCount"]);
const SAFE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_CODE = /^[a-z0-9][a-z0-9_.:-]{0,95}$/i;
const SAFE_EVENT = /^[a-z0-9][a-z0-9_.:-]{0,95}$/i;
const SAFE_DISTINCT_ID = /^[a-f0-9]{64}$/;
const SAFE_TENANT_TAG = /^tenant:[a-f0-9]{24}$/;

export const CLIENT_PRODUCT_EVENTS = new Set([
  "client_runtime_provider_workspace_opened",
  "client_runtime_provider_request_failed",
  "client_runtime_provider_prompt_submitted",
  "client_runtime_provider_response_succeeded",
  "client_runtime_provider_response_failed",
]);

type SafeTelemetryFields = Record<string, string | number | boolean>;

export function logClientRuntimeEvent(event: string, fields: Record<string, unknown> = {}) {
  const safeFields: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!SAFE_KEYS.has(key)) continue;
    if (key === "requestId" || key === "jobId") {
      if (typeof value === "string" && SAFE_ID.test(value)) safeFields[key] = value;
      continue;
    }
    if (key === "status" || key === "attempt") {
      if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 999) safeFields[key] = value;
      continue;
    }
    if (typeof value === "boolean") {
      safeFields[key] = value;
      continue;
    }
    if (typeof value !== "string") continue;
    const code = value.trim().slice(0, 96);
    if (SAFE_CODE.test(code)) safeFields[key] = code;
  }
  if (event.includes("provider_failed") && !safeFields.classification) {
    safeFields.classification = classifyClientRuntimeFailure(safeFields.status, safeFields.reason);
  }
  const payload = {
    severity: event.includes("failed") || event.includes("exceeded") ? "WARNING" : "INFO",
    service: "veloce-client-runtime",
    event,
    ...safeFields,
    timestamp: new Date().toISOString(),
  };
  // Optional sinks must not turn completed business operations into retries.
  try { console.info(JSON.stringify(payload)); } catch {}
  const vendorFields = vendorSafeFields(safeFields.tenant
    ? { ...safeFields, tenant: `tenant:${createHash("sha256").update(String(safeFields.tenant)).digest("hex").slice(0, 24)}` }
    : safeFields);
  void capturePostHogEvent(event, vendorFields, String(vendorFields.tenant ?? "veloce-runtime")).catch(() => false);
  if (payload.severity === "WARNING") void captureSentryEvent(event, vendorFields).catch(() => false);
  void captureDatadogEvent(event, vendorFields, payload.severity === "WARNING" ? "warn" : "info").catch(() => false);
}

export async function captureClientProductEvent(input: {
  event: string;
  distinctId: string;
  properties?: Record<string, unknown>;
}) {
  if (!CLIENT_PRODUCT_EVENTS.has(input.event) || !SAFE_DISTINCT_ID.test(input.distinctId)) return false;
  const fields = vendorSafeFields(sanitizeFields(input.properties ?? {}));
  return capturePostHogEvent(input.event, fields, input.distinctId);
}

function sanitizeFields(fields: Record<string, unknown>): SafeTelemetryFields {
  const safe: SafeTelemetryFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!SAFE_KEYS.has(key)) continue;
    if (key === "tenant") {
      if (typeof value === "string" && SAFE_TENANT_TAG.test(value)) safe[key] = value;
      continue;
    }
    if (key === "status" || key === "attempt" || key === "messageCount") {
      if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 999) safe[key] = value;
      continue;
    }
    if (typeof value === "boolean") { safe[key] = value; continue; }
    if (typeof value === "string" && SAFE_CODE.test(value.trim())) safe[key] = value.trim().slice(0, 96);
  }
  return safe;
}

// Everything a vendor (PostHog, Sentry, Datadog) may receive passes through vendorSafeFields (ADR-013). Fields that could carry a
// client's words in a code-shaped string are limited to fixed known values; anything else is sent as "other".
const VENDOR_KEYS = new Set(["tenant", "status", "reason", "provider", "capability", "classification", "requestId", "jobId", "attempt", "messageCount"]);
export const KNOWN_REASONS: ReadonlySet<string> = new Set([
  "budget_exceeded", "context_compression_input_invalid", "delivery_claim_failed", "ecc_adapter_unavailable", "ecc_capability_not_enabled",
  "ecc_execution_not_authorized", "ecc_input_invalid", "ecc_job_not_authorized", "ecc_lesson_not_active", "ecc_lesson_snapshot_invalid",
  "gcp_identity_unavailable", "instruction_budget_input_invalid", "invalid_input", "media_text_invalid", "model_not_allowlisted",
  "model_pricing_not_configured", "music_input_invalid", "notebook_source_changed", "notebook_source_reference_invalid",
  "notebook_source_unavailable", "prompt_invalid", "provider_calls_require_approval", "provider_contract_not_configured",
  "provider_model_not_allowlisted", "provider_music_failed", "provider_not_allowlisted", "provider_not_configured",
  "provider_output_invalid", "provider_request_failed", "provider_status_failed", "provider_unreachable", "provider_video_failed",
  "research_query_required", "secret_like_input_rejected", "seo_url_not_allowed", "task_base_url_invalid", "task_base_url_not_public",
  "task_enqueue_failed", "task_identifier_missing", "task_runtime_not_configured", "tenant_membership_unavailable", "tenant_not_configured",
  "video_input_invalid", "visual_qa_job_not_configured", "worker_not_allowlisted", "worker_not_configured", "worker_output_invalid",
  "worker_output_too_large", "worker_source_url_not_allowed", "worker_unreachable", "workspace_job_not_configured",
]);
export const KNOWN_CLASSIFICATIONS: ReadonlySet<string> = new Set([
  "policy_denied", "provider_auth", "provider_timeout", "provider_rate_limited", "provider_upstream", "provider_request_rejected", "provider_internal",
]);
const KNOWN_PROVIDERS: ReadonlySet<string> = new Set([...clientProviderContractNames(), "firecrawl", "brave"]);
const KNOWN_CAPABILITIES: ReadonlySet<string> = new Set([...CAPABILITIES.map((capability) => capability.id), "intent-routing", "research", "visual-qa"]);
const KNOWN_VALUES: Record<string, ReadonlySet<string>> = {
  reason: KNOWN_REASONS, classification: KNOWN_CLASSIFICATIONS, provider: KNOWN_PROVIDERS, capability: KNOWN_CAPABILITIES,
};

export function vendorSafeFields(fields: SafeTelemetryFields): SafeTelemetryFields {
  const out: SafeTelemetryFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!VENDOR_KEYS.has(key)) continue;
    if (key === "tenant") {
      if (typeof value === "string" && SAFE_TENANT_TAG.test(value)) out[key] = value;
      continue;
    }
    if (key === "requestId" || key === "jobId") {
      if (typeof value === "string" && SAFE_ID.test(value)) out[key] = value;
      continue;
    }
    if (key === "status" || key === "attempt" || key === "messageCount") {
      if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 999) out[key] = value;
      continue;
    }
    const known = KNOWN_VALUES[key];
    if (known) {
      const code = typeof value === "string" ? value.trim().toLowerCase() : "";
      out[key] = known.has(code) ? code : "other";
    }
  }
  return out;
}

// Datadog log intake sites; the gov sites are left out on purpose. Verified against docs.datadoghq.com/api/latest/logs on 2026-10-20.
const DATADOG_SITES = new Set(["datadoghq.com", "us3.datadoghq.com", "us5.datadoghq.com", "datadoghq.eu", "ap1.datadoghq.com", "ap2.datadoghq.com", "uk1.datadoghq.com"]);

async function captureDatadogEvent(event: string, fields: SafeTelemetryFields, level: "info" | "warn") {
  if (process.env.CLIENT_DATADOG_CAPTURE_ENABLED !== "1" || !SAFE_EVENT.test(event)) return false;
  const apiKey = process.env.DATADOG_API_KEY?.trim();
  if (!apiKey) return false;
  const site = process.env.DATADOG_SITE?.trim() || "datadoghq.com";
  if (!DATADOG_SITES.has(site)) return false;
  // Our fields sit under "veloce" so a field named status cannot overwrite Datadog's own log level.
  const response = await fetch(`https://http-intake.logs.${site}/api/v2/logs`, {
    method: "POST",
    headers: { "content-type": "application/json", "DD-API-KEY": apiKey },
    body: JSON.stringify([{ ddsource: "veloce", service: "veloce-client-runtime", status: level, message: event, ddtags: fields.tenant ? String(fields.tenant) : undefined, veloce: fields }]),
    cache: "no-store",
    signal: AbortSignal.timeout(2_000),
  }).catch(() => null);
  return response?.ok === true;
}

async function capturePostHogEvent(event: string, fields: SafeTelemetryFields, distinctId: string) {
  if (process.env.CLIENT_POSTHOG_CAPTURE_ENABLED !== "1" || !SAFE_EVENT.test(event)) return false;
  const apiKey = process.env.POSTHOG_API_KEY?.trim();
  if (!apiKey) return false;
  const host = (process.env.POSTHOG_HOST?.trim() || "https://app.posthog.com").replace(/\/$/, "");
  const response = await fetch(`${host}/capture/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, event, distinct_id: distinctId, properties: { ...fields, source: "veloce" } }),
    cache: "no-store",
    signal: AbortSignal.timeout(2_000),
  }).catch(() => null);
  return response?.ok === true;
}

async function captureSentryEvent(event: string, fields: SafeTelemetryFields) {
  const parsed = parseSentryDsn(process.env.SENTRY_DSN?.trim());
  if (!parsed) return false;
  const eventId = createHash("sha256").update(`${event}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 32);
  const sentryEvent = {
    event_id: eventId,
    timestamp: Math.floor(Date.now() / 1000),
    platform: "node",
    level: "warning",
    message: event,
    tags: Object.fromEntries(Object.entries(fields).filter(([key]) => ["tenant", "provider", "classification", "route"].includes(key))),
    extra: Object.fromEntries(Object.entries(fields).filter(([key]) => !["tenant", "provider", "classification", "route"].includes(key))),
    release: process.env.VELOCE_RELEASE?.trim() || undefined,
  };
  const envelope = `${JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), sdk: { name: "veloce-runtime", version: "1" } })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(sentryEvent)}\n`;
  const response = await fetch(`${parsed.ingest}/api/${parsed.projectId}/envelope/?sentry_version=7&sentry_key=${encodeURIComponent(parsed.publicKey)}&sentry_client=veloce-runtime/1`, {
    method: "POST",
    headers: { "content-type": "application/x-sentry-envelope" },
    body: envelope,
    cache: "no-store",
    signal: AbortSignal.timeout(2_000),
  }).catch(() => null);
  return response?.ok === true;
}

function parseSentryDsn(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const projectId = url.pathname.replace(/^\//, "").trim();
    if (!projectId || !url.username || !url.hostname) return null;
    const ingest = `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}`;
    return { ingest, projectId, publicKey: url.username };
  } catch { return null; }
}

export function classifyClientRuntimeFailure(status: unknown, reason: unknown) {
  const code = typeof reason === "string" ? reason.toLowerCase() : "";
  const numericStatus = typeof status === "number" ? status : Number(status);
  if (code === "budget_exceeded" || code === "provider_not_allowlisted" || code === "provider_calls_require_approval") return "policy_denied";
  if (numericStatus === 401 || numericStatus === 403 || /not_configured|auth|credential/.test(code)) return "provider_auth";
  if (numericStatus === 408 || numericStatus === 504 || /timeout|timed_out/.test(code)) return "provider_timeout";
  if (numericStatus === 429 || /rate.?limit/.test(code)) return "provider_rate_limited";
  if (numericStatus >= 500 || /upstream|request_failed|status_failed/.test(code)) return "provider_upstream";
  if (numericStatus >= 400) return "provider_request_rejected";
  return "provider_internal";
}
