import { expect, test } from "@playwright/test";
import { selectResearchProvider } from "../src/lib/researchProviderRouter";

const firecrawl = { available: true, allowed: true, costMicros: 1000 };
const brave = { available: true, allowed: true, costMicros: 0 };

test("automatic bounded search chooses the cheaper Brave lane", () => {
  const decision = selectResearchProvider({ configuredProvider: "firecrawl", routingEnabled: true, scrapeRequested: false, firecrawl, brave });
  expect(decision).toMatchObject({ provider: "brave", mode: "automatic", reason: "bounded-search-cost", policyVersion: "research-routing-v1" });
});

test("automatic bounded search respects a cheaper approved Firecrawl lane", () => {
  const decision = selectResearchProvider({ configuredProvider: "brave", routingEnabled: true, scrapeRequested: false, firecrawl: { ...firecrawl, costMicros: 0 }, brave: { ...brave, costMicros: 1000 } });
  expect(decision).toMatchObject({ provider: "firecrawl", mode: "automatic", reason: "firecrawl-fallback", estimatedCostMicros: 0 });
});

test("content extraction chooses Firecrawl even when Brave is cheaper", () => {
  const decision = selectResearchProvider({ configuredProvider: "brave", routingEnabled: true, scrapeRequested: true, firecrawl, brave });
  expect(decision).toMatchObject({ provider: "firecrawl", mode: "automatic", reason: "content-extraction" });
});

test("automatic routing falls back to Firecrawl when Brave is unavailable or disallowed", () => {
  const decision = selectResearchProvider({ configuredProvider: "brave", routingEnabled: true, scrapeRequested: false, firecrawl, brave: { ...brave, available: false } });
  expect(decision).toMatchObject({ provider: "firecrawl", reason: "brave-unavailable" });
  const disallowed = selectResearchProvider({ configuredProvider: "brave", routingEnabled: true, scrapeRequested: false, firecrawl, brave: { ...brave, allowed: false } });
  expect(disallowed).toMatchObject({ provider: "firecrawl", reason: "brave-unavailable" });
});

test("manifest mode preserves explicit provider choice and fails closed", () => {
  expect(selectResearchProvider({ configuredProvider: "firecrawl", routingEnabled: false, scrapeRequested: false, firecrawl, brave })).toMatchObject({ provider: "firecrawl", mode: "manifest", reason: "manifest-provider" });
  expect(selectResearchProvider({ configuredProvider: "brave", routingEnabled: false, scrapeRequested: false, firecrawl, brave: { ...brave, available: false } })).toEqual({ error: "provider_not_configured" });
  expect(selectResearchProvider({ configuredProvider: "brave", routingEnabled: true, scrapeRequested: false, firecrawl: { ...firecrawl, allowed: false }, brave: { ...brave, allowed: false } })).toEqual({ error: "provider_not_allowlisted" });
});

test("automatic selection does not substitute search for requested extraction", () => {
  expect(selectResearchProvider({ configuredProvider: "brave", routingEnabled: true, scrapeRequested: true, firecrawl: { ...firecrawl, available: false }, brave })).toEqual({ error: "provider_not_configured" });
});
