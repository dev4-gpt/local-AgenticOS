/**
 * Loop cost accounting and budget enforcement.
 *
 * `LoopRun.costMicros` and `LoopRound.costMicros` have existed since the hosted
 * loop shipped, and `loopShouldContinue` reads neither: a loop stops on a pass
 * or on the round cap and **on nothing else**. The round cap was therefore the
 * only thing between a tenant and an unbounded spend, and it bounds the number
 * of rounds rather than their cost — five rounds against an expensive model is a
 * very different bill from five cheap ones.
 *
 * The `budget` trait already asks *is this spend authorised*. This module
 * answers the questions it does not: what did it actually cost, how far off the
 * estimate was it, what did retries and fallbacks add, and is the next round
 * still affordable.
 *
 * All amounts are integer micros of USD, matching the existing `costMicros`
 * columns. Ledgers are immutable — every record returns a new ledger, so a
 * partially-updated ledger cannot be observed after a throw mid-round.
 *
 * @see docs/V96-EXTERNAL-CORPUS-INTEGRATION.md — Wave 3B
 */

import type { LoopRound } from "@/lib/clientLoopAdapter";
import type { LoopStopCondition } from "@/lib/clientLoopRegistry";

export interface LoopCostLedger {
  /** What the loop predicted it would spend, summed across rounds. */
  estimatedMicros: number;
  /** What it actually spent. */
  actualMicros: number;
  /** Spend avoided by context compression, as reported by the provider lane. */
  compressionSavedMicros: number;
  /** Spend attributable to retries and provider fallback, not first attempts. */
  retryMicros: number;
  /** Actual cost per round, in order. */
  roundMicros: readonly number[];
  /** The ceiling. `null` means no tenant ceiling was supplied. */
  budgetMicros: number | null;
}

export interface LoopRoundCost {
  actualMicros: number;
  estimatedMicros?: number;
  compressionSavedMicros?: number;
  retryMicros?: number;
}

function nonNegative(value: number | undefined) {
  return Number.isFinite(value) && (value as number) > 0 ? Math.round(value as number) : 0;
}

export function emptyLoopLedger(budgetMicros: number | null = null): LoopCostLedger {
  return {
    estimatedMicros: 0,
    actualMicros: 0,
    compressionSavedMicros: 0,
    retryMicros: 0,
    roundMicros: [],
    budgetMicros: budgetMicros === null ? null : Math.max(0, Math.round(budgetMicros)),
  };
}

export function recordRoundCost(ledger: LoopCostLedger, cost: LoopRoundCost): LoopCostLedger {
  const actual = nonNegative(cost.actualMicros);
  return {
    estimatedMicros: ledger.estimatedMicros + nonNegative(cost.estimatedMicros),
    actualMicros: ledger.actualMicros + actual,
    compressionSavedMicros: ledger.compressionSavedMicros + nonNegative(cost.compressionSavedMicros),
    retryMicros: ledger.retryMicros + nonNegative(cost.retryMicros),
    roundMicros: [...ledger.roundMicros, actual],
    budgetMicros: ledger.budgetMicros,
  };
}

/** Rebuilds a ledger from persisted rounds, for a resumed or audited run. */
export function ledgerFromRounds(rounds: readonly LoopRound[], budgetMicros: number | null = null): LoopCostLedger {
  return rounds.reduce<LoopCostLedger>(
    (ledger, round) => recordRoundCost(ledger, { actualMicros: round.costMicros }),
    emptyLoopLedger(budgetMicros),
  );
}

export interface LoopCostSummary {
  spentMicros: number;
  /** Actual minus estimated. Positive means it cost more than predicted. */
  varianceMicros: number;
  /** Variance as a percentage of the estimate; `null` when nothing was estimated. */
  variancePercent: number | null;
  savedMicros: number;
  retryMicros: number;
  /** Share of spend that went to retries and fallback, 0–1. */
  retryShare: number;
  meanRoundMicros: number;
  rounds: number;
}

export function summarizeLoopCost(ledger: LoopCostLedger): LoopCostSummary {
  const rounds = ledger.roundMicros.length;
  const variance = ledger.actualMicros - ledger.estimatedMicros;
  return {
    spentMicros: ledger.actualMicros,
    varianceMicros: variance,
    variancePercent: ledger.estimatedMicros > 0
      ? Math.round((variance / ledger.estimatedMicros) * 1000) / 10
      : null,
    savedMicros: ledger.compressionSavedMicros,
    retryMicros: ledger.retryMicros,
    retryShare: ledger.actualMicros > 0 ? ledger.retryMicros / ledger.actualMicros : 0,
    meanRoundMicros: rounds > 0 ? Math.round(ledger.actualMicros / rounds) : 0,
    rounds,
  };
}

export interface LoopBudgetVerdict {
  /** No ceiling was supplied, so nothing can be enforced. Stated, not implied. */
  unbounded: boolean;
  remainingMicros: number;
  /** Spend already at or past the ceiling. */
  exhausted: boolean;
  /** What the next round is expected to cost, from observed rounds. */
  projectedNextRoundMicros: number;
  /** The projected next round would cross the ceiling. */
  wouldExceed: boolean;
}

