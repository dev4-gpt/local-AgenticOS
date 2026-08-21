import { expect, test } from "@playwright/test";
import { resolveCapabilityTraits, traitBundleMetadata, traitEvidenceForOutcome, validateTraitBundle } from "../src/lib/capabilityTraits";
import { validateV96RepositoryCatalog, validateV96RepositoryReference, V96_REPOSITORY_CATALOG, V96_UNCATALOGED_LICENSE_REFERENCES } from "../src/lib/v96RepositoryCatalog";
import { portfolioSummary, validateV96StarredPortfolio, V96_STARRED_PORTFOLIO, V96_STARRED_PORTFOLIO_SNAPSHOT_DATE } from "../src/lib/v96StarredPortfolio";

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

test("Jina is promoted only after its complete isolated-worker evidence bundle", () => {
  const jina = V96_REPOSITORY_CATALOG.find((item) => item.id === "jina-reader");
  expect(jina?.status).toBe("enabled");
  expect(jina?.activation).toBe("native-enabled");
  expect(jina?.activationEvidence).toContain("00168-h5t");
  expect(jina?.activationEvidence).toContain("two-tenant isolation");
  expect(jina?.activationEvidence).toContain("deletion lineage");
  expect(jina?.rollbackRule).toContain("403");
});

test("unlicensed portfolio references remain explicit and non-executable", () => {
  expect(V96_UNCATALOGED_LICENSE_REFERENCES).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "ai-builder-club-skills", licenseStatus: "no-license-file", disposition: "reference-only" }),
    expect.objectContaining({ id: "awesome-gpu-engineering", licenseStatus: "no-license-file", disposition: "reference-only" }),
  ]));
  for (const reference of V96_UNCATALOGED_LICENSE_REFERENCES) {
    expect(V96_REPOSITORY_CATALOG.some((item) => item.id === reference.id)).toBe(false);
  }
});

test("catalog license labels match the pinned source dispositions", () => {
  expect(V96_REPOSITORY_CATALOG.find((item) => item.id === "open-notebook")?.license).toBe("MIT");
  expect(V96_REPOSITORY_CATALOG.find((item) => item.id === "rag-anything")?.license).toBe("MIT");
  expect(V96_REPOSITORY_CATALOG.find((item) => item.id === "wan2gp")?.license).toBe("WanGP Community License 2.0");
  expect(V96_REPOSITORY_CATALOG.find((item) => item.id === "skyreels-v2")?.license).toBe("other (repository metadata)");
});

test("the dated starred portfolio reconciles all current sources without activating runtimes", () => {
  expect(V96_STARRED_PORTFOLIO_SNAPSHOT_DATE).toBe("2026-08-20");
  expect(V96_STARRED_PORTFOLIO).toHaveLength(101);
  expect(validateV96StarredPortfolio()).toEqual([]);
  expect(portfolioSummary().total).toBe(101);
  expect(portfolioSummary().referenceOnly).toBeGreaterThan(0);
  expect(V96_STARRED_PORTFOLIO.find((item) => item.fullName === "x1xhlol/system-prompts-and-models-of-ai-tools")?.activation).toBe("reference-only");
  expect(V96_STARRED_PORTFOLIO.find((item) => item.fullName === "D4Vinci/Scrapling")?.runtime).toBe("operator-worker");
});

test("starred portfolio blocks unresolved licenses and unsafe permission expansion", () => {
  const restricted = V96_STARRED_PORTFOLIO.filter((item) => item.licenseStatus !== "confirmed" || /GPL|AGPL/i.test(item.license));
  const unlicensed = V96_STARRED_PORTFOLIO.filter((item) => item.licenseStatus === "missing" || item.licenseStatus === "unresolved");
  expect(unlicensed.length).toBeGreaterThan(0);
  expect(restricted.every((item) => item.activation === "reference-only")).toBe(true);
  expect(V96_STARRED_PORTFOLIO.every((item) => !item.executionPermissions.includes("execute-shell") && !item.executionPermissions.includes("arbitrary-network"))).toBe(true);
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
