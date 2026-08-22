/**
 * Customer-facing usage credits are a display layer over the existing integer
 * USD-micros ledger. They are informational for BYOK tenants and can become a
 * billable unit for a later Veloce-managed-credit plan.
 */
export const MICROS_PER_USAGE_CREDIT = 1_000;

export function microsToUsageCredits(micros: number) {
  if (!Number.isFinite(micros) || micros <= 0) return 0;
  return Math.ceil(micros / MICROS_PER_USAGE_CREDIT);
}

export function usageCreditsToMicros(credits: number) {
  if (!Number.isFinite(credits) || credits <= 0) return 0;
  return Math.round(credits * MICROS_PER_USAGE_CREDIT);
}

export function formatUsageCredits(credits: number) {
  return `${Math.max(0, Math.round(credits)).toLocaleString("en-US")} credits`;
}
