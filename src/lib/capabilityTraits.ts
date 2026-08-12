import { V96_REPOSITORY_CATALOG, type V96RepositoryReference } from "@/lib/v96RepositoryCatalog";

export const CAPABILITY_TRAIT_VERSION = "v96-traits-1" as const;

export type CapabilityTraitId =
  | "tenant-isolation" | "provenance" | "budget" | "idempotency" | "audit"
  | "resumability" | "approval" | "output-quality" | "source-policy"
  | "ssrf-protection" | "citations" | "confidence" | "partial-results"
  | "retention" | "deletion-lineage" | "chunk-provenance" | "reviewed-activation"
  | "artifact-ownership" | "visual-qa" | "provider-license" | "model-allowlist"
  | "target-scope" | "egress-control" | "workspace-isolation" | "consent" | "accessibility"
  | "context-compression";

export type TraitDisposition = "blocked" | "review" | "partial" | "succeeded";

export interface CapabilityTraitDefinition {
  id: CapabilityTraitId;
  version: typeof CAPABILITY_TRAIT_VERSION;
  required: boolean;
  onFailure: Exclude<TraitDisposition, "succeeded">;
  evidenceKind: string;
}

export interface TraitEvidence {
  traitId: CapabilityTraitId;
  status: TraitDisposition;
  checkedAt: string;
  message?: string;
  sourceIds?: readonly string[];
}

export interface ResolvedTraitBundle {
  version: typeof CAPABILITY_TRAIT_VERSION;
  capability: string;
  provider: string | null;
  surface: string | null;
  traits: readonly CapabilityTraitDefinition[];
  sourceReferences: readonly Pick<V96RepositoryReference, "id" | "sourceUrl" | "sourceCommit" | "license">[];
  policy: {
    failClosedTraits: readonly CapabilityTraitId[];
    reviewTraits: readonly CapabilityTraitId[];
    partialTraits: readonly CapabilityTraitId[];
  };
}

const BASELINE: readonly CapabilityTraitDefinition[] = [
  { id: "tenant-isolation", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "tenant-scope" },
  { id: "provenance", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "source-lineage" },
  { id: "budget", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "budget-ledger" },
  { id: "idempotency", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "retry-identity" },
  { id: "audit", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "audit-event" },
  { id: "resumability", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "checkpoint" },
  { id: "approval", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "approval-record" },
  { id: "output-quality", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "review", evidenceKind: "quality-report" },
];

const CAPABILITY_TRAITS: Record<string, readonly CapabilityTraitDefinition[]> = {
  research: [
    { id: "source-policy", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "allowlisted-source" },
    { id: "ssrf-protection", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "network-safety" },
    { id: "citations", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "partial", evidenceKind: "citation-record" },
    { id: "confidence", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "review", evidenceKind: "confidence-score" },
    { id: "partial-results", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "partial", evidenceKind: "partial-result" },
  ],
  notebook: [
    { id: "retention", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "retention-policy" },
    { id: "deletion-lineage", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "deletion-cascade" },
    { id: "chunk-provenance", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "chunk-lineage" },
    { id: "reviewed-activation", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "activation-review" },
  ],
  "context-compiler": [
    { id: "chunk-provenance", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "chunk-lineage" },
    { id: "reviewed-activation", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "activation-review" },
    { id: "deletion-lineage", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "deletion-cascade" },
  ],
  seo: [
    { id: "source-policy", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "allowlisted-source" },
    { id: "citations", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "partial", evidenceKind: "citation-record" },
  ],
  media: [
    { id: "artifact-ownership", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "tenant-artifact" },
    { id: "provider-license", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "provider-policy" },
    { id: "visual-qa", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "review", evidenceKind: "visual-qa-report" },
  ],
  "visual-qa": [
    { id: "artifact-ownership", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "tenant-artifact" },
    { id: "visual-qa", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "review", evidenceKind: "visual-qa-report" },
  ],
  "video-generation": [
    { id: "artifact-ownership", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "tenant-artifact" },
    { id: "provider-license", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "provider-policy" },
  ],
  "provider-routing": [
    { id: "model-allowlist", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "route-policy" },
    { id: "context-compression", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "compression-trace" },
  ],
  "intent-routing": [
    { id: "model-allowlist", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "classifier-policy" },
    { id: "context-compression", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "compression-trace" },
  ],
  "security-assessment": [
    { id: "target-scope", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "target-authorization" },
    { id: "egress-control", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "network-policy" },
  ],
  "resumable-worktree": [
    { id: "workspace-isolation", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "worktree-scope" },
  ],
  voice: [
    { id: "consent", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "voice-consent" },
    { id: "artifact-ownership", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "tenant-artifact" },
  ],
  communications: [
    { id: "consent", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "recipient-consent" },
  ],
};

const ALIASES: Record<string, string> = {
  "seo-research": "research",
  "content-research": "research",
  "seo-intelligence": "seo",
  "workspace-execution": "resumable-worktree",
  "text-agents": "provider-routing",
};

