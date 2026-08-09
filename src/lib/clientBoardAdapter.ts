// Typed hosted contract for the two task boards.
//
// Local Kanban reads and writes a Hermes SQLite database through the `hermes
// kanban` CLI; local Agent Kanban is a browser-only board whose cards build an
// artifact. Cloud Run has neither a CLI nor a laptop database, so both become
// tenant rows sharing one table, each keeping its own stage vocabulary.

export const BOARD_KINDS = ["kanban", "agent-kanban"] as const;
export type BoardKind = (typeof BOARD_KINDS)[number];

export const KANBAN_STATUSES = ["triage", "todo", "ready", "running", "blocked", "done", "archived"] as const;
export const AGENT_KANBAN_STATUSES = ["queued", "building", "reviewing", "done", "rejected"] as const;
export const BOARD_EXECUTION_STATES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;

export type BoardStatus = (typeof KANBAN_STATUSES)[number] | (typeof AGENT_KANBAN_STATUSES)[number];
export type BoardExecutionState = (typeof BOARD_EXECUTION_STATES)[number];

export const BOARD_COLUMNS: Record<BoardKind, Array<{ key: BoardStatus; label: string }>> = {
  kanban: [
    { key: "triage", label: "Triage" },
    { key: "todo", label: "To do" },
    { key: "ready", label: "Ready" },
    { key: "running", label: "Running" },
    { key: "blocked", label: "Blocked" },
    { key: "done", label: "Done" },
  ],
  "agent-kanban": [
    { key: "queued", label: "Queued" },
    { key: "building", label: "Building" },
    { key: "reviewing", label: "Reviewing" },
    { key: "done", label: "Done" },
    { key: "rejected", label: "Rejected" },
  ],
};

export const BOARD_PRIORITIES = [
  { value: 0, label: "none" },
  { value: 1, label: "low" },
  { value: 2, label: "medium" },
  { value: 3, label: "high" },
  { value: 4, label: "urgent" },
] as const;

export type BoardTask = {
  id: string;
  board: BoardKind;
  title: string;
  body: string;
  status: BoardStatus;
  assignee: string | null;
  priority: number;
  labels: string[];
  buildArtifactId: string | null;
  buildPreviewHtml: string | null;
  executionState: BoardExecutionState | null;
  executionJobId: string | null;
  executionError: string | null;
  result: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BoardComment = { id: string; taskId: string; author: string | null; body: string; createdAt: string };
export type BoardEvent = { id: string; taskId: string; kind: string; detail: string; createdAt: string };

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

export function isBoardKind(value: string): value is BoardKind {
  return (BOARD_KINDS as readonly string[]).includes(value);
}

export function boardStatuses(board: BoardKind): readonly string[] {
  return board === "kanban" ? KANBAN_STATUSES : AGENT_KANBAN_STATUSES;
}

/** A status is only valid on the board that owns it. */
export function isBoardStatus(board: BoardKind, status: string) {
  return boardStatuses(board).includes(status);
}

export function defaultBoardStatus(board: BoardKind): BoardStatus {
  return board === "kanban" ? "triage" : "queued";
}

export function normalizeBoardTask(row: Record<string, unknown>): BoardTask {
  const board: BoardKind = row.board === "agent-kanban" ? "agent-kanban" : "kanban";
  const status = str(row.status, 20);
  return {
    id: str(row.id, 36),
    board,
    title: str(row.title, 240),
    body: str(row.body, 20000),
    status: (isBoardStatus(board, status) ? status : defaultBoardStatus(board)) as BoardStatus,
    assignee: nullableStr(row.assignee, 80),
    priority: Math.min(4, Math.max(0, Math.round(num(row.priority)))),
    labels: Array.isArray(row.labels) ? row.labels.filter((label): label is string => typeof label === "string").slice(0, 12) : [],
    buildArtifactId: nullableStr(row.build_artifact_id, 36),
    buildPreviewHtml: nullableStr(row.build_preview_html, 40000),
    executionState: typeof row.execution_state === "string" && (BOARD_EXECUTION_STATES as readonly string[]).includes(row.execution_state)
      ? row.execution_state as BoardExecutionState : null,
    executionJobId: nullableStr(row.execution_job_id, 36),
    executionError: nullableStr(row.execution_error, 120),
    result: nullableStr(row.result, 20000),
    startedAt: nullableStr(row.started_at, 40),
    completedAt: nullableStr(row.completed_at, 40),
    createdAt: str(row.created_at, 40),
    updatedAt: str(row.updated_at, 40),
  };
}

export function normalizeBoardComment(row: Record<string, unknown>): BoardComment {
  return {
    id: str(row.id, 36),
    taskId: str(row.task_id, 36),
    author: nullableStr(row.author, 80),
    body: str(row.body, 10000),
    createdAt: str(row.created_at, 40),
  };
}

export function normalizeBoardEvent(row: Record<string, unknown>): BoardEvent {
  return {
    id: String(row.id ?? ""),
    taskId: str(row.task_id, 36),
    kind: str(row.kind, 60),
    detail: str(row.detail, 2000),
    createdAt: str(row.created_at, 40),
  };
}

export function boardColumnTasks(tasks: BoardTask[], status: BoardStatus) {
  return tasks
    .filter((task) => task.status === status)
    .sort((left, right) => {
      if (left.priority !== right.priority) return right.priority - left.priority;
      return Date.parse(right.createdAt || "0") - Date.parse(left.createdAt || "0");
    });
}

export function boardCounts(tasks: BoardTask[]) {
  const counts: Record<string, number> = {};
  for (const task of tasks) counts[task.status] = (counts[task.status] ?? 0) + 1;
  return counts;
}

/**
 * Only Agent Kanban cards build an artifact, and only when nothing is already
 * running for that card.
 */
export function boardCanBuild(task: Pick<BoardTask, "board" | "status" | "executionState">) {
  return task.board === "agent-kanban"
    && (task.status === "queued" || task.status === "building")
    && task.executionState !== "queued" && task.executionState !== "running";
}

export function boardBuildPrompt(task: Pick<BoardTask, "title" | "body">) {
  return [
    "You are the Veloce agent board builder. Build the card into one reviewable deliverable.",
    `Card: ${task.title}`,
    task.body ? `Brief:\n${task.body}` : "No further brief was supplied; deliver the clearest useful build for the title.",
    "",
    "Return one complete, self-contained HTML document in a single ```html code fence. Use inline CSS only. Do not include scripts, remote assets, credentials, or placeholders for work you did not perform.",
    "The document becomes this tenant's deliverable and must stand on its own.",
  ].join("\n").slice(0, 20_000);
}

export function boardPriorityLabel(priority: number) {
  return BOARD_PRIORITIES.find((entry) => entry.value === priority)?.label ?? "medium";
}

export function boardStatusLabel(task: BoardTask) {
  if (task.executionState === "queued") return "Queued for the hosted runner";
  if (task.executionState === "running") return "Runner is working";
  if (task.executionState === "failed") return `Run failed${task.executionError ? `: ${task.executionError}` : ""}`;
  if (task.buildArtifactId) return "Built with an artifact";
  return task.status;
}

export function boardTimeAgo(iso: string, now = Date.now()) {
  const minutes = Math.floor((now - Date.parse(iso)) / 60000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export function boardSchemaMissing(status: number, body?: unknown) {
  if (status === 404) return true;
  if (status !== 400 && status !== 406) return false;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  return /client_board|schema cache|PGRST205|PGRST202|does not exist/i.test(text);
}
