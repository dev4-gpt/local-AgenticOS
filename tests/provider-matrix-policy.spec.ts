import { expect, test } from "@playwright/test";
import { PROVIDER_PRICING_SNAPSHOTS } from "../src/lib/providerPricingCatalog";
import { PUBLIC_PROVIDER_CATALOG } from "../src/lib/publicProviderCatalog";
import { freeTierWithinLimit, resolveCostRoute } from "../src/lib/costRoutingPolicy";
import { V96_REPOSITORY_CATALOG } from "../src/lib/v96RepositoryCatalog";

test("provider snapshots are dated, sourced, and use exact micros when known", () => {
  expect(PROVIDER_PRICING_SNAPSHOTS.length).toBeGreaterThanOrEqual(8);
  for (const snapshot of PROVIDER_PRICING_SNAPSHOTS) {
    expect(snapshot.id).toContain("v2026-08-22");
    expect(snapshot.sourceUrl).toMatch(/^https:\/\//);
    expect(snapshot.verifiedAt).toBe("2026-08-22");
    expect(snapshot.options.length).toBeGreaterThan(0);
    expect(snapshot.options.some((option) => option.id === snapshot.recommendedOptionId)).toBe(true);
  }
});

test("provider catalog exposes pricing and never makes reference-only rows selectable", () => {
  const providers = PUBLIC_PROVIDER_CATALOG.filter((entry) => entry.kind === "provider");
  expect(providers.length).toBeGreaterThan(10);
  const pricedProviderKeys = new Set(["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "GEMINI_API_KEY", "FIRECRAWL_API_KEY", "BRAVE_API_KEY", "ELEVENLABS_API_KEY"]);
  for (const entry of providers) {
    if (pricedProviderKeys.has(entry.credentialKey ?? "")) {
      expect(entry.pricingSnapshotId).toBeTruthy();
      expect(entry.pricingSourceUrl).toMatch(/^https:\/\//);
      expect(entry.pricingVerifiedAt).toBe("2026-08-22");
      expect(entry.modelOptions?.length).toBeGreaterThan(0);
      expect(entry.selectionAllowed).toBe(true);
    } else {
      expect(entry.selectionAllowed).toBe(false);
      expect(entry.approval).toContain("Current pricing evidence is required");
    }
  }
  for (const entry of PUBLIC_PROVIDER_CATALOG.filter((item) => item.status === "reference-only" || item.status === "operator-only")) {
    expect(entry.selectionAllowed).toBe(false);
  }
});

test("cost routing prefers native and free routes and fails closed", () => {
  expect(resolveCostRoute({ nativeAvailable: true, byokConnected: true }).route).toBe("native");
  expect(resolveCostRoute({ freeWorkerAvailable: true, byokConnected: true }).route).toBe("free-worker");
  expect(resolveCostRoute({ byokConnected: true, managedEnabled: true, managedBudgetAllowed: true }).route).toBe("byok");
  expect(resolveCostRoute({ managedEnabled: true, managedBudgetAllowed: true }).route).toBe("veloce-managed");
  expect(resolveCostRoute({ managedEnabled: true, managedBudgetAllowed: false }).route).toBe("blocked");
});

test("free-tier routing is tenant bounded", () => {
  expect(freeTierWithinLimit("brave", { dailyRequests: 0, monthlyUnits: 0, concurrent: 0 })).toBe(true);
  expect(freeTierWithinLimit("brave", { dailyRequests: 10, monthlyUnits: 1, concurrent: 0 })).toBe(false);
  expect(freeTierWithinLimit("brave", { dailyRequests: 1, monthlyUnits: 1000, concurrent: 0 })).toBe(false);
});

test("V3.1 provenance rows are present and bounded", () => {
  expect(V96_REPOSITORY_CATALOG.find((item) => item.id === "repomix")?.sourceUrl).toBe("https://github.com/yamadashy/repomix");
  expect(V96_REPOSITORY_CATALOG.find((item) => item.id === "plunk")?.license).toBe("AGPL-3.0");
  expect(V96_REPOSITORY_CATALOG.find((item) => item.id === "novu")?.license).toBe("MIT");
  expect(V96_REPOSITORY_CATALOG.find((item) => item.id === "plunk")?.executionPermissions).not.toContain("send-external");
});
