import { ECC_ADAPTERS } from "@/lib/eccCatalog";
import type { ClientPlaybook } from "@/lib/clientPlaybooks";

export const ECC_PLAYBOOKS: readonly ClientPlaybook[] = ECC_ADAPTERS.map(adapter => ({
  id: adapter.id, label: adapter.label, description: `Prepare a reviewable ${adapter.artifactKind} from supplied context and evidence references.`,
  intents: [adapter.label.toLowerCase()], eligibleCapabilities: ["ecc-workflows"], skillIds: [adapter.componentId],
  requiredTraits: ["tenant-isolation", "provenance", "budget", "idempotency", "audit", "approval", "output-quality"],
  riskClass: "review", approval: "review-before-apply", outputType: adapter.artifactKind, supportedSurfaces: ["orchestrate"],
}));
