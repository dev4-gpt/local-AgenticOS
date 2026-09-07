// A synced local copy, not a reach outside this app's directory: Vercel's
// build for this project has its Root Directory scoped to product-experience,
// so a relative import into ../../../infrastructure would not be available
// in the deployed build. scripts/verify-integration-catalog-contract.mjs
// enforces this copy stays byte-identical to the canonical
// infrastructure/integration-control-plane.manifest.json.
import manifest from "../data/integration-control-plane.manifest.json";

export type IntegrationRiskTier = "low" | "medium" | "high" | "critical";
export type IntegrationState = "native-enabled" | "disabled";

export interface IntegrationCatalogEntry {
  id: string;
  name: string;
  repository: string | null;
  state: IntegrationState;
  riskTier: IntegrationRiskTier;
  placements: string[];
  runtime: string;
  dataBoundary: string;
  activationEvidence: string[];
  rollback: string;
  sbomReference: string | null;
  provenanceReference: string | null;
}

interface CatalogManifest {
  schemaVersion: number;
  purpose: string;
  integrations: IntegrationCatalogEntry[];
}

const CATALOG = manifest as CatalogManifest;

// The capability broker is the one place other code should ask "is this
// integration currently active, and what does it require" -- rather than
// each caller re-reading and re-interpreting the manifest JSON itself.
export function loadIntegrationCatalog(): IntegrationCatalogEntry[] {
  return CATALOG.integrations;
}

export function integrationCatalogEntry(id: string): IntegrationCatalogEntry | null {
  return CATALOG.integrations.find((entry) => entry.id === id) ?? null;
}

export function isIntegrationActive(id: string): boolean {
  return integrationCatalogEntry(id)?.state === "native-enabled";
}

// Governance rule enforced here (not just by the CI verifier): a high or
// critical risk-tier integration must never be reported active without a
// real (non-pending) SBOM and provenance reference. This is the runtime
// counterpart to scripts/verify-integration-catalog-contract.mjs's static
// check on the manifest file itself.
export function isIntegrationActivatable(id: string): { ok: boolean; reason?: string } {
  const entry = integrationCatalogEntry(id);
  if (!entry) return { ok: false, reason: "unknown_integration" };
  if (entry.state !== "native-enabled") return { ok: false, reason: "not_enabled" };
  if ((entry.riskTier === "high" || entry.riskTier === "critical")) {
    if (!entry.sbomReference || entry.sbomReference.startsWith("pending")) return { ok: false, reason: "sbom_pending" };
    if (!entry.provenanceReference || entry.provenanceReference.startsWith("pending")) return { ok: false, reason: "provenance_pending" };
  }
  return { ok: true };
}
