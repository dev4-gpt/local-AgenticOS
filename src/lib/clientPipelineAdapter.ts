// Typed hosted Pipeline contract.

import { governedPipelineGuardrails } from "@/lib/integrationGovernance";
import { contentOsVideoPilotGuardrails } from "@/lib/contentOsVideoPilot";
//
// The local pipeline stores each item as a Markdown file with YAML frontmatter
// in an Obsidian vault, and runs three separate provider calls to classify,
// plan, and break work into tasks. The hosted pipeline keeps the same funnel and
// the same fields over tenant rows, and shapes an item in one structured call so
// the round fits the ledger's one-reservation-per-job contract.

export const PIPELINE_STAGES = ["inbox", "shaping", "review", "building", "shipped", "rejected"] as const;
export const PIPELINE_ROUTES = ["project", "action", "idea", "reference", "escalate"] as const;
export const PIPELINE_EXECUTION_STATES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export type PipelineRoute = (typeof PIPELINE_ROUTES)[number];
export type PipelineExecutionState = (typeof PIPELINE_EXECUTION_STATES)[number];

/** The visible funnel, matching the local board's columns and copy. */
export const PIPELINE_COLUMNS: Array<{ key: PipelineStage; label: string; blurb: string }> = [
  { key: "inbox", label: "Capture", blurb: "Raw input — no structure required" },
  { key: "shaping", label: "Classify & Route", blurb: "Agents decide what it is" },
  { key: "review", label: "Human Gate", blurb: "The one checkpoint — approve or reject" },
  { key: "building", label: "Execute", blurb: "The hosted runner builds it" },
  { key: "shipped", label: "Shipped", blurb: "Done" },
];

export type PipelineItem = {
  id: string;
  slug: string;
  title: string;
  stage: PipelineStage;
  route: PipelineRoute | null;
  confidence: number | null;
  tags: string[];
  idea: string;
  classification: string | null;
  plan: string | null;
  tasks: string | null;
  pinned: boolean;
  buildArtifactId: string | null;
  buildPreviewHtml: string | null;
  executionState: PipelineExecutionState | null;
  executionJobId: string | null;
  executionError: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PipelineShapeResult = {
  route: PipelineRoute;
  title: string;
  confidence: number;
  tags: string[];
  classification: string;
  plan: string;
  tasks: string;
};

function str(value: unknown, max = 240) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function nullableStr(value: unknown, max = 240) {
  const text = str(value, max);
  return text ? text : null;
}

function oneOf<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (allowed as readonly string[]).includes(text) ? text as T[number] : fallback;
}

export function pipelineSlugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

