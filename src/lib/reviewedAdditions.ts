export type ReviewedAdditionStatus = "recommended" | "review" | "deferred";
export type ReviewedAdditionKind = "quality" | "orchestration" | "voice" | "growth" | "communications" | "agent-library" | "vision" | "video" | "research";

export interface ReviewedAddition {
  id: string;
  name: string;
  kind: ReviewedAdditionKind;
  status: ReviewedAdditionStatus;
  summary: string;
  fit: string;
  decision: string;
  boundary: string;
  sourceUrl: string;
  docsUrl?: string;
  detectedId?: string;
}

// These are product decisions, not an auto-install list. Keeping the research
// here makes the cloud edition aware of useful ecosystem capabilities without
// importing local files, credentials, or third-party execution into the client
// runtime.
export const REVIEWED_ADDITIONS: ReviewedAddition[] = [
  {
    id: "sonarqube-cli",
    name: "SonarQube CLI",
    kind: "quality",
    status: "recommended",
    summary: "Secrets detection and fast code-quality feedback for agent-built changes.",
    fit: "Direct fit for the existing Quality Review and local coding lanes.",
    decision: "Surface as an optional operator preflight; enable it only when the operator has configured SonarQube.",
    boundary: "Read-only analysis by default. Never send source to a provider without explicit operator configuration; never auto-fix or deploy.",
    sourceUrl: "https://github.com/SonarSource/sonarqube-cli",
    docsUrl: "https://docs.sonarsource.com/sonarqube-cli/quickstart-guide",
    detectedId: "sonarqube-cli",
  },
  {
    id: "agent-orchestrator",
    name: "Agent Orchestrator (AO)",
    kind: "orchestration",
    status: "recommended",
    summary: "Parallel coding agents in isolated Git worktrees with CI and review follow-up.",
    fit: "Strong fit for Agent Kanban and the local build pipeline, where worktree isolation is the missing safety primitive.",
    decision: "Integrate as an optional status/launch lane after a small repository pilot; keep the existing board as the source of truth until then.",
    boundary: "Operator-only. Launch requires an explicit repository and task; no public/cloud route may invoke a laptop daemon or personal Git credentials.",
    sourceUrl: "https://aoagents.dev/",
    docsUrl: "https://aoagents.dev/docs/quickstart/",
    detectedId: "agent-orchestrator",
  },
  {
    id: "shepherd",
    name: "Shepherd",
    kind: "orchestration",
    status: "review",
    summary: "Reversible, inspectable agent execution traces with OS-enforced workspace permissions.",
    fit: "High-value safety pattern for future build previews and rollbackable agent runs.",
    decision: "Borrow the retained-output and review-before-apply model first; evaluate the runtime directly after the local build lane has a clear sandbox contract.",
    boundary: "No direct execution integration yet. The upstream project is early alpha and its macOS/Linux sandbox assumptions need a dedicated pilot and threat-model review.",
    sourceUrl: "https://github.com/shepherd-agents/shepherd",
    docsUrl: "https://docs.shepherd-agents.ai/",
    detectedId: "shepherd",
  },
  {
    id: "qm",
    name: "QM",
    kind: "orchestration",
    status: "deferred",
    summary: "Multiplayer agent workspaces with scoped memory, permissions, skills, and background work.",
    fit: "Useful reference for team workspaces, but overlaps heavily with the hosted client runtime and Paperclip.",
    decision: "Study its scope and policy model; do not add a second company-wide agent control plane now.",
    boundary: "No deployment or credential import. Any future collaboration feature must preserve tenant isolation, approval gates, and auditable background jobs.",
    sourceUrl: "https://github.com/yc-software/qm",
    detectedId: "qm",
  },
  {
    id: "huggingface-speech-to-speech",
    name: "Hugging Face Speech-to-Speech",
    kind: "voice",
    status: "review",
    summary: "An open-source path to local speech-to-speech agents using local or provider-compatible backends.",
    fit: "A credible privacy-preserving fallback for the existing Jarvis, Studio, and voice-agent surfaces.",
    decision: "Prototype only after a storage and latency gate; retain ElevenLabs/approved APIs for production until the local lane is measured.",
    boundary: "Local experimental lane with consented voices, no telephony, no client-cloud exposure, and human review before deliverables.",
    sourceUrl: "https://github.com/huggingface/speech-to-speech",
    docsUrl: "https://huggingface.co/docs/hub/agents-local",
  },
  {
    id: "explee",
    name: "Explee / AutoGTM",
    kind: "growth",
    status: "review",
    summary: "AI prospect research, enrichment, personalized email drafting, and meeting-booking workflows.",
    fit: "Overlaps with Leads and Outreach and may improve enrichment quality for narrowly scoped campaigns.",
    decision: "Treat as a provider candidate behind a cost, consent, export, and approval review; do not duplicate its database inside Veloce.",
    boundary: "Research and draft only until a human approves audience, message, spend, and destination. No automatic outreach or purchased-data ingestion.",
    sourceUrl: "https://explee.com/",
    docsUrl: "https://explee.com/pricing",
  },
  {
    id: "infobip",
    name: "Infobip",
    kind: "communications",
    status: "review",
    summary: "A possible SMS, WhatsApp, voice, and omnichannel delivery adapter for approved workflows.",
    fit: "Could extend Outreach and the phone-agent surface beyond email, but it adds regulated messaging and usage-based spend.",
    decision: "Catalog now; only build an adapter after opt-in, regional compliance, pricing, and delivery approval are explicit.",
    boundary: "No unsolicited messaging, no browser-held keys, no unattended sends, and every message must be tied to a reviewable recipient and approval record.",
    sourceUrl: "https://www.infobip.com/",
    docsUrl: "https://www.infobip.com/pricing",
  },
  {
    id: "agency-agents",
    name: "Agency Agents",
    kind: "agent-library",
    status: "recommended",
    summary: "A large, MIT-licensed library of specialist agent role definitions, workflows, and deliverables for coding, design, growth, and operations.",
    fit: "Direct fit for Veloce's existing agents, Skills, Agent Room, and provider-neutral routing; it improves role quality without adding another model runtime.",
    decision: "Curate and import selected role specifications into a versioned Veloce skill pack; never install the entire roster or grant roles new tools by default.",
    boundary: "Prompt/skill content only. Every imported role needs provenance, a scope declaration, a model/provider policy, and the existing human approval gates.",
    sourceUrl: "https://github.com/msitarzewski/agency-agents",
    docsUrl: "https://agencyagents.app/",
  },
  {
    id: "roboflow-supervision",
    name: "Roboflow Supervision",
    kind: "vision",
    status: "review",
    summary: "Model-agnostic Python computer-vision primitives for detections, tracking, zones, datasets, and annotations.",
    fit: "Adds a reusable visual-QA layer to Video, OpenMontage, Thumbnail, and future artifact-review workflows.",
    decision: "Prototype as a bounded Python worker that reads tenant-approved media artifacts and returns structured QC evidence; keep it out of the Next.js runtime.",
    boundary: "No arbitrary camera feeds or personal images. Inputs must be tenant-scoped artifacts, outputs must be evidence records, and model/API credentials remain server-side.",
    sourceUrl: "https://github.com/roboflow/supervision",
    docsUrl: "https://supervision.roboflow.com/",
  },
  {
    id: "skyreels-v2",
    name: "SkyReels V2",
    kind: "video",
    status: "deferred",
    summary: "Open video-generation infrastructure for long-form, text-to-video, image-to-video, and start/end-frame-controlled workflows.",
    fit: "Potentially valuable for OpenMontage and Video as a GPU-backed alternative to paid generation, but it is not a fit for the current M3 Pro local runtime.",
    decision: "Add a future GPU-worker contract only. Benchmark the smallest viable model and model-weight terms before provisioning; do not download weights locally now.",
    boundary: "Separate worker, explicit budget, queue timeout, artifact retention, and license/model-use review. Never expose a GPU worker directly to a client browser.",
    sourceUrl: "https://github.com/skyworkai/skyreels-v2",
    docsUrl: "https://huggingface.co/Skywork/SkyReels-V2",
  },
  {
    id: "scrapegraph-ai",
    name: "ScrapeGraphAI",
    kind: "research",
    status: "recommended",
    summary: "AI-guided structured web extraction and research graphs, with Python and Playwright-based operation.",
    fit: "Useful beside the existing Firecrawl and AgentReach lanes for structured extraction into SEO, Radar, Leads, and Memory records.",
    decision: "Add a read-only, allowlisted research adapter that emits citations and structured records; do not replace Firecrawl until quality, cost, and policy tests pass.",
    boundary: "No localhost/private-network targets, login-cookie forwarding, paywall bypass, or unrestricted crawling. Enforce robots/terms review, rate limits, page budgets, SSRF protection, and source attribution.",
    sourceUrl: "https://github.com/ScrapeGraphAI/Scrapegraph-ai",
    docsUrl: "https://pypi.org/project/scrapegraphai/",
  },
  {
    id: "prime-agent",
    name: "Prime Agent",
    kind: "orchestration",
    status: "review",
    summary: "A self-improving RLM agent with recursive subagents, durable harness state, background sessions, goals, and bounded autonomous mode.",
    fit: "Strong fit for long-running local engineering and research continuity, but it overlaps with Claude/Codex, Ruflo, Agent Kanban, and the planned AO lane.",
    decision: "Pilot as an operator-only resumable worktree lane and borrow its durable-goal/harness ideas before adding another full execution plane.",
    boundary: "Not a security sandbox: it can run model-generated Python and project commands with user permissions. Require disposable worktrees, explicit budgets, review-before-apply, and no client-cloud execution.",
    sourceUrl: "https://github.com/PrimeIntellect-ai/prime-agent",
    docsUrl: "https://github.com/PrimeIntellect-ai/prime-agent#built-for-long-running-work",
    detectedId: "prime-agent",
  },
];
