import { expect, test } from "@playwright/test";
import { resolveCapabilityTraits, traitBundleMetadata, traitEvidenceForOutcome, validateTraitBundle } from "../src/lib/capabilityTraits";
import { validateV96RepositoryCatalog, V96_REPOSITORY_CATALOG } from "../src/lib/v96RepositoryCatalog";

test("the native trait resolver adds a mandatory baseline and research traits", () => {
  const bundle = resolveCapabilityTraits({ capability: "seo-research", provider: "firecrawl", surface: "notebook" });
  const ids = bundle.traits.map((trait) => trait.id);
  expect(ids).toEqual(expect.arrayContaining([
    "tenant-isolation", "provenance", "budget", "idempotency", "audit",
    "resumability", "approval", "output-quality", "source-policy", "ssrf-protection", "citations",
  ]));
  expect(bundle.policy.failClosedTraits).toContain("tenant-isolation");
  expect(bundle.policy.reviewTraits).toContain("output-quality");
  expect(validateTraitBundle(bundle)).toEqual([]);
});

test("capability aliases resolve to the same immutable policy snapshot", () => {
  const first = traitBundleMetadata(resolveCapabilityTraits({ capability: "research", provider: "firecrawl" }));
  const alias = traitBundleMetadata(resolveCapabilityTraits({ capability: "seo-research", provider: "firecrawl" }));
  expect(alias).toEqual(first);
  expect(first.sourceReferences.some((source) => source.id === "open-notebook")).toBe(true);
});

test("trait evidence keeps successful baseline controls while marking incomplete research honestly", () => {
  const bundle = resolveCapabilityTraits({ capability: "research", provider: "firecrawl" });
  const evidence = traitEvidenceForOutcome(bundle, "succeeded", {
    overrides: { "partial-results": "partial", confidence: "review" },
  });
  expect(evidence.find((item) => item.traitId === "tenant-isolation")?.status).toBe("succeeded");
  expect(evidence.find((item) => item.traitId === "partial-results")?.status).toBe("partial");
  expect(evidence.find((item) => item.traitId === "confidence")?.status).toBe("review");
});

test("the STAR repository catalog is pinned, licensed, and permission-bounded", () => {
  expect(V96_REPOSITORY_CATALOG.length).toBeGreaterThanOrEqual(17);
  expect(validateV96RepositoryCatalog()).toEqual([]);
  for (const repository of V96_REPOSITORY_CATALOG) {
    expect(repository.executionPermissions).not.toContain("execute-shell");
    expect(repository.sourceCommit.length).toBeGreaterThan(6);
  }
});
