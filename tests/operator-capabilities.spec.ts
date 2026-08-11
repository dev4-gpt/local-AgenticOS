import { expect, test } from "@playwright/test";
import {
  chooseProviderRoute,
  validateCommunicationRequest,
  validateResumableWorktreeRequest,
  validateSecurityAssessmentRequest,
  validateVoiceRequest,
} from "../src/lib/operatorCapabilityContracts";

test("routing chooses only approved providers and records fallback", () => {
  const decision = chooseProviderRoute({
    requestId: "route-1",
    policy: { tenantSlug: "veloce-cloud-test", approvedProviders: ["primary", "backup"], fallbackOrder: ["primary", "backup"], maxBudgetMicros: 1000, allowCompression: true },
    estimatedCostMicros: 500,
    failedProviders: ["primary"],
  });
  expect(decision?.selectedProvider).toBe("backup");
  expect(decision?.reason).toBe("fallback");
  expect(chooseProviderRoute({ requestId: "route-2", policy: { tenantSlug: "veloce-cloud-test", approvedProviders: ["primary"], fallbackOrder: ["primary"], maxBudgetMicros: 100, allowCompression: false }, estimatedCostMicros: 101 } )?.reason).toBe("budget_rejection");
});

test("operator worktrees are bounded and approval-aware", () => {
  expect(validateResumableWorktreeRequest({ contractVersion: "v96", tenantSlug: "veloce-cloud-test", runId: "run-1", goal: "Review a change", worktreeRef: "tmp/run-1", maxTokens: 10_000, maxMinutes: 30, approval: "pending" })).toEqual([]);
  expect(validateResumableWorktreeRequest({ worktreeRef: "/Users/private", maxTokens: 0, maxMinutes: 0, approval: "pending" })).toEqual(expect.arrayContaining(["worktreeRef must be a bounded relative reference", "maxTokens is invalid"]));
});

test("security, voice, and communications require explicit boundaries", () => {
  expect(validateSecurityAssessmentRequest({ contractVersion: "v96", tenantSlug: "veloce-cloud-test", target: "https://staging.example.com", scope: ["headers", "routes"], maxMinutes: 10, budgetMicros: 1000, approval: "approved" })).toEqual([]);
  expect(validateSecurityAssessmentRequest({ target: "https://example.com", scope: ["*"], approval: "pending" })).toEqual(expect.arrayContaining(["target must be an approved staging origin", "security assessment requires approval"]));
  expect(validateVoiceRequest({ contractVersion: "v96", tenantSlug: "veloce-cloud-test", text: "Hello", voiceId: "voice_1234", consentRecordId: "consent-1", storage: "private-artifact" })).toEqual([]);
  expect(validateCommunicationRequest({ contractVersion: "v96", tenantSlug: "veloce-cloud-test", provider: "infobip", recipients: ["+15551234567"], content: "Draft only", consentRecordId: "consent-1", approval: "approved", send: false })).toEqual([]);
  expect(validateCommunicationRequest({ provider: "infobip", recipients: ["+15551234567"], content: "Send now", consentRecordId: "consent-1", approval: "approved", send: true })).toContain("communication requests cannot send automatically");
});
