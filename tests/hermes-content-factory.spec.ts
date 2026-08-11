import { expect, test } from "@playwright/test";
import {
  HERMES_CONTENT_FACTORY_SOURCE,
  HERMES_CONTENT_FACTORY_STEPS,
  canPublishHermesContentFactoryPlan,
  createHermesContentFactoryPlan,
  hermesContentFactoryPrompt,
} from "../src/lib/hermesContentFactory";
import { hermesFactoryApprovalPatch, hermesFactoryDeliveryReplay, normalizeClientHermesFactoryRun } from "../src/lib/clientHermesContentFactory";

test("Hermes content factory has a complete, approval-gated v96 sequence", () => {
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
  expect(plan.contractVersion).toBe("v96");
  expect(plan.tenantSlug).toBe("veloce-cloud-test");
  expect(plan.autoPublish).toBe(false);
  expect(canPublishHermesContentFactoryPlan(plan, null)).toBe(false);
  expect(canPublishHermesContentFactoryPlan(plan, {
    id: "approval-1",
    workflowId: plan.workflowId,
    tenantSlug: plan.tenantSlug,
    approvedBy: "member-1",
    approvedAt: "2026-08-11T12:00:00.000Z",
  })).toBe(true);
  const prompt = hermesContentFactoryPrompt(plan, "draft");
  expect(prompt).toContain("You are Hermes");
  expect(prompt).toContain("Stage: draft");
  expect(prompt).toContain("Never publish");
});

test("Hermes content factory retries are deterministic but explicit keys can create separate runs", () => {
  const input = { tenantSlug: "veloce-cloud-test", brief: "Create a researched article comparing safe agent-cloud architectures.", contentType: "article" as const };
  const first = createHermesContentFactoryPlan(input);
  const retry = createHermesContentFactoryPlan({ ...input, brief: `  ${input.brief}  ` });
  const separate = createHermesContentFactoryPlan({ ...input, idempotencyKey: "campaign-2" });
  expect(retry.workflowId).toBe(first.workflowId);
  expect(separate.workflowId).not.toBe(first.workflowId);
});

test("Hermes publication approval is bound to tenant and workflow", () => {
  const plan = createHermesContentFactoryPlan({ tenantSlug: "veloce-cloud-test", brief: "Create a researched article comparing safe agent-cloud architectures." });
  const approval = { id: "approval-1", workflowId: plan.workflowId, tenantSlug: plan.tenantSlug, approvedBy: "member-1", approvedAt: "2026-08-11T12:00:00.000Z" };
  expect(canPublishHermesContentFactoryPlan(plan, { ...approval, tenantSlug: "other-tenant" })).toBe(false);
  expect(canPublishHermesContentFactoryPlan(plan, { ...approval, workflowId: "other-workflow" })).toBe(false);
  expect(canPublishHermesContentFactoryPlan(plan, { ...approval, approvedAt: "not-a-date" })).toBe(false);
});

test("Hermes content factory rejects unscoped or empty briefs", () => {
  expect(() => createHermesContentFactoryPlan({ tenantSlug: "bad slug", brief: "A valid enough brief." })).toThrow(/tenantSlug/);
  expect(() => createHermesContentFactoryPlan({ tenantSlug: "veloce-cloud-test", brief: "short" })).toThrow(/brief/);
});

test("approval and delivery records are workflow-bound and delivery retries replay", () => {
  const plan = createHermesContentFactoryPlan({ tenantSlug: "veloce-cloud-test", brief: "Create a researched article comparing safe agent-cloud architectures." });
  const run = normalizeClientHermesFactoryRun({
    id: "run-1", tenant_slug: plan.tenantSlug, created_by: "member-1", workflow_id: plan.workflowId,
    idempotency_key: "request-1", content_type: plan.contentType, brief: plan.brief, plan,
    status: "awaiting_approval", current_stage: "approval", stages: [], citations: [],
  });
  const approval = hermesFactoryApprovalPatch(run, "member-1");
  expect(approval?.approval.id).toBe("approval-run-1");
  expect(approval?.status).toBe("approved");
  expect(hermesFactoryDeliveryReplay({ ...run, status: "published", delivery: { id: "delivery-1", workflowId: plan.workflowId, tenantSlug: plan.tenantSlug, destination: "internal-review", status: "recorded", approvalId: approval?.approval.id } })).toBe(true);
  expect(hermesFactoryDeliveryReplay({ ...run, status: "published", delivery: null })).toBe(false);
});
