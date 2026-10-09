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
