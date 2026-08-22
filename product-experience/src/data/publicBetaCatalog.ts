export type PublicBetaStatus =
  | "Available now"
  | "Available with client key"
  | "Review required"
  | "Isolated worker"
  | "Operator only"
  | "Reference only";

export type PublicBetaKind = "Native contract" | "Provider" | "Repository provenance";

export type PublicBetaCatalogEntry = {
  id: string;
  name: string;
  kind: PublicBetaKind;
  status: PublicBetaStatus;
  customerTool: string;
  outcome: string;
  stage: string;
  data: string;
  cost: string;
  credentials: string;
  approval: string;
  source?: string;
  freeTier?: string;
  pricingSource?: string;
  runtime?: string;
  costOwner?: "client" | "veloce" | "shared";
};

const nativeEntries: PublicBetaCatalogEntry[] = [
  {
    id: "research-to-delivery",
    name: "Research to delivery",
    kind: "Native contract",
    status: "Available now",
    customerTool: "Governed operating pipeline",
    outcome: "Turn a goal into cited research, a plan, a reviewed artifact, approval, and delivery.",
    stage: "Research → memory → planning → artifact → quality → approval → delivery",
    data: "Tenant records, approved sources, and tenant-owned artifacts.",
    cost: "Planning can be zero credits; enabled provider stages show an estimate first.",
    credentials: "No provider key for planning; BYOK for provider stages.",
    approval: "Human approval before external delivery.",
  },
  {
    id: "tenant-memory",
    name: "Tenant memory and records",
    kind: "Native contract",
    status: "Available now",
    customerTool: "Memory, Notebook, Journal, and Goals",
    outcome: "Keep decisions, sources, and project context available without crossing tenants.",
    stage: "Context and memory",
    data: "Current tenant records and explicitly uploaded artifacts.",
    cost: "Platform storage and retention allowance; usually no provider credits.",
    credentials: "No provider key.",
    approval: "Tenant-scoped writes, export, and deletion.",
  },
  {
    id: "ponytail-restraint",
    name: "Ponytail restraint guard",
    kind: "Native contract",
    status: "Available now",
    customerTool: "Anti-spin and restraint infrastructure",
    outcome: "Stops low-value loops and blocks another paid round when progress or budget evidence fails.",
    stage: "Every loop round and provider-bound iteration",
    data: "Job scores, issue signatures, budget ledger, and stop evidence.",
    cost: "No upstream runtime fee; prevents avoidable provider spend.",
    credentials: "No provider key.",
    approval: "Fail-closed worker decision; prompts cannot override it.",
    source: "https://github.com/DietrichGebert/ponytail",
  },
  {
    id: "quality-review",
    name: "Quality and provenance review",
    kind: "Native contract",
    status: "Available now",
    customerTool: "Citations, accessibility, quality findings, and approval review",
    outcome: "See what was checked, what failed, and what needs a human decision before delivery.",
    stage: "Artifact → quality → approval",
    data: "Tenant response, cited sources, and tenant-owned deliverables.",
    cost: "Platform policy; model-backed review is metered when enabled.",
    credentials: "No provider key for policy checks; BYOK for model review.",
    approval: "Review-before-apply or human-before-external-action.",
  },
];

