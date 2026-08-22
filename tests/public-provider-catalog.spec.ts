import { expect, test } from "@playwright/test";
import {
  PUBLIC_PROVIDER_CATALOG,
  publicCatalogEntryForCredential,
  publicCatalogProviderOptions,
} from "../src/lib/publicProviderCatalog";

test("the public catalog exposes complete, non-misleading rows", () => {
  expect(PUBLIC_PROVIDER_CATALOG.length).toBeGreaterThan(20);
  for (const entry of PUBLIC_PROVIDER_CATALOG) {
    expect(entry.id).toBeTruthy();
    expect(entry.customerTool).toBeTruthy();
    expect(entry.customerOutcome).toBeTruthy();
    expect(entry.pipelineStage).toBeTruthy();
    expect(entry.dataScope).toBeTruthy();
    expect(entry.permissions).toBeTruthy();
    expect(entry.pricingBasis).toBeTruthy();
    expect(entry.creditEstimate).toBeTruthy();
    expect(entry.approval).toBeTruthy();
  }
});

test("BYOK rows map only to approved credential options", () => {
  const options = publicCatalogProviderOptions();
  expect(options.length).toBeGreaterThan(5);
  for (const entry of options) {
    expect(entry.status).toBe("client-key");
    expect(entry.credentialKey).toBeTruthy();
    expect(publicCatalogEntryForCredential(entry.credentialKey!)).toEqual(entry);
  }
});

test("Ponytail is visible as a native governed capability, not a bundled runtime", () => {
  const ponytail = PUBLIC_PROVIDER_CATALOG.find((entry) => entry.id === "native-ponytail-restraint");
  expect(ponytail?.status).toBe("available-now");
  expect(ponytail?.credentialMode).toBe("none");
  expect(ponytail?.sourceUrl).toContain("ponytail");
  expect(ponytail?.license).toBe("MIT");
});

test("Jina is visibly isolated even though its contract is enabled", () => {
  const jina = PUBLIC_PROVIDER_CATALOG.find((entry) => entry.id === "repository-jina-reader");
  expect(jina?.status).toBe("isolated-worker");
  expect(jina?.sourceNote).toContain("isolated");
});
