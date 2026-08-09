import { expect, test } from "@playwright/test";
import {
  boardCanBuild, boardColumnTasks, boardCounts, boardPriorityLabel, boardSchemaMissing, boardStatusLabel,
  defaultBoardStatus, isBoardKind, isBoardStatus, normalizeBoardTask, type BoardTask,
} from "../src/lib/clientBoardAdapter";

function task(overrides: Partial<BoardTask> & { id: string }): BoardTask {
  return {
    board: "kanban", title: "Task", body: "", status: "triage", assignee: null, priority: 2, labels: [],
    buildArtifactId: null, buildPreviewHtml: null, executionState: null, executionJobId: null,
    executionError: null, result: null, startedAt: null, completedAt: null,
    createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z", ...overrides,
  };
}

test("each board owns its own status vocabulary", () => {
  expect(isBoardKind("kanban")).toBe(true);
  expect(isBoardKind("nope")).toBe(false);
  expect(isBoardStatus("kanban", "triage")).toBe(true);
  expect(isBoardStatus("kanban", "reviewing")).toBe(false);
  expect(isBoardStatus("agent-kanban", "reviewing")).toBe(true);
  expect(isBoardStatus("agent-kanban", "triage")).toBe(false);
  // 'done' is the one status both boards share.
  expect(isBoardStatus("kanban", "done")).toBe(true);
  expect(isBoardStatus("agent-kanban", "done")).toBe(true);
  expect(defaultBoardStatus("kanban")).toBe("triage");
  expect(defaultBoardStatus("agent-kanban")).toBe("queued");
});

test("only agent-kanban cards build, and never while a run is in flight", () => {
  expect(boardCanBuild(task({ id: "1", board: "kanban", status: "todo" }))).toBe(false);
  expect(boardCanBuild(task({ id: "2", board: "agent-kanban", status: "queued" }))).toBe(true);
  expect(boardCanBuild(task({ id: "3", board: "agent-kanban", status: "building" }))).toBe(true);
  expect(boardCanBuild(task({ id: "4", board: "agent-kanban", status: "done" }))).toBe(false);
  expect(boardCanBuild(task({ id: "5", board: "agent-kanban", status: "queued", executionState: "running" }))).toBe(false);
});

test("columns order by priority then recency", () => {
  const tasks = [
    task({ id: "a", status: "todo", title: "low old", priority: 1, createdAt: "2026-08-01T00:00:00.000Z" }),
    task({ id: "b", status: "todo", title: "urgent", priority: 4, createdAt: "2026-07-01T00:00:00.000Z" }),
    task({ id: "c", status: "todo", title: "low new", priority: 1, createdAt: "2026-08-08T00:00:00.000Z" }),
    task({ id: "d", status: "done", title: "elsewhere" }),
  ];
  expect(boardColumnTasks(tasks, "todo").map((entry) => entry.title)).toEqual(["urgent", "low new", "low old"]);
  expect(boardCounts(tasks)).toEqual({ todo: 3, done: 1 });
});

test("a status from the wrong board is normalized back to that board's default", () => {
  // A kanban row carrying an agent-kanban status must not render in a column
  // that board does not have.
  const normalized = normalizeBoardTask({ id: "x", board: "kanban", status: "reviewing", priority: "9" });
  expect(normalized.status).toBe("triage");
  expect(normalized.priority).toBe(4);
  const agent = normalizeBoardTask({ id: "y", board: "agent-kanban", status: "queued", labels: ["a", 2] });
  expect(agent.status).toBe("queued");
  expect(agent.labels).toEqual(["a"]);
});

test("status labels surface the real run state", () => {
  expect(boardStatusLabel(task({ id: "1", executionState: "failed", executionError: "budget_exceeded" }))).toContain("budget_exceeded");
  expect(boardStatusLabel(task({ id: "2", executionState: "running" }))).toContain("working");
  expect(boardStatusLabel(task({ id: "3", buildArtifactId: "a" }))).toContain("artifact");
  expect(boardPriorityLabel(4)).toBe("urgent");
  expect(boardPriorityLabel(99)).toBe("medium");
});

test("detects an unapplied boards migration", () => {
  expect(boardSchemaMissing(404)).toBe(true);
  expect(boardSchemaMissing(400, { code: "PGRST205", message: "client_board_tasks" })).toBe(true);
  expect(boardSchemaMissing(401)).toBe(false);
});
