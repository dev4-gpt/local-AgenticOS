const DEFAULT_RETENTION_DAYS = 45;
const MAX_RETENTION_DAYS = 3650;
const DAY_MS = 86_400_000;

export function clientRetentionExpiresAt(rawDays: string | undefined, createdAt = Date.now()): string | null {
  const raw = rawDays ?? String(DEFAULT_RETENTION_DAYS);
  const days = Number(raw);
  if (!/^[1-9][0-9]{0,3}$/.test(raw) || !Number.isSafeInteger(days) || days > MAX_RETENTION_DAYS) return null;
  if (!Number.isFinite(createdAt) || createdAt < 0) return null;
  const expiry = new Date(createdAt + days * DAY_MS);
  return Number.isNaN(expiry.valueOf()) ? null : expiry.toISOString();
}

export function clientRetentionSecondsRemaining(record: { retention_expires_at?: unknown }, now = Date.now()): number {
  if (typeof record.retention_expires_at !== "string" || !Number.isFinite(now)) return 0;
  const expiresAt = Date.parse(record.retention_expires_at);
  if (!Number.isFinite(expiresAt)) return 0;
  return Math.max(0, Math.min(900, Math.floor((expiresAt - now) / 1_000)));
}
