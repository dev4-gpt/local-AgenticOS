const SAFE_KEYS = new Set(["tenant", "bucket", "route", "provider", "status", "reason", "classification", "requestId", "jobId", "attempt"]);
const SAFE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_CODE = /^[a-z0-9][a-z0-9_.:-]{0,95}$/i;

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
  console.info(JSON.stringify({
    severity: event.includes("failed") || event.includes("exceeded") ? "WARNING" : "INFO",
    service: "veloce-client-runtime",
    event,
    ...safeFields,
    timestamp: new Date().toISOString(),
  }));
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
