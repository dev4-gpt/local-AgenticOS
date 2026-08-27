export type ManagedProviderOperation =
  | "quote" | "healthCheck" | "reserve" | "execute" | "settle" | "refund"
  | "balance" | "disable" | "restore" | "videoModels" | "videoStatus"
  | "videoQuote" | "videoReserve" | "videoExecute";

export type ManagedProviderReadinessRow = {
  managedRouteEnabled: boolean;
  status: string | null;
  credentialReference: string | null;
  manifestVersion: string | null;
  healthStatus: string | null;
  reconciliationStatus: string | null;
  connectionStatus: string | null;
  credentialMode: string | null;
  connectionSecretResource: string | null;
  connectionPricingSnapshotId: string | null;
  connectionManifestVersion: string | null;
  connectionValidationCurrent: boolean;
};

export function evaluateManagedProviderReadiness(
  operation: ManagedProviderOperation,
  row: ManagedProviderReadinessRow | null,
  pricingSnapshotId: string | null,
) {
  if (!row) return { ok: false as const, status: 409, error: "managed_provider_allocation_missing" };

  const execution = ["quote", "reserve", "execute", "videoQuote", "videoReserve", "videoExecute"].includes(operation);
  const requiresConnection = execution || ["healthCheck", "balance", "restore", "videoModels", "videoStatus"].includes(operation);
  if (execution && row.managedRouteEnabled !== true) return { ok: false as const, status: 409, error: "managed_provider_not_enabled" };
  if (operation !== "disable" && row.status === "suspended") return { ok: false as const, status: 409, error: "managed_provider_suspended" };
  if ((execution || operation === "restore") && !row.manifestVersion) return { ok: false as const, status: 409, error: "managed_provider_manifest_not_approved" };
  if (execution && row.healthStatus !== "passed") return { ok: false as const, status: 409, error: "managed_provider_health_not_passed" };
  if (execution || operation === "restore") {
    if (["drift", "failed"].includes(row.reconciliationStatus ?? "")) {
      return { ok: false as const, status: 409, error: "managed_provider_reconciliation_failed" };
    }
    if (row.reconciliationStatus !== "matched") {
      return { ok: false as const, status: 409, error: "managed_provider_reconciliation_not_matched" };
    }
  }
  if (operation !== "disable" && operation !== "settle" && operation !== "refund" && !row.credentialReference) {
    return { ok: false as const, status: 409, error: "managed_provider_credential_missing" };
  }
  if (requiresConnection) {
    const allowedStatuses = operation === "healthCheck" ? ["validating", "connected"] : ["connected"];
    if (!allowedStatuses.includes(row.connectionStatus ?? "")) return { ok: false as const, status: 409, error: "managed_provider_connection_not_approved" };
    if (row.credentialMode !== "veloce-managed") return { ok: false as const, status: 409, error: "managed_provider_credential_mode_invalid" };
    if (!row.connectionSecretResource || row.connectionSecretResource !== row.credentialReference) return { ok: false as const, status: 409, error: "managed_provider_credential_reference_mismatch" };
    if (!row.connectionManifestVersion || row.connectionManifestVersion !== row.manifestVersion) return { ok: false as const, status: 409, error: "managed_provider_manifest_mismatch" };
  }
  if (execution) {
    if (!row.connectionValidationCurrent) return { ok: false as const, status: 409, error: "managed_provider_connection_validation_stale" };
    if (!pricingSnapshotId) return { ok: false as const, status: 409, error: "managed_pricing_not_configured" };
    if (!row.connectionPricingSnapshotId || row.connectionPricingSnapshotId !== pricingSnapshotId) return { ok: false as const, status: 409, error: "managed_pricing_snapshot_connection_mismatch" };
  }
  return {
    ok: true as const,
    credentialReference: row.credentialReference,
    manifestVersion: row.manifestVersion,
    pricingSnapshotId,
  };
}
