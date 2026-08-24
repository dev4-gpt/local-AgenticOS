import { expect, test } from "@playwright/test";
import { evaluateManagedProviderReadiness } from "../product-experience/src/lib/managedProviderReadiness";

const row = {
  managedRouteEnabled: true,
  status: "active",
  credentialReference: "projects/p/secrets/openrouter/versions/1",
  manifestVersion: "manifest-1",
  healthStatus: "passed",
  reconciliationStatus: "matched",
};

test("health and balance remain available before health has passed", () => {
  const unhealthy = { ...row, healthStatus: "failed" };
  expect(evaluateManagedProviderReadiness("healthCheck", unhealthy, "price-1").ok).toBe(true);
  expect(evaluateManagedProviderReadiness("balance", unhealthy, "price-1").ok).toBe(true);
  expect(evaluateManagedProviderReadiness("execute", unhealthy, "price-1").error).toBe("managed_provider_health_not_passed");
});

test("settlement and refund remain available while the route is disabled", () => {
  const disabled = { ...row, managedRouteEnabled: false, healthStatus: "disabled" };
  expect(evaluateManagedProviderReadiness("settle", disabled, null).ok).toBe(true);
  expect(evaluateManagedProviderReadiness("refund", disabled, null).ok).toBe(true);
  expect(evaluateManagedProviderReadiness("execute", disabled, "price-1").error).toBe("managed_provider_not_enabled");
});

test("restore requires approval and credential evidence, then forces a new health check", () => {
  expect(evaluateManagedProviderReadiness("restore", { ...row, manifestVersion: null }, null).error).toBe("managed_provider_manifest_not_approved");
  expect(evaluateManagedProviderReadiness("restore", { ...row, credentialReference: null }, null).error).toBe("managed_provider_credential_missing");
  expect(evaluateManagedProviderReadiness("restore", { ...row, healthStatus: "disabled" }, null).ok).toBe(true);
});
