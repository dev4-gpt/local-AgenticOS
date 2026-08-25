import { expect, test } from "@playwright/test";
import {
  BASE_MONTHLY_USD,
  BASE_SETUP_USD,
  applyCommercialScopeToManifest,
  recommendCommercialScope,
} from "../product-experience/src/lib/commercialScope";

test("standard intake recommends the single base platform offer", () => {
  const recommendation = recommendCommercialScope({
    seatCount: 1,
    brandCount: 1,
    workflowCount: 1,
    integrations: [],
    capabilityAreas: [],
    mediaRequirement: "none",
    externalActions: false,
    knowledgeMigration: false,
    supportLevel: "standard",
    managedServiceNeed: "self_directed",
    credentialModel: "client_owned",
    providerUsagePreference: "byok",
    providerCreditBudgetUsd: null,
    retentionDays: null,
    approvalRule: "approve_external_actions",
  });

  expect(recommendation.packageId).toBe("platform");
  expect(recommendation.complexity).toBe("standard");
  expect(recommendation.setupRangeUsd).toEqual({ min: BASE_SETUP_USD, max: BASE_SETUP_USD });
  expect(recommendation.monthlyRangeUsd).toEqual({ min: BASE_MONTHLY_USD, max: BASE_MONTHLY_USD });
  expect(recommendation.providerCredits.includedInPlatformFee).toBe(false);
  expect(recommendation.addOns).toEqual([]);
});

test("scope flags make complexity and capability additions explicit", () => {
  const recommendation = recommendCommercialScope({
    seatCount: 8,
    brandCount: 2,
    workflowCount: 5,
    integrations: ["CRM", "Drive", "Slack"],
    capabilityAreas: ["growth", "creative"],
    mediaRequirement: "video",
    externalActions: true,
    knowledgeMigration: true,
    supportLevel: "priority",
    managedServiceNeed: "growth",
    credentialModel: "managed_allowance",
    providerUsagePreference: "managed_credits",
    providerCreditBudgetUsd: 500,
    retentionDays: 90,
    approvalRule: "approve_publish_and_spend",
  });

  expect(recommendation.complexity).toBe("custom");
  expect(recommendation.flags).toEqual(expect.arrayContaining([
    "additional_seats",
    "multiple_brands",
    "workflow_complexity",
    "integration_complexity",
    "media_generation",
    "external_actions",
    "knowledge_migration",
    "support_scope",
    "managed_service",
  ]));
  expect(recommendation.addOns.map((item) => item.id)).toEqual(expect.arrayContaining([
    "growth-operations",
    "creative-production",
    "managed-operations",
    "integrations",
  ]));
  expect(recommendation.providerCredits).toEqual({ mode: "managed_credits", requestedMonthlyBudgetUsd: 500, includedInPlatformFee: false });
  expect(recommendation.requiredCapabilities).toEqual(expect.arrayContaining(["seo-research", "media", "delivery-actions"]));
});

test("manifest compilation does not turn scope approval into provider activation", () => {
  const manifest = applyCommercialScopeToManifest({
    approved: true,
    providerCallsEnabled: false,
    enabledCapabilities: ["tenant-data"],
    providerAllowlist: [],
    approvalPolicy: "approve_external_actions",
  }, {
    capabilityAreas: ["creative"],
    mediaRequirement: "image",
    providerUsagePreference: "managed_credits",
    providerCreditBudgetUsd: 300,
  });

  expect(manifest.enabledCapabilities).toEqual(expect.arrayContaining(["tenant-data", "artifacts", "media", "web-studio"]));
  expect(manifest.providerCallsEnabled).toBe(false);
  expect(manifest.providerAllowlist).toEqual([]);
  expect(manifest.commercialScope).toMatchObject({ providerUsage: "managed_credits", providerCreditsIncluded: false });
});
