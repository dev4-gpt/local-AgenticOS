/**
 * Command policy (tracker QM-6b): decides what may happen to a command an adapter wants to run, before it runs.
 *
 * The idea and the five floor rules come from QM's command policy (MIT, github.com/yc-software/qm,
 * src/policy/command-policy.ts). What is Veloce's own is where the answers go: a command that needs approval becomes a
 * hash-bound `run-command` action in the two-person approval gateway (ADR-006), so a different person approves this exact
 * command under this exact policy, once. Nothing in the host runs commands yet; this module is the part that decides, so
 * the first runtime that does can only run what it says.
 *
 * Three answers: allow (run it), deny (never), require_approval (a second person must approve this exact command).
 * When several rules match, the strictest wins, so a per-client rule can add restrictions but can never loosen the floor.
 * Rules are regular expressions written by people, so each is checked for the shapes that make matching explode.
 */
import { createHash } from "node:crypto";
import { approvalActionCanonical, canonicalJson, type ApprovalAction } from "./adapterApprovalGateway";

export type CommandDecision = "allow" | "deny" | "require_approval";
export interface CommandRule {
  pattern: string;
  decision: CommandDecision;
  reason?: string;
}
export interface CommandPolicy {
  mode: "denylist" | "allowlist";
  rules: CommandRule[];
}

export const MAX_RULES = 100;
export const MAX_PATTERN_CHARS = 300;
export const MAX_REASON_CHARS = 200;
export const MAX_COMMAND_CHARS = 10_000;
export const COMMAND_DESTINATION = "command";

const RANK: Record<CommandDecision, number> = { allow: 0, require_approval: 1, deny: 2 };

/** Rules every client gets and no per-client rule can loosen. */
export const ORG_FLOOR_RULES: readonly CommandRule[] = [
  { pattern: "\\brm\\b[^\\n]*(?:-[a-zA-Z]*r|--recursive)", decision: "require_approval", reason: "recursive delete" },
  { pattern: "\\bgit\\s+push\\b.*(?:--force\\b|(?:^|\\s)-[a-zA-Z]*f\\b)", decision: "require_approval", reason: "force push" },
  { pattern: "\\b(drop|truncate)\\s+table\\b", decision: "require_approval", reason: "destructive SQL" },
  { pattern: "\\bmkfs\\b|:\\(\\)\\s*\\{", decision: "deny", reason: "destructive command or fork bomb" },
  { pattern: "\\bcurl\\b.*\\|\\s*(sh|bash)\\b", decision: "require_approval", reason: "pipes a download into a shell" },
];

export function defaultOrgPolicy(): CommandPolicy {
  return { mode: "denylist", rules: ORG_FLOOR_RULES.map((rule) => ({ ...rule })) };
}

const isRepeat = (ch: string | undefined): boolean => ch === "*" || ch === "+" || ch === "{";

/**
 * A pattern is accepted only if it compiles and avoids what makes a regular expression slow on hostile input: a repeated
 * group that itself repeats or branches, "look" assertions and back-references. Character classes can still repeat.
 */
export function isSafePattern(pattern: unknown): pattern is string {
  if (typeof pattern !== "string" || pattern.length < 1 || pattern.length > MAX_PATTERN_CHARS) return false;
  try {
    new RegExp(pattern, "i");
  } catch {
    return false;
  }
  if (/\(\?(?:=|!|<=|<!|<[A-Za-z])/.test(pattern) || /\\(?:[1-9]|k<)/.test(pattern)) return false;
  // Walk the pattern. When a group closes, refuse it if it repeats while containing a repeat or a branch.
  const groups: Array<{ repeats: boolean; branches: boolean }> = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === "\\") { i += 1; continue; }
    if (inClass) { if (ch === "]") inClass = false; continue; }
    if (ch === "[") { inClass = true; continue; }
    if (ch === "(") { groups.push({ repeats: false, branches: false }); continue; }
    const open = groups.at(-1);
    if (ch === "|" && open) { open.branches = true; continue; }
    if (isRepeat(ch) && open) { open.repeats = true; continue; }
    if (ch === ")") {
      const closed = groups.pop();
      if (!closed) return false;
      const repeated = isRepeat(pattern[i + 1]);
      if (repeated && (closed.repeats || closed.branches)) return false;
      const parent = groups.at(-1);
      if (parent) {
        parent.repeats = parent.repeats || closed.repeats || repeated;
        parent.branches = parent.branches || closed.branches;
      }
    }
  }
  return groups.length === 0;
}

