import { expect, test } from "@playwright/test";
import { resolveCapabilityTraits, missingRequiredTraits } from "../src/lib/capabilityTraits";
import { LOOP_MAX_ROUNDS, type LoopRound } from "../src/lib/clientLoopAdapter";
import {
  CLIENT_LOOP_CONTRACTS,
  LOOP_PLAYBOOKS,
  QUALITY_STREAK_TARGET,
  loopContractById,
  loopPermitsStop,
  validateLoopContract,
  type ClientLoopContract,
} from "../src/lib/clientLoopRegistry";
import {
  detectLoopSpin,
  emptyLoopLedger,
  ledgerFromRounds,
  loopBudgetVerdict,
  loopStopDecision,
  recordRoundCost,
  summarizeLoopCost,
} from "../src/lib/loopCostLedger";
import { allClientPlaybooks, clientReadyPlaybooks } from "../src/lib/clientPlaybooks";

function round(overrides: Partial<LoopRound> = {}): LoopRound {
  return {
    id: "r", runId: "run", round: 1, passed: false, score: 50, issues: ["a"],
    summary: "", artifactChars: 0, costMicros: 0, errorCode: null, createdAt: "",
    ...overrides,
  };
}

test("every named loop contract satisfies its own validator", () => {
  for (const contract of CLIENT_LOOP_CONTRACTS) {
    expect(validateLoopContract(contract), `${contract.id} must validate`).toEqual([]);
  }
  expect(CLIENT_LOOP_CONTRACTS.length).toBeGreaterThan(0);
  expect(loopContractById("anti-spin")?.origin).toBe("new");
  expect(loopContractById("plan-generate-verify-fix")?.origin).toBe("existing");
  expect(loopContractById("not-a-loop")).toBeNull();
});

test("the contract validator actually rejects, rather than passing everything", () => {
  // A validator never observed failing is not a verified gate.
  const base = CLIENT_LOOP_CONTRACTS[0];
  const overCap: ClientLoopContract = { ...base, maxRounds: LOOP_MAX_ROUNDS + 1 };
  expect(validateLoopContract(overCap).join(" ")).toContain("maxRounds");

  const unbudgeted: ClientLoopContract = {
    ...base,
    requiredTraits: base.requiredTraits.filter((trait) => trait !== "budget"),
  };
  expect(validateLoopContract(unbudgeted).join(" ")).toContain("budget");

  const uncosted: ClientLoopContract = {
    ...base,
    requiredTraits: base.requiredTraits.filter((trait) => trait !== "cost-accounting"),
  };
  expect(validateLoopContract(uncosted).join(" ")).toContain("cost-accounting");

  const unstoppable: ClientLoopContract = {
    ...base,
    stopConditions: base.stopConditions.filter((stop) => stop !== "budget-exhausted"),
  };
  expect(validateLoopContract(unstoppable).join(" ")).toContain("budget-exhausted");

  const orphanExisting: ClientLoopContract = { ...base, origin: "existing", implementedBy: undefined };
  expect(validateLoopContract(orphanExisting).join(" ")).toContain("implemented");
});

test("a loop may not stop for a reason its contract does not permit", () => {
  const streak = loopContractById("quality-streak")!;
  expect(loopPermitsStop(streak, "quality-streak")).toBe(true);
  // A single pass must not end a streak loop -- that is the whole point of it.
  expect(loopPermitsStop(streak, "verdict-pass")).toBe(false);
  expect(loopPermitsStop(streak, "budget-exhausted")).toBe(true);
});

test("loop playbooks reach the router and claim no trait the capability cannot resolve", () => {
  const ids = new Set(allClientPlaybooks().map((playbook) => playbook.id));
  for (const playbook of LOOP_PLAYBOOKS) expect(ids.has(playbook.id)).toBe(true);

  const onLoopSurface = clientReadyPlaybooks(["loop-run"], "loop");
  expect(onLoopSurface.length).toBeGreaterThan(0);

  for (const playbook of LOOP_PLAYBOOKS) {
    const bundle = resolveCapabilityTraits({ capability: "loop-run", surface: "loop" });
    expect(
      missingRequiredTraits(bundle, playbook.requiredTraits),
      `${playbook.id} declares a trait loop-run does not resolve`,
    ).toEqual([]);
  }
});

test("cost-accounting is resolved for provider-bound capabilities and fails closed", () => {
  const bundle = resolveCapabilityTraits({ capability: "loop-run" });
  const cost = bundle.traits.find((trait) => trait.id === "cost-accounting");
  expect(cost, "loop-run must carry cost-accounting").toBeTruthy();
  expect(cost!.onFailure).toBe("blocked");
  expect(bundle.policy.failClosedTraits).toContain("cost-accounting");

  // A capability that does not spend does not need it.
  expect(resolveCapabilityTraits({ capability: "notebook" }).traits.map((t) => t.id)).not.toContain("cost-accounting");
});

test("the ledger separates estimate, actual, savings and retry spend", () => {
  let ledger = emptyLoopLedger(1000);
  ledger = recordRoundCost(ledger, { actualMicros: 120, estimatedMicros: 100, compressionSavedMicros: 30, retryMicros: 20 });
  ledger = recordRoundCost(ledger, { actualMicros: 180, estimatedMicros: 100, compressionSavedMicros: 10, retryMicros: 0 });

  const summary = summarizeLoopCost(ledger);
  expect(summary.spentMicros).toBe(300);
  expect(summary.varianceMicros).toBe(100);
  expect(summary.variancePercent).toBe(50);
  expect(summary.savedMicros).toBe(40);
  expect(summary.retryMicros).toBe(20);
  expect(summary.rounds).toBe(2);
  expect(summary.meanRoundMicros).toBe(150);

  // Ledgers are immutable: recording does not mutate the ledger passed in.
  const before = emptyLoopLedger(500);
  recordRoundCost(before, { actualMicros: 99 });
  expect(before.actualMicros).toBe(0);
  expect(summarizeLoopCost(before).variancePercent).toBeNull();
});

