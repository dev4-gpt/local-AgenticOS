import type { CapabilityTraitId } from "@/lib/capabilityTraits";
import { LOOP_PLAYBOOKS } from "@/lib/clientLoopRegistry";
import { NATIVE_SPECIALIST_PLAYBOOKS } from "@/lib/nativeSpecialistPlaybooks";
import { V96_CURATED_SKILL_PACK } from "@/lib/v96SkillPack";
import { validateV96SkillManifest } from "@/lib/v96Contracts";

/**
 * The natural-language intake surfaces the router accepts. Exported as one
 * array so the type and the API route's runtime guard cannot drift — they were
 * previously a union here and a hand-written `new Set([...])` in the intent
 * route, which is two places to update and one to forget.
 *
 * `loop` was absent, so no request could ever reach the Loop lane through the
 * router even though `loop` is a permitted skill surface and `loop-run` is a
 * known capability.
 */
export const CLIENT_INTENT_SURFACES = ["chat", "notebook", "orchestrate", "create", "guide", "integrations", "loop"] as const;

export type ClientIntentSurface = typeof CLIENT_INTENT_SURFACES[number];
export type ClientPlaybookRisk = "low" | "review" | "external";

export interface ClientPlaybook {
  id: string;
  label: string;
  description: string;
  intents: readonly string[];
  eligibleCapabilities: readonly string[];
  skillIds: readonly string[];
  requiredTraits: readonly CapabilityTraitId[];
  riskClass: ClientPlaybookRisk;
  approval: "none" | "review-before-apply" | "human-before-external-action";
  outputType: string;
  supportedSurfaces: readonly ClientIntentSurface[];
}

const BASE_TRAITS: readonly CapabilityTraitId[] = [
  "tenant-isolation", "provenance", "budget", "idempotency", "audit", "resumability", "approval", "output-quality",
];
const PROVIDER_TRAITS: readonly CapabilityTraitId[] = [...BASE_TRAITS, "model-allowlist", "context-compression"];

export const NATIVE_CLIENT_PLAYBOOKS: readonly ClientPlaybook[] = [
  {
    id: "research-citation",
    label: "Research and citation",
    description: "Build a source-aware answer or research record with citations and confidence.",
    intents: ["research", "investigate", "find sources", "cite", "compare evidence", "market research"],
    eligibleCapabilities: ["research"], skillIds: ["research"],
    requiredTraits: [...BASE_TRAITS, "source-policy", "citations", "confidence", "partial-results"],
    riskClass: "review", approval: "review-before-apply", outputType: "structured-research-record",
    supportedSurfaces: ["chat", "notebook", "orchestrate", "guide"],
  },
  {
    id: "knowledge-grounding",
    label: "Knowledge grounding",
    description: "Answer from approved tenant notebook or knowledge context with lineage preserved.",
    intents: ["from my notes", "from the notebook", "ground this", "use our knowledge", "according to these sources"],
    eligibleCapabilities: ["notebook", "knowledge"], skillIds: ["research", "technical-writing"],
    requiredTraits: [...BASE_TRAITS, "retention", "deletion-lineage", "chunk-provenance", "reviewed-activation"],
    riskClass: "review", approval: "review-before-apply", outputType: "grounded-answer",
    supportedSurfaces: ["chat", "notebook", "guide"],
  },
  {
    id: "draft-and-review",
    label: "Draft and review",
    description: "Create a bounded draft and return it with quality findings and review state.",
    intents: ["draft", "write", "rewrite", "edit", "review this", "improve this"],
    eligibleCapabilities: ["text-agents", "quality"], skillIds: ["technical-writing", "code-review"],
    requiredTraits: [...PROVIDER_TRAITS],
    riskClass: "review", approval: "review-before-apply", outputType: "reviewed-draft",
    supportedSurfaces: ["chat", "notebook", "create", "guide"],
  },
  {
    id: "workflow-planning",
    label: "Workflow planning",
    description: "Turn an outcome into a resumable, auditable plan without taking external action.",
    intents: ["plan", "break this down", "workflow", "steps", "roadmap", "organize"],
    eligibleCapabilities: ["orchestration"], skillIds: ["architecture"],
    requiredTraits: [...BASE_TRAITS],
    riskClass: "low", approval: "none", outputType: "workflow-plan",
    supportedSurfaces: ["chat", "orchestrate", "guide", "integrations", "loop"],
  },
  {
    id: "quality-review",
    label: "Quality review",
    description: "Inspect an approved draft or artifact and report actionable quality findings.",
    intents: ["quality", "check", "audit", "find problems", "accessibility", "review code"],
    eligibleCapabilities: ["quality", "output-quality"], skillIds: ["code-review", "accessibility"],
    requiredTraits: [...BASE_TRAITS, "accessibility"],
    riskClass: "review", approval: "review-before-apply", outputType: "quality-report",
    supportedSurfaces: ["chat", "create", "guide", "integrations", "loop"],
  },
  {
    id: "context-efficient-provider",
    label: "Context-efficient provider work",
    description: "Answer a general request through the approved provider lane with native compression and cost tracing.",
    intents: ["answer", "explain", "summarize", "help me understand", "general question"],
    eligibleCapabilities: ["text-agents"], skillIds: [],
    requiredTraits: [...PROVIDER_TRAITS],
    riskClass: "low", approval: "none", outputType: "provider-answer",
    supportedSurfaces: ["chat", "notebook", "orchestrate", "create", "guide", "integrations", "loop"],
  },
];

const specialistPlaybooks: readonly ClientPlaybook[] = V96_CURATED_SKILL_PACK
  .filter((role) => role.modelLane === "approved-provider" && validateV96SkillManifest(role).length === 0)
  .map((role) => ({
    id: `specialist-${role.id}`,
    label: role.label,
    description: `Use the reviewed ${role.label.toLowerCase()} role contract for a bounded ${role.deliverable.kind}.`,
    intents: [role.label.toLowerCase(), role.deliverable.kind.replaceAll("-", " ")],
    eligibleCapabilities: ["text-agents"], skillIds: [role.id], requiredTraits: PROVIDER_TRAITS,
    riskClass: "review" as const,
    approval: role.approval,
    outputType: role.deliverable.kind,
    supportedSurfaces: ["chat", "create", "guide"] as const,
  }));

export function allClientPlaybooks() {
  return [...NATIVE_CLIENT_PLAYBOOKS, ...NATIVE_SPECIALIST_PLAYBOOKS, ...LOOP_PLAYBOOKS, ...specialistPlaybooks];
}

export function clientReadyPlaybooks(enabledCapabilities: readonly string[], surface?: string | null) {
  const enabled = new Set(enabledCapabilities);
  if (enabled.has("seo-research")) enabled.add("research");
  if (enabled.has("tenant-data")) enabled.add("notebook");
  return allClientPlaybooks().filter((playbook) =>
    playbook.eligibleCapabilities.some((capability) => enabled.has(capability))
    && (!surface || playbook.supportedSurfaces.includes(surface as ClientIntentSurface)),
  );
}

export function playbookById(id: string, available = allClientPlaybooks()) {
  return available.find((playbook) => playbook.id === id) ?? null;
}
