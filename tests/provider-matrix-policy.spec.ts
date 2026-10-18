import { expect, test } from "@playwright/test";
import { PROVIDER_PRICING_SNAPSHOTS } from "../src/lib/providerPricingCatalog";
import { PUBLIC_PROVIDER_CATALOG } from "../src/lib/publicProviderCatalog";
import { freeTierWithinLimit, resolveCostRoute } from "../src/lib/costRoutingPolicy";
import { V96_REPOSITORY_CATALOG } from "../src/lib/v96RepositoryCatalog";

test("provider snapshots are dated, sourced, and use exact micros when known", () => {
  expect(PROVIDER_PRICING_SNAPSHOTS.length).toBeGreaterThanOrEqual(8);
  for (const snapshot of PROVIDER_PRICING_SNAPSHOTS) {
    expect(snapshot.id).toContain(`v${snapshot.verifiedAt}`);
    expect(snapshot.sourceUrl).toMatch(/^https:\/\//);
    expect(snapshot.verifiedAt).toMatch(/^2026-08-\d{2}$/);
    expect(snapshot.options.length).toBeGreaterThan(0);
    expect(snapshot.options.some((option) => option.id === snapshot.recommendedOptionId)).toBe(true);
  }
});

test("provider catalog exposes pricing and never makes reference-only rows selectable", () => {
  const providers = PUBLIC_PROVIDER_CATALOG.filter((entry) => entry.kind === "provider");
  expect(providers.length).toBeGreaterThan(10);
  const pricedProviderKeys = new Set(PROVIDER_PRICING_SNAPSHOTS.map((snapshot) => snapshot.providerKey).filter((key): key is string => Boolean(key)));
  for (const entry of providers) {
    if (pricedProviderKeys.has(entry.credentialKey ?? "")) {
      expect(entry.pricingSnapshotId).toBeTruthy();
      expect(entry.pricingSourceUrl).toMatch(/^https:\/\//);
      expect(entry.pricingVerifiedAt).toMatch(/^2026-08-\d{2}$/);
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

const creativeReferences = [
  ["lenis", "https://github.com/darkroomengineering/lenis", "e01eefb1f55cd08bc051521d74f5f8182b71ee9d", "MIT"],
  ["gsap", "https://github.com/greensock/GSAP", "13e2b790546426a1a2e0e9b409f3f8dc6d6611f2", "GSAP Standard No Charge License"],
  ["vanta", "https://github.com/tengbao/vanta", "f8b351906688b56f0fc744e53bde81fc3c56f150", "MIT"],
  ["react-bits", "https://github.com/DavidHDev/react-bits", "310fc737fadcaa149a4e06fb088fc95332dc8bfb", "MIT + Commons Clause License Condition v1.0"],
  ["awesome-opus5-5-videos", "https://github.com/yihui-dev/awesome-opus5-5-videos", "92aee2f586ac0715cb3cbcb6384834f98a33383d", "MIT"],
] as const;

for (const [id, sourceUrl, sourceCommit, license] of creativeReferences) {
  test(`creative build reference ${id} is pinned, discoverable and not an execution grant`, () => {
    const reference = V96_REPOSITORY_CATALOG.find((entry) => entry.id === id);
    expect(reference).toMatchObject({ sourceUrl, sourceCommit, license,
      status: "cataloged", activation: "reference-only", sourceKind: "repository",
      runtime: "dependency-free", executionPermissions: ["read-reference", "write-review"] });
    expect(reference?.resourceUrls).toContain(sourceUrl);
    expect(reference?.evidenceGate).toBeTruthy();
    const publicEntry = PUBLIC_PROVIDER_CATALOG.find((entry) => entry.id === `repository-${id}`);
    expect(publicEntry).toMatchObject({ kind: "repository", sourceUrl, sourceCommit, license,
      status: "reference-only", selectionAllowed: false, credentialMode: "none" });
    expect(publicEntry?.sourceNote).toContain("not an execution grant");
  });
}
