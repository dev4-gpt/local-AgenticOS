import { createHash } from "node:crypto";

export const STANDING_INSTRUCTION_BUDGET_VERSION = "v96-instruction-budget-1" as const;
export const DEFAULT_STANDING_INSTRUCTION_MAX_LINES = 200;
export const DEFAULT_STANDING_INSTRUCTION_MAX_CHARS = 20_000;

export type StandingInstructionKind = "policy" | "trait" | "surface" | "role" | "other";

export interface StandingInstructionSegment {
  id: string;
  kind: StandingInstructionKind;
  content: string;
  mandatory?: boolean;
}

export interface StandingInstructionBudgetEvidence {
  policyVersion: typeof STANDING_INSTRUCTION_BUDGET_VERSION;
  segmentCount: number;
  totalChars: number;
  totalLines: number;
  mandatoryChars: number;
  optionalChars: number;
  maxChars: number;
  maxLines: number;
  withinBudget: boolean;
  inputHash: string;
  segmentIds: readonly string[];
}

export type StandingInstructionBudgetResult =
  | { ok: true; evidence: StandingInstructionBudgetEvidence }
  | { ok: false; error: "instruction_budget_input_invalid"; evidence: StandingInstructionBudgetEvidence };

/**
 * Measure the standing instruction layer without retaining its content.
 *
 * This is an observability contract, not an instruction editor. Mandatory
 * safety, tenant, approval, and provenance text is never removed or reordered
 * by this helper. The evidence contains counts, stable IDs, and a hash only.
 */
export function measureStandingInstructionBudget(input: {
  segments: readonly StandingInstructionSegment[];
  maxChars?: number;
  maxLines?: number;
}): StandingInstructionBudgetResult {
  const maxChars = input.maxChars ?? DEFAULT_STANDING_INSTRUCTION_MAX_CHARS;
  const maxLines = input.maxLines ?? DEFAULT_STANDING_INSTRUCTION_MAX_LINES;
  const validLimits = Number.isSafeInteger(maxChars) && maxChars > 0 && Number.isSafeInteger(maxLines) && maxLines > 0;
  const validSegments = input.segments.every((segment) => Boolean(
    segment
      && typeof segment.id === "string"
      && /^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(segment.id)
      && ["policy", "trait", "surface", "role", "other"].includes(segment.kind)
      && typeof segment.content === "string"
      && segment.content.length <= 200_000
      && (segment.mandatory === undefined || typeof segment.mandatory === "boolean"),
  ));
  const ids = input.segments.map((segment) => segment.id).slice(0, 128);
  const totalChars = input.segments.reduce((total, segment) => total + (typeof segment.content === "string" ? segment.content.length : 0), 0);
  const totalLines = input.segments.reduce((total, segment) => total + countLines(segment.content), 0);
  const mandatoryChars = input.segments.reduce((total, segment) => total + (segment.mandatory ? segment.content.length : 0), 0);
  const evidence = makeEvidence({
    segments: input.segments,
    maxChars: validLimits ? maxChars : DEFAULT_STANDING_INSTRUCTION_MAX_CHARS,
    maxLines: validLimits ? maxLines : DEFAULT_STANDING_INSTRUCTION_MAX_LINES,
    totalChars,
    totalLines,
    mandatoryChars,
    ids,
  });
  if (!validLimits || !validSegments || input.segments.length > 128) {
    return { ok: false, error: "instruction_budget_input_invalid", evidence: { ...evidence, withinBudget: false } };
  }
  return { ok: true, evidence };
}

export function standingInstructionSegmentsFromMessages(messages: readonly { role: string; content: string }[]): StandingInstructionSegment[] {
  return messages.reduce<StandingInstructionSegment[]>((segments, message, index) => {
    if (message.role === "system") {
      segments.push({ id: `system-${index}`, kind: "policy", content: message.content, mandatory: true });
    }
    return segments;
  }, []);
}

function countLines(content: string) {
  return typeof content === "string" && content.length > 0 ? content.split("\n").length : 0;
}

function makeEvidence(input: {
  segments: readonly StandingInstructionSegment[];
  maxChars: number;
  maxLines: number;
  totalChars: number;
  totalLines: number;
  mandatoryChars: number;
  ids: readonly string[];
}): StandingInstructionBudgetEvidence {
  const optionalChars = Math.max(0, input.totalChars - input.mandatoryChars);
  const inputHash = createHash("sha256")
    .update(JSON.stringify(input.segments.map((segment) => ({ id: segment.id, kind: segment.kind, mandatory: Boolean(segment.mandatory), chars: segment.content.length, lines: countLines(segment.content) }))))
    .digest("hex");
  return {
    policyVersion: STANDING_INSTRUCTION_BUDGET_VERSION,
    segmentCount: input.segments.length,
    totalChars: input.totalChars,
    totalLines: input.totalLines,
    mandatoryChars: input.mandatoryChars,
    optionalChars,
    maxChars: input.maxChars,
    maxLines: input.maxLines,
    withinBudget: input.totalChars <= input.maxChars && input.totalLines <= input.maxLines,
    inputHash,
    segmentIds: input.ids,
  };
}
