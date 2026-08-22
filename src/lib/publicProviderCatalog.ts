import { CLIENT_CREDENTIAL_OPTIONS } from "@/lib/clientCredentialCatalog";
import { V96_REPOSITORY_CATALOG, type V96RepositoryReference } from "@/lib/v96RepositoryCatalog";
import { pricingDisplay, pricingSnapshotForCredential, type ProviderPricingOption } from "@/lib/providerPricingCatalog";

export type PublicCatalogStatus =
  | "available-now"
  | "client-key"
  | "review-required"
  | "isolated-worker"
  | "operator-only"
  | "reference-only";

export type PublicCatalogKind = "native" | "provider" | "repository";
export type PublicCredentialMode = "none" | "byok" | "veloce-managed" | "reviewed";

export interface PublicProviderCatalogEntry {
  id: string;
  name: string;
  kind: PublicCatalogKind;
  category: string;
  customerTool: string;
  customerOutcome: string;
  pipelineStage: string;
  status: PublicCatalogStatus;
  dataScope: string;
  permissions: string;
  pricingBasis: string;
  creditEstimate: string;
  credentialMode: PublicCredentialMode;
  approval: string;
  credentialKey?: string;
  sourceUrl?: string;
  sourceCommit?: string;
  license?: string;
  sourceNote?: string;
  pricingSnapshotId?: string;
  pricingVersion?: string;
  pricingVerifiedAt?: string;
  pricingSourceUrl?: string;
  freeTier?: string;
  costOwner?: "client" | "veloce" | "shared";
  modelOptions?: readonly ProviderPricingOption[];
  runtimePlacement?: string;
  managedCredentialAvailable?: boolean;
  selectionAllowed?: boolean;
}

const NATIVE_ENTRIES: readonly PublicProviderCatalogEntry[] = [
  {
    id: "native-research-to-delivery", name: "Research to delivery", kind: "native", category: "Pipeline",
    customerTool: "Governed research-to-delivery pipeline", customerOutcome: "Turn a goal into cited research, a plan, quality-checked artifacts, approval, and delivery.",
    pipelineStage: "Intent → research → memory → plan → artifact → quality → approval → delivery", status: "available-now",
    dataScope: "Current tenant records, approved sources, and tenant-owned artifacts.", permissions: "Read approved sources; write tenant records and reviewable artifacts.",
    pricingBasis: "No provider fee for planning-only stages; provider calls are metered when enabled.", creditEstimate: "Planning may be 0; provider stages show an estimate before execution.",
    credentialMode: "none", approval: "Human approval before external delivery.", sourceNote: "Veloce-owned contract assembled from the governed capability plane.",
  },
  {
    id: "native-tenant-memory", name: "Tenant memory and records", kind: "native", category: "Knowledge",
    customerTool: "Memory, Notebook, Journal, and Goals", customerOutcome: "Keep decisions, sources, and project context available to future work without crossing tenants.",
    pipelineStage: "Context and memory", status: "available-now", dataScope: "Current tenant records and explicitly uploaded artifacts.",
    permissions: "Read/write current tenant records; export and deletion remain tenant-scoped.", pricingBasis: "Platform storage and retention allowance.", creditEstimate: "Usually 0 API credits; storage is governed separately.",
    credentialMode: "none", approval: "No provider approval; destructive actions are user-scoped.", sourceNote: "Veloce native Supabase and Cloud Storage boundary.",
  },
  {
    id: "native-ponytail-restraint", name: "Ponytail restraint guard", kind: "native", category: "Quality and cost",
    customerTool: "Anti-spin and restraint infrastructure", customerOutcome: "Stop loops when another round is unlikely to improve the result or justify its cost.",
    pipelineStage: "Every loop round and provider-bound iteration", status: "available-now", dataScope: "Job scores, issue signatures, budget ledger, and stop evidence.",
    permissions: "Read loop evidence; write a fail-closed restraint decision.", pricingBasis: "No upstream runtime fee; reduces avoidable provider spend.", creditEstimate: "0 credits for the guard; it can prevent the next paid round.",
    credentialMode: "none", approval: "The worker decision cannot be overridden by a prompt.", sourceUrl: "https://github.com/DietrichGebert/ponytail", license: "MIT",
    sourceNote: "Ponytail informs a Veloce-owned trait; the upstream runtime is not bundled.",
  },
  {
    id: "native-quality-review", name: "Quality and provenance review", kind: "native", category: "Quality",
    customerTool: "Output quality, citations, accessibility, and approval review", customerOutcome: "See what was checked, what failed, and what requires a human decision before delivery.",
    pipelineStage: "Artifact → quality → approval", status: "available-now", dataScope: "Current response, cited sources, and tenant-owned deliverables.",
    permissions: "Read reviewable outputs; write findings and approval records.", pricingBasis: "Included platform policy; model-backed review is metered when enabled.", creditEstimate: "Depends on the selected review provider and output size.",
    credentialMode: "none", approval: "Review-before-apply or human-before-external-action.", sourceNote: "Veloce native policy informed by the quality references in the catalog.",
  },
];