const REPOSITORY_TRAITS: Record<string, readonly string[]> = {
  research: ["open-notebook", "scrapegraph-ai", "open-seo"],
  notebook: ["open-notebook"],
  "context-compiler": ["book-to-skill"],
  seo: ["open-seo", "scrapegraph-ai"],
  media: ["roboflow-supervision", "open-generative-ai"],
  "visual-qa": ["roboflow-supervision"],
  "video-generation": ["skyreels-v2", "open-generative-ai"],
  "provider-routing": ["omniroute"],
  "resumable-worktree": ["prime-agent", "shepherd"],
  "security-assessment": ["strix", "sonarqube-cli"],
  "output-quality": ["i-have-adhd", "no-ai-slop"],
  voice: ["huggingface-speech-to-speech"],
  communications: ["explee", "infobip"],
};

const PROVIDER_BOUND_CAPABILITIES = new Set([
  "text-agents", "provider-routing", "research", "seo", "orchestration", "workspace-execution",
  "room-round", "pipeline-shape", "loop-run", "ruflo-swarm", "hermes-content-factory", "intent-routing",
]);

const PROVIDER_BOUND_TRAITS: readonly CapabilityTraitDefinition[] = [
  { id: "context-compression", version: CAPABILITY_TRAIT_VERSION, required: true, onFailure: "blocked", evidenceKind: "compression-trace" },
];

function canonicalCapability(capability: string) {
  return ALIASES[capability] ?? capability;
}

export function resolveCapabilityTraits(input: {
  capability: string;
  provider?: string | null;
  surface?: string | null;
  tenantPolicy?: Record<string, unknown>;
}): ResolvedTraitBundle {
  const capability = canonicalCapability(input.capability.trim().toLowerCase());
  const additional = [...(CAPABILITY_TRAITS[capability] ?? []), ...(PROVIDER_BOUND_CAPABILITIES.has(capability) ? PROVIDER_BOUND_TRAITS : [])];
  const traits = [...BASELINE, ...additional].filter((trait, index, all) => all.findIndex((candidate) => candidate.id === trait.id) === index);
  const sourceIds = new Set([...(REPOSITORY_TRAITS[capability] ?? []), "agency-agents", "i-have-adhd", "no-ai-slop", ...(PROVIDER_BOUND_CAPABILITIES.has(capability) ? ["headroom"] : [])]);
  const sourceReferences = V96_REPOSITORY_CATALOG.filter((reference) => sourceIds.has(reference.id)).map(({ id, sourceUrl, sourceCommit, license }) => ({ id, sourceUrl, sourceCommit, license }));
  return {
    version: CAPABILITY_TRAIT_VERSION,
    capability,
    provider: input.provider ?? null,
    surface: input.surface ?? null,
    traits,
    sourceReferences,
    policy: {
      failClosedTraits: traits.filter((trait) => trait.onFailure === "blocked").map((trait) => trait.id),
      reviewTraits: traits.filter((trait) => trait.onFailure === "review").map((trait) => trait.id),
      partialTraits: traits.filter((trait) => trait.onFailure === "partial").map((trait) => trait.id),
    },
  };
}

export function traitBundleMetadata(bundle: ResolvedTraitBundle) {
  return {
    version: bundle.version,
    capability: bundle.capability,
    provider: bundle.provider,
    surface: bundle.surface,
    traits: bundle.traits.map((trait) => ({ id: trait.id, version: trait.version, required: trait.required, onFailure: trait.onFailure, evidenceKind: trait.evidenceKind })),
    sourceReferences: bundle.sourceReferences,
    policy: bundle.policy,
  };
}

/**
 * Produce the evidence ledger for a job outcome without allowing an adapter to
 * omit a required trait. Individual adapters may refine a trait status (for
 * example, citations can be partial while tenant isolation still succeeded).
 */
export function traitEvidenceForOutcome(
  bundle: ResolvedTraitBundle,
  outcome: TraitDisposition,
  options: {
    overrides?: Partial<Record<CapabilityTraitId, TraitDisposition>>;
    message?: string;
    sourceIds?: readonly string[];
  } = {},
): readonly TraitEvidence[] {
  const overrides = options.overrides ?? {};
  return bundle.traits.map((trait) => ({
    traitId: trait.id,
    status: overrides[trait.id] ?? outcome,
    checkedAt: new Date().toISOString(),
    ...(options.message ? { message: options.message.slice(0, 500) } : {}),
    ...(options.sourceIds?.length ? { sourceIds: options.sourceIds.slice(0, 32) } : {}),
  }));
}

export function validateTraitBundle(bundle: Partial<ResolvedTraitBundle>) {
  const errors: string[] = [];
  if (bundle.version !== CAPABILITY_TRAIT_VERSION) errors.push("trait bundle version is invalid");
  if (!bundle.capability?.trim()) errors.push("trait bundle capability is required");
  if (!Array.isArray(bundle.traits) || !bundle.traits.some((trait) => trait?.id === "tenant-isolation")) errors.push("tenant-isolation trait is required");
  if (!Array.isArray(bundle.traits) || !bundle.traits.some((trait) => trait?.id === "provenance")) errors.push("provenance trait is required");
  if (!Array.isArray(bundle.sourceReferences)) errors.push("sourceReferences are required");
  return errors;
}
