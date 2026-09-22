export type CredentialReadiness = {
  code: string;
  label: string;
  detail: string;
};

/** Configuration evidence only; a successful provider call is a separate check. */
export function clientCredentialReadiness(input: {
  configured: boolean;
  connectionStatus: string | null;
  credentialMode: string;
  callsEnabled: boolean;
  runtimeConfiguration?: boolean;
}): CredentialReadiness {
  if (input.runtimeConfiguration) return input.configured
    ? { code: "runtime-configured", label: "Configured", detail: "This runtime setting is present; it does not need a provider connection record." }
    : { code: "runtime-missing", label: "Setup required", detail: "This runtime setting is missing. Contact your workspace administrator." };
  if (input.connectionStatus === "revoked") return { code: "revoked", label: "Revoked", detail: "This connection was revoked. A new reviewed connection is required." };
  if (input.connectionStatus === "submitted") return { code: "pending-review", label: "Pending review", detail: "The submitted credential is awaiting review and activation." };
  if (input.credentialMode !== "byok") return { code: "managed-lane", label: "Managed provider", detail: "Managed execution uses its own provider activation and credit allocation. Check the managed provider section." };
  if (!input.configured) return { code: "key-missing", label: "Key missing", detail: "No approved credential is loaded in this runtime. Submit a key or ask your administrator to connect it." };
  if (input.connectionStatus !== "connected") return { code: "activation-required", label: "Activation required", detail: "The key is loaded, but this workspace has no active connection record. Your administrator must validate and activate it." };
  if (!input.callsEnabled) return { code: "execution-disabled", label: "Execution disabled", detail: "The connection is recorded, but provider calls are disabled for this runtime." };
  return { code: "connection-recorded", label: "Connection recorded", detail: "The key and connection record are present. Model permissions, budget, and a successful run still determine availability." };
}
