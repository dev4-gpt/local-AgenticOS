import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("OpenRouter snapshot preparation uses the official live catalog and remains review-only", () => {
  const script = readFileSync(resolve(process.cwd(), "scripts/prepare-openrouter-pricing-snapshot.mjs"), "utf8");

  expect(script).toContain('const sourceUrl = "https://openrouter.ai/api/v1/models"');
  expect(script).toContain("conservativeMicrosPer1k");
  expect(script).toContain('reviewStatus: "pending-human-approval"');
  expect(script).toContain('version: "openrouter-managed-v1"');
  expect(script).toContain("productionConfigAfterApproval");
  expect(script).toContain("tiered pricing is not supported");
  expect(script).toContain("positive managed-credit reservation contract");
  expect(script).not.toContain("OPENROUTER_API_KEY");
  expect(script).not.toContain("vercel env add");
});
