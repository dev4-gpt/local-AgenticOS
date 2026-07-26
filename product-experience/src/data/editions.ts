import type { Chapter, FeatureItem } from "@/types/editions";

// Base URL of the live Veloce AgenticOS runtime. Public deployments must not
// point prospects at localhost or at the private operator workspace. Set
// NEXT_PUBLIC_APP_URL only after an authenticated client edition exists.
const APP = process.env.NEXT_PUBLIC_APP_URL;

// Every feature is an equal card (kind "image", no image) — FeatureImage
// renders eyebrow + desc + an "Open" pill so all links are equally visible and
// clickable, in array order.
const card = (chapter: string, eyebrow: string, desc: string, route: string): FeatureItem => ({
  chapter,
  kind: "image",
  eyebrow,
  desc,
  linkText: "Open",
  linkHref: APP ? `${APP}${route}` : "#developer",
  imgSrc: null,
  hasVideo: false,
});

export const chapters: Chapter[] = [
  // ─── Operating layers I–VI: the six pillars. Each tool appears once. ───────
  {
    slug: "sidekick",
    title: "Command",
    roman: "I",
    items: [
      card("Command", "Mission Control", "Every agent, model, and decision currently in flight, in one operating view.", "/"),
      card("Command", "Claude", "A direct streaming line to Claude Code — full tool use, MCPs, and plugins.", "/claude"),
      card("Command", "OpenClaw", "Local agent gateway: chat one-shot, or open the full control room.", "/openclaw"),
      card("Command", "Codex", "Long-horizon coding sessions with goal tracking.", "/codex"),
      card("Command", "Hermes", "The orchestrator and provider-routing brain behind the agents.", "/hermes"),
      card("Command", "Antigravity", "Autonomous build agent with its own workspace and live preview.", "/antigravity"),
      card("Command", "Room", "The shared control room where agents hand off work.", "/room"),
      card("Command", "Fusion", "Blend multiple models on a single answer.", "/fusion"),
      card("Command", "Engine", "The runtime that schedules and supervises every agent.", "/engine"),
    ],
  },
  {
    slug: "agentic",
    title: "Context",
    roman: "II",
    items: [
      card("Context", "Memory", "Approved reasoning becomes a private, reusable project foundation.", "/memory"),
      card("Context", "Notebook", "Source-grounded research notebooks that cite exactly what they use.", "/notebook"),
      card("Context", "Graphify", "Turn any input — code, docs, transcripts — into a queryable knowledge graph.", "/memory"),
      card("Context", "Journal", "A running log of decisions and daily operating context.", "/journal"),
      card("Context", "Goals", "Durable objectives the agents plan and execute against.", "/goals"),
      card("Context", "Vault", "Private source fragments that never leave the local runtime.", "/memory"),
    ],
  },
  {
    slug: "online",
    title: "Orchestrate",
    roman: "III",
    items: [
      card("Orchestrate", "Pipeline", "Capture → shape → decide → build, as one accountable lane.", "/pipeline"),
      card("Orchestrate", "Agent Kanban", "Watch parallel agent work move across visible, named stages.", "/kanban"),
      card("Orchestrate", "Paperclip", "Attach context and dispatch a build without a blank-prompt reset.", "/paperclip"),
      card("Orchestrate", "Loop", "Run a prompt or workflow on a recurring interval.", "/loop"),
      card("Orchestrate", "Ruflo", "Coordinate a swarm of agents against one objective.", "/ruflo"),
    ],
  },
  {
    slug: "retail",
    title: "Create",
    roman: "IV",
    items: [
      card("Create", "Flow Lab", "Turn an approved reference into an original scene and build brief.", "/flow-lab"),
      card("Create", "Web Studio", "A brief becomes a conversion-focused page, ready for review.", "/web-studio"),
      card("Create", "Open Design", "Original design systems and assets — not stock templates.", "/opendesign"),
      card("Create", "Video", "Script → footage → voiceover → rendered video.", "/video"),
      card("Create", "Music", "Generate original tracks and beds for productions.", "/music"),
      card("Create", "Thumbnails", "On-brand thumbnails and cover art in a single pass.", "/thumbnails"),
      card("Create", "OpenMontage", "Assemble motion montages from owned frames.", "/openmontage"),
    ],
  },
  {
    slug: "marketing",
    title: "Govern",
    roman: "V",
    items: [
      card("Govern", "Integrations", "Every external connector has an owner, a scope, and an audit trail.", "/integrations"),
      card("Govern", "Capabilities", "Enable client-safe capabilities with explicit boundaries.", "/capabilities"),
      card("Govern", "Model routing", "Route each task to the right model within a spending cap.", "/engine"),
      card("Govern", "Local runtime", "Keep drafting and internal prep on free, local models.", "/local"),
      card("Govern", "Approvals", "No external action ships without a human decision.", "/pipeline"),
      card("Govern", "Guide", "In-context guidance on safe, cost-aware operation.", "/guide"),
    ],
  },
  {
    slug: "checkout",
    title: "Deliver",
    roman: "VI",
    items: [
      card("Deliver", "Leads", "Find, enrich, and score qualified conversations.", "/leads"),
      card("Deliver", "Radar", "Track the signals that are moving and draft outreach from them.", "/radar"),
      card("Deliver", "SEO", "Research, generate, and deploy content that ranks.", "/seo"),
      card("Deliver", "Studio", "Package approved work into client-ready deliverables.", "/studio"),
      card("Deliver", "Outreach", "Sequenced, human-approved outreach with reply tracking.", "/leads"),
      card("Deliver", "Reporting", "Delivery progress, cost, and outcome health in one rhythm.", "/goals"),
    ],
  },

  // ─── After Deliver: the live operating system as distinct dashboard views.
  //     Panel/metric framing — no pillar tool is re-listed here. Values shown
  //     are a representative snapshot of the live runtime. ────────────────────
  {
    slug: "operations",
    title: "Runtime",
    roman: "VII",
    items: [
      card("Runtime", "Providers online", "Claude, OpenClaw, and Hermes report healthy and connected.", "/"),
      card("Runtime", "Latency & pulse", "Combined response time and a runtime heartbeat, updated live.", "/engine"),
      card("Runtime", "Local & free", "A local model stays available for zero-cost drafting.", "/freeclaude"),
      card("Runtime", "Within cap", "Model spend stays inside its budget, visible before any overage.", "/engine"),
    ],
  },
  {
    slug: "shop-app",
    title: "Control room",
    roman: "VIII",
    items: [
      card("Control room", "Sessions in flight", "See which agents are active and step into their room.", "/room"),
      card("Control room", "Streaming lines", "Direct, live chat lines to every connected agent.", "/claude"),
      card("Control room", "Autonomous builds", "Long-running build agents with their own live preview.", "/antigravity"),
      card("Control room", "Blended answers", "Route one question across multiple models at once.", "/fusion"),
    ],
  },
  {
    slug: "b2b",
    title: "Knowledge graph",
    roman: "IX",
    items: [
      card("Knowledge graph", "Grounded briefs", "Approved reasoning resolves into a reusable project foundation.", "/memory"),
      card("Knowledge graph", "Connected sources", "Fragments link into a graph you can query and explore.", "/memory"),
      card("Knowledge graph", "Cited research", "Every research note shows exactly which sources it used.", "/notebook"),
      card("Knowledge graph", "Decision log", "A running record of what was decided, and why.", "/journal"),
    ],
  },
  {
    slug: "finance",
    title: "Routing & spend",
    roman: "X",
    items: [
      card("Routing & spend", "Right model, right task", "Each job routes to the model that fits, inside a cap.", "/engine"),
      card("Routing & spend", "Budgets & tokens", "Usage stays isolated, capped, and visible before overage.", "/engine"),
      card("Routing & spend", "Provider fallback", "Automatic failover across providers when one rate-limits.", "/hermes"),
      card("Routing & spend", "Connectors", "Every integration carries an owner, a scope, and an audit trail.", "/integrations"),
    ],
  },
  {
    slug: "shipping",
    title: "Outcomes",
    roman: "XI",
    items: [
      card("Outcomes", "Qualified pipeline", "Find, enrich, and score the conversations worth having.", "/leads"),
      card("Outcomes", "Signal radar", "Track what's moving in the market and draft from it.", "/radar"),
      card("Outcomes", "Ranking content", "Research, generate, and deploy content that ranks.", "/seo"),
      card("Outcomes", "Delivery health", "Progress, cost, and outcome quality in one operating view.", "/goals"),
    ],
  },

  // ─── Section VI: contact. ChapterSection renders <ContactSection/> here. ───
  {
    slug: "developer",
    title: "Contact",
    roman: "XII",
    items: [],
  },
];
