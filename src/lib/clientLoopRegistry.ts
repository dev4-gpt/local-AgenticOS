/**
 * The named loop registry.
 *
 * Before this file, Loop was a free-text goal box: a tenant typed an outcome and
 * the adapter ran builder → judge → revise until it passed or hit
 * `LOOP_MAX_ROUNDS`. Nothing named the *shape* of the loop being run, so every
 * loop had the same single stop condition and the router had nothing to select.
 *
 * Each contract below declares its stop conditions, round cap and required
 * traits as **data**, so the worker enforces them. A loop that stops "when the
 * work is good enough" because a prompt asked it to is not bounded; a loop that
 * stops because `stopConditions` says so is.
 *
 * Most of these already existed unnamed — see `origin`. Naming them is the
 * deliverable; reimplementing them would be waste and would fork behaviour.
 *
 * Informed by `obra/superpowers` (loop granularity and naming) and
 * `DietrichGebert/ponytail` (the restraint verdict). Neither runtime is
 * installed and no upstream text is reproduced; see
 * docs/V96-EXTERNAL-CORPUS-INTEGRATION.md — Wave 3.
 */

import type { CapabilityTraitId } from "@/lib/capabilityTraits";
import { LOOP_DEFAULT_ROUNDS, LOOP_MAX_ROUNDS } from "@/lib/clientLoopAdapter";
// Type-only: erased at build time, so this does not create a runtime import
// cycle with clientPlaybooks, which imports LOOP_PLAYBOOKS back.
import type { ClientIntentSurface, ClientPlaybook, ClientPlaybookRisk } from "@/lib/clientPlaybooks";

/**
 * Why a loop stopped. Every terminating loop reports exactly one of these, so
 * "it finished" is never an unexplained state in the audit record.
 */
export const LOOP_STOP_CONDITIONS = [
  /** The judge passed the work against the definition of done. */
  "verdict-pass",
  /** The round cap was reached without a pass. */
  "round-cap",
  /** Spend reached the ceiling, or the next round would cross it. */
  "budget-exhausted",
  /** Rounds stopped making progress: no score gain and the same issues recur. */
  "no-progress",
  /** The best available move is to change nothing further. */
  "restraint",
  /** N consecutive clean passes were observed. */
  "quality-streak",
  /** A human declined at the approval boundary. */
  "approval-denied",
] as const;

export type LoopStopCondition = (typeof LOOP_STOP_CONDITIONS)[number];

/**
 * `existing` means the behaviour already ships and this contract only gives it a
 * name and a declared boundary. `new` means the contract introduces behaviour.
 * Recorded so a reader can tell which rows are documentation of reality and
 * which are additions that need their own evidence.
 */
export type LoopOrigin = "existing" | "new";

export interface ClientLoopContract {
  id: string;
  label: string;
  description: string;
  intents: readonly string[];
  /** Hard ceiling, always within `LOOP_MAX_ROUNDS`. */
  maxRounds: number;
  /** Every way this loop is permitted to terminate. */
  stopConditions: readonly LoopStopCondition[];
  requiredTraits: readonly CapabilityTraitId[];
  riskClass: ClientPlaybookRisk;
  approval: ClientPlaybook["approval"];
  outputType: string;
  origin: LoopOrigin;
  /** Where the behaviour lives today, for `existing` rows. */
  implementedBy?: string;
  /** Governed corpus references that informed the contract. Never installed. */
  informedBy?: readonly string[];
}

/**
 * The trait floor for any loop. A named loop is a bounded shape over the
 * existing adapter, never a route around its guarantees, so it inherits the
 * baseline in full and adds cost accounting on top: a loop is the one surface
 * that can spend repeatedly without a human between rounds.
 */
const LOOP_TRAITS: readonly CapabilityTraitId[] = [
  "tenant-isolation", "provenance", "budget", "idempotency", "audit",
  "resumability", "approval", "output-quality", "cost-accounting",
];

const PROVIDER_LOOP_TRAITS: readonly CapabilityTraitId[] = [
  ...LOOP_TRAITS, "model-allowlist", "context-compression",
];

/** Terminating conditions every loop carries regardless of its shape. */
const UNIVERSAL_STOPS: readonly LoopStopCondition[] = ["round-cap", "budget-exhausted"];

