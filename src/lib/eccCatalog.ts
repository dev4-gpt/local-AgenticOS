import catalog from "@/data/ecc-components.json";
import registrations from "@/data/ecc-adapters.json";

export const ECC_REVISION = catalog.revision;
export const ECC_ADAPTERS = registrations.adapters;
export const ECC_DEPARTMENTS = {
  engineering: "Engineering", "security-quality": "Security & Quality", research: "Research",
  "content-growth": "Content & Growth", "business-operations": "Business Operations", "data-infrastructure": "Data & Infrastructure",
};

// These are code-owned registrations. Neither a client catalog selection nor
// learned text can add a tool, adapter, capability or spending permission.
export function eccAdapter(id: unknown) {
  return typeof id === "string" ? ECC_ADAPTERS.find(adapter => adapter.id === id) ?? null : null;
}

export function eccCatalog(capabilityEnabled: boolean) {
  return catalog.components.map(component => {
    const adapter = ECC_ADAPTERS.find(item => item.componentId === component.id);
    return { ...component,
      adapterId: adapter?.id ?? null,
      state: adapter ? "available" : component.state,
      implementationScope: adapter ? `Bounded ${adapter.artifactKind}; upstream automation is not enabled.` : component.intendedOutcome,
      activationEvidence: adapter ? [adapter.verification] : component.activationEvidence,
      availability: adapter && capabilityEnabled ? "available" : adapter ? "requires-configuration" : component.state,
      unavailableReason: adapter ? (capabilityEnabled ? null : "ECC workflow/artifact capabilities and tenant policy must be enabled.") : "No verified Veloce adapter. Upstream prerequisites and costs require review.",
      cost: adapter?.cost ?? component.cost,
    };
  });
}
