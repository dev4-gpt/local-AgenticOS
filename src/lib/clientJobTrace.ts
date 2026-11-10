import { AsyncLocalStorage } from "node:async_hooks";

const STAGES = ["claim", "budget_reserve", "provider_call", "budget_settle", "artifact_create", "artifact_upload", "artifact_confirm"] as const;
type Stage = typeof STAGES[number];
type Outcome = "ok" | "error" | "unknown";
type Span = { stage: Stage; offsetMs: number; durationMs: number; outcome: Outcome };
type StageSummary = { stage: Stage; ok: number; error: number; unknown: number };
type Trace = { version: 1 | 2; jobId: string; totalDurationMs: number; truncated: boolean; spans: Span[];
  stageSummary?: StageSummary[]; summaryTruncated?: boolean; inFlight?: number };
type Context = { jobId: string; startedAt: number; spans: Span[]; truncated: boolean;
  stageSummary: Map<Stage, StageSummary>; summaryTruncated: boolean; inFlight: number };
const context = new AsyncLocalStorage<Context>();
const MAX_SPANS = 32;
const RETAINED_INITIAL_SPANS = 24;
const MAX_DURATION_MS = 86_400_000;
const MAX_COUNT = 1_000_000;
const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function withClientJobTrace<T>(jobId: string, work: () => Promise<T>): Promise<T> {
  if (!JOB_ID.test(jobId)) return work();
  return context.run({ jobId, startedAt: performance.now(), spans: [], truncated: false,
    stageSummary: new Map(), summaryTruncated: false, inFlight: 0 }, work);
}

export async function traceClientJobStage<T>(stage: Stage, work: () => Promise<T>, succeeded: (result: T) => boolean = () => true): Promise<T> {
  const current = context.getStore();
  if (!current || !STAGES.includes(stage)) return work();
  const offsetMs = boundedMs(performance.now() - current.startedAt);
  current.inFlight++;
  let outcome: Span["outcome"] = "error";
  try {
    const result = await work();
    // An observer is not the operation: its failure must not trigger a replay.
    try { outcome = succeeded(result) ? "ok" : "error"; }
    catch { outcome = "unknown"; }
    return result;
  } finally {
    current.inFlight--;
    const summary = current.stageSummary.get(stage) ?? { stage, ok: 0, error: 0, unknown: 0 };
    if (summary[outcome] < MAX_COUNT) summary[outcome]++;
    else current.summaryTruncated = true;
    current.stageSummary.set(stage, summary);
    const span = { stage, offsetMs, durationMs: boundedMs(performance.now() - current.startedAt) - offsetMs, outcome };
    if (current.spans.length === MAX_SPANS) {
      current.truncated = true;
      current.spans.splice(RETAINED_INITIAL_SPANS, 1);
    }
    current.spans.push(span);
  }
}

export function clientJobTraceSnapshot(jobId: string): Trace | null {
  const current = context.getStore();
  if (!current || current.jobId !== jobId) return null;
  return { version: 2, jobId, totalDurationMs: boundedMs(performance.now() - current.startedAt), truncated: current.truncated,
    spans: current.spans.map((span) => ({ ...span })), stageSummary: [...current.stageSummary.values()].map((entry) => ({ ...entry })),
    summaryTruncated: current.summaryTruncated, inFlight: Math.min(MAX_COUNT, current.inFlight) };
}

export function safeClientJobTrace(value: unknown, jobId: string): Trace | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if ((raw.version !== 1 && raw.version !== 2) || raw.jobId !== jobId || !JOB_ID.test(jobId) || !Array.isArray(raw.spans) || raw.spans.length > MAX_SPANS) return null;
  if (!safeMs(raw.totalDurationMs) || typeof raw.truncated !== "boolean") return null;
  const spans: Span[] = [];
  for (const entry of raw.spans) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const span = entry as Record<string, unknown>;
    if (typeof span.stage !== "string" || !STAGES.includes(span.stage as Stage) || !safeMs(span.offsetMs) || !safeMs(span.durationMs)
      || (span.offsetMs as number) > (raw.totalDurationMs as number)
      || (span.offsetMs as number) + (span.durationMs as number) > (raw.totalDurationMs as number) + (raw.version === 1 ? 1 : 0)
      || (span.outcome !== "ok" && span.outcome !== "error" && !(raw.version === 2 && span.outcome === "unknown"))) return null;
    spans.push({ stage: span.stage as Stage, offsetMs: span.offsetMs as number, durationMs: span.durationMs as number, outcome: span.outcome as Span["outcome"] });
  }
  if (raw.version === 1) return { version: 1, jobId, totalDurationMs: raw.totalDurationMs as number, truncated: raw.truncated, spans };
  if (!Array.isArray(raw.stageSummary) || raw.stageSummary.length > STAGES.length || typeof raw.summaryTruncated !== "boolean" || !safeCount(raw.inFlight)) return null;
  const summaries = new Map<Stage, StageSummary>();
  for (const entry of raw.stageSummary) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const item = entry as Record<string, unknown>;
    if (typeof item.stage !== "string" || !STAGES.includes(item.stage as Stage) || summaries.has(item.stage as Stage)
      || !safeCount(item.ok) || !safeCount(item.error) || !safeCount(item.unknown)
      || (item.ok as number) + (item.error as number) + (item.unknown as number) === 0) return null;
    summaries.set(item.stage as Stage, { stage: item.stage as Stage, ok: item.ok as number, error: item.error as number, unknown: item.unknown as number });
  }
  for (const stage of STAGES) for (const outcome of ["ok", "error", "unknown"] as const) {
    const detailed = spans.filter((span) => span.stage === stage && span.outcome === outcome).length;
    const count = summaries.get(stage)?.[outcome] ?? 0;
    if (count < detailed || (!raw.truncated && count !== detailed)) return null;
  }
  const observed = [...summaries.values()].reduce((count, item) => count + item.ok + item.error + item.unknown, 0);
  if (raw.truncated && (spans.length !== MAX_SPANS || observed <= MAX_SPANS)) return null;
  if (raw.summaryTruncated && ![...summaries.values()].some((item) => [item.ok, item.error, item.unknown].includes(MAX_COUNT))) return null;
  return { version: 2, jobId, totalDurationMs: raw.totalDurationMs as number, truncated: raw.truncated, spans,
    stageSummary: [...summaries.values()], summaryTruncated: raw.summaryTruncated, inFlight: raw.inFlight as number };
}

function boundedMs(value: number) { return Math.min(MAX_DURATION_MS, Math.max(0, Math.round(value))); }
function safeMs(value: unknown) { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_DURATION_MS; }
function safeCount(value: unknown) { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNT; }