const providerEntries: PublicBetaCatalogEntry[] = [
  ["OpenAI", "Text, multimodal, and media provider lane", "Generate reviewed text or media-ready plans", "Provider execution", "Input/output tokens or generated media"],
  ["Anthropic", "Claude provider lane", "Draft, reason, and review tenant work", "Provider execution", "Input/output tokens"],
  ["OpenRouter", "Multi-model provider lane", "Use an approved model through one governed adapter", "Provider routing", "Input/output tokens and selected model rate"],
  ["Google Gemini", "Text and multimodal provider lane", "Run approved text and multimodal tasks", "Provider execution", "Input/output tokens or media units"],
  ["Groq Speech-to-Text", "Bounded transcription", "Turn approved audio into a tenant transcript", "Input → transcription", "Audio duration and upload size"],
  ["ElevenLabs", "Speech and narration", "Create a tenant-owned voice artifact for review", "Artifact creation", "Characters or audio duration"],
  ["ElevenLabs Music", "Music generation", "Create a reviewed music artifact", "Artifact creation", "Generation duration and provider units"],
  ["HeyGen", "Hosted avatar/video", "Create a tenant-owned video for review", "Artifact creation", "Video duration and render units"],
  ["Suno", "Hosted music polling", "Queue a music request and retain the result as an artifact", "Queued artifact creation", "Generation duration and provider units"],
  ["Firecrawl", "Read-only web research", "Collect bounded source content with citations", "Research → citations", "Provider request or page credits"],
  ["Brave Search", "Public search adapter", "Find bounded public sources for a cited brief", "Research → citations", "Search request units"],
  ["Hunter", "Growth research adapter", "Prepare an enrichment brief without automatic outreach", "Research → review", "Provider lookup units"],
  ["Jina Reader", "Isolated web extraction worker", "Extract bounded source content for a cited research brief", "Research → citations", "Isolated worker compute and provider usage"],
].map(([name, tool, outcome, stage, cost]) => ({
  id: `provider-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  name,
  kind: "Provider",
  status: name === "Jina Reader" ? "Isolated worker" : "Available with client key",
  customerTool: tool,
  outcome,
  stage,
  data: "Current tenant request and provider result only; no browser key exposure.",
  cost: `${cost}; normalized credits are estimated before execution when pricing is configured.`,
  credentials: name === "Jina Reader" ? "Isolated worker token stays server-side; no browser key." : "Client-owned key submitted through the authenticated server flow.",
  approval: name === "Jina Reader" ? "Worker evidence, tenant isolation, budget, idempotency, deletion, and rollback are required." : "Manifest approval, budget, rate limits, and provider-specific consent.",
}));

const repositoryEntries: readonly [string, string, string, string, string][] = [
  ["Ponytail", "Restraint trait", "Stop low-value loops", "Every loop", "Native trait; no upstream runtime fee"],
  ["Superpowers", "Named loop structure", "Make planning, execution, and review boundaries explicit", "Planning → review", "No upstream fee; platform execution costs apply"],
  ["Headroom", "Context compression", "Reduce context cost and improve routing efficiency", "Context → routing", "No upstream fee; model usage remains metered"],
  ["AGENTS.md / Agent Skills / Agency Agents", "Provenance and specialist playbooks", "Give reviewed work the right specialist context", "Planning and execution", "Reference input; no upstream runtime fee"],
  ["Open Notebook / book-to-skill", "Reviewed knowledge compilation", "Turn approved knowledge into tenant context", "Memory → planning", "Storage and model usage apply when compiled"],
  ["i-have-adhd / no-ai-slop", "Accessibility and output safeguards", "Make outputs clearer, more usable, and less synthetic", "Quality review", "Native policy; no upstream runtime fee"],
  ["Company Research Agent", "Research playbook", "Prepare company research for a reviewed brief", "Research → review", "Review-required workflow contract"],
  ["OpenSEO", "SEO/research workflow", "Turn research into a reviewed SEO delivery package", "Research → delivery", "Subsequent governed workflow; review required"],
  ["RAG-Anything / Semantica / Cognee / RAGFlow", "Knowledge upgrade candidates", "Evaluate one knowledge upgrade at a time", "Memory", "Isolated evaluation; storage and compute apply"],
  ["gstack / Google agents-cli / Prime Agent / Shepherd / OpenHands", "Operator worktree infrastructure", "Support operator-side development and repair", "Operator plane", "Operator-only; never client execution"],
  ["Strix / PentAGI / HexStrike", "Security workers", "Run isolated security checks when separately approved", "Security review", "Isolated worker; review and rollback required"],
  ["Wan2GP / SkyReels / Chatterbox / OpenMontage / Supervision", "GPU and media workers", "Support bounded media generation or inspection when demand justifies it", "Media and quality", "GPU worker; cost and demand evidence required"],
  ["OpenReply / Infobip", "Communications adapters", "Prepare messages and delivery packages", "Approval → delivery", "Draft-first; sending always requires approval"],
  ["Appsmith / FounderOS", "Control-room references", "Inform operator dashboards and governance surfaces", "Operator plane", "Reference only; not hosted-runtime dependencies"],
];

const additionalRepositoryEntries: PublicBetaCatalogEntry[] = [
  { id: "repository-repomix", name: "Repomix", kind: "Repository provenance", status: "Available now", customerTool: "Operator and CI context compiler", outcome: "Pack selected codebase context, count tokens, and compress safely for reviewed operator work.", stage: "Context → routing", data: "Reference or explicitly exported operator context; customer-private data is never packed automatically.", cost: "No upstream runtime fee; token and CI compute costs apply.", credentials: "No provider key.", approval: "Token-count, secret-exclusion, and compression-parity evidence.", source: "https://github.com/yamadashy/repomix", runtime: "Operator/CI", costOwner: "veloce" },
  { id: "repository-plunk", name: "Plunk", kind: "Repository provenance", status: "Review required", customerTool: "Internal transactional email fallback", outcome: "Evaluate self-hosted notification delivery without making it a customer send path by default.", stage: "Support and notifications", data: "Operator notification records only during evaluation.", cost: "AGPL-3.0 self-hosted software; mail, compute, deliverability, and support costs apply.", credentials: "Operator-managed SMTP/provider credentials.", approval: "Deliverability, tenant isolation, legal retention, and rollback evidence.", source: "https://github.com/useplunk/plunk", runtime: "Operator worker", costOwner: "veloce" },
  { id: "repository-novu", name: "Novu", kind: "Repository provenance", status: "Review required", customerTool: "Internal multi-channel notification fallback", outcome: "Evaluate audited email, SMS, push, and in-app notification workflows.", stage: "Support and notifications", data: "Operator notification records only during evaluation.", cost: "MIT self-hosted software; channel provider, compute, and support costs apply.", credentials: "Operator-managed channel credentials.", approval: "Provider failure, delivery audit, retention, and rollback evidence.", source: "https://github.com/novuhq/novu", runtime: "Operator worker", costOwner: "veloce" },
];

export const PUBLIC_BETA_CATALOG: readonly PublicBetaCatalogEntry[] = [
  ...nativeEntries,
  ...providerEntries,
  ...repositoryEntries.map(([name, tool, outcome, stage, cost]) => ({
    id: `repository-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    kind: "Repository provenance" as const,
    status: name === "Ponytail" ? "Available now" as const : name.includes("Jina") ? "Isolated worker" as const : name.includes("Company") || name.includes("OpenSEO") ? "Review required" as const : name.includes("gstack") || name.includes("Appsmith") || name.includes("FounderOS") ? "Operator only" as const : name.includes("Strix") || name.includes("Wan2GP") || name.includes("OpenReply") ? "Isolated worker" as const : "Reference only" as const,
    customerTool: tool,
    outcome,
    stage,
    data: "Only the Veloce contract and declared tenant boundary are exposed to clients.",
    cost,
    credentials: "No upstream credentials are exposed by the catalog entry.",
    approval: "Catalog visibility is not execution permission; promotion requires its own evidence bundle.",
  })),
  ...additionalRepositoryEntries,
];

export const PUBLIC_BETA_STATUS_ORDER: readonly PublicBetaStatus[] = [
  "Available now",
  "Available with client key",
  "Review required",
  "Isolated worker",
  "Operator only",
  "Reference only",
];
