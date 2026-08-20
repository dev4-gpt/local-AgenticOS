import { expect, test } from "@playwright/test";
import { measureStandingInstructionBudget, standingInstructionSegmentsFromMessages, STANDING_INSTRUCTION_BUDGET_VERSION } from "../src/lib/instructionBudget";

test("standing instruction measurement is deterministic and redacted", () => {
  const segments = standingInstructionSegmentsFromMessages([
    { role: "system", content: "Tenant isolation policy with private content." },
    { role: "user", content: "Current request must not be counted as standing policy." },
  ]);
  const first = measureStandingInstructionBudget({ segments });
  const second = measureStandingInstructionBudget({ segments });
  expect(first).toEqual(second);
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  expect(first.evidence.policyVersion).toBe(STANDING_INSTRUCTION_BUDGET_VERSION);
  expect(first.evidence.mandatoryChars).toBe(segments[0].content.length);
  expect(JSON.stringify(first.evidence)).not.toContain("private content");
});

test("the budget reports line and character overflow without changing safety text", () => {
  const segments = [{ id: "policy-core", kind: "policy" as const, mandatory: true, content: "keep this policy\nexactly" }];
  const result = measureStandingInstructionBudget({ segments, maxChars: 5, maxLines: 1 });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.evidence.withinBudget).toBe(false);
  expect(result.evidence.totalLines).toBe(2);
  expect(result.evidence.mandatoryChars).toBe(segments[0].content.length);
});

test("invalid or oversized evidence input fails closed and does not expose content", () => {
  const result = measureStandingInstructionBudget({
    segments: [{ id: "bad id", kind: "policy", content: "secret private instructions" }],
  });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toBe("instruction_budget_input_invalid");
  expect(JSON.stringify(result.evidence)).not.toContain("secret private instructions");
});
