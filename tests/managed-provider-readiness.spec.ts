import { expect, test } from "@playwright/test";
import { evaluateManagedProviderReadiness } from "../product-experience/src/lib/managedProviderReadiness";

const row = {
  managedRouteEnabled: true,
  status: "active",
  credentialReference: "projects/p/secrets/openrouter/versions/1",
  manifestVersion: "manifest-1",
  healthStatus: "passed",
  reconciliationStatus: "matched",
  connectionStatus: "connected",
  credentialMode: "veloce-managed",
  connectionSecretResource: "projects/p/secrets/openrouter/versions/1",
  connectionPricingSnapshotId: "price-1",
  connectionManifestVersion: "manifest-1",
  connectionValidationCurrent: true,
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

test("paid execution fails closed until reconciliation is explicitly matched", () => {
  const pending = { ...row, reconciliationStatus: "pending" };
  expect(evaluateManagedProviderReadiness("healthCheck", pending, "price-1").ok).toBe(true);
  expect(evaluateManagedProviderReadiness("execute", pending, "price-1").error).toBe("managed_provider_reconciliation_not_matched");
  expect(evaluateManagedProviderReadiness("restore", pending, "price-1").error).toBe("managed_provider_reconciliation_not_matched");
});

test("paid execution is bound to the approved provider connection and pricing snapshot", () => {
  expect(evaluateManagedProviderReadiness("execute", { ...row, connectionStatus: "validating" }, "price-1").error).toBe("managed_provider_connection_not_approved");
  expect(evaluateManagedProviderReadiness("execute", { ...row, credentialMode: "byok" }, "price-1").error).toBe("managed_provider_credential_mode_invalid");
  expect(evaluateManagedProviderReadiness("execute", { ...row, connectionSecretResource: "projects/p/secrets/other/versions/1" }, "price-1").error).toBe("managed_provider_credential_reference_mismatch");
  expect(evaluateManagedProviderReadiness("execute", { ...row, connectionManifestVersion: "manifest-2" }, "price-1").error).toBe("managed_provider_manifest_mismatch");
  expect(evaluateManagedProviderReadiness("execute", { ...row, connectionValidationCurrent: false }, "price-1").error).toBe("managed_provider_connection_validation_stale");
  expect(evaluateManagedProviderReadiness("execute", { ...row, connectionPricingSnapshotId: "price-2" }, "price-1").error).toBe("managed_pricing_snapshot_connection_mismatch");
  expect(evaluateManagedProviderReadiness("execute", row, null).error).toBe("managed_pricing_not_configured");
});

test("health validation may run while a managed connection is validating", () => {
  expect(evaluateManagedProviderReadiness("healthCheck", { ...row, connectionStatus: "validating" }, null).ok).toBe(true);
});
