import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, countClientRecords, selectClientRecords } from "@/lib/clientDataPlane";
import { safeClientJobTrace } from "@/lib/clientJobTrace";
import { containsClientSecretLike } from "@/lib/clientInputSafety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_HOURS = 24;
const SAMPLE_LIMIT = 250;
const LEDGER_PAGE_SIZE = 1000;
const LEDGER_MAX_ROWS = 10000;

export async function GET() {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return jsonError("not_authenticated", 401);

  const rateLimit = await checkClientRuntimeRateLimit("observability-read", 60, 900);
  if (!rateLimit.ok) return jsonError("runtime_limit_unavailable", 503);
  if (!rateLimit.allowed) return jsonError("runtime_rate_limited", 429);

  const tenantSlug = process.env.CLIENT_SLUG?.trim() ?? "";
  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [audit, jobs, budget, artifacts] = await Promise.all([
    selectClientRecords("client_runtime_audit_events", {
      tenant_slug: `eq.${tenantSlug}`,
      created_at: `gte.${since}`,
      event_type: "like.client_runtime_*",
      order: "created_at.desc",
      limit: String(SAMPLE_LIMIT),
    }),
    selectClientRecords("client_runtime_jobs", {
      tenant_slug: `eq.${tenantSlug}`,
      created_at: `gte.${since}`,
      order: "created_at.desc",
      limit: String(SAMPLE_LIMIT),
    }),
    readMonthlyLedger(tenantSlug, monthStart.toISOString()),
    countClientRecords("client_runtime_artifacts", { tenant_slug: `eq.${tenantSlug}` }),
  ]);

  if (!audit.ok || !jobs.ok || !budget.ok || !artifacts.ok) return jsonError("observability_read_failed", 502);
  if (![...audit.records, ...jobs.records, ...budget.records].every((record) => record.tenant_slug === tenantSlug)) return jsonError("observability_scope_mismatch", 502);

  const events = audit.records.map((record) => ({
    event: typeof record.event_type === "string" && /^client_runtime_[a-z0-9_]{1,72}$/.test(record.event_type) ? record.event_type : "runtime.event",
    createdAt: typeof record.created_at === "string" ? record.created_at : null,
    metadata: safeMetadata(record.metadata),
  }));
  const jobRecords = jobs.records.map((record) => ({
    id: safeId(record.id),
    provider: safeCode(record.provider),
    model: safeCode(record.model),
    status: safeCode(record.status),
    createdAt: typeof record.created_at === "string" ? record.created_at : null,
    startedAt: typeof record.started_at === "string" ? record.started_at : null,
    finishedAt: typeof record.finished_at === "string" ? record.finished_at : null,
    errorCode: safeErrorCode(record.error_code),
    trace: safeClientJobTrace(record.output_metadata && typeof record.output_metadata === "object" && !Array.isArray(record.output_metadata) ? (record.output_metadata as Record<string, unknown>).__veloceExecutionTrace : null, safeId(record.id) ?? ""),
  }));
  const counts = countEvents(events.map((event) => event.event));
  const providerCounts = countJobs(jobRecords);
  const monthlyUsage = summarizeBudget(budget.records);

  return NextResponse.json({
    ok: true,
    windowHours: WINDOW_HOURS,
    posthogConfigured: Boolean(process.env.POSTHOG_API_KEY?.trim()),
    posthogCaptureEnabled: Boolean(process.env.POSTHOG_API_KEY?.trim()) && process.env.CLIENT_POSTHOG_CAPTURE_ENABLED === "1",
    sample: { eventsLimited: audit.records.length === SAMPLE_LIMIT, jobsLimited: jobs.records.length === SAMPLE_LIMIT, limit: SAMPLE_LIMIT },
    counts,
    providerCounts,
    monthlyUsage,
    artifacts: { total: artifacts.count },
    recentEvents: events.slice(0, 12),
    recentJobs: jobRecords.slice(0, 12),
  }, { headers: { "cache-control": "private, no-store" } });
}

