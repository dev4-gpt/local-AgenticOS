export type HybridCapabilityState = "available" | "setup-required" | "controlled" | "future";
export type HybridExecutionLocation = "cloud" | "local-worker" | "hybrid";

export interface HybridCapability {
  id: string;
  label: string;
  executionLocation: HybridExecutionLocation;
  state: HybridCapabilityState;
  summary: string;
  userControls: readonly string[];
  activationRequirement: string;
  requestType: "command" | "context" | "orchestrate" | "create" | "deliver";
}

/**
 * The customer-facing counterpart to the hosted capability manifest.
 *
 * This registry deliberately separates a useful product outcome from the
 * runtime that performs it. A card can therefore tell a customer exactly why
 * it needs a Local Worker, a provider approval, or an explicit action review
 * instead of presenting a disabled tab as a broken feature.
 */
export const HYBRID_CAPABILITIES: readonly HybridCapability[] = [
  {
    id: "cloud-agents", label: "Cloud AI agents", executionLocation: "cloud", state: "controlled",
    summary: "Run approved tenant-safe agent jobs through an allowlisted provider, private queue, budget ledger, and audit trail.",
    userControls: ["Choose BYOK or an approved managed route", "Review model and spend ceiling", "Approve external or paid stages"],
    activationRequirement: "Tenant provider/model approval, budget, and current canary evidence.", requestType: "command",
  },
  {
    id: "local-worker", label: "Local Worker", executionLocation: "local-worker", state: "setup-required",
    summary: "A paired customer device executes narrowly scoped local work without giving the cloud unrestricted filesystem or shell access.",
    userControls: ["Pair or unpair a device", "Select approved folders, vaults, models, and tools", "Pause or revoke local permissions"],
    activationRequirement: "Supported signed installer, device pairing, local policy engine, and lifecycle controls.", requestType: "context",
  },
  {
    id: "local-sources", label: "Files, vaults, and Obsidian", executionLocation: "hybrid", state: "setup-required",
    summary: "Search and summarize customer-selected local sources while keeping raw files local by default.",
    userControls: ["Choose each folder or vault", "Allow results-only or selected-source sharing", "Approve writes separately"],
    activationRequirement: "Paired Local Worker with scoped source grants.", requestType: "context",
  },
  {
    id: "local-models", label: "Ollama and local models", executionLocation: "local-worker", state: "setup-required",
    summary: "Use customer-selected local models and compute for private, offline-friendly work.",
    userControls: ["Choose installed models", "Set local compute limits", "Keep prompts and outputs local when desired"],
    activationRequirement: "Paired Local Worker with model discovery and local execution policy.", requestType: "command",
  },
  {
    id: "workflow-control", label: "Pipelines and workflow planning", executionLocation: "cloud", state: "available",
    summary: "Create tenant-scoped plans, boards, review stages, and approvals without automatically running paid or external actions.",
    userControls: ["Start and review workflows", "Assign approval owners", "Choose whether a step stays planning-only"],
    activationRequirement: "Enabled tenant workflow capability; provider-backed steps are separately controlled.", requestType: "orchestrate",
  },
  {
    id: "tenant-memory", label: "Memory, notebooks, journal, and goals", executionLocation: "hybrid", state: "controlled",
    summary: "Keep tenant records in the cloud while optionally drawing from customer-selected local context.",
    userControls: ["Choose cloud retention", "Export or delete tenant records", "Keep local source material local"],
    activationRequirement: "Tenant data capability plus lifecycle and isolation evidence for the selected flow.", requestType: "context",
  },
  {
    id: "research-seo", label: "Research and SEO", executionLocation: "cloud", state: "controlled",
    summary: "Produce citation-aware research and SEO analysis; publishing and unrestricted crawling are separate actions.",
    userControls: ["Choose approved domains and sources", "Review citations", "Approve any publishing separately"],
    activationRequirement: "Source policy, crawl limits, provider budget, and citation/review controls.", requestType: "orchestrate",
  },
  {
    id: "open-screen", label: "Screen capture and import", executionLocation: "local-worker", state: "setup-required",
    summary: "Capture or import only customer-selected recordings and optionally add them as tenant-owned artifacts.",
    userControls: ["Approve each capture device or artifact", "Select what is uploaded", "Set retention or delete artifacts"],
    activationRequirement: "Local capture connector, artifact scan, consent, retention, and deletion controls.", requestType: "create",
  },
  {
    id: "voice", label: "Voice, captions, and narration", executionLocation: "hybrid", state: "controlled",
    summary: "Support transcription, captions, and ordinary text-to-speech; identity-sensitive voice use stays separately protected.",
    userControls: ["Grant microphone access", "Choose local or approved provider processing", "Review and delete voice artifacts"],
    activationRequirement: "Audio consent, retention, budget, and provider/local-worker controls. Voice cloning needs verified speaker consent.", requestType: "create",
  },
  {
    id: "openmontage", label: "OpenMontage production", executionLocation: "local-worker", state: "controlled",
    summary: "Run a customer-local creative production workflow using selected assets and customer-local or BYOK compute.",
    userControls: ["Choose project assets", "Approve provider/GPU spend", "Select final artifacts to sync"],
    activationRequirement: "Counsel-approved integration/distribution model plus local connector, asset, and budget controls.", requestType: "create",
  },
  {
    id: "gpu-media", label: "GPU video and visual production", executionLocation: "hybrid", state: "future",
    summary: "Use customer-local GPU first, with an isolated managed cloud worker only when required.",
    userControls: ["Choose local versus managed compute", "Set a per-job spend ceiling", "Review rights and delete generated artifacts"],
    activationRequirement: "GPU worker isolation, cost caps, rights/moderation, retention, queue recovery, and rollback evidence.", requestType: "create",
  },
  {
    id: "outbound-actions", label: "Delivery, outreach, and publishing", executionLocation: "hybrid", state: "controlled",
    summary: "Prepare deliverables and drafts automatically, but require an explicit human approval before anything is sent or published.",
    userControls: ["Preview the exact outbound action", "Approve or reject each destination", "Review audit, unsubscribe, and rollback status"],
    activationRequirement: "Destination adapter, consent/unsubscribe, idempotency, audit, and rollback/undo evidence.", requestType: "deliver",
  },
  {
    id: "developer-mode", label: "Developer worktrees and security tools", executionLocation: "local-worker", state: "controlled",
    summary: "Run explicitly scoped development or security work in a disposable local environment rather than a default unattended agent.",
    userControls: ["Choose repository or target scope", "Approve each consequential run", "Review changes before apply"],
    activationRequirement: "Explicit authorization, disposable worktree/worker, egress limits, review, and rollback.", requestType: "orchestrate",
  },
  {
    id: "workplace-integrations", label: "Workplace integrations", executionLocation: "cloud", state: "controlled",
    summary: "Connect business systems through per-tenant, least-privilege adapters; read-first before any write action.",
    userControls: ["Choose connected account and scopes", "Revoke access", "Approve writes separately"],
    activationRequirement: "Per-integration OAuth, audit, retention, revocation, and approval evidence.", requestType: "orchestrate",
  },
  {
    id: "recordly", label: "Recordly", executionLocation: "local-worker", state: "future",
    summary: "Tracked as a creative reference, not a Veloce-distributed or hosted capability.",
    userControls: ["None until a compliant product option exists"],
    activationRequirement: "Counsel-approved AGPL commercial use and distribution decision.", requestType: "create",
  },
] as const;

export function hybridCapabilityById(id: string) {
  return HYBRID_CAPABILITIES.find((capability) => capability.id === id) ?? null;
}
