// Typed hosted-Paperclip contract.
//
// The local operator product runs Paperclip as a service on :3100 and reads
// companies, projects, agents, issues, comments, and heartbeat runs from it.
// Cloud Run cannot reach that laptop service, so this module defines the same
// observable domain over tenant-scoped Supabase rows plus the existing hosted
// job/artifact lane. Everything here is pure so the shape can be tested without
// a database, a provider key, or a browser.

export const PAPERCLIP_ISSUE_STATUSES = ["backlog", "active", "blocked", "done", "cancelled"] as const;
export const PAPERCLIP_ISSUE_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const PAPERCLIP_AGENT_STATUSES = ["idle", "working", "paused", "terminated"] as const;
export const PAPERCLIP_PROJECT_STATUSES = ["active", "paused", "archived"] as const;
export const PAPERCLIP_RUN_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;

export type PaperclipIssueStatus = (typeof PAPERCLIP_ISSUE_STATUSES)[number];
export type PaperclipIssuePriority = (typeof PAPERCLIP_ISSUE_PRIORITIES)[number];
export type PaperclipAgentStatus = (typeof PAPERCLIP_AGENT_STATUSES)[number];
export type PaperclipProjectStatus = (typeof PAPERCLIP_PROJECT_STATUSES)[number];
export type PaperclipRunStatus = (typeof PAPERCLIP_RUN_STATUSES)[number];

export type PaperclipCompany = {
  name: string;
  description: string;
  issuePrefix: string;
  issueCounter: number;
  brandColor: string;
  budgetMicros: number;
  status: string;
};

export type PaperclipProject = {
  id: string;
  name: string;
  urlKey: string;
  description: string;
  color: string;
  icon: string;
  status: PaperclipProjectStatus;
  targetDate: string | null;
  createdAt: string;
};

export type PaperclipAgent = {
  id: string;
  name: string;
  role: string;
  title: string;
  icon: string;
  status: PaperclipAgentStatus;
  reportsTo: string | null;
  provider: string;
  model: string;
  budgetMicros: number;
  lastHeartbeatAt: string | null;
  urlKey: string;
};