test("a loop stops before running the round it cannot afford", () => {
  // Enforcing a ceiling only after the spend is not a ceiling.
  let ledger = emptyLoopLedger(1000);
  ledger = recordRoundCost(ledger, { actualMicros: 400 });
  ledger = recordRoundCost(ledger, { actualMicros: 450 });

  const verdict = loopBudgetVerdict(ledger);
  expect(verdict.exhausted).toBe(false);
  expect(verdict.remainingMicros).toBe(150);
  // Projects from the most expensive round, not the mean -- rounds grow.
  expect(verdict.projectedNextRoundMicros).toBe(450);
  expect(verdict.wouldExceed).toBe(true);

  const decision = loopStopDecision({ round: 2, maxRounds: 5, passed: false, ledger });
  expect(decision.stop).toBe(true);
  expect(decision.reason).toBe("budget-exhausted");
});

test("budget exhaustion outranks every other stop reason", () => {
  // Both out of money and spinning: the audit record must name the cause that
  // actually forced the stop, not whichever check happened to run first.
  const ledger = recordRoundCost(emptyLoopLedger(100), { actualMicros: 100 });
  const spinning = [round({ round: 1 }), round({ round: 2 }), round({ round: 3 })];
  const decision = loopStopDecision({ round: 1, maxRounds: 5, passed: false, ledger, rounds: spinning });
  expect(decision.reason).toBe("budget-exhausted");
});

test("an unbounded ledger is stated as unbounded rather than silently allowed", () => {
  const ledger = recordRoundCost(emptyLoopLedger(null), { actualMicros: 999_999 });
  const verdict = loopBudgetVerdict(ledger);
  expect(verdict.unbounded).toBe(true);
  expect(verdict.exhausted).toBe(false);
  expect(loopStopDecision({ round: 1, maxRounds: 3, passed: false, ledger }).stop).toBe(false);
});

test("anti-spin fires on stalled rounds and stays quiet on progress", () => {
  const stalled = [
    round({ round: 1, score: 60, issues: ["missing header", "bad contrast"] }),
    round({ round: 2, score: 60, issues: ["bad contrast", "missing header"] }),
    round({ round: 3, score: 55, issues: ["missing header", "bad contrast"] }),
  ];
  expect(detectLoopSpin(stalled)).toBe(true);

  const improving = [
    round({ round: 1, score: 40, issues: ["a"] }),
    round({ round: 2, score: 60, issues: ["a"] }),
    round({ round: 3, score: 80, issues: ["a"] }),
  ];
  expect(detectLoopSpin(improving)).toBe(false);

  // Same score but genuinely different issues is work, not spinning.
  const flatButMoving = [
    round({ round: 1, score: 60, issues: ["a"] }),
    round({ round: 2, score: 60, issues: ["b"] }),
    round({ round: 3, score: 60, issues: ["c"] }),
  ];
  expect(detectLoopSpin(flatButMoving)).toBe(false);

  // Too few rounds to judge.
  expect(detectLoopSpin([round()])).toBe(false);

  const decision = loopStopDecision({ round: 3, maxRounds: 5, passed: false, ledger: emptyLoopLedger(null), rounds: stalled });
  expect(decision.stop).toBe(true);
  expect(decision.reason).toBe("no-progress");
});

test("a quality streak needs consecutive passes, not one lucky round", () => {
  const ledger = emptyLoopLedger(null);
  const oneWin = loopStopDecision({
    round: 1, maxRounds: 5, passed: true, ledger,
    consecutivePasses: 1, streakTarget: QUALITY_STREAK_TARGET,
  });
  expect(oneWin.stop).toBe(false);

  const streak = loopStopDecision({
    round: 2, maxRounds: 5, passed: true, ledger,
    consecutivePasses: QUALITY_STREAK_TARGET, streakTarget: QUALITY_STREAK_TARGET,
  });
  expect(streak.stop).toBe(true);
  expect(streak.reason).toBe("quality-streak");
});

test("an ordinary loop still stops on a pass and on the round cap", () => {
  const ledger = emptyLoopLedger(null);
  const passed = loopStopDecision({ round: 1, maxRounds: 3, passed: true, ledger });
  expect(passed.reason).toBe("verdict-pass");

  const capped = loopStopDecision({ round: 3, maxRounds: 3, passed: false, ledger });
  expect(capped.reason).toBe("round-cap");

  expect(loopStopDecision({ round: 1, maxRounds: 3, passed: false, ledger }).stop).toBe(false);
});

test("a ledger rebuilt from persisted rounds matches what was recorded", () => {
  // A resumed run must not lose the spend that already happened.
  const rounds = [round({ costMicros: 120 }), round({ costMicros: 200 })];
  const rebuilt = ledgerFromRounds(rounds, 1000);
  expect(rebuilt.actualMicros).toBe(320);
  expect(rebuilt.roundMicros).toEqual([120, 200]);
  expect(loopBudgetVerdict(rebuilt).remainingMicros).toBe(680);
});
