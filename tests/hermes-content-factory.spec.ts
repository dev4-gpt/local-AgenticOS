import { expect, test } from "@playwright/test";
import {
  HERMES_CONTENT_FACTORY_SOURCE,
  HERMES_CONTENT_FACTORY_STEPS,
  canPublishHermesContentFactoryPlan,
  createHermesContentFactoryPlan,
  hermesContentFactoryPrompt,
} from "../src/lib/hermesContentFactory";

test("Hermes content factory has a complete, approval-gated v90 sequence", () => {
  expect(HERMES_CONTENT_FACTORY_SOURCE).toBe("https://rajaashok.github.io/hermes-content-factory-workflow");
  expect(HERMES_CONTENT_FACTORY_STEPS.map((step) => step.id)).toEqual([
    "brief", "research", "plan", "draft", "assets", "quality", "approval", "publish",
  ]);
  expect(HERMES_CONTENT_FACTORY_STEPS.find((step) => step.id === "research")?.output).toBe("citation_record");
  expect(HERMES_CONTENT_FACTORY_STEPS.find((step) => step.id === "quality")?.output).toBe("quality_report");
  expect(HERMES_CONTENT_FACTORY_STEPS.find((step) => step.id === "publish")?.approvalRequired).toBe(true);
});

test("Hermes content factory creates a tenant-scoped plan and cannot publish implicitly", () => {
  const plan = createHermesContentFactoryPlan({
    tenantSlug: "veloce-cloud-test",
    workflowId: "content-factory-1",
    contentType: "article",
    brief: "Create a researched article comparing safe agent-cloud architectures.",
  });
  expect(plan.contractVersion).toBe("v90");
  expect(plan.tenantSlug).toBe("veloce-cloud-test");
  expect(plan.autoPublish).toBe(false);
  expect(canPublishHermesContentFactoryPlan(plan, false)).toBe(false);
  expect(canPublishHermesContentFactoryPlan(plan, true)).toBe(true);
  const prompt = hermesContentFactoryPrompt(plan, "draft");
  expect(prompt).toContain("You are Hermes");
  expect(prompt).toContain("Stage: draft");
  expect(prompt).toContain("Never publish");
});

test("Hermes content factory rejects unscoped or empty briefs", () => {
  expect(() => createHermesContentFactoryPlan({ tenantSlug: "bad slug", brief: "A valid enough brief." })).toThrow(/tenantSlug/);
  expect(() => createHermesContentFactoryPlan({ tenantSlug: "veloce-cloud-test", brief: "short" })).toThrow(/brief/);
});