export type PaperclipIssue = {
  id: string;
  identifier: string;
  issueNumber: number;
  title: string;
  description: string;
  status: PaperclipIssueStatus;
  priority: PaperclipIssuePriority;
  projectId: string | null;
  assigneeAgentId: string | null;
  labels: string[];
  executionState: PaperclipRunStatus | null;
  executionJobId: string | null;
  buildArtifactId: string | null;
  buildPreviewHtml: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaperclipComment = {
  id: string;
  issueId: string;
  authorAgentId: string | null;
  body: string;
  createdAt: string;
};

export type PaperclipRun = {
  id: string;
  issueId: string | null;
  agentId: string | null;
  jobId: string | null;
  status: PaperclipRunStatus;
  provider: string;
  model: string;
  summary: string;
  errorCode: string | null;
  costMicros: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export type PaperclipBuild = {
  issueId: string;
  identifier: string;
  title: string;
  status: PaperclipIssueStatus;
  agent: string | null;
  agentIcon: string;
  project: string;
  createdAt: string;
  artifactId: string;
  previewHtml: string | null;
};

export type PaperclipStats = {
  agents: number;
  onlineAgents: number;
  runs24h: number;
  succeeded: number;
  failed: number;
  successRate: number;
  issues: number;
  doneIssues: number;
  builds: number;
  spentMicros: number;
  budgetMicros: number;
};

export type PaperclipActivityEntry = {
  id: string;
  agent: string;
  status: PaperclipRunStatus;
  when: string;
  summary: string;
};

export type PaperclipProjectStat = { id: string; name: string; total: number; done: number };
export type PaperclipCostRow = { id: string; name: string; provider: string; model: string; budgetMicros: number; spentMicros: number; runs: number };

const DAY_MS = 24 * 3600 * 1000;

function str(value: unknown, max = 240) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function num(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableStr(value: unknown, max = 240) {
  const text = str(value, max);
  return text ? text : null;
}

function oneOf<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (allowed as readonly string[]).includes(text) ? text as T[number] : fallback;
}

export function normalizePaperclipCompany(row: Record<string, unknown> | null | undefined, fallbackName: string, fallbackPrefix: string): PaperclipCompany {
  return {
    name: str(row?.name, 120) || fallbackName,
    description: str(row?.description, 2000),
    issuePrefix: str(row?.issue_prefix, 8) || fallbackPrefix,
    issueCounter: Math.max(0, Math.round(num(row?.issue_counter))),
    brandColor: /^#[0-9a-fA-F]{6}$/.test(str(row?.brand_color, 7)) ? str(row?.brand_color, 7) : "#d4a574",
    budgetMicros: Math.max(0, Math.round(num(row?.budget_monthly_micros))),
    status: str(row?.status, 20) || "active",
  };
}

export function normalizePaperclipProject(row: Record<string, unknown>): PaperclipProject {
  return {
    id: str(row.id, 36),
    name: str(row.name, 120),
    urlKey: str(row.url_key, 49),
    description: str(row.description, 4000),
    color: str(row.color, 7) || "#d4a574",
    icon: str(row.icon, 8),
    status: oneOf(row.status, PAPERCLIP_PROJECT_STATUSES, "active"),
    targetDate: nullableStr(row.target_date, 10),
    createdAt: str(row.created_at, 40),
  };
}

export function normalizePaperclipAgent(row: Record<string, unknown>): PaperclipAgent {
  return {
    id: str(row.id, 36),
    name: str(row.name, 120),
    role: str(row.role, 80),
    title: str(row.title, 120) || str(row.role, 80),
    icon: str(row.icon, 8),
    status: oneOf(row.status, PAPERCLIP_AGENT_STATUSES, "idle"),
    reportsTo: nullableStr(row.reports_to, 36),
    provider: str(row.provider, 40),
    model: str(row.model, 120),
    budgetMicros: Math.max(0, Math.round(num(row.budget_monthly_micros))),
    lastHeartbeatAt: nullableStr(row.last_heartbeat_at, 40),
    urlKey: str(row.url_key, 49),
  };
}

export function normalizePaperclipIssue(row: Record<string, unknown>): PaperclipIssue {
  return {
    id: str(row.id, 36),
    identifier: str(row.identifier, 20),
    issueNumber: Math.max(0, Math.round(num(row.issue_number))),
    title: str(row.title, 240),
    description: str(row.description, 20000),
    status: oneOf(row.status, PAPERCLIP_ISSUE_STATUSES, "backlog"),
    priority: oneOf(row.priority, PAPERCLIP_ISSUE_PRIORITIES, "medium"),
    projectId: nullableStr(row.project_id, 36),
    assigneeAgentId: nullableStr(row.assignee_agent_id, 36),
    labels: Array.isArray(row.labels) ? row.labels.filter((label): label is string => typeof label === "string").slice(0, 12) : [],
    executionState: typeof row.execution_state === "string" && (PAPERCLIP_RUN_STATUSES as readonly string[]).includes(row.execution_state) ? row.execution_state as PaperclipRunStatus : null,
    executionJobId: nullableStr(row.execution_job_id, 36),
    buildArtifactId: nullableStr(row.build_artifact_id, 36),
    buildPreviewHtml: nullableStr(row.build_preview_html, 40000),
    startedAt: nullableStr(row.started_at, 40),
    completedAt: nullableStr(row.completed_at, 40),
    createdAt: str(row.created_at, 40),
    updatedAt: str(row.updated_at, 40),
  };
}

export function normalizePaperclipComment(row: Record<string, unknown>): PaperclipComment {
  return {
    id: str(row.id, 36),
    issueId: str(row.issue_id, 36),
    authorAgentId: nullableStr(row.author_agent_id, 36),
    body: str(row.body, 10000),
    createdAt: str(row.created_at, 40),
  };
}

export function normalizePaperclipRun(row: Record<string, unknown>): PaperclipRun {
  return {
    id: str(row.id, 36),
    issueId: nullableStr(row.issue_id, 36),
    agentId: nullableStr(row.agent_id, 36),
    jobId: nullableStr(row.job_id, 36),
    status: oneOf(row.status, PAPERCLIP_RUN_STATUSES, "queued"),
    provider: str(row.provider, 40),
    model: str(row.model, 120),
    summary: str(row.summary, 4000),
    errorCode: nullableStr(row.error_code, 120),
    costMicros: Math.max(0, Math.round(num(row.cost_micros))),
    startedAt: nullableStr(row.started_at, 40),
    finishedAt: nullableStr(row.finished_at, 40),
    createdAt: str(row.created_at, 40),
  };
}

/**
 * Default issue prefix for a tenant slug, e.g. `veloce-cloud-test` -> `VEL`.
 * Paperclip identifiers are user-visible, so this stays short and stable.
 */
export function paperclipDefaultPrefix(tenantSlug: string) {
  const letters = tenantSlug.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const candidate = letters.slice(0, 3);
  return /^[A-Z][A-Z0-9]{1,7}$/.test(candidate) ? candidate : "PCL";
}

export function paperclipUrlKey(value: string, fallback: string) {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 49);
  return /^[a-z0-9][a-z0-9-]{0,48}$/.test(slug) ? slug : fallback;
}

// Mirrors the local overview's org ranking so the hosted org chart orders
// leadership the same way the operator product does.
const ROLE_RANK: Record<string, number> = {
  ceo: 0,
  cto: 1,
  cmo: 1,
  coo: 1,
  cfo: 1,
  "head of operations": 1,
  ops: 1,
};

export function paperclipOrgRank(role: string) {
  return ROLE_RANK[role.trim().toLowerCase()] ?? 2;
}

export function sortPaperclipAgents(agents: PaperclipAgent[]) {
  return [...agents].sort((left, right) => {
    const rank = paperclipOrgRank(left.role) - paperclipOrgRank(right.role);
    return rank !== 0 ? rank : left.name.localeCompare(right.name);
  });
}

export type PaperclipOrgNode = { agent: PaperclipAgent; reports: PaperclipOrgNode[] };

/**
 * Builds the reporting tree. Agents whose manager is missing, or whose chain
 * loops back on itself, are surfaced at the root rather than silently dropped.
 */
export function paperclipOrgChart(agents: PaperclipAgent[]): PaperclipOrgNode[] {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const nodes = new Map(agents.map((agent) => [agent.id, { agent, reports: [] as PaperclipOrgNode[] }]));
  const roots: PaperclipOrgNode[] = [];
  for (const agent of sortPaperclipAgents(agents)) {
    const node = nodes.get(agent.id);
    if (!node) continue;
    const parentId = agent.reportsTo && agent.reportsTo !== agent.id && byId.has(agent.reportsTo) && !createsCycle(agent.id, agent.reportsTo, byId) ? agent.reportsTo : null;
    const parent = parentId ? nodes.get(parentId) : null;
    if (parent) parent.reports.push(node);
    else roots.push(node);
  }
  return roots;
}

function createsCycle(agentId: string, parentId: string, byId: Map<string, PaperclipAgent>) {
  const seen = new Set<string>([agentId]);
  let cursor: string | null = parentId;
  while (cursor) {
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = byId.get(cursor)?.reportsTo ?? null;
  }
  return false;
}

export function paperclipStats(input: {
  agents: PaperclipAgent[];
  issues: PaperclipIssue[];
  runs: PaperclipRun[];
  company: PaperclipCompany;
  now?: number;
}): PaperclipStats {
  const now = input.now ?? Date.now();
  const recent = input.runs.filter((run) => {
    const stamp = Date.parse(run.finishedAt || run.startedAt || run.createdAt || "");
    return Number.isFinite(stamp) && stamp >= now - DAY_MS;
  });
  const succeeded = recent.filter((run) => run.status === "succeeded").length;
  const failed = recent.filter((run) => run.status === "failed").length;
  const settled = succeeded + failed;
  const spentMicros = input.runs.reduce((total, run) => total + run.costMicros, 0);
  const budgetMicros = input.company.budgetMicros || input.agents.reduce((total, agent) => total + agent.budgetMicros, 0);
  return {
    agents: input.agents.length,
    onlineAgents: input.agents.filter((agent) => agent.status !== "paused" && agent.status !== "terminated").length,
    runs24h: recent.length,
    succeeded,
    failed,
    // An account with no settled runs is healthy, not 0% — this matches the
    // local dashboard, which shows 100% until something actually fails.
    successRate: settled > 0 ? Math.round((succeeded / settled) * 100) : 100,
    issues: input.issues.length,
    doneIssues: input.issues.filter((issue) => issue.status === "done").length,
    builds: input.issues.filter((issue) => Boolean(issue.buildArtifactId)).length,
    spentMicros,
    budgetMicros,
  };
}

export function paperclipActivity(runs: PaperclipRun[], agents: PaperclipAgent[], limit = 16): PaperclipActivityEntry[] {
  const nameOf = (id: string | null) => agents.find((agent) => agent.id === id)?.name ?? "—";
  return runs.slice(0, limit).map((run) => ({
    id: run.id,
    agent: nameOf(run.agentId),
    status: run.status,
    when: run.finishedAt || run.startedAt || run.createdAt || "",
    summary: (run.summary || run.errorCode || "").slice(0, 140),
  }));
}

export function paperclipProjectStats(projects: PaperclipProject[], issues: PaperclipIssue[]): PaperclipProjectStat[] {
  return projects.map((project) => {
    const scoped = issues.filter((issue) => issue.projectId === project.id);
    return {
      id: project.id,
      name: project.name || "Project",
      total: scoped.length,
      done: scoped.filter((issue) => issue.status === "done").length,
    };
  });
}

export function paperclipIssueStatusCounts(issues: PaperclipIssue[]) {
  const counts: Record<string, number> = {};
  for (const issue of issues) counts[issue.status] = (counts[issue.status] ?? 0) + 1;
  return counts;
}

/**
 * The Builds gallery. Local Paperclip detects a shipped build by finding a
 * `/builds/*.html` link plus an image attachment on the issue. The hosted
 * equivalent is a committed tenant artifact, which is a stronger signal: the
 * bytes exist in tenant Cloud Storage and are reachable only through a signed
 * download.
 */
export function paperclipBuilds(input: { issues: PaperclipIssue[]; agents: PaperclipAgent[]; projects: PaperclipProject[] }): PaperclipBuild[] {
  const agentOf = (id: string | null) => input.agents.find((agent) => agent.id === id);
  const projectOf = (id: string | null) => input.projects.find((project) => project.id === id)?.name ?? "";
  return input.issues
    .filter((issue): issue is PaperclipIssue & { buildArtifactId: string } => Boolean(issue.buildArtifactId))
    .map((issue) => {
      const agent = agentOf(issue.assigneeAgentId);
      return {
        issueId: issue.id,
        identifier: issue.identifier,
        title: issue.title || "Untitled build",
        status: issue.status,
        agent: agent?.name ?? null,
        agentIcon: agent?.icon ?? "",
        project: projectOf(issue.projectId),
        createdAt: issue.completedAt || issue.createdAt,
        artifactId: issue.buildArtifactId,
        previewHtml: issue.buildPreviewHtml,
      };
    })
    .sort((left, right) => Date.parse(right.createdAt || "0") - Date.parse(left.createdAt || "0"));
}

export function paperclipCostRows(agents: PaperclipAgent[], runs: PaperclipRun[]): PaperclipCostRow[] {
  return sortPaperclipAgents(agents).map((agent) => {
    const scoped = runs.filter((run) => run.agentId === agent.id);
    return {
      id: agent.id,
      name: agent.name,
      provider: agent.provider,
      model: agent.model,
      budgetMicros: agent.budgetMicros,
      spentMicros: scoped.reduce((total, run) => total + run.costMicros, 0),
      runs: scoped.length,
    };
  });
}

/**
 * The prompt an agent run sends through the approved provider lane. It carries
 * the issue identity so the artifact is traceable back to a tenant issue, and
 * it never mentions a local path, port, or credential.
 */
export function paperclipRunPrompt(input: {
  company: PaperclipCompany;
  issue: Pick<PaperclipIssue, "identifier" | "title" | "description" | "priority">;
  agent: Pick<PaperclipAgent, "name" | "role" | "title"> | null;
  project: string;
}) {
  const persona = input.agent
    ? `You are ${input.agent.name}, the ${input.agent.title || input.agent.role || "assigned agent"} at ${input.company.name}.`
    : `You are an assigned build agent at ${input.company.name}.`;
  return [
    persona,
    `Work the following build issue to completion and ship one reviewable build.`,
    `Issue: ${input.issue.identifier} — ${input.issue.title}`,
    input.project ? `Project: ${input.project}` : "",
    `Priority: ${input.issue.priority}`,
    "Acceptance criteria and constraints:",
    input.issue.description || "No further constraints were supplied; deliver the clearest useful build for the title.",
    "",
    "Return one complete, self-contained HTML document in a single ```html code fence. Use inline CSS only. Do not include scripts, remote assets, credentials, or placeholders for work you did not perform.",
    "The document becomes this tenant's build artifact and must stand on its own.",
  ].filter(Boolean).join("\n").slice(0, 20_000);
}

export function paperclipRunSummary(run: { status: PaperclipRunStatus; errorCode?: string | null; artifactCommitted?: boolean }) {
  if (run.status === "succeeded") return run.artifactCommitted ? "Shipped a build artifact to tenant storage." : "Run completed without a committed artifact.";
  if (run.status === "failed") return `Run failed${run.errorCode ? `: ${run.errorCode}` : ""}.`;
  if (run.status === "running") return "Agent is working the issue in the hosted runtime.";
  if (run.status === "cancelled") return "Run was cancelled before an artifact was committed.";
  return "Queued for the approved hosted runner.";
}

export function paperclipTimeAgo(iso: string, now = Date.now()) {
  if (!iso) return "";
  const seconds = (now - Date.parse(iso)) / 1000;
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function paperclipFormatMicros(micros: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(micros / 1_000_000);
}

/**
 * Supabase returns a schema-cache error when the Paperclip migration has not
 * been applied yet. The UI must say that plainly rather than render an empty
 * board that looks like a working-but-idle company.
 */
export function paperclipSchemaMissing(status: number, body?: unknown) {
  // PostgREST answers 404/PGRST205 for an unknown table and 404/PGRST202 for an
  // unknown function. Both mean "migration not applied" on these fixed paths.
  if (status === 404) return true;
  if (status !== 400 && status !== 406) return false;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  return /client_paperclip|schema cache|PGRST205|PGRST202|does not exist/i.test(text);
}
