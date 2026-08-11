import { expect, test } from "@playwright/test";
import {
  createSeoIntelligenceRequest,
  firecrawlSearchToSeoIntelligenceRecord,
  normalizeSeoIntelligenceRecord,
  validateSeoIntelligenceRequest,
} from "../src/lib/seoIntelligence";

test("SEO intelligence requests are bounded and provider-neutral", () => {
  const request = createSeoIntelligenceRequest({
    requestId: "seo-request-1",
    tenantSlug: "veloce-cloud-test",
    provider: "firecrawl",
    domain: "https://example.com",
    metrics: ["competitors"],
    maxRows: 3,
  });
  expect(request.contractVersion).toBe("v96");
  expect(validateSeoIntelligenceRequest({ ...request, domain: "http://127.0.0.1", maxRows: 101 })).toEqual(expect.arrayContaining([
    "domain must be a public https URL",
    "maxRows must be between 1 and 100",
  ]));
});

test("Firecrawl evidence normalizes into an attributable SEO record", () => {
  const request = createSeoIntelligenceRequest({
    requestId: "seo-request-2",
    tenantSlug: "veloce-cloud-test",
    provider: "firecrawl",
    domain: "https://example.com",
    metrics: ["competitors"],
    maxRows: 2,
  });
  const record = firecrawlSearchToSeoIntelligenceRecord({
    request,
    providerCostMicros: 1000,
    results: [
      { url: "https://example.com/one", title: "One", description: "Summary", markdown: "Full page" },
      { url: "https://example.com/two", title: "Two", description: "", markdown: "" },
    ],
  });
  expect(record.status).toBe("partial");
  expect(record.citations).toHaveLength(1);
  expect(record.metrics.competitors).toHaveLength(2);
  expect(normalizeSeoIntelligenceRecord(record)?.provider).toBe("firecrawl");
});

test("SEO records fail closed when evidence is absent", () => {
  const request = createSeoIntelligenceRequest({
    requestId: "seo-request-3",
    tenantSlug: "veloce-cloud-test",
    provider: "openseo",
    domain: "https://example.com",
    metrics: ["rankings"],
    maxRows: 1,
  });
  const record = firecrawlSearchToSeoIntelligenceRecord({ request, providerCostMicros: 0, results: [] });
  expect(record.status).toBe("failed");
  expect(normalizeSeoIntelligenceRecord(record)?.status).toBe("failed");
});
