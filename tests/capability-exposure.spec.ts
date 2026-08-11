import { expect, test } from "@playwright/test";
import { clientCapabilityExposure } from "../src/lib/clientRuntimePolicy";

test("client capability exposure distinguishes preview from execution", () => {
  const previousEdition = process.env.VELOCE_CLIENT_EDITION;
  const previousEnabled = process.env.CLIENT_ENABLED_CAPABILITIES;
  const previousPreview = process.env.CLIENT_PREVIEW_CAPABILITIES;
  process.env.VELOCE_CLIENT_EDITION = "1";
  process.env.CLIENT_ENABLED_CAPABILITIES = "tenant-data";
  process.env.CLIENT_PREVIEW_CAPABILITIES = "context-compiler";
  expect(clientCapabilityExposure("tenant-data")).toBe("enabled");
  expect(clientCapabilityExposure("context-compiler")).toBe("preview");
  expect(clientCapabilityExposure("visual-qa")).toBe("hidden");
  if (previousEdition === undefined) delete process.env.VELOCE_CLIENT_EDITION; else process.env.VELOCE_CLIENT_EDITION = previousEdition;
  if (previousEnabled === undefined) delete process.env.CLIENT_ENABLED_CAPABILITIES; else process.env.CLIENT_ENABLED_CAPABILITIES = previousEnabled;
  if (previousPreview === undefined) delete process.env.CLIENT_PREVIEW_CAPABILITIES; else process.env.CLIENT_PREVIEW_CAPABILITIES = previousPreview;
});
