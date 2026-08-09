// Per-surface configuration for the hosted Create, Govern, and Deliver studios.
//
// These seventeen routes all run the same proven lane — queue a
// workspace-execution job, commit a tenant artifact — but the local product
// gives each one its own identity: its own presets, its own input, its own
// output shape, its own gallery. The generic "Run in hosted workspace" screen
// erased all of that. This config restores the per-surface structure without
// seventeen near-identical components, and needs no new tables because
// executions and artifacts already have them.

import type { ClientWorkspaceSurface } from "@/lib/clientWorkspaceExecution";

export type StudioField = {
  key: "title" | "goal" | "reference";
  label: string;
  placeholder: string;
  multiline?: boolean;
  optional?: boolean;
};

export type StudioSurface = {
  eyebrow: string;
  title: string;
  description: string;
  accent: string;
  /** What the primary action is called, in this surface's own language. */
  action: string;
  /** Quick starts, mirroring the local surface's presets. */
  presets: Array<{ label: string; title: string; goal: string }>;
  fields: StudioField[];
  /** A preview surface renders its artifact; a brief surface reads as Markdown. */
  artifactIntent: "preview" | "brief";
  /** Named so the gallery reads like the local one rather than "artifacts". */
  outputNoun: string;
  /**
   * Stated when the surface's real capability is not yet active, so the page
   * explains the genuine blocked prerequisite instead of implying more.
   */
  pendingCapability?: string;
};

