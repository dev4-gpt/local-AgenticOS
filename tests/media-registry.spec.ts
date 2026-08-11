import { expect, test } from "@playwright/test";
import {
  MEDIA_PROVIDER_REGISTRY,
  validateGovernedMediaRequest,
  validateMediaProviderDescriptor,
  validateVisualQaRequest,
} from "../src/lib/mediaProviderRegistry";

test("media registry keeps every provider disabled until evidence promotes it", () => {
  expect(MEDIA_PROVIDER_REGISTRY.length).toBeGreaterThanOrEqual(4);
  for (const provider of MEDIA_PROVIDER_REGISTRY) {
    expect(validateMediaProviderDescriptor(provider)).toEqual([]);
    expect(provider.enabledByDefault).toBe(false);
  }
});

test("governed media requests require registered providers and private artifacts", () => {
  expect(validateGovernedMediaRequest({
    contractVersion: "v96",
    tenantSlug: "veloce-cloud-test",
    requestId: "media-1",
    providerId: "openai-image",
    artifactInputIds: [],
    prompt: "A bounded test asset",
    budgetMicros: 50_000,
    publication: "private-artifact",
  })).toEqual([]);
  expect(validateGovernedMediaRequest({ providerId: "unreviewed-provider", prompt: "x", budgetMicros: -1 })).toEqual(expect.arrayContaining([
    "provider is not registered",
    "budgetMicros must be a non-negative safe integer",
  ]));
});

test("visual QA requests are bounded before an isolated worker runs", () => {
  expect(validateVisualQaRequest({ contractVersion: "v96", tenantSlug: "veloce-cloud-test", artifactId: "artifact-1", maxFrames: 12, maxRuntimeMs: 10_000, detector: "supervision" })).toEqual([]);
  expect(validateVisualQaRequest({ contractVersion: "v96", tenantSlug: "veloce-cloud-test", artifactId: "artifact-1", maxFrames: 121, maxRuntimeMs: 1, detector: "supervision" })).toEqual(expect.arrayContaining([
    "maxFrames must be between 1 and 120",
    "maxRuntimeMs must be between 100 and 120000",
  ]));
});
