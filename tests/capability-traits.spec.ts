import { expect, test } from "@playwright/test";
import { resolveCapabilityTraits, traitBundleMetadata, traitEvidenceForOutcome, validateTraitBundle } from "../src/lib/capabilityTraits";
import { validateV96RepositoryCatalog, validateV96RepositoryReference, V96_REPOSITORY_CATALOG } from "../src/lib/v96RepositoryCatalog";

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

test("provider-bound jobs receive the native compression trait and Headroom provenance", () => {
  const bundle = resolveCapabilityTraits({ capability: "text-agents", provider: "openrouter", surface: "chat" });
  expect(bundle.traits.map((trait) => trait.id)).toContain("context-compression");
  expect(bundle.sourceReferences.map((source) => source.id)).toContain("headroom");
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

test("native-enabled references declare implementation, evidence, and rollback", () => {
  for (const reference of V96_REPOSITORY_CATALOG.filter((item) => item.activation === "native-enabled")) {
    expect(reference.implementationMapping).toBeTruthy();
    expect(reference.activationEvidence).toBeTruthy();
    expect(reference.rollbackRule).toBeTruthy();
  }
  expect(V96_REPOSITORY_CATALOG.find((item) => item.id === "roboflow-supervision")?.activation).toBe("externally-gated");
  expect(V96_REPOSITORY_CATALOG.find((item) => item.id === "wan2gp")?.activation).toBe("externally-gated");
});

test("reference validation rejects tokenized or under-specified sources", () => {
  const errors = validateV96RepositoryReference({
    id: "unsafe-source",
    name: "Unsafe source",
    sourceUrl: "https://example.com/repo?token=secret",
    sourceCommit: "main",
    license: "unknown",
    provenance: "",
    targetCapabilities: [],
    traits: [],
    runtime: "adapter",
    executionPermissions: [],
    status: "contract-only",
    resourceUrls: ["https://example.com/guide?token=secret"],
    placement: "",
    evidenceGate: "",
  });
  expect(errors).toEqual(expect.arrayContaining([
    "repository sourceUrl must be a clean https URL",
    "repository sourceCommit must be pinned",
    "repository license must be known",
    "repository provenance is required",
    "repository targetCapabilities are required",
    "repository traits are required",
    "repository executionPermissions are required",
    "repository resourceUrls must be clean https URLs",
    "repository placement is required",
    "repository evidenceGate is required",
  ]));
});
