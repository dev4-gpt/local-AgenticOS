import { expect, test } from "@playwright/test";
import {
  CAPABILITY_CONTRACT_VERSION,
  deterministicCapabilityIdempotencyKey,
  validateCapabilityApproval,
  validateCapabilityBudget,
  validateCapabilityEnvelope,
} from "../src/lib/capabilityContracts";

test("capability envelope accepts a tenant-scoped reviewed request", () => {
  const now = new Date().toISOString();
  expect(validateCapabilityEnvelope({
    contractVersion: CAPABILITY_CONTRACT_VERSION,
    capability: "research",
    tenantSlug: "veloce-cloud-test",
    requestId: "research-request-1",
    idempotencyKey: "research-example-1",
    status: "queued",
    budget: { maxMicros: 50_000 },
    approval: { required: "none", status: "not_required" },
    artifactIds: [],
    citationIds: [],
    traitSnapshot: {
      version: "v96-traits-1",
      capability: "research",
      provider: "firecrawl",
      surface: "notebook",
      traits: [],
      sourceReferences: [],
      policy: { failClosedTraits: [], reviewTraits: [], partialTraits: [] },
    },
    evidence: [],
    failureDisposition: "succeeded",
    createdAt: now,
    updatedAt: now,
  })).toEqual([]);
});

test("capability validation fails closed for tenant, budget, and approval violations", () => {
  const errors = validateCapabilityEnvelope({
    contractVersion: "v95",
    capability: "unknown" as "research",
    tenantSlug: "bad tenant",
    requestId: "!",
    idempotencyKey: "",
    status: "queued",
    budget: { maxMicros: -1, reservedMicros: 20 },
    approval: { required: "human-before-external-action", status: "approved" },
    artifactIds: [""],
    citationIds: [""],
    createdAt: "not-a-date",
    updatedAt: "not-a-date",
  });
  expect(errors.join(" ")).toContain("contractVersion");
  expect(errors.join(" ")).toContain("capability");
  expect(errors.join(" ")).toContain("tenantSlug");
  expect(errors.join(" ")).toContain("budget");
  expect(errors.join(" ")).toContain("approvalId");
  expect(errors.join(" ")).toContain("artifactIds");
  expect(errors.join(" ")).toContain("createdAt");
});

test("approved capabilities require a complete approval record", () => {
  expect(validateCapabilityApproval({ required: "human-before-external-action", status: "approved" })).toEqual([
    "approved capability requires approvalId",
    "approved capability requires approvedBy",
    "approved capability requires a valid approvedAt",
  ]);
  expect(validateCapabilityApproval({ required: "human-before-external-action", status: "approved", approvalId: "a1", approvedBy: "member", approvedAt: new Date().toISOString() })).toEqual([]);
});

test("capability idempotency keys are deterministic and input-sensitive", () => {
  const first = deterministicCapabilityIdempotencyKey("research", ["tenant-a", "https://example.com", "title"]);
  expect(first).toBe(deterministicCapabilityIdempotencyKey("research", ["tenant-a", "https://example.com", "title"]));
  expect(first).not.toBe(deterministicCapabilityIdempotencyKey("research", ["tenant-b", "https://example.com", "title"]));
  expect(validateCapabilityBudget({ maxMicros: 100, reservedMicros: 101 })).toContain("budget.reservedMicros cannot exceed maxMicros");
});