/**
 * The check is made *before* a round rather than after it. A ceiling enforced
 * only after the fact is not a ceiling: the spend has already happened and
 * cannot be refunded, so a loop must decline the round it cannot afford.
 *
 * The projection uses the most expensive round observed, not the mean. Rounds
 * grow as context accumulates, so a mean systematically under-projects the next
 * one — which is the direction that overspends.
 */
export function loopBudgetVerdict(ledger: LoopCostLedger): LoopBudgetVerdict {
  if (ledger.budgetMicros === null) {
    return {
      unbounded: true,
      remainingMicros: Number.POSITIVE_INFINITY,
      exhausted: false,
      projectedNextRoundMicros: 0,
      wouldExceed: false,
    };
  }
  const remaining = Math.max(0, ledger.budgetMicros - ledger.actualMicros);
  const projected = ledger.roundMicros.length ? Math.max(...ledger.roundMicros) : 0;
  return {
    unbounded: false,
    remainingMicros: remaining,
    exhausted: ledger.actualMicros >= ledger.budgetMicros,
    projectedNextRoundMicros: projected,
    wouldExceed: projected > remaining,
  };
}

/**
 * Anti-spin: a loop is spinning when it keeps paying for rounds that do not move
 * the verdict. Two independent signals, because either alone gives false
 * positives — a score can sit flat while genuinely different issues are being
 * fixed, and issues can repeat while the score climbs.
 */
export function detectLoopSpin(rounds: readonly LoopRound[], window = 2): boolean {
  if (rounds.length < window + 1) return false;
  const recent = rounds.slice(-(window + 1));
  const scores = recent.map((round) => round.score ?? 0);
  const noGain = scores.every((score) => score <= scores[0]);
  const signatures = recent.map((round) => [...round.issues].sort().join("|"));
  const repeating = signatures.every((signature) => signature === signatures[0] && signature !== "");
  return noGain && repeating;
}

export interface LoopRestraintSignal {
  /** Expected score improvement for the next paid round. */
  expectedScoreDelta: number;
  /** The next round's conservative cost projection. */
  nextRoundCostMicros: number;
  /** Minimum improvement required to justify another round. Defaults to one point. */
  minimumScoreDelta?: number;
  /** Whether the latest unresolved issues are still the same. */
  repeatedIssueSignature?: boolean;
}

/**
 * Ponytail restraint is deliberately separate from anti-spin. Anti-spin says
 * "the loop is repeating"; restraint says "even the best expected improvement
 * does not justify another paid round". Both are worker decisions, so a prompt
 * cannot override either one.
 */
export function ponytailRestraintVerdict(signal: LoopRestraintSignal) {
  const minimum = Number.isFinite(signal.minimumScoreDelta) ? Math.max(0, signal.minimumScoreDelta ?? 1) : 1;
  const cost = Number.isFinite(signal.nextRoundCostMicros) ? Math.max(0, Math.round(signal.nextRoundCostMicros)) : 0;
  const delta = Number.isFinite(signal.expectedScoreDelta) ? signal.expectedScoreDelta : 0;
  return cost > 0 && delta < minimum && (signal.repeatedIssueSignature === true || delta <= 0);
}

export interface LoopStopDecision {
  stop: boolean;
  reason: LoopStopCondition | null;
  detail: string;
}

/**
 * The single place a loop decides whether to run another round.
 *
 * Order matters and is not arbitrary. Budget is checked before progress: a loop
 * that is both out of money and making progress must still stop, and reporting
 * `no-progress` there would misattribute the cause in the audit record.
 */
export function loopStopDecision(input: {
  round: number;
  maxRounds: number;
  passed: boolean;
  ledger: LoopCostLedger;
  rounds?: readonly LoopRound[];
  consecutivePasses?: number;
  streakTarget?: number;
  restraint?: LoopRestraintSignal;
}): LoopStopDecision {
  const budget = loopBudgetVerdict(input.ledger);
  if (budget.exhausted) {
    return { stop: true, reason: "budget-exhausted", detail: "spend reached the tenant ceiling" };
  }
  if (budget.wouldExceed) {
    return {
      stop: true,
      reason: "budget-exhausted",
      detail: `next round projected at ${budget.projectedNextRoundMicros} micros with ${budget.remainingMicros} remaining`,
    };
  }
  if (input.streakTarget && input.streakTarget > 0) {
    if ((input.consecutivePasses ?? 0) >= input.streakTarget) {
      return { stop: true, reason: "quality-streak", detail: `${input.consecutivePasses} consecutive clean passes` };
    }
  } else if (input.passed) {
    return { stop: true, reason: "verdict-pass", detail: "the judge accepted the work" };
  }
  if (input.round >= input.maxRounds) {
    return { stop: true, reason: "round-cap", detail: `reached the ${input.maxRounds}-round cap` };
  }
  if (input.restraint && ponytailRestraintVerdict(input.restraint)) {
    return {
      stop: true,
      reason: "restraint",
      detail: `expected score improvement ${input.restraint.expectedScoreDelta} is below the ${input.restraint.minimumScoreDelta ?? 1}-point threshold for another paid round`,
    };
  }
  if (input.rounds && detectLoopSpin(input.rounds)) {
    return { stop: true, reason: "no-progress", detail: "no score gain and the same issues recurring" };
  }
  return { stop: false, reason: null, detail: "" };
}
