import manifest from "../../infrastructure/integration-control-plane.manifest.json";

export type GovernedIntegrationState = "native-enabled" | "disabled";

export type GovernedIntegration = {
  id: "ponytail" | "headroom" | "openreply" | "voxcpm" | "scout";
  name: string;
  repository: string;
  state: GovernedIntegrationState;
  placements: readonly ("pipeline" | "infrastructure" | "backend" | "engineering-controls")[];
  runtime: string;
  dataBoundary: string;
  activationEvidence: readonly string[];
  rollback: string;
};

const ENTRIES = manifest.integrations as unknown as readonly GovernedIntegration[];

/** Public, secret-free status for the dashboard and planning surfaces. */
export function governedIntegrations(): readonly GovernedIntegration[] {
  return ENTRIES;
}

const ALIASES: Record<GovernedIntegration["id"], readonly string[]> = {
  ponytail: ["ponytail", "restraint guard"],
  headroom: ["headroom", "context compression"],
  openreply: ["openreply", "instagram"],
  voxcpm: ["voxcpm", "voice pilot", "voice generation"],
  scout: ["scout", "lead research", "lead-research"],
};

export function governedIntegrationsMentioned(text: string): readonly GovernedIntegration[] {
  const normalized = text.toLowerCase();
  return ENTRIES.filter((entry) => ALIASES[entry.id].some((alias) => normalized.includes(alias)));
}

/** Keeps planning useful while preserving the authority boundary. */
export function governedPipelineGuardrails(text: string): string {
  const matches = governedIntegrationsMentioned(text);
  if (!matches.length) return "";
  return [
    "Governed integration constraints for this plan:",
    ...matches.map((entry) => `- ${entry.name} is ${entry.state}. Runtime: ${entry.runtime}. Boundary: ${entry.dataBoundary} Activation evidence: ${entry.activationEvidence.join(", ")}.`),
    "Plan evidence and a human approval step; do not activate, deploy, contact an external account, request credentials, import personal data, or claim that a blocked integration is available.",
  ].join("\n");
}