export const STUDIO_SURFACES: Partial<Record<ClientWorkspaceSurface, StudioSurface>> = {
  create: {
    eyebrow: "IV. Create", title: "Create Brief", accent: "#60a5fa",
    description: "Turn an approved direction into a concrete brief the rest of the pipeline can act on.",
    action: "Write the brief", artifactIntent: "brief", outputNoun: "briefs",
    presets: [
      { label: "Campaign concept", title: "Campaign concept", goal: "Write a campaign concept brief: the audience, the single idea, the proof, the channels, and what success looks like." },
      { label: "Product explainer", title: "Product explainer", goal: "Write an explainer brief for a product launch: the problem, how it works, who it is for, and the three points that must land." },
      { label: "Stakeholder handoff", title: "Stakeholder handoff", goal: "Write a handoff brief covering decisions made, open questions, owners, and the next review checkpoint." },
    ],
    fields: [
      { key: "title", label: "Name this brief", placeholder: "What is it for?" },
      { key: "goal", label: "Direction", placeholder: "The approved direction, audience, and constraints.", multiline: true },
    ],
  },
  opendesign: {
    eyebrow: "IV. Create · Design", title: "OpenDesign", accent: "#f472b6",
    description: "Generate a design implementation you can open, review, and download. Output is a self-contained page held in tenant storage.",
    action: "Generate the design", artifactIntent: "preview", outputNoun: "designs",
    presets: [
      { label: "Pricing page", title: "Pricing page", goal: "Design a three-tier pricing page with a recommended tier, feature comparison, and a clear primary action." },
      { label: "Style guide", title: "Style guide", goal: "Design a brand style guide page showing type scale, colour roles with hex values, spacing, and component examples." },
      { label: "Client portal", title: "Client portal", goal: "Design a client portal home: status summary, recent deliverables, and the next action needed from the client." },
    ],
    fields: [
      { key: "title", label: "Name this design", placeholder: "Pricing page, style guide…" },
      { key: "goal", label: "What to design", placeholder: "Purpose, audience, must-have sections, and any brand direction.", multiline: true },
    ],
  },
  "web-studio": {
    eyebrow: "IV. Create · Sites", title: "Web Studio", accent: "#60a5fa",
    description: "Build a complete page you can preview here and download as a single file.",
    action: "Build the page", artifactIntent: "preview", outputNoun: "pages",
    presets: [
      { label: "Personal brand", title: "Personal brand site", goal: "Build a personal brand page: who I am, what I do, selected work, and a way to get in touch." },
      { label: "Lead generation", title: "Lead generation page", goal: "Build a lead generation page with a clear promise, proof, objection handling, and one form-focused action." },
      { label: "Book a strategy call", title: "Strategy call page", goal: "Build a page whose only job is booking a strategy call: the offer, who it suits, what happens on the call." },
    ],
    fields: [
      { key: "title", label: "Name this page", placeholder: "Launch page, waitlist…" },
      { key: "goal", label: "What the page must do", placeholder: "Audience, the one action it drives, and the proof it needs.", multiline: true },
    ],
  },
  "flow-lab": {
    eyebrow: "IV. Create · Strategy", title: "Flow Lab", accent: "#a78bfa",
    description: "Map a flow end to end and keep it as a reviewable document.",
    action: "Map the flow", artifactIntent: "brief", outputNoun: "flows",
    presets: [
      { label: "Onboarding flow", title: "Onboarding flow", goal: "Map an onboarding flow from signup to first value: each step, what the user sees, and where they drop off." },
      { label: "Content system", title: "Content system", goal: "Map a content system: sources, formats, review gates, publishing, and repurposing." },
      { label: "Funnel", title: "Funnel map", goal: "Map a funnel from first touch to closed: stages, the question answered at each, and the handoffs." },
    ],
    fields: [
      { key: "title", label: "Name this flow", placeholder: "Onboarding, funnel…" },
      { key: "goal", label: "What to map", placeholder: "The start point, the end state, and any known constraints.", multiline: true },
    ],
  },
  games: {
    eyebrow: "IV. Create · Interactive", title: "Game Studio", accent: "#34d399",
    description: "Build a small playable game as a single self-contained page.",
    action: "Build the game", artifactIntent: "preview", outputNoun: "games",
    presets: [
      { label: "Memory game", title: "Memory game", goal: "Build a memory card game: a grid of pairs, move counter, and a win state." },
      { label: "Puzzle", title: "Puzzle game", goal: "Build a small logic puzzle with a clear goal, a reset, and a win state." },
      { label: "Clicker", title: "Clicker prototype", goal: "Build a clicker prototype with a score, an upgrade, and visible progression." },
    ],
    fields: [
      { key: "title", label: "Name this game", placeholder: "Memory, puzzle…" },
      { key: "goal", label: "How it plays", placeholder: "The rules, the win state, and the feel you want.", multiline: true },
    ],
  },
  studio: {
    eyebrow: "IV. Create · Media", title: "Agent Studio", accent: "#c4b5fd",
    description: "Prepare production-ready media direction. Image, speech, and video generation each activate with their own approved provider.",
    action: "Prepare the direction", artifactIntent: "brief", outputNoun: "directions",
    pendingCapability: "Media generation runs through separate provider adapters. Until one is approved for this tenant, this surface produces the production direction rather than the asset.",
    presets: [
      { label: "Campaign brief", title: "Campaign creative brief", goal: "Prepare a creative direction: the idea, the visual language, the shot list, and what must be true in every asset." },
      { label: "Narration script", title: "Narration script", goal: "Prepare a narration script with timing notes and the tone to read it in." },
      { label: "Creative concept", title: "Creative concept", goal: "Prepare a creative concept: the insight, the expression, and three executions." },
    ],
    fields: [
      { key: "title", label: "Name this direction", placeholder: "Campaign, narration…" },
      { key: "goal", label: "The direction", placeholder: "Audience, message, tone, and any brand constraints.", multiline: true },
    ],
  },
  video: {
    eyebrow: "IV. Create · Video", title: "Video Studio", accent: "#f87171",
    description: "Prepare a production-ready video brief. Rendering activates when an approved video provider is enabled for this tenant.",
    action: "Prepare the video brief", artifactIntent: "brief", outputNoun: "video briefs",
    pendingCapability: "Video rendering needs an approved media provider and its own budget. This surface prepares the brief; it does not claim to have rendered anything.",
    presets: [
      { label: "Product explainer", title: "Product explainer", goal: "Prepare an explainer video brief: hook, problem, how it works, proof, and call to action, with timings." },
      { label: "Launch reel", title: "Launch reel", goal: "Prepare a launch reel brief: beat-by-beat storyboard, on-screen text, and pacing." },
      { label: "Avatar script", title: "Avatar script", goal: "Prepare a presenter script with delivery notes and shot changes." },
    ],
    fields: [
      { key: "title", label: "Name this video", placeholder: "Explainer, launch reel…" },
      { key: "goal", label: "What it must say", placeholder: "Audience, message, length, and tone.", multiline: true },
    ],
  },
  openmontage: {
    eyebrow: "IV. Create · Video assembly", title: "OpenMontage", accent: "#fb923c",
    description: "Plan an edit: scenes, order, and transitions. Assembly runs when a render worker is approved.",
    action: "Plan the montage", artifactIntent: "brief", outputNoun: "montage plans",
    pendingCapability: "Assembly needs a dedicated render worker, which is not enabled for this tenant. This surface plans the edit only.",
    presets: [
      { label: "Trailer", title: "Trailer plan", goal: "Plan a trailer: the arc, scene order, pacing, and where the title lands." },
      { label: "Scene list", title: "Scene list", goal: "Plan a scene list with duration, purpose, and the transition into the next." },
      { label: "Montage", title: "Montage brief", goal: "Plan a montage: the through-line, the beats, and the music feel." },
    ],
    fields: [
      { key: "title", label: "Name this edit", placeholder: "Trailer, montage…" },
      { key: "goal", label: "The edit", placeholder: "Footage available, the story, and the target length.", multiline: true },
    ],
  },
  music: {
    eyebrow: "IV. Create · Audio", title: "Music Studio", accent: "#22d3ee",
    description: "Prepare a composition brief. Audio generation activates per approved provider and budget.",
    action: "Prepare the composition", artifactIntent: "brief", outputNoun: "compositions",
    pendingCapability: "Audio generation needs an approved music provider. This surface prepares the composition brief.",
    presets: [
      { label: "Brand theme", title: "Brand theme", goal: "Prepare a brand theme brief: mood, instrumentation, tempo, and where it will be used." },
      { label: "Podcast intro", title: "Podcast intro", goal: "Prepare a podcast intro brief: length, feel, and how it hands off to the host." },
      { label: "Background score", title: "Background score", goal: "Prepare a background score brief that supports narration without competing with it." },
    ],
    fields: [
      { key: "title", label: "Name this piece", placeholder: "Brand theme, intro…" },
      { key: "goal", label: "The sound", placeholder: "Mood, tempo, instrumentation, length, and reference feel.", multiline: true },
    ],
  },
  thumbnails: {
    eyebrow: "IV. Create · Thumbnails", title: "Thumbnail Studio", accent: "#fbbf24",
    description: "Work out the visual direction for a thumbnail. Image generation activates with an approved media provider.",
    action: "Prepare the direction", artifactIntent: "brief", outputNoun: "thumbnail directions",
    pendingCapability: "Image generation needs an approved media provider. This surface prepares the direction and the reasoning behind it.",
    presets: [
      { label: "YouTube thumbnail", title: "YouTube thumbnail", goal: "Prepare a thumbnail direction: the one idea, the focal element, the text, and why it earns the click." },
      { label: "Launch visual", title: "Launch visual", goal: "Prepare a launch visual direction that works at small sizes and in a crowded feed." },
      { label: "Social cover", title: "Social cover", goal: "Prepare a social cover direction with safe areas and platform crops accounted for." },
    ],
    fields: [
      { key: "title", label: "Name this thumbnail", placeholder: "Episode, launch…" },
      { key: "goal", label: "What it is for", placeholder: "The subject, the promise, and the competing content it sits beside.", multiline: true },
    ],
  },
  seo: {
    eyebrow: "V. Govern · Search", title: "SEO", accent: "#5ab896",
    description: "Produce a governed SEO plan. Live crawling and rank data activate through their own approved adapters.",
    action: "Build the SEO plan", artifactIntent: "brief", outputNoun: "SEO plans",
    pendingCapability: "Live crawling runs through the approved research adapter and is budgeted separately. This surface plans from what you provide.",
    presets: [
      { label: "Content opportunity", title: "Content opportunity audit", goal: "Assess a content opportunity: the queries worth targeting, the intent behind them, and what would have to be true to rank." },
      { label: "Technical plan", title: "Technical SEO plan", goal: "Produce a technical SEO plan: crawlability, indexation, performance, and structured data, ordered by leverage." },
      { label: "Content brief", title: "SEO content brief", goal: "Write an SEO content brief: target query, intent, required sections, internal links, and success measure." },
    ],
    fields: [
      { key: "title", label: "Name this plan", placeholder: "Topic or site area" },
      { key: "goal", label: "What to plan", placeholder: "The site, the target audience, and the queries or pages in scope.", multiline: true },
      { key: "reference", label: "Reference URL", placeholder: "https://example.com — optional context", optional: true },
    ],
  },
  "seo-guide": {
    eyebrow: "V. Govern · Guidance", title: "SEO Guide", accent: "#5ab896",
    description: "Produce a durable SEO playbook the team can work from.",
    action: "Write the playbook", artifactIntent: "brief", outputNoun: "playbooks",
    presets: [
      { label: "SEO playbook", title: "SEO playbook", goal: "Write an SEO playbook: how we choose targets, how we brief, how we publish, and how we measure." },
      { label: "Content checklist", title: "Content checklist", goal: "Write a pre-publish content checklist covering intent, structure, links, and metadata." },
      { label: "Audit rubric", title: "Audit rubric", goal: "Write an audit rubric with clear pass and fail criteria per area." },
    ],
    fields: [
      { key: "title", label: "Name this playbook", placeholder: "Playbook, checklist…" },
      { key: "goal", label: "What it must cover", placeholder: "Who follows it, and the decisions it needs to settle.", multiline: true },
    ],
  },
  guide: {
    eyebrow: "V. Govern · Capability", title: "Build Guide", accent: "#c4b5fd",
    description: "Produce an implementation guide that records its own approval and evidence requirements.",
    action: "Write the guide", artifactIntent: "brief", outputNoun: "guides",
    presets: [
      { label: "Capability guide", title: "Capability guide", goal: "Write a capability guide: what it does, what it needs, how it is approved, and how it is verified." },
      { label: "Approval checklist", title: "Approval checklist", goal: "Write an approval checklist covering credentials, budget, policy, and rollback." },
      { label: "Operations brief", title: "Operations brief", goal: "Write an operations brief: who runs this, what they watch, and what they do when it fails." },
    ],
    fields: [
      { key: "title", label: "Name this guide", placeholder: "Capability, checklist…" },
      { key: "goal", label: "What it must cover", placeholder: "The capability, its prerequisites, and who reads this.", multiline: true },
    ],
  },
  integrations: {
    eyebrow: "V. Govern · Connections", title: "Integrations", accent: "#60a5fa",
    description: "Plan a connection before anything touches an external account. Credentials, scopes, and activation stay separately approved.",
    action: "Plan the integration", artifactIntent: "brief", outputNoun: "integration plans",
    pendingCapability: "No external account is contacted from this surface. Connecting one is a separate, credentialed approval.",
    presets: [
      { label: "Integration plan", title: "Integration plan", goal: "Plan an integration: the data that moves, in which direction, on what trigger, and what happens when it fails." },
      { label: "OAuth scope review", title: "OAuth scope review", goal: "Review the OAuth scopes an integration asks for and argue the least-privilege set." },
      { label: "Connector brief", title: "Connector brief", goal: "Write a connector brief: endpoints, rate limits, retries, and the audit trail it must leave." },
    ],
    fields: [
      { key: "title", label: "Name this integration", placeholder: "The system to connect" },
      { key: "goal", label: "What it must do", placeholder: "The systems, the data, the direction, and the trigger.", multiline: true },
    ],
  },
  deliver: {
    eyebrow: "VI. Deliver", title: "Delivery", accent: "#5ab896",
    description: "Prepare a delivery package with a durable trail. A destination only receives data through a separately approved action.",
    action: "Prepare the delivery", artifactIntent: "brief", outputNoun: "delivery packages",
    pendingCapability: "Sending to a destination is a separate approved action with its own record. This surface prepares the package.",
    presets: [
      { label: "Delivery package", title: "Delivery package", goal: "Prepare a delivery package: what is included, what changed, what the client must review, and by when." },
      { label: "Client handoff", title: "Client handoff", goal: "Prepare a client handoff: what was done, how to use it, what is still open, and who owns what." },
      { label: "Release note", title: "Release note", goal: "Prepare a release note in client-facing language, leading with what they can now do." },
    ],
    fields: [
      { key: "title", label: "Name this delivery", placeholder: "What is being delivered" },
      { key: "goal", label: "What it contains", placeholder: "The work, the audience, and what they need to decide.", multiline: true },
    ],
  },
  leads: {
    eyebrow: "VI. Deliver · Lead operations", title: "Leads", accent: "#fbbf24",
    description: "Work out who to reach and what to say. Enrichment and outbound sending stay separately gated.",
    action: "Build the lead plan", artifactIntent: "brief", outputNoun: "lead plans",
    pendingCapability: "No enrichment provider is contacted and no message is sent from this surface. Both are separate approvals.",
    presets: [
      { label: "Define an ICP", title: "ICP definition", goal: "Define an ideal customer profile: the firmographics, the trigger, the buying committee, and the disqualifiers." },
      { label: "Research brief", title: "Lead research brief", goal: "Write a lead research brief: the segments, the signals to look for, and the sources to check." },
      { label: "Outreach copy", title: "Outreach copy", goal: "Write outreach copy: the opening line that earns a reply, the proof, and one clear ask." },
    ],
    fields: [
      { key: "title", label: "Name this plan", placeholder: "Segment or campaign" },
      { key: "goal", label: "Who and why", placeholder: "The offer, the segment, and the trigger that makes now the right time.", multiline: true },
    ],
  },
  radar: {
    eyebrow: "VI. Deliver · Publishing", title: "Radar", accent: "#f472b6",
    description: "Plan distribution and keep the record. No destination receives anything until its adapter is approved.",
    action: "Plan the distribution", artifactIntent: "brief", outputNoun: "distribution plans",
    pendingCapability: "Publishing to a destination requires that destination's approved adapter. This surface plans and records only.",
    presets: [
      { label: "Publish plan", title: "Publish plan", goal: "Plan a publish sequence: what goes where, in what order, and how each piece is adapted per channel." },
      { label: "Distribution brief", title: "Distribution brief", goal: "Write a distribution brief: the channels, the cadence, and the measure of success." },
      { label: "Campaign report", title: "Campaign report", goal: "Prepare a campaign report: what ran, what it produced, and what to change next." },
    ],
    fields: [
      { key: "title", label: "Name this plan", placeholder: "Campaign or launch" },
      { key: "goal", label: "What to distribute", placeholder: "The asset, the audiences, and the channels in scope.", multiline: true },
    ],
  },
};

export function studioSurface(surface: ClientWorkspaceSurface) {
  return STUDIO_SURFACES[surface] ?? null;
}

export function isStudioSurface(surface: ClientWorkspaceSurface) {
  return Boolean(STUDIO_SURFACES[surface]);
}

/**
 * Builds the goal sent to the runner. A reference URL is passed as context
 * rather than as an instruction to fetch it, because nothing on this surface
 * crawls — the research adapter does, separately and under its own budget.
 */
export function studioGoal(input: { goal: string; reference?: string }) {
  const reference = input.reference?.trim();
  return (reference ? `${input.goal.trim()}\n\nReference for context only (do not claim to have visited it): ${reference}` : input.goal.trim()).slice(0, 10_000);
}
