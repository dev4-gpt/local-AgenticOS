export type ManagedProviderOperation =
  | "quote" | "healthCheck" | "reserve" | "execute" | "settle" | "refund"
  | "balance" | "disable" | "restore" | "videoModels" | "videoStatus";

export type ManagedProviderReadinessRow = {
  managedRouteEnabled: boolean;
  status: string | null;
  credentialReference: string | null;
  manifestVersion: string | null;
  healthStatus: string | null;
  reconciliationStatus: string | null;
};

export function evaluateManagedProviderReadiness(
  operation: ManagedProviderOperation,
  row: ManagedProviderReadinessRow | null,
  pricingSnapshotId: string | null,
) {
  if (!row) return { ok: false as const, status: 409, error: "managed_provider_allocation_missing" };

  const execution = ["quote", "reserve", "execute"].includes(operation);
  if (execution && row.managedRouteEnabled !== true) return { ok: false as const, status: 409, error: "managed_provider_not_enabled" };
  if (operation !== "disable" && row.status === "suspended") return { ok: false as const, status: 409, error: "managed_provider_suspended" };
  if ((execution || operation === "restore") && !row.manifestVersion) return { ok: false as const, status: 409, error: "managed_provider_manifest_not_approved" };
  if (execution && row.healthStatus !== "passed") return { ok: false as const, status: 409, error: "managed_provider_health_not_passed" };
  if ((execution || operation === "restore") && ["drift", "failed"].includes(row.reconciliationStatus ?? "")) {
    return { ok: false as const, status: 409, error: "managed_provider_reconciliation_failed" };
  }
  if (operation !== "disable" && operation !== "settle" && operation !== "refund" && !row.credentialReference) {
    return { ok: false as const, status: 409, error: "managed_provider_credential_missing" };
  }
  return {
    ok: true as const,
    credentialReference: row.credentialReference,
    manifestVersion: row.manifestVersion,
    pricingSnapshotId,
  };
}
