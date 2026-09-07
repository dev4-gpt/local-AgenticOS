import { expect, test } from "@playwright/test";
import {
  managedPricingSnapshotId,
  parseManagedTextPricing,
  validateManagedPricingSnapshot,
} from "../product-experience/src/lib/managedProviderPricing";

const pricing = { "openai/gpt-4o-mini": { inputMicrosPer1k: 150, outputMicrosPer1k: 600 } };
const date = "2026-08-27";
const id = managedPricingSnapshotId(pricing, date);
const effectiveAt = `${date}T14:37:35.666Z`;

test("strict pricing parser rejects malformed, free, negative, and extra-field rates", () => {
  expect(parseManagedTextPricing(JSON.stringify(pricing))).toEqual(pricing);
  expect(parseManagedTextPricing("{}")).toBeNull();
  expect(parseManagedTextPricing(JSON.stringify({ free: { inputMicrosPer1k: 0, outputMicrosPer1k: 0 } }))).toBeNull();
  expect(parseManagedTextPricing(JSON.stringify({ bad: { inputMicrosPer1k: -1, outputMicrosPer1k: 1 } }))).toBeNull();
  expect(parseManagedTextPricing(JSON.stringify({ bad: { inputMicrosPer1k: "1", outputMicrosPer1k: 1 } }))).toBeNull();
  expect(parseManagedTextPricing(JSON.stringify({ bad: { inputMicrosPer1k: 1, outputMicrosPer1k: 1, currency: "usd" } }))).toBeNull();
});

test("pricing snapshot must match its database record, date, hash, prices, and age", () => {
  const now = Date.parse("2026-08-27T15:00:00.000Z");
  const valid = validateManagedPricingSnapshot({
    configuredSnapshotId: id,
    configuredPricing: pricing,
    row: { id, version: "openrouter-managed-v1", effective_at: effectiveAt, prices: pricing },
    now,
  });
  expect(valid.ok).toBe(true);
  expect(validateManagedPricingSnapshot({ configuredSnapshotId: id, configuredPricing: pricing, row: null, now }).error).toBe("managed_pricing_snapshot_missing");
  expect(validateManagedPricingSnapshot({ configuredSnapshotId: id, configuredPricing: pricing, row: { id, version: "wrong", effective_at: effectiveAt, prices: pricing }, now }).error).toBe("managed_pricing_snapshot_record_invalid");
  expect(validateManagedPricingSnapshot({ configuredSnapshotId: id, configuredPricing: pricing, row: { id, version: "openrouter-managed-v1", effective_at: effectiveAt, prices: { "openai/gpt-4o-mini": { inputMicrosPer1k: 151, outputMicrosPer1k: 600 } } }, now }).error).toBe("managed_pricing_snapshot_prices_mismatch");
  expect(validateManagedPricingSnapshot({ configuredSnapshotId: id, configuredPricing: pricing, row: { id, version: "openrouter-managed-v1", effective_at: effectiveAt, prices: pricing }, now: now + 169 * 3_600_000 }).error).toBe("managed_pricing_snapshot_stale");
});
