import { expect, test } from "@playwright/test";
import { formatUsageCredits, microsToUsageCredits, usageCreditsToMicros } from "../src/lib/usageCredits";

test("usage credits are a stable display layer over USD micros", () => {
  expect(microsToUsageCredits(0)).toBe(0);
  expect(microsToUsageCredits(1)).toBe(1);
  expect(microsToUsageCredits(1_001)).toBe(2);
  expect(usageCreditsToMicros(12)).toBe(12_000);
  expect(formatUsageCredits(12)).toBe("12 credits");
});