async function readMonthlyLedger(tenantSlug: string, monthStart: string) {
  const records: Record<string, unknown>[] = [];
  let beforeId: string | null = null;
  for (let page = 0; page <= LEDGER_MAX_ROWS / LEDGER_PAGE_SIZE; page++) {
    const result = await selectClientRecords("client_runtime_budget_ledger", {
      tenant_slug: `eq.${tenantSlug}`,
      created_at: `gte.${monthStart}`,
      order: "id.desc",
      limit: String(LEDGER_PAGE_SIZE),
      ...(beforeId ? { id: `lt.${beforeId}` } : {}),
    });
    if (!result.ok) return { ok: false, records: [] as Record<string, unknown>[] };
    if (records.length + result.records.length > LEDGER_MAX_ROWS) return { ok: false, records: [] as Record<string, unknown>[] };
    records.push(...result.records);
    if (result.records.length < LEDGER_PAGE_SIZE) return { ok: true, records };
    const lastId = result.records.at(-1)?.id;
    if (!/^[1-9]\d*$/.test(String(lastId)) || String(lastId) === beforeId) return { ok: false, records: [] as Record<string, unknown>[] };
    beforeId = String(lastId);
  }
  return { ok: false, records: [] as Record<string, unknown>[] };
}

function countEvents(events: string[]) {
  return events.reduce<Record<string, number>>((result, event) => {
    result[event] = (result[event] ?? 0) + 1;
    return result;
  }, {});
}

function countJobs(jobs: Array<{ provider: string | null; model: string | null; status: string | null; createdAt: string | null; startedAt: string | null; finishedAt: string | null }>) {
  return jobs.reduce<Record<string, { total: number; succeeded: number; failed: number; active: number; averageLatencyMs: number | null; lastModel: string | null; latencyTotal: number; latencyCount: number }>>((result, job) => {
    const provider = job.provider ?? "unknown";
    const current = result[provider] ?? { total: 0, succeeded: 0, failed: 0, active: 0, averageLatencyMs: null, lastModel: null, latencyTotal: 0, latencyCount: 0 };
    current.total += 1;
    if (job.status === "succeeded") current.succeeded += 1;
    else if (job.status === "failed" || job.status === "cancelled") current.failed += 1;
    else current.active += 1;
    if (!current.lastModel && job.model) current.lastModel = job.model;
    const start = Date.parse(job.startedAt ?? job.createdAt ?? "");
    const finish = Date.parse(job.finishedAt ?? "");
    if (Number.isFinite(start) && Number.isFinite(finish) && finish >= start) {
      current.latencyTotal += finish - start;
      current.latencyCount += 1;
      current.averageLatencyMs = Math.round(current.latencyTotal / current.latencyCount);
    }
    result[provider] = current;
    return result;
  }, {} as Record<string, { total: number; succeeded: number; failed: number; active: number; averageLatencyMs: number | null; lastModel: string | null; latencyTotal: number; latencyCount: number }>);
}

function summarizeBudget(records: Record<string, unknown>[]) {
  const summary = { totalCostMicros: 0, inputTokens: 0, outputTokens: 0, byProvider: {} as Record<string, { costMicros: number; inputTokens: number; outputTokens: number; model: string | null }> };
  for (const record of records) {
    const provider = safeCode(record.provider) ?? "unknown";
    const amount = safeNonNegativeInteger(record.amount_micros);
    const usage = record.usage_metadata && typeof record.usage_metadata === "object" && !Array.isArray(record.usage_metadata) ? record.usage_metadata as Record<string, unknown> : {};
    const inputTokens = safeNonNegativeInteger(usage.inputTokens ?? usage.promptTokens);
    const outputTokens = safeNonNegativeInteger(usage.outputTokens ?? usage.completionTokens);
    const entry = summary.byProvider[provider] ?? { costMicros: 0, inputTokens: 0, outputTokens: 0, model: safeCode(record.model) };
    entry.costMicros += amount;
    entry.inputTokens += inputTokens;
    entry.outputTokens += outputTokens;
    if (!entry.model) entry.model = safeCode(record.model);
    summary.byProvider[provider] = entry;
    summary.totalCostMicros += amount;
    summary.inputTokens += inputTokens;
    summary.outputTokens += outputTokens;
  }
  return summary;
}

function safeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    if (!["provider", "route", "result", "source", "messageCount"].includes(key)) return [];
    if (key === "messageCount") return Number.isSafeInteger(item) && (item as number) >= 0 && (item as number) <= 999 ? [[key, item]] : [];
    const code = safeCode(item);
    return code ? [[key, code]] : [];
  }));
}

function safeCode(value: unknown) {
  return typeof value === "string" && /^[a-z0-9_.:-]{1,96}$/i.test(value.trim()) && !containsClientSecretLike(value) ? value.trim() : null;
}

function safeErrorCode(value: unknown) {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,95}$/.test(value) && !containsClientSecretLike(value) ? value : null;
}

function safeId(value: unknown) {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

function safeNonNegativeInteger(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "cache-control": "private, no-store" } });
}
