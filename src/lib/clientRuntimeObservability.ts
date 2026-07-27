const SAFE_KEYS = new Set(["tenant", "bucket", "route", "provider", "status", "reason", "attempt"]);

export function logClientRuntimeEvent(event: string, fields: Record<string, unknown> = {}) {
  const safeFields = Object.fromEntries(Object.entries(fields).filter(([key, value]) => SAFE_KEYS.has(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")));
  console.info(JSON.stringify({
    severity: event.includes("failed") || event.includes("exceeded") ? "WARNING" : "INFO",
    service: "veloce-client-runtime",
    event,
    ...safeFields,
    timestamp: new Date().toISOString(),
  }));
}