/** Validates a policy someone wrote. Returns the policy, or says what is wrong. */
export function parseCommandPolicy(input: unknown): { policy: CommandPolicy } | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "the policy must be an object" };
  const { mode, rules } = input as { mode?: unknown; rules?: unknown };
  if (mode !== "denylist" && mode !== "allowlist") return { error: 'mode must be "denylist" or "allowlist"' };
  if (!Array.isArray(rules) || rules.length > MAX_RULES) return { error: `rules must be a list of at most ${MAX_RULES}` };
  const out: CommandRule[] = [];
  for (const [index, raw] of rules.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: `rules[${index}] must be an object` };
    const rule = raw as { pattern?: unknown; decision?: unknown; reason?: unknown };
    if (!isSafePattern(rule.pattern)) return { error: `rules[${index}].pattern is not an accepted pattern` };
    if (rule.decision !== "allow" && rule.decision !== "deny" && rule.decision !== "require_approval") return { error: `rules[${index}].decision must be allow, deny or require_approval` };
    if (rule.reason !== undefined && (typeof rule.reason !== "string" || rule.reason.length > MAX_REASON_CHARS)) return { error: `rules[${index}].reason must be text of at most ${MAX_REASON_CHARS} characters` };
    out.push({ pattern: rule.pattern, decision: rule.decision, ...(rule.reason !== undefined ? { reason: rule.reason } : {}) });
  }
  return { policy: { mode, rules: out } };
}

/** The floor plus a client's own rules. The floor's allowlist mode wins; the strictest-wins rule keeps the floor's limits. */
export function composePolicy(floor: CommandPolicy, scope?: CommandPolicy | null): CommandPolicy {
  if (!scope) return floor;
  return { mode: floor.mode === "allowlist" ? "allowlist" : scope.mode, rules: [...floor.rules, ...scope.rules] };
}

// Invisible and look-alike characters would let `rm` hide as a different string; compare both the raw and the folded text.
const INVISIBLE = /[­͏؜᠎​-‏‪-‮⁠-⁯﻿︀-️\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const fold = (text: string): string => text.normalize("NFKC").replace(INVISIBLE, "");

export interface CommandVerdict {
  decision: CommandDecision;
  reason: string;
  /** Index of the rule that decided it, or null when no rule did (allowed by default, or off the allowlist). */
  ruleIndex: number | null;
}

/** What the policy says about one command. The strictest matching rule wins; an allowlist denies anything unmatched. */
export function evaluateCommand(policy: CommandPolicy, command: unknown): CommandVerdict {
  if (typeof command !== "string" || !command.trim()) return { decision: "deny", reason: "the command is empty", ruleIndex: null };
  if (command.length > MAX_COMMAND_CHARS) return { decision: "deny", reason: "the command is too long", ruleIndex: null };
  const texts = [command, fold(command)];
  let strictest: CommandVerdict | null = null;
  let firstAllow: CommandVerdict | null = null;
  for (const [index, rule] of policy.rules.entries()) {
    if (!texts.some((text) => new RegExp(rule.pattern, "i").test(text))) continue;
    if (rule.decision === "allow") {
      firstAllow ??= { decision: "allow", reason: rule.reason ?? "allowed by a rule", ruleIndex: index };
      continue;
    }
    if (!strictest || RANK[rule.decision] > RANK[strictest.decision]) {
      strictest = { decision: rule.decision, reason: rule.reason ?? (rule.decision === "deny" ? "denied by a rule" : "needs approval"), ruleIndex: index };
    }
  }
  if (strictest) return strictest;
  if (policy.mode === "allowlist") return firstAllow ?? { decision: "deny", reason: "not on the allowlist", ruleIndex: null };
  return firstAllow ?? { decision: "allow", reason: "no rule matched", ruleIndex: null };
}

/** A short fingerprint of the policy in force. An approval is bound to it, so changing the policy voids earlier approvals. */
export function policyVersionOf(policy: CommandPolicy): string {
  return `cmd-${createHash("sha256").update(canonicalJson(policy), "utf8").digest("hex").slice(0, 24)}`;
}

/** The approval action for running exactly this command under exactly this policy. */
export function commandApprovalAction(policy: CommandPolicy, adapterId: string, command: string): ApprovalAction {
  return { kind: "run-command", adapterId, destination: COMMAND_DESTINATION, policyVersion: policyVersionOf(policy), payload: { command } };
}

export type CommandOutcome =
  | { outcome: "run"; reason: string }
  | { outcome: "refuse"; reason: string }
  | { outcome: "needs_approval"; reason: string; action: ApprovalAction; canonical: string; hash: string };

/**
 * The one call a runtime makes before running a command. "run" means the policy allows it; "refuse" means never;
 * "needs_approval" carries the exact action to send to the approval gateway. After a second person approves, the runtime
 * recomputes the same action from the command it is about to run and executes the approval with that hash, so a command
 * that differs by one character, or a policy that changed, does not match.
 */
export function decideCommand(policy: CommandPolicy, adapterId: string, command: string): CommandOutcome {
  const verdict = evaluateCommand(policy, command);
  if (verdict.decision === "allow") return { outcome: "run", reason: verdict.reason };
  if (verdict.decision === "deny") return { outcome: "refuse", reason: verdict.reason };
  const action = commandApprovalAction(policy, adapterId, command);
  try {
    return { outcome: "needs_approval", reason: verdict.reason, action, ...approvalActionCanonical(action) };
  } catch {
    // A command that cannot be written into an approval (bad adapter id, or too large once escaped) cannot be approved.
    return { outcome: "refuse", reason: "the command cannot be put into an approval request" };
  }
}
