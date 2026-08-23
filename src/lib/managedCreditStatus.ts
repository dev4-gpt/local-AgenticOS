export type ManagedCreditStatus =
  | "wallet_funded"
  | "awaiting_manifest_approval"
  | "credential_missing"
  | "provider_not_enabled"
  | "ready_for_execution"
  | "depleted"
  | "suspended";

export interface ManagedCreditReadinessInput {
  walletStatus: string;
  budgetStatus: string;
  availableMicros: number;
  managedRouteEnabled: boolean;
  manifestApproved: boolean;
  credentialReady: boolean;
  healthCheckPassed: boolean;
}

export interface ManagedCreditReadiness {
  status: ManagedCreditStatus;
  usable: boolean;
  label: string;
  reason: string;
}

/**
 * Wallet funding and provider execution are intentionally separate states.
 * A paid allocation must never imply that a provider can already execute.
 */
export function resolveManagedCreditReadiness(input: ManagedCreditReadinessInput): ManagedCreditReadiness {
  if (input.walletStatus === "suspended" || input.budgetStatus === "suspended") {
    return { status: "suspended", usable: false, label: "Suspended", reason: "The tenant or provider budget is suspended." };
  }
  if (input.availableMicros <= 0 || input.budgetStatus === "exhausted") {
    return { status: "depleted", usable: false, label: "Depleted", reason: "No spendable provider allocation remains." };
  }
  if (!input.managedRouteEnabled) {
    return { status: "provider_not_enabled", usable: false, label: "Provider not enabled", reason: "The wallet is funded, but Veloce-managed execution is not enabled for this provider." };
  }
  if (!input.manifestApproved) {
    return { status: "awaiting_manifest_approval", usable: false, label: "Awaiting approval", reason: "An approved tenant manifest is required before provider execution." };
  }
  if (!input.credentialReady) {
    return { status: "credential_missing", usable: false, label: "Credential missing", reason: "A validated tenant-scoped managed credential is required." };
  }
  if (!input.healthCheckPassed) {
    return { status: "provider_not_enabled", usable: false, label: "Provider not ready", reason: "The provider health check has not passed for this route." };
  }
  return { status: "ready_for_execution", usable: true, label: "Ready for execution", reason: "Manifest, credential, health, and budget checks passed." };
}
