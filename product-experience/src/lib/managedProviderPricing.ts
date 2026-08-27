import { createHash } from "node:crypto";

export type ManagedTextPricing = Record<string, {
  inputMicrosPer1k: number;
  outputMicrosPer1k: number;
}>;

export type ManagedPricingSnapshotRow = {
  id: unknown;
  version: unknown;
  effective_at: unknown;
  prices: unknown;
};

const SNAPSHOT_VERSION = "openrouter-managed-v1";
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const SNAPSHOT_ID = /^openrouter-managed-(\d{4}-\d{2}-\d{2})-([0-9a-f]{12})$/;
const MAX_RATE_MICROS_PER_1K = 1_000_000_000;

export function parseManagedTextPricing(value: string | undefined): ManagedTextPricing | null {
  let parsed: unknown;
  try { parsed = JSON.parse(value ?? ""); } catch { return null; }
  return normalizeManagedTextPricing(parsed);
}

export function normalizeManagedTextPricing(value: unknown): ManagedTextPricing | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length || entries.length > 32) return null;
  const normalized: ManagedTextPricing = {};
  for (const [model, rawRate] of entries.sort(([left], [right]) => left.localeCompare(right))) {
    if (!MODEL_ID.test(model) || !rawRate || typeof rawRate !== "object" || Array.isArray(rawRate)) return null;
    const keys = Object.keys(rawRate as Record<string, unknown>).sort();
    if (keys.join(",") !== "inputMicrosPer1k,outputMicrosPer1k") return null;
    const inputMicrosPer1k = (rawRate as Record<string, unknown>).inputMicrosPer1k;
    const outputMicrosPer1k = (rawRate as Record<string, unknown>).outputMicrosPer1k;
    if (!validRate(inputMicrosPer1k) || !validRate(outputMicrosPer1k)) return null;
    if (inputMicrosPer1k === 0 && outputMicrosPer1k === 0) return null;
    normalized[model] = { inputMicrosPer1k, outputMicrosPer1k };
  }
  return normalized;
}

export function managedPricingSnapshotId(pricing: ManagedTextPricing, date: string) {
  const canonical = canonicalManagedTextPricing(pricing);
  const digest = createHash("sha256").update(canonical).digest("hex").slice(0, 12);
  return `openrouter-managed-${date}-${digest}`;
}

export function canonicalManagedTextPricing(pricing: ManagedTextPricing) {
  return JSON.stringify(Object.fromEntries(Object.entries(pricing).sort(([left], [right]) => left.localeCompare(right))));
}

export function validateManagedPricingSnapshot(input: {
  configuredSnapshotId: string | null;
  configuredPricing: ManagedTextPricing | null;
  row: ManagedPricingSnapshotRow | null;
  now?: number;
  maxAgeHours?: number;
}) {
  const configuredSnapshotId = input.configuredSnapshotId?.trim() || "";
  if (!configuredSnapshotId || !input.configuredPricing) return failure("managed_pricing_not_configured");
  const match = configuredSnapshotId.match(SNAPSHOT_ID);
  if (!match) return failure("managed_pricing_snapshot_id_invalid");
  if (!input.row) return failure("managed_pricing_snapshot_missing");
  if (input.row.id !== configuredSnapshotId || input.row.version !== SNAPSHOT_VERSION) return failure("managed_pricing_snapshot_record_invalid");
  const effectiveAt = typeof input.row.effective_at === "string" ? Date.parse(input.row.effective_at) : Number.NaN;
  const now = input.now ?? Date.now();
  const maxAgeHours = Number.isFinite(input.maxAgeHours) ? Math.min(720, Math.max(1, Number(input.maxAgeHours))) : 168;
  if (!Number.isFinite(effectiveAt) || effectiveAt > now + 300_000 || effectiveAt < now - maxAgeHours * 3_600_000) return failure("managed_pricing_snapshot_stale");
  const effectiveDate = new Date(effectiveAt).toISOString().slice(0, 10);
  if (match[1] !== effectiveDate || managedPricingSnapshotId(input.configuredPricing, effectiveDate) !== configuredSnapshotId) return failure("managed_pricing_snapshot_id_mismatch");
  const storedPricing = normalizeManagedTextPricing(input.row.prices);
  if (!storedPricing || canonicalManagedTextPricing(storedPricing) !== canonicalManagedTextPricing(input.configuredPricing)) return failure("managed_pricing_snapshot_prices_mismatch");
  return { ok: true as const, pricing: input.configuredPricing, pricingSnapshotId: configuredSnapshotId };
}

function failure(error: string) {
  return { ok: false as const, status: 409, error };
}

function validRate(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_RATE_MICROS_PER_1K;
}