const PROVIDER_ENTRIES: readonly PublicProviderCatalogEntry[] = [
  ["OPENAI_API_KEY", "OpenAI", "Models", "Text and multimodal provider lane", "Generate reviewed text or media-ready plans", "Provider execution", "Text/image/audio tokens or generated media", "BYOK", "Provider call requires manifest approval and budget"],
  ["ANTHROPIC_API_KEY", "Anthropic", "Models", "Claude provider lane", "Draft, reason, and review tenant work", "Provider execution", "Input/output tokens", "BYOK", "Provider call requires manifest approval and budget"],
  ["OPENROUTER_API_KEY", "OpenRouter", "Models", "Multi-model provider lane", "Use an approved model through one governed adapter", "Provider routing", "Input/output tokens plus selected model rate", "BYOK", "Model and provider allowlists apply"],
  ["GEMINI_API_KEY", "Google Gemini", "Models", "Gemini provider lane", "Run approved text and multimodal tasks", "Provider execution", "Input/output tokens or media units", "BYOK", "Provider call requires manifest approval and budget"],
  ["MOONSHOT_API_KEY", "Moonshot / Kimi", "Models", "Kimi provider lane", "Run an approved long-context model task", "Provider execution", "Input/output tokens", "BYOK", "Provider call requires manifest approval and budget"],
  ["GLM_API_KEY", "GLM / Z.ai", "Models", "GLM provider lane", "Run an approved text or coding task", "Provider execution", "Input/output tokens", "BYOK", "Provider call requires manifest approval and budget"],
  ["XAI_API_KEY", "xAI / Grok", "Models", "Grok provider lane", "Run an approved research or build task", "Provider execution", "Input/output tokens", "BYOK", "Provider call requires manifest approval and budget"],
  ["SAKANA_API_KEY", "Sakana Fugu", "Models", "Sakana provider lane", "Prepare an ensemble answer for review", "Provider routing", "Provider-reported usage", "BYOK", "Provider call requires manifest approval and budget"],
  ["GROQ_API_KEY", "Groq Speech-to-Text", "Audio", "Recorded speech transcription", "Turn bounded microphone input into a tenant transcript", "Input → transcription", "Audio duration and upload size", "BYOK", "Consent, upload bound, rate limit, and budget apply"],
  ["ELEVENLABS_API_KEY", "ElevenLabs", "Audio", "Speech and narration adapter", "Create a tenant-owned voice artifact for review", "Artifact creation", "Characters or audio duration", "BYOK", "Consent and approval before external use"],
  ["ELEVENLABS_MUSIC_API_KEY", "ElevenLabs Music", "Audio", "Music generation adapter", "Create a reviewed music artifact", "Artifact creation", "Generation duration and provider units", "BYOK", "Rights, budget, and approval apply"],
  ["HEYGEN_API_KEY", "HeyGen", "Video", "Hosted avatar/video adapter", "Create a tenant-owned video for review", "Artifact creation", "Video duration and render units", "BYOK", "Approval before publication or delivery"],
  ["SUNO_API_KEY", "Suno", "Audio", "Hosted music polling adapter", "Queue a music request and retain the result as an artifact", "Queued artifact creation", "Generation duration and provider units", "BYOK", "Rights, budget, and approval apply"],
  ["FIRECRAWL_API_KEY", "Firecrawl", "Research", "Read-only web research adapter", "Collect bounded source content with citations", "Research → citations", "Provider request or page credits", "BYOK", "Public URL allowlist, SSRF protection, and budget apply"],
  ["BRAVE_API_KEY", "Brave Search", "Research", "Search adapter", "Find bounded public sources for a cited research brief", "Research → citations", "Search request units", "BYOK", "Result count, citation, rate, and budget limits apply"],
  ["HUNTER_API_KEY", "Hunter", "Growth", "Growth research adapter", "Prepare an approved enrichment brief without automatic outreach", "Research → review", "Provider lookup units", "BYOK", "Consent and human approval before external action"],
].map(([key, name, category, tool, outcome, stage, pricing, credentialMode, approval]) => ({
  id: `provider-${String(key).toLowerCase()}`, name, kind: "provider" as const, category,
  customerTool: tool, customerOutcome: outcome, pipelineStage: stage, status: "client-key" as const,
  dataScope: "The current tenant's approved request and provider result only.",
  permissions: "Server-side provider call; no browser key exposure; outputs remain tenant-owned.",
  pricingBasis: pricing, creditEstimate: "Shown before execution when provider pricing is configured.",
  credentialMode: credentialMode as PublicCredentialMode, approval, credentialKey: key,
  runtimePlacement: "Tenant runtime provider adapter",
  managedCredentialAvailable: false,
  selectionAllowed: true,
  sourceNote: "Available only after this provider is approved in the tenant manifest.",
}));

