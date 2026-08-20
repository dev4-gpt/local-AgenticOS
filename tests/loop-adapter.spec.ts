import { expect, test } from "@playwright/test";
import {
  LOOP_MAX_ROUNDS, loopBuilderPrompt, loopFinalStatus, loopJudgePrompt, loopShouldContinue,
  loopStatusLabel, loopSchemaMissing, normalizeLoopRound, normalizeLoopRun, parseLoopVerdict,
  type LoopRun,
} from "../src/lib/clientLoopAdapter";

function run(overrides: Partial<LoopRun> & { id: string }): LoopRun {
  return {
    goal: "g", title: "Loop", status: "queued", jobId: null, builderProvider: null, builderModel: null,
    judgeProvider: null, judgeModel: null, maxRounds: 3, roundsCompleted: 0, bestScore: null,
    finalSummary: null, buildArtifactId: null, buildPreviewHtml: null, costMicros: 0, errorCode: null,
    createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z", ...overrides,
  };
}

test("parses the section verdict format", () => {
  const verdict = parseLoopVerdict([
    "PASS: no",
    "SCORE: 62",
    "SUMMARY: Close, but the contrast fails and the layout breaks on mobile.",
    "--- ISSUES ---",
    "- Body text contrast is below 4.5:1",
    "- Layout overflows below 380px",
  ].join("\n"));
  expect(verdict?.pass).toBe(false);
  expect(verdict?.score).toBe(62);
  expect(verdict?.issues).toHaveLength(2);
  expect(verdict?.issues[0]).toContain("contrast");
  expect(verdict?.summary).toContain("Close");
});

test("a passing verdict carries no issues", () => {
  const verdict = parseLoopVerdict("PASS: yes\nSCORE: 94\nSUMMARY: Meets the goal.\n--- ISSUES ---\n");
  expect(verdict?.pass).toBe(true);
  expect(verdict?.score).toBe(94);
  expect(verdict?.issues).toEqual([]);
});

test("still reads the older JSON verdict shape", () => {
  const verdict = parseLoopVerdict('Here is my verdict: {"pass": true, "score": 88, "issues": [], "summary": "Good."}');
  expect(verdict?.pass).toBe(true);
  expect(verdict?.score).toBe(88);
});

test("reviewed-plan provider mode is not mistaken for a passing judge verdict", () => {
  expect(parseLoopVerdict(JSON.stringify({ type: "reviewed_plan", tool: "propose_reviewed_plan", plan: { summary: "needs review", steps: [{ title: "Review" }] } }))).toBeNull();
});

test("an unreadable verdict is null so it is never counted as a pass", () => {
  expect(parseLoopVerdict("I think this looks pretty good overall!")).toBeNull();
  expect(parseLoopVerdict("")).toBeNull();
});

test("scores are clamped into range", () => {
  expect(parseLoopVerdict("PASS: no\nSCORE: 999\nSUMMARY: x\n--- ISSUES ---\n- y")?.score).toBe(100);
  expect(parseLoopVerdict('{"pass":false,"score":-40,"issues":[],"summary":"x"}')?.score).toBe(0);
});

test("the loop stops on a pass or at the cap", () => {
  expect(loopShouldContinue({ round: 1, maxRounds: 3, passed: false })).toBe(true);
  expect(loopShouldContinue({ round: 1, maxRounds: 3, passed: true })).toBe(false);
  expect(loopShouldContinue({ round: 3, maxRounds: 3, passed: false })).toBe(false);
  expect(loopFinalStatus({ passed: true, rounds: 2, maxRounds: 3 })).toBe("passed");
  expect(loopFinalStatus({ passed: false, rounds: 3, maxRounds: 3 })).toBe("exhausted");
  expect(loopFinalStatus({ passed: false, rounds: 1, maxRounds: 3 })).toBe("failed");
  expect(loopFinalStatus({ passed: false, rounds: 1, maxRounds: 3, stopReason: "budget-exhausted" })).toBe("exhausted");
});

test("the builder is told to fix exactly the judge's issues and nothing else", () => {
  const first = loopBuilderPrompt({ goal: "Ship a pricing page", previous: "", issues: [] });
  expect(first).toContain("No draft yet");
  expect(first).toContain("```html");
  const revision = loopBuilderPrompt({ goal: "Ship a pricing page", previous: "<html>old</html>", issues: ["Contrast too low"] });
  expect(revision).toContain("REJECTED");
  expect(revision).toContain("Contrast too low");
  expect(revision).toContain("change nothing else that already works");
  expect(revision).toContain("<html>old</html>");
});

test("the judge prompt is adversarial, bounded, and free of local references", () => {
  const prompt = loopJudgePrompt({ goal: "Ship it", artifact: "x".repeat(30_000) });
  expect(prompt).toContain("VERIFICATION GATE");
  expect(prompt).toContain("--- ISSUES ---");
  // The artifact is truncated so a huge draft cannot blow the prompt budget.
  expect(prompt.length).toBeLessThanOrEqual(20_000);
  expect(prompt).not.toMatch(/localhost|Ollama|Hermes|vault/i);
});

test("normalizers clamp rounds and scores from the row", () => {
  const normalized = normalizeLoopRun({ id: "r", status: "weird", max_rounds: 99, rounds_completed: "2", best_score: "77" });
  expect(normalized.status).toBe("queued");
  expect(normalized.maxRounds).toBe(LOOP_MAX_ROUNDS);
  expect(normalized.roundsCompleted).toBe(2);
  expect(normalized.bestScore).toBe(77);

  const round = normalizeLoopRound({ id: "x", round: "2", passed: "yes", issues: ["a", 5], score: "50" });
  expect(round.round).toBe(2);
  // Only a real boolean true counts as a pass.
  expect(round.passed).toBe(false);
  expect(round.issues).toEqual(["a"]);
});

test("status labels describe where the loop actually stopped", () => {
  expect(loopStatusLabel(run({ id: "1", status: "running", roundsCompleted: 1, maxRounds: 3 }))).toBe("Round 2 of 3");
  expect(loopStatusLabel(run({ id: "2", status: "passed", roundsCompleted: 2 }))).toContain("Passed at round 2");
  expect(loopStatusLabel(run({ id: "3", status: "exhausted", maxRounds: 3 }))).toContain("3-round cap");
  expect(loopStatusLabel(run({ id: "4", status: "failed", errorCode: "budget_exceeded" }))).toContain("budget_exceeded");
});

test("detects an unapplied loop migration", () => {
  expect(loopSchemaMissing(404)).toBe(true);
  expect(loopSchemaMissing(400, { code: "PGRST205", message: "client_loop_runs" })).toBe(true);
  expect(loopSchemaMissing(401)).toBe(false);
});