/** Slug must be unique per tenant; a short suffix keeps a repeated title usable. */
export function pipelineUniqueSlug(title: string, taken: string[]) {
  const base = pipelineSlugify(title) || "idea";
  if (!taken.includes(base)) return base;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base.slice(0, 56)}-${index}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base.slice(0, 52)}-${Date.now().toString(36).slice(-6)}`;
}

export function normalizePipelineItem(row: Record<string, unknown>): PipelineItem {
  const confidence = row.confidence === null || row.confidence === undefined ? null : Number(row.confidence);
  return {
    id: str(row.id, 36),
    slug: str(row.slug, 61),
    title: str(row.title, 240),
    stage: oneOf(row.stage, PIPELINE_STAGES, "inbox"),
    route: typeof row.route === "string" && (PIPELINE_ROUTES as readonly string[]).includes(row.route) ? row.route as PipelineRoute : null,
    confidence: Number.isFinite(confidence) ? confidence : null,
    tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 12) : [],
    idea: str(row.idea, 20000),
    classification: nullableStr(row.classification, 8000),
    plan: nullableStr(row.plan, 20000),
    tasks: nullableStr(row.tasks, 20000),
    pinned: row.pinned === true,
    buildArtifactId: nullableStr(row.build_artifact_id, 36),
    buildPreviewHtml: nullableStr(row.build_preview_html, 40000),
    executionState: typeof row.execution_state === "string" && (PIPELINE_EXECUTION_STATES as readonly string[]).includes(row.execution_state) ? row.execution_state as PipelineExecutionState : null,
    executionJobId: nullableStr(row.execution_job_id, 36),
    executionError: nullableStr(row.execution_error, 120),
    decidedAt: nullableStr(row.decided_at, 40),
    createdAt: str(row.created_at, 40),
    updatedAt: str(row.updated_at, 40),
  };
}

/**
 * One structured shaping call replaces the local classify → plan → tasks chain.
 * Asking for a single JSON object keeps the job to one budget reservation and
 * makes the result parseable without three round trips.
 */
export function pipelineShapePrompt(input: { idea: string; title: string }) {
  const governance = governedPipelineGuardrails(`${input.title}\n${input.idea}`);
  // Deliberately line-oriented rather than JSON. The plan and tasks are
  // Markdown with real newlines; asking for those inside JSON string values
  // makes models emit unescaped newlines and the parse fails.
  return [
    "You are the Veloce pipeline shaping agent. Classify an incoming idea and prepare it for a human approval gate.",
    "",
    `Working title: ${input.title}`,
    "Idea as captured:",
    input.idea,
    "",
    "Reply in exactly this format, with these headings on their own lines and nothing before or after:",
    "",
    "ROUTE: <project|action|idea|reference|escalate>",
    "TITLE: <a sharper title, at most 80 characters>",
    "CONFIDENCE: <a number between 0 and 1>",
    "TAGS: <2 to 5 short lowercase tags, comma separated>",
    "--- CLASSIFICATION ---",
    "<two or three sentences on what this is and why that route fits>",
    "--- PLAN ---",
    "<3 to 6 Markdown bullet steps>",
    "--- TASKS ---",
    "<3 to 8 Markdown checklist items, each starting \"- [ ] \">",
    "",
    "Route meanings: project = multi-step build worth its own workstream; action = a single concrete task;",
    "idea = worth keeping but not yet actionable; reference = information to file; escalate = needs a human decision first.",
    "Do not invent facts about the business. Do not include credentials.",
    governance,
    contentOsVideoPilotGuardrails(`${input.title}\n${input.idea}`),
  ].join("\n").slice(0, 20_000);
}

function parseShapeSections(output: string): PipelineShapeResult | null {
  const route = output.match(/^\s*ROUTE:\s*(.+)$/im)?.[1]?.trim().toLowerCase() ?? "";
  if (!(PIPELINE_ROUTES as readonly string[]).includes(route)) return null;
  const section = (name: string) => {
    const match = output.match(new RegExp(`---\\s*${name}\\s*---\\s*\\n([\\s\\S]*?)(?=\\n---\\s*[A-Z]+\\s*---|$)`, "i"));
    return match?.[1]?.trim() ?? "";
  };
  const classification = section("CLASSIFICATION").slice(0, 8000);
  const plan = section("PLAN").slice(0, 20000);
  const tasks = section("TASKS").slice(0, 20000);
  if (!classification || !plan || !tasks) return null;
  const rawConfidence = Number(output.match(/^\s*CONFIDENCE:\s*([0-9.]+)/im)?.[1]);
  return {
    route: route as PipelineRoute,
    title: (output.match(/^\s*TITLE:\s*(.+)$/im)?.[1]?.trim() ?? "").slice(0, 80) || "Untitled idea",
    confidence: Number.isFinite(rawConfidence) ? Math.min(1, Math.max(0, rawConfidence)) : 0.5,
    tags: (output.match(/^\s*TAGS:\s*(.+)$/im)?.[1] ?? "")
      .split(",").map((tag) => tag.trim().toLowerCase().replace(/^["'#]|["']$/g, "").slice(0, 32)).filter(Boolean).slice(0, 5),
    classification,
    plan,
    tasks,
  };
}

/**
 * Parses the shaping response. Returns null rather than a half-filled item when
 * the model did not produce usable JSON, so the caller can fail the job
 * honestly instead of writing junk into the tenant board.
 */
export function parsePipelineShape(output: string): PipelineShapeResult | null {
  // Sections first, since that is what the prompt asks for. JSON stays as a
  // fallback so a model that answers in the older shape still works.
  const sections = parseShapeSections(output);
  if (sections) return sections;
  const fence = output.match(/```(?:json)?\s*\n([\s\S]*?)```/i)?.[1] ?? output;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fence.trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  const route = typeof value.route === "string" ? value.route.trim().toLowerCase() : "";
  if (!(PIPELINE_ROUTES as readonly string[]).includes(route)) return null;
  const classification = str(value.classification, 8000).trim();
  const plan = str(value.plan, 20000).trim();
  const tasks = str(value.tasks, 20000).trim();
  if (!classification || !plan || !tasks) return null;
  const rawConfidence = Number(value.confidence);
  return {
    route: route as PipelineRoute,
    title: str(value.title, 80).trim() || "Untitled idea",
    confidence: Number.isFinite(rawConfidence) ? Math.min(1, Math.max(0, rawConfidence)) : 0.5,
    tags: Array.isArray(value.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim().toLowerCase().slice(0, 32)).filter(Boolean).slice(0, 5)
      : [],
    classification,
    plan,
    tasks,
  };
}

/** The Execute-stage prompt. Reuses the artifact lane Paperclip already proved. */
export function pipelineBuildPrompt(item: Pick<PipelineItem, "title" | "idea" | "plan" | "tasks">) {
  return [
    "You are the Veloce pipeline execution agent. Build the approved item into one reviewable deliverable.",
    `Item: ${item.title}`,
    "Original idea:",
    item.idea,
    item.plan ? `Approved plan:\n${item.plan}` : "",
    item.tasks ? `Tasks:\n${item.tasks}` : "",
    "",
    "Return one complete, self-contained HTML document in a single ```html code fence. Use inline CSS only. Do not include scripts, remote assets, credentials, or placeholders for work you did not perform.",
    "The document becomes this tenant's deliverable and must stand on its own.",
  ].filter(Boolean).join("\n").slice(0, 20_000);
}

