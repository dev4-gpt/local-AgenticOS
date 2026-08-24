import { expect, test } from "@playwright/test";
import { MANAGED_PROVIDER_OPERATIONS, OPENROUTER_MANAGED_ROUTE } from "../src/lib/managedProviderAdapter";
import { resolveManagedCreditReadiness } from "../src/lib/managedCreditStatus";

test("a settled wallet allocation is not presented as provider-ready", () => {
  const result = resolveManagedCreditReadiness({
    walletStatus: "active",
    budgetStatus: "active",
    availableMicros: 1_000_000,
    managedRouteEnabled: false,
    manifestApproved: false,
    credentialReady: false,
    healthCheckPassed: false,
  });

  expect(result.status).toBe("provider_not_enabled");
  expect(result.usable).toBe(false);
  expect(result.reason).toContain("wallet is funded");
});

test("managed execution requires every readiness gate", () => {
  const base = {
    walletStatus: "active",
    budgetStatus: "active",
    availableMicros: 1_000_000,
    managedRouteEnabled: true,
    manifestApproved: true,
    credentialReady: true,
    healthCheckPassed: true,
  } as const;

  expect(resolveManagedCreditReadiness({ ...base, manifestApproved: false }).status).toBe("awaiting_manifest_approval");
  expect(resolveManagedCreditReadiness({ ...base, credentialReady: false }).status).toBe("credential_missing");
  expect(resolveManagedCreditReadiness({ ...base, healthCheckPassed: false }).usable).toBe(false);
  expect(resolveManagedCreditReadiness(base).status).toBe("ready_for_execution");
});

test("depleted and suspended budgets fail closed", () => {
  const base = {
    walletStatus: "active",
    budgetStatus: "active",
    availableMicros: 1_000_000,
    managedRouteEnabled: true,
    manifestApproved: true,
    credentialReady: true,
    healthCheckPassed: true,
  } as const;

  expect(resolveManagedCreditReadiness({ ...base, availableMicros: 0 }).status).toBe("depleted");
  expect(resolveManagedCreditReadiness({ ...base, budgetStatus: "suspended" }).status).toBe("suspended");
});

test("the OpenRouter managed route remains explicitly disabled", () => {
  expect(OPENROUTER_MANAGED_ROUTE.enabled).toBe(false);
  expect(MANAGED_PROVIDER_OPERATIONS).toEqual(["quote", "healthCheck", "reserve", "execute", "settle", "refund", "balance", "disable", "restore"]);
});
