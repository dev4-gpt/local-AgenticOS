import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, selectClientRecords } from "@/lib/clientDataPlane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_HOURS = 24;

export async function GET() {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return jsonError("not_authenticated", 401);

  const rateLimit = await checkClientRuntimeRateLimit("observability-read", 60, 900);
  if (!rateLimit.ok) return jsonError("runtime_limit_unavailable", 503);
  if (!rateLimit.allowed) return jsonError("runtime_rate_limited", 429);

  const tenantSlug = process.env.CLIENT_SLUG?.trim() ?? "";
  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const [audit, jobs] = await Promise.all([
    selectClientRecords("client_runtime_audit_events", {
      tenant_slug: `eq.${tenantSlug}`,
      created_at: `gte.${since}`,
      event_type: "like.client_runtime_*",
      order: "created_at.desc",
      limit: "250",
    }),
    selectClientRecords("client_runtime_jobs", {
      tenant_slug: `eq.${tenantSlug}`,
      created_at: `gte.${since}`,
      order: "created_at.desc",
      limit: "250",
    }),
  ]);

  if (!audit.ok || !jobs.ok) return jsonError("observability_read_failed", 502);

  const events = audit.records.map((record) => ({
    event: typeof record.event_type === "string" ? record.event_type : "runtime.event",
    createdAt: typeof record.created_at === "string" ? record.created_at : null,
    metadata: safeMetadata(record.metadata),
  }));
  const jobRecords = jobs.records.map((record) => ({
    provider: safeCode(record.provider),
    status: safeCode(record.status),
    createdAt: typeof record.created_at === "string" ? record.created_at : null,
    finishedAt: typeof record.finished_at === "string" ? record.finished_at : null,
    errorCode: safeCode(record.error_code),
  }));
  const counts = countEvents(events.map((event) => event.event));
  const providerCounts = countJobs(jobRecords);

  return NextResponse.json({
    ok: true,
    windowHours: WINDOW_HOURS,
    posthogConfigured: Boolean(process.env.POSTHOG_API_KEY?.trim()),
    counts,
    providerCounts,
    recentEvents: events.slice(0, 12),
    recentJobs: jobRecords.slice(0, 12),
  }, { headers: { "cache-control": "private, no-store" } });
}

function countEvents(events: string[]) {
  return events.reduce<Record<string, number>>((result, event) => {
    result[event] = (result[event] ?? 0) + 1;
    return result;
  }, {});
}

function countJobs(jobs: Array<{ provider: string | null; status: string | null }>) {
  return jobs.reduce<Record<string, { total: number; succeeded: number; failed: number; active: number }>>((result, job) => {
    const provider = job.provider ?? "unknown";
    const current = result[provider] ?? { total: 0, succeeded: 0, failed: 0, active: 0 };
    current.total += 1;
    if (job.status === "succeeded") current.succeeded += 1;
    else if (job.status === "failed" || job.status === "cancelled") current.failed += 1;
    else current.active += 1;
    result[provider] = current;
    return result;
  }, {});
}

function safeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key]) => ["provider", "route", "result", "source", "messageCount"].includes(key)).map(([key, item]) => [key, typeof item === "string" || typeof item === "number" ? item : undefined]).filter(([, item]) => item !== undefined));
}

function safeCode(value: unknown) {
  return typeof value === "string" && /^[a-z0-9_.:-]{1,96}$/i.test(value.trim()) ? value.trim() : null;
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "cache-control": "private, no-store" } });
}
