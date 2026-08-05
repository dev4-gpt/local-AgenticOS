import { createHash } from "node:crypto";

const SAFE_KEYS = new Set(["tenant", "bucket", "route", "provider", "status", "reason", "classification", "requestId", "jobId", "attempt", "capability", "result", "source", "messageCount"]);
const SAFE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_CODE = /^[a-z0-9][a-z0-9_.:-]{0,95}$/i;
const SAFE_EVENT = /^[a-z0-9][a-z0-9_.:-]{0,95}$/i;

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
  console.info(JSON.stringify(payload));
  void capturePostHogEvent(event, safeFields, safeFields.tenant ? `tenant:${safeFields.tenant}` : "veloce-runtime");
  if (payload.severity === "WARNING") void captureSentryEvent(event, safeFields);
}

export async function captureClientProductEvent(input: {
  event: string;
  distinctId: string;
  properties?: Record<string, unknown>;
}) {
  if (!SAFE_EVENT.test(input.event) || !input.distinctId.trim()) return false;
  const fields = sanitizeFields(input.properties ?? {});
  return capturePostHogEvent(input.event, fields, input.distinctId.trim().slice(0, 160));
}

function sanitizeFields(fields: Record<string, unknown>): SafeTelemetryFields {
  const safe: SafeTelemetryFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!SAFE_KEYS.has(key)) continue;
    if (key === "status" || key === "attempt" || key === "messageCount") {
      if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 999) safe[key] = value;
      continue;
    }
    if (typeof value === "boolean") { safe[key] = value; continue; }
    if (typeof value === "string" && SAFE_CODE.test(value.trim())) safe[key] = value.trim().slice(0, 96);
  }
  return safe;
}

async function capturePostHogEvent(event: string, fields: SafeTelemetryFields, distinctId: string) {
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
