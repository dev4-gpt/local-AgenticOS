// Typed hosted Ruflo contract.
//
// The local Ruflo shells out to the `ruflo` CLI: it inits a swarm, spawns a
// roster where each agent gets "<role> for: <objective>", then collects each
// agent's output from JSON under ~/.claude-flow. Cloud Run has no CLI and no
// home directory, so the same swarm -> roster -> per-agent result shape runs on
// the approved provider lane over tenant rows.
//
// Worth recording: the local roster is a flat fan-out, not a dependency graph.
// Each agent works the same objective from its own angle and a coordinator
// synthesises the results at the end.

export const RUFLO_TOPOLOGIES = ["hierarchical", "mesh", "star"] as const;
export const RUFLO_SWARM_STATUSES = ["queued", "running", "completed", "failed", "cancelled"] as const;
export const RUFLO_AGENT_STATUSES = ["idle", "running", "done", "failed", "skipped"] as const;

export type RufloTopology = (typeof RUFLO_TOPOLOGIES)[number];
export type RufloSwarmStatus = (typeof RUFLO_SWARM_STATUSES)[number];
export type RufloAgentStatus = (typeof RUFLO_AGENT_STATUSES)[number];

export type RufloRosterEntry = { type: string; name: string; angle: string };

/**
 * The presets. The SEO roster mirrors the local `SEO_ROSTER` exactly, including
 * the agent types the local code had to remap after the CLI silently rejected
 * the originals. Each entry carries the angle it works the objective from.
 */
export const RUFLO_PRESETS: Record<string, { label: string; blurb: string; roster: RufloRosterEntry[] }> = {
  seo: {
    label: "SEO strategy",
    blurb: "Twelve specialists work one objective from their own angle, then a coordinator synthesises.",
    roster: [
      { type: "researcher", name: "keyword-research", angle: "the keyword and query landscape worth targeting" },
      { type: "researcher", name: "search-intent", angle: "what searchers actually want at each stage" },
      { type: "analyst", name: "competitor-analysis", angle: "who currently ranks and why" },
      { type: "tester", name: "technical-audit", angle: "technical issues that would block ranking" },
      { type: "architect", name: "content-architecture", angle: "how the content should be structured and clustered" },
      { type: "researcher", name: "serp-analysis", angle: "what the SERP rewards for these queries" },
      { type: "optimizer", name: "on-page-optimizer", angle: "on-page changes with the highest leverage" },
      { type: "analyst", name: "schema-strategist", angle: "structured data worth implementing" },
      { type: "researcher", name: "backlink-gap", angle: "authority gaps against the competition" },
      { type: "performance-engineer", name: "core-web-vitals", angle: "performance work that affects ranking" },
      { type: "analyst", name: "internal-linking", angle: "internal link structure and equity flow" },
      { type: "reviewer", name: "seo-qa-reviewer", angle: "what is weak, risky, or missing in this plan" },
    ],
  },
  launch: {
    label: "Launch plan",
    blurb: "A smaller roster for taking something to market.",
    roster: [
      { type: "researcher", name: "market-research", angle: "the market and who it is for" },
      { type: "analyst", name: "positioning", angle: "how this should be positioned against alternatives" },
      { type: "architect", name: "channel-plan", angle: "which channels to use and in what order" },
      { type: "optimizer", name: "conversion-path", angle: "the path from attention to signup" },
      { type: "reviewer", name: "launch-reviewer", angle: "what is weak, risky, or missing in this plan" },
    ],
  },
};

export const RUFLO_DEFAULT_PRESET = "seo";
export const RUFLO_MAX_AGENTS = 16;