function repositoryStatus(reference: V96RepositoryReference): PublicCatalogStatus {
  // A native contract can be available while its external implementation is
  // still an isolated worker. Keep that distinction visible to customers.
  if (reference.runtime === "adapter" && reference.id === "jina-reader") return "isolated-worker";
  if (reference.status === "enabled") return "available-now";
  if (reference.status === "operator-only") return "operator-only";
  if (reference.status === "cataloged") return "reference-only";
  if (reference.runtime === "gpu-worker" || reference.runtime === "operator-worker") return "isolated-worker";
  return "review-required";
}

function repositoryOutcome(reference: V96RepositoryReference) {
  const capability = reference.targetCapabilities[0]?.replace(/-/g, " ") || "governed work";
  return `Informs the Veloce ${capability} lane without installing the upstream runtime.`;
}

function repositoryPlacement(reference: V96RepositoryReference) {
  return reference.placement?.trim() || "Reference";
}

const REPOSITORY_ENTRIES: readonly PublicProviderCatalogEntry[] = V96_REPOSITORY_CATALOG.map((reference) => ({
  id: `repository-${reference.id}`,
  name: reference.name,
  kind: "repository",
  category: repositoryPlacement(reference).split(",")[0]?.trim() || "Reference",
  customerTool: reference.targetCapabilities.map((value) => value.replace(/-/g, " ")).join(" · "),
  customerOutcome: repositoryOutcome(reference),
  pipelineStage: repositoryPlacement(reference),
  status: repositoryStatus(reference),
  dataScope: "Only the Veloce contract and declared tenant boundary are exposed to clients.",
  permissions: reference.executionPermissions.join(", "),
  pricingBasis: reference.runtime === "dependency-free" ? "No upstream runtime fee; Veloce platform costs only." : "No upstream runtime fee; isolated worker compute, storage, and egress apply when activated.",
  creditEstimate: "No charge while reference-only; worker or provider usage is estimated before execution when activated.",
  credentialMode: reference.runtime === "dependency-free" ? "none" : "reviewed",
  approval: reference.status === "enabled" ? "Existing capability evidence" : (reference.evidenceGate || "Review the evidence bundle before activation."),
  sourceUrl: reference.sourceUrl,
  sourceCommit: reference.sourceCommit,
  license: reference.license,
  sourceNote: reference.activation === "native-enabled" ? reference.implementationMapping : "Provenance record only; catalog status is not an execution grant.",
  runtimePlacement: reference.placement,
  managedCredentialAvailable: reference.id === "jina-reader",
  selectionAllowed: reference.activation === "native-enabled" && (reference.runtime === "dependency-free" || reference.id === "jina-reader"),
}));

function enrichEntry(entry: PublicProviderCatalogEntry): PublicProviderCatalogEntry {
  const pricing = pricingSnapshotForCredential(entry.credentialKey ?? "");
  return {
    ...entry,
    ...(pricing ? {
      pricingSnapshotId: pricing.id,
      pricingVersion: pricing.version,
      pricingVerifiedAt: pricing.verifiedAt,
      pricingSourceUrl: pricing.sourceUrl,
      freeTier: pricing.freeTier,
      costOwner: pricing.costOwner,
      modelOptions: pricing.options,
      pricingBasis: `${entry.pricingBasis} ${pricingDisplay(pricing)}`,
    } : {
      costOwner: entry.kind === "provider" ? "client" : "veloce",
      selectionAllowed: entry.selectionAllowed ?? (entry.status === "available-now"),
    }),
    selectionAllowed: entry.status === "reference-only" || entry.status === "operator-only" ? false : (entry.selectionAllowed ?? entry.status === "available-now"),
  };
}

export const PUBLIC_PROVIDER_CATALOG: readonly PublicProviderCatalogEntry[] = [
  ...[...NATIVE_ENTRIES, ...PROVIDER_ENTRIES, ...REPOSITORY_ENTRIES].map(enrichEntry),
];

export function publicCatalogEntryById(id: string) {
  return PUBLIC_PROVIDER_CATALOG.find((entry) => entry.id === id) ?? null;
}

export function publicCatalogEntryForCredential(key: string) {
  return PROVIDER_ENTRIES.find((entry) => entry.credentialKey === key) ?? null;
}

export function publicCatalogProviderOptions() {
  return CLIENT_CREDENTIAL_OPTIONS.filter((option) => option.submitAllowed)
    .map((option) => publicCatalogEntryForCredential(option.key))
    .filter((entry): entry is PublicProviderCatalogEntry => Boolean(entry));
}

export function publicCatalogStatusLabel(status: PublicCatalogStatus) {
  return {
    "available-now": "Available now",
    "client-key": "Available with client key",
    "review-required": "Review required",
    "isolated-worker": "Isolated worker",
    "operator-only": "Operator only",
    "reference-only": "Reference only",
  }[status];
}
