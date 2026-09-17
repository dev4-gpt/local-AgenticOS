import { expect, test } from "@playwright/test";
import { HYBRID_CAPABILITIES, hybridCapabilityById } from "@/lib/hybridCapabilityCatalog";

test("high-value hybrid capability catalog has a user-controlled path", () => {
  const expected = [
    "cloud-agents", "local-worker", "local-sources", "local-models", "workflow-control", "tenant-memory",
    "research-seo", "open-screen", "voice", "openmontage", "gpu-media", "outbound-actions", "developer-mode",
    "workplace-integrations", "recordly",
  ];
  expect(HYBRID_CAPABILITIES.map((capability) => capability.id)).toEqual(expected);
  for (const capability of HYBRID_CAPABILITIES) {
    expect(capability.summary.length).toBeGreaterThan(20);
    expect(capability.userControls.length).toBeGreaterThan(0);
    expect(capability.activationRequirement.length).toBeGreaterThan(12);
  }
});

test("restricted catalog entries remain explicit rather than silently executable", () => {
  expect(hybridCapabilityById("recordly")).toMatchObject({ executionLocation: "local-worker", state: "future" });
  expect(hybridCapabilityById("openmontage")).toMatchObject({ executionLocation: "local-worker", state: "controlled" });
  expect(hybridCapabilityById("outbound-actions")).toMatchObject({ state: "controlled" });
  expect(hybridCapabilityById("missing-capability")).toBeNull();
});
