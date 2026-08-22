import type { PublicProviderCatalogEntry } from "@/lib/publicProviderCatalog";

export const CLIENT_ACTIVATION_MANIFEST_VERSION = "v1" as const;

export interface ClientActivationManifestProposal {
  schemaVersion: typeof CLIENT_ACTIVATION_MANIFEST_VERSION;
  status: "submitted-for-review";
  tenantSlug: string | null;
  requestedBy: { id: string; email: string | null };
  catalog: {
    id: string;
    providerKey: string;
    providerLabel: string;
    status: PublicProviderCatalogEntry["status"];
    pipelineStage: string;
  };
  manifestPatch: {
    providerAllowlist: string[];
    secretEnv: Record<string, string>;
    providerCallsEnabled: false;
    approvalPolicy: "review-before-activation";
  };
  evidenceRequired: readonly string[];
}

export function buildClientActivationManifestProposal(input: {
  tenantSlug: string | null;
  user: { id: string; email: string | null };
  providerKey: string;
  providerLabel: string;
  catalog: PublicProviderCatalogEntry;
  secretName: string;
}): ClientActivationManifestProposal {
  return {
    schemaVersion: CLIENT_ACTIVATION_MANIFEST_VERSION,
    status: "submitted-for-review",
    tenantSlug: input.tenantSlug,
    requestedBy: input.user,
    catalog: {
      id: input.catalog.id,
      providerKey: input.providerKey,
      providerLabel: input.providerLabel,
      status: input.catalog.status,
      pipelineStage: input.catalog.pipelineStage,
    },
    manifestPatch: {
      providerAllowlist: [input.providerKey],
      secretEnv: { [input.providerKey]: input.secretName },
      providerCallsEnabled: false,
      approvalPolicy: "review-before-activation",
    },
    evidenceRequired: [
      "provider validation smoke",
      "budget reservation and settlement",
      "tenant isolation",
      "idempotency and deletion lineage",
      "rollback with provider disabled",
    ],
  };
}
