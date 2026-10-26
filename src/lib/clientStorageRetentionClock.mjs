const DAY_MS = 86_400_000;
export const CLIENT_STORAGE_RETENTION_CLOCK = "expiry-minus-bucket-days-v1";

export function clientStorageRetentionClock(expiresAt, rawDays = "28", now = Date.now()) {
  const value = typeof rawDays === "number" ? String(rawDays) : rawDays;
  const days = typeof value === "string" && /^[1-9][0-9]?$/.test(value) ? Number(value) : NaN;
  const expiry = typeof expiresAt === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(expiresAt) ? Date.parse(expiresAt) : NaN;
  if (!Number.isSafeInteger(days) || days < 1 || days > 28 || !Number.isFinite(now)
    || !Number.isFinite(expiry) || expiry <= now || expiry > now + days * DAY_MS) return null;
  const anchor = expiry - days * DAY_MS;
  if (anchor < 0) return null;
  return { customTime: new Date(anchor).toISOString(), retentionExpiresAt: new Date(expiry).toISOString(),
    retentionDays: days, policy: CLIENT_STORAGE_RETENTION_CLOCK };
}

export function clientStorageLifecycleRules(namespace, days) {
  if (!/^[a-z][a-z0-9-]{2,40}$/.test(namespace) || !Number.isSafeInteger(days) || days < 1 || days > 28) {
    throw new Error("storage_retention_policy_invalid");
  }
  return ["age", "daysSinceCustomTime"].map((condition) => ({ action: { type: "Delete" },
    condition: { [condition]: days, matchesPrefix: [`${namespace}/`] } }));
}
