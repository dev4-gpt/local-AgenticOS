import { AsyncLocalStorage } from "node:async_hooks";

const STAGES = ["claim", "budget_reserve", "provider_call", "budget_settle", "artifact_create", "artifact_upload", "artifact_confirm"] as const;
type Stage = typeof STAGES[number];
type Span = { stage: Stage; offsetMs: number; durationMs: number; outcome: "ok" | "error" };
type Trace = { version: 1; jobId: string; totalDurationMs: number; truncated: boolean; spans: Span[] };
type Context = { jobId: string; startedAt: number; spans: Span[]; truncated: boolean };
const context = new AsyncLocalStorage<Context>();
const MAX_SPANS = 32;
const MAX_DURATION_MS = 86_400_000;
const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function withClientJobTrace<T>(jobId: string, work: () => Promise<T>): Promise<T> {
  if (!JOB_ID.test(jobId)) return work();
  return context.run({ jobId, startedAt: performance.now(), spans: [], truncated: false }, work);
}

export async function traceClientJobStage<T>(stage: Stage, work: () => Promise<T>, succeeded: (result: T) => boolean = () => true): Promise<T> {
  const current = context.getStore();
  if (!current) return work();
  const startedAt = performance.now();
  let outcome: Span["outcome"] = "error";
  try {
    const result = await work();
    outcome = succeeded(result) ? "ok" : "error";
    return result;
  } finally {
    if (current.spans.length < MAX_SPANS) {
      current.spans.push({ stage, offsetMs: boundedMs(startedAt - current.startedAt), durationMs: boundedMs(performance.now() - startedAt), outcome });
    } else current.truncated = true;
  }
}

export function clientJobTraceSnapshot(jobId: string): Trace | null {
  const current = context.getStore();
  if (!current || current.jobId !== jobId) return null;
  return { version: 1, jobId, totalDurationMs: boundedMs(performance.now() - current.startedAt), truncated: current.truncated, spans: [...current.spans] };
}

export function safeClientJobTrace(value: unknown, jobId: string): Trace | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1 || raw.jobId !== jobId || !JOB_ID.test(jobId) || !Array.isArray(raw.spans) || raw.spans.length > MAX_SPANS) return null;
  if (!safeMs(raw.totalDurationMs) || typeof raw.truncated !== "boolean") return null;
  const spans: Span[] = [];
  for (const entry of raw.spans) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const span = entry as Record<string, unknown>;
    if (typeof span.stage !== "string" || !STAGES.includes(span.stage as Stage) || !safeMs(span.offsetMs) || !safeMs(span.durationMs) || (span.outcome !== "ok" && span.outcome !== "error")) return null;
    spans.push({ stage: span.stage as Stage, offsetMs: span.offsetMs as number, durationMs: span.durationMs as number, outcome: span.outcome as Span["outcome"] });
  }
  return { version: 1, jobId, totalDurationMs: raw.totalDurationMs as number, truncated: raw.truncated, spans };
}

function boundedMs(value: number) { return Math.min(MAX_DURATION_MS, Math.max(0, Math.round(value))); }
function safeMs(value: unknown) { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_DURATION_MS; }