export type RufloSwarm = {
  id: string;
  objective: string;
  topology: RufloTopology;
  preset: string;
  status: RufloSwarmStatus;
  jobId: string | null;
  provider: string | null;
  model: string | null;
  agentCount: number;
  completedCount: number;
  failedCount: number;
  report: string | null;
  reportArtifactId: string | null;
  costMicros: number;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RufloAgent = {
  id: string;
  swarmId: string;
  agentType: string;
  name: string;
  task: string;
  position: number;
  status: RufloAgentStatus;
  output: string | null;
  errorCode: string | null;
  costMicros: number;
  startedAt: string | null;
  finishedAt: string | null;
};

function str(value: unknown, max = 240) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function nullableStr(value: unknown, max = 240) {
  const text = str(value, max);
  return text ? text : null;
}

function num(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function oneOf<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (allowed as readonly string[]).includes(text) ? text as T[number] : fallback;
}

export function rufloPreset(preset: string) {
  return RUFLO_PRESETS[preset] ?? RUFLO_PRESETS[RUFLO_DEFAULT_PRESET];
}

export function rufloRoster(preset: string) {
  return rufloPreset(preset).roster.slice(0, RUFLO_MAX_AGENTS);
}

/** Mirrors the local task string: "<role words> for: <objective>". */
export function rufloAgentTask(entry: RufloRosterEntry, objective: string) {
  return `${entry.name.replace(/-/g, " ")} for: ${objective}`.slice(0, 4000);
}

export function normalizeRufloSwarm(row: Record<string, unknown>): RufloSwarm {
  return {
    id: str(row.id, 36),
    objective: str(row.objective, 4000),
    topology: oneOf(row.topology, RUFLO_TOPOLOGIES, "hierarchical"),
    preset: str(row.preset, 40) || RUFLO_DEFAULT_PRESET,
    status: oneOf(row.status, RUFLO_SWARM_STATUSES, "queued"),
    jobId: nullableStr(row.job_id, 36),
    provider: nullableStr(row.provider, 40),
    model: nullableStr(row.model, 120),
    agentCount: Math.max(0, Math.round(num(row.agent_count))),
    completedCount: Math.max(0, Math.round(num(row.completed_count))),
    failedCount: Math.max(0, Math.round(num(row.failed_count))),
    report: nullableStr(row.report, 40000),
    reportArtifactId: nullableStr(row.report_artifact_id, 36),
    costMicros: Math.max(0, Math.round(num(row.cost_micros))),
    errorCode: nullableStr(row.error_code, 120),
    createdAt: str(row.created_at, 40),
    updatedAt: str(row.updated_at, 40),
  };
}

export function normalizeRufloAgent(row: Record<string, unknown>): RufloAgent {
  return {
    id: str(row.id, 36),
    swarmId: str(row.swarm_id, 36),
    agentType: str(row.agent_type, 40),
    name: str(row.name, 60),
    task: str(row.task, 4000),
    position: Math.max(0, Math.round(num(row.position))),
    status: oneOf(row.status, RUFLO_AGENT_STATUSES, "idle"),
    output: nullableStr(row.output, 20000),
    errorCode: nullableStr(row.error_code, 120),
    costMicros: Math.max(0, Math.round(num(row.cost_micros))),
    startedAt: nullableStr(row.started_at, 40),
    finishedAt: nullableStr(row.finished_at, 40),
  };
}

/** One agent's prompt: its own angle on the shared objective. */
export function rufloAgentPrompt(input: { entry: RufloRosterEntry; objective: string }) {
  return [
    `You are the ${input.entry.name.replace(/-/g, " ")} specialist in a coordinated team working one objective.`,
    `Your angle: ${input.entry.angle}.`,
    "",
    `OBJECTIVE:\n${input.objective}`,
    "",
    "Cover only your angle — other specialists handle theirs, so do not restate the whole plan.",
    "Reply with 4 to 8 concise Markdown bullets of specific, actionable findings. No preamble, no headings.",
    "Do not invent facts, metrics, or competitor names you cannot support. Do not include credentials.",
  ].join("\n").slice(0, 20_000);
}

/**
 * The coordinator prompt. It only ever sees agent findings, so a failed agent
 * simply contributes nothing rather than blocking the synthesis.
 */
export function rufloReportPrompt(input: { objective: string; findings: Array<{ name: string; output: string }> }) {
  const body = input.findings
    .map((finding) => `### ${finding.name.replace(/-/g, " ")}\n${finding.output.slice(0, 2000)}`)
    .join("\n\n")
    .slice(0, 14_000);
  return [
    "You are the coordinator of a specialist team. Synthesise their findings into one plan the client can act on.",
    "",
    `OBJECTIVE:\n${input.objective}`,
    "",
    `--- SPECIALIST FINDINGS ---\n${body}\n--- END ---`,
    "",
    "Return one complete, self-contained HTML document in a single ```html code fence. Use inline CSS only. No scripts, no remote assets, no credentials.",
    "Lead with the priorities that matter most, group the rest by theme, and note anything the specialists disagreed on or could not answer.",
  ].join("\n").slice(0, 20_000);
}

export function rufloProgress(swarm: RufloSwarm) {
  const settled = swarm.completedCount + swarm.failedCount;
  return swarm.agentCount > 0 ? Math.min(100, Math.round((settled / swarm.agentCount) * 100)) : 0;
}

export function rufloStatusLabel(swarm: RufloSwarm) {
  if (swarm.status === "queued") return "Queued for the hosted runner";
  if (swarm.status === "running") return `${swarm.completedCount + swarm.failedCount}/${swarm.agentCount} agents reported`;
  if (swarm.status === "completed") {
    // Agents can all report while the coordinator's synthesis fails validation.
    // Saying "Completed" there would claim a plan the client never received.
    const agents = swarm.failedCount > 0
      ? `Completed with ${swarm.failedCount} agent${swarm.failedCount === 1 ? "" : "s"} failing`
      : "Completed";
    return swarm.reportArtifactId ? agents : `${agents}, but the coordinator report was not usable`;
  }
  if (swarm.status === "cancelled") return "Cancelled";
  return `Failed${swarm.errorCode ? `: ${swarm.errorCode}` : ""}`;
}

export function rufloTimeAgo(iso: string, now = Date.now()) {
  const minutes = Math.floor((now - Date.parse(iso)) / 60000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export function rufloFormatMicros(micros: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(micros / 1_000_000);
}

export function rufloSchemaMissing(status: number, body?: unknown) {
  if (status === 404) return true;
  if (status !== 400 && status !== 406) return false;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  return /client_ruflo|schema cache|PGRST205|PGRST202|does not exist/i.test(text);
}