export const CLIENT_LOOP_CONTRACTS: readonly ClientLoopContract[] = [
  {
    id: "plan-generate-verify-fix",
    label: "Plan, generate, verify, fix",
    description: "Build toward a definition of done, judge it adversarially, and revise only what the judge rejected.",
    intents: ["keep improving until", "iterate until it passes", "loop until done", "refine this until", "definition of done"],
    maxRounds: LOOP_DEFAULT_ROUNDS,
    stopConditions: [...UNIVERSAL_STOPS, "verdict-pass", "no-progress"],
    requiredTraits: PROVIDER_LOOP_TRAITS,
    riskClass: "review", approval: "review-before-apply", outputType: "loop-artifact",
    origin: "existing", implementedBy: "clientLoopAdapter",
    informedBy: ["superpowers"],
  },
  {
    id: "adversarial-review",
    label: "Adversarial review",
    description: "Run a separate judge against the work so the builder never grades its own homework.",
    intents: ["review it adversarially", "stress test this", "have something check my work", "poke holes in this"],
    maxRounds: LOOP_DEFAULT_ROUNDS,
    stopConditions: [...UNIVERSAL_STOPS, "verdict-pass", "no-progress"],
    requiredTraits: PROVIDER_LOOP_TRAITS,
    riskClass: "review", approval: "review-before-apply", outputType: "quality-report",
    origin: "existing", implementedBy: "clientLoopAdapter",
    informedBy: ["superpowers"],
  },
  {
    id: "human-approval-gate",
    label: "Human approval gate",
    description: "Hold the result at the approval boundary until a human accepts or declines it.",
    intents: ["let me approve", "check with me first", "hold for review", "do not apply without me"],
    maxRounds: 1,
    stopConditions: [...UNIVERSAL_STOPS, "verdict-pass", "approval-denied"],
    requiredTraits: LOOP_TRAITS,
    riskClass: "external", approval: "human-before-external-action", outputType: "approval-record",
    origin: "existing", implementedBy: "the approval boundary",
  },
  {
    id: "goal-clarify",
    label: "Goal clarification",
    description: "Turn a vague request into one verifiable definition of done before any round runs.",
    intents: ["not sure what i want", "help me define this", "make this concrete", "what should the goal be"],
    maxRounds: 1,
    stopConditions: [...UNIVERSAL_STOPS, "verdict-pass"],
    requiredTraits: PROVIDER_LOOP_TRAITS,
    riskClass: "low", approval: "none", outputType: "clarified-goal",
    origin: "existing", implementedBy: "clientIntentRouter",
  },
  {
    id: "completion-contract",
    label: "Completion contract",
    description: "Refuse to report success without evidence, and name what was not checked.",
    intents: ["prove it works", "show me the evidence", "verify before claiming", "did it actually pass"],
    maxRounds: LOOP_DEFAULT_ROUNDS,
    stopConditions: [...UNIVERSAL_STOPS, "verdict-pass", "no-progress"],
    requiredTraits: PROVIDER_LOOP_TRAITS,
    riskClass: "review", approval: "review-before-apply", outputType: "evidence-record",
    origin: "existing", implementedBy: "the house verification rule",
  },
  {
    id: "anti-spin",
    label: "Anti-spin",
    description: "Stop a loop that has stopped making progress: no score gain, recurring issues, or nothing left worth changing.",
    intents: ["stop if it stalls", "do not go in circles", "give up if stuck", "bail out when spinning"],
    maxRounds: LOOP_MAX_ROUNDS,
    stopConditions: [...UNIVERSAL_STOPS, "verdict-pass", "no-progress", "restraint"],
    requiredTraits: PROVIDER_LOOP_TRAITS,
    riskClass: "low", approval: "none", outputType: "loop-artifact",
    origin: "new",
    informedBy: ["ponytail", "pinrule"],
  },
  {
    id: "quality-streak",
    label: "Quality streak",
    description: "Require several consecutive clean passes before accepting, so one lucky round cannot end the loop.",
    intents: ["pass consistently", "not just once", "consecutive clean runs", "make sure it holds"],
    maxRounds: LOOP_MAX_ROUNDS,
    stopConditions: [...UNIVERSAL_STOPS, "quality-streak", "no-progress"],
    requiredTraits: PROVIDER_LOOP_TRAITS,
    riskClass: "review", approval: "review-before-apply", outputType: "loop-artifact",
    origin: "new",
    informedBy: ["superpowers"],
  },
];

/** Consecutive passes `quality-streak` requires before it accepts. */
export const QUALITY_STREAK_TARGET = 2;

const LOOP_SURFACES: readonly ClientIntentSurface[] = ["loop", "orchestrate", "chat"];

/**
 * The contracts projected into the playbook shape the router already selects
 * from. Kept as a projection rather than a second hand-maintained list so a
 * contract and its playbook cannot drift.
 */
export const LOOP_PLAYBOOKS: readonly ClientPlaybook[] = CLIENT_LOOP_CONTRACTS.map((contract) => ({
  id: `loop-${contract.id}`,
  label: contract.label,
  description: contract.description,
  intents: contract.intents,
  eligibleCapabilities: ["loop-run"],
  skillIds: [],
  requiredTraits: contract.requiredTraits,
  riskClass: contract.riskClass,
  approval: contract.approval,
  outputType: contract.outputType,
  supportedSurfaces: LOOP_SURFACES,
}));

export function loopContractById(id: string) {
  return CLIENT_LOOP_CONTRACTS.find((contract) => contract.id === id) ?? null;
}

/**
 * Whether a loop may terminate for this reason. A stop condition absent from the
 * contract is a bug in the caller, not a permissible outcome — otherwise a
 * `quality-streak` loop could quietly accept a single pass.
 */
export function loopPermitsStop(contract: ClientLoopContract, reason: LoopStopCondition) {
  return contract.stopConditions.includes(reason);
}

/** Contracts are capped by the adapter's ceiling; nothing may declare past it. */
export function validateLoopContract(contract: ClientLoopContract) {
  const errors: string[] = [];
  if (!contract.id.trim()) errors.push("loop contract id is required");
  if (contract.maxRounds < 1 || contract.maxRounds > LOOP_MAX_ROUNDS) {
    errors.push(`${contract.id}: maxRounds must be between 1 and ${LOOP_MAX_ROUNDS}`);
  }
  for (const universal of UNIVERSAL_STOPS) {
    if (!contract.stopConditions.includes(universal)) errors.push(`${contract.id}: must permit ${universal}`);
  }
  if (!contract.requiredTraits.includes("budget")) errors.push(`${contract.id}: must require the budget trait`);
  if (!contract.requiredTraits.includes("cost-accounting")) errors.push(`${contract.id}: must require cost-accounting`);
  if (!contract.requiredTraits.includes("approval")) errors.push(`${contract.id}: must require approval`);
  if (contract.origin === "existing" && !contract.implementedBy) {
    errors.push(`${contract.id}: an existing loop must name where it is implemented`);
  }
  return errors;
}
