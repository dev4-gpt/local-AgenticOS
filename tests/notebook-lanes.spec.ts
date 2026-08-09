import { expect, test } from "@playwright/test";
import {
  NOTEBOOK_GROUNDING_RULE,
  NOTEBOOK_STUDIO_OUTPUTS,
  notebookChatPrompt,
  notebookSourceBlock,
  notebookStudioGoal,
  notebookStudioOutput,
  type NotebookSource,
} from "../src/lib/clientNotebookLanes";
import { isClientWorkspaceSurface } from "../src/lib/clientWorkspaceExecution";

const SOURCES: NotebookSource[] = [
  { id: "a", title: "Pricing research", content: "Tiered pricing beat flat pricing in the trial." },
  { id: "b", title: "Support notes", content: "Customers ask for annual billing." },
];

test("the studio lane queues a surface the runner actually accepts", () => {
  // A surface the worker rejects would queue a job that can never complete.
  expect(isClientWorkspaceSurface("notebook")).toBe(true);
});

test("both grounded lanes carry the no-fabrication rule", () => {
  // Nothing in this lane crawls or searches, so the model is told so explicitly.
  expect(notebookChatPrompt({ question: "What did pricing show?", sources: SOURCES })).toContain(NOTEBOOK_GROUNDING_RULE);
  expect(notebookStudioGoal({ output: "summary", sources: SOURCES })).toContain(NOTEBOOK_GROUNDING_RULE);
});

test("the chat prompt carries the selected sources and the question", () => {
  const prompt = notebookChatPrompt({ question: "Which billing period do customers want?", sources: SOURCES });
  expect(prompt).toContain("Pricing research");
  expect(prompt).toContain("Customers ask for annual billing.");
  expect(prompt).toContain("Which billing period do customers want?");
});

test("an empty question produces no prompt at all", () => {
  expect(notebookChatPrompt({ question: "   ", sources: SOURCES })).toBe("");
});

test("a question with no sources still says so rather than inviting free recall", () => {
  const prompt = notebookChatPrompt({ question: "What happened?", sources: [] });
  expect(prompt).toContain("No sources were selected");
  expect(prompt).toContain(NOTEBOOK_GROUNDING_RULE);
});

test("truncated sources are marked as truncated", () => {
  const long: NotebookSource[] = [{ id: "l", title: "Long", content: "x".repeat(9_000) }];
  const block = notebookSourceBlock(long, 2_000);
  expect(block).toContain("[source truncated]");
  // A shortened source must never be handed over as though it were whole.
  expect(block.length).toBeLessThan(9_000);
});

test("the studio goal stays inside the executions route's goal limit", () => {
  const heavy: NotebookSource[] = Array.from({ length: 12 }, (_, index) => ({ id: String(index), title: `Source ${index}`, content: "y".repeat(5_000) }));
  const goal = notebookStudioGoal({ output: "briefing", instruction: "z".repeat(500), sources: heavy });
  // The route slices at 10,000; exceeding it here would silently drop the rule.
  expect(goal.length).toBeLessThanOrEqual(10_000);
});

test("each studio output is distinct and none promises a media provider's job", () => {
  const labels = new Set(NOTEBOOK_STUDIO_OUTPUTS.map((item) => item.label));
  const goals = new Set(NOTEBOOK_STUDIO_OUTPUTS.map((item) => item.goal));
  expect(labels.size).toBe(NOTEBOOK_STUDIO_OUTPUTS.length);
  expect(goals.size).toBe(NOTEBOOK_STUDIO_OUTPUTS.length);
  for (const item of NOTEBOOK_STUDIO_OUTPUTS) {
    expect(item.goal.length).toBeGreaterThan(40);
    // Audio and slides need a provider this lane does not have.
    expect(item.label.toLowerCase()).not.toMatch(/audio|podcast|video|slide|presentation/);
  }
});

test("an unknown studio output falls back rather than queueing an empty goal", () => {
  expect(notebookStudioOutput("not-a-real-output")).toBe("outline");
  expect(notebookStudioGoal({ output: notebookStudioOutput("nonsense"), sources: SOURCES }).length).toBeGreaterThan(40);
});