/**
 * The human gate is the one transition a job may never make on its own.
 * Everything else follows the funnel in order.
 */
export function pipelineStageAfterShaping(): PipelineStage {
  return "review";
}

export function pipelineCanApprove(item: Pick<PipelineItem, "stage">) {
  return item.stage === "review";
}

export function pipelineCanShape(item: Pick<PipelineItem, "stage" | "executionState">) {
  return (item.stage === "inbox" || item.stage === "shaping")
    && item.executionState !== "queued" && item.executionState !== "running";
}

export function pipelineCanBuild(item: Pick<PipelineItem, "stage" | "executionState">) {
  return item.stage === "building"
    && item.executionState !== "queued" && item.executionState !== "running";
}

export function pipelineColumnItems(items: PipelineItem[], stage: PipelineStage) {
  return items
    .filter((item) => item.stage === stage)
    .sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      return Date.parse(right.createdAt || "0") - Date.parse(left.createdAt || "0");
    });
}

export function pipelineCounts(items: PipelineItem[]) {
  const counts: Record<string, number> = {};
  for (const item of items) counts[item.stage] = (counts[item.stage] ?? 0) + 1;
  return counts;
}

export function pipelineStatusLabel(item: PipelineItem) {
  if (item.executionState === "queued") return "Queued for the hosted runner";
  if (item.executionState === "running") return "Runner is working";
  if (item.executionState === "failed") return `Run failed${item.executionError ? `: ${item.executionError}` : ""}`;
  if (item.stage === "review") return "Waiting on the human gate";
  if (item.stage === "shipped") return item.buildArtifactId ? "Shipped with an artifact" : "Marked shipped";
  if (item.stage === "rejected") return "Rejected at the gate";
  if (item.stage === "shaping") return "Shaping";
  return "Captured";
}

export function pipelineTimeAgo(iso: string, now = Date.now()) {
  const minutes = Math.floor((now - Date.parse(iso)) / 60000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export function pipelineSchemaMissing(status: number, body?: unknown) {
  if (status === 404) return true;
  if (status !== 400 && status !== 406) return false;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  return /client_pipeline|schema cache|PGRST205|PGRST202|does not exist/i.test(text);
}
