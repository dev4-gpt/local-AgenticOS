import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, enqueueClientRuntimeJob, selectClientRecords } from "@/lib/clientDataPlane";
import { deterministicCapabilityIdempotencyKey } from "@/lib/capabilityContracts";
import { enqueueClientRuntimeTask } from "@/lib/cloudTasks";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { clientCapabilityEnabled, clientCapabilityProviderEnabled, clientProviderCallsEnabled } from "@/lib/clientRuntimePolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(request: Request) {
  const session = await member();
  if (!session) return fail("not_authenticated", 401);
  const rate = await checkClientRuntimeRateLimit("research-read", 60, 900);
  if (!rate.ok) return fail("runtime_limit_unavailable", 503);
  if (!rate.allowed) return fail("runtime_rate_limited", 429);

  const notebookId = new URL(request.url).searchParams.get("notebookId")?.trim() ?? "";
  if (notebookId && !UUID.test(notebookId)) return fail("research_notebook_invalid", 400);
  const runs = await selectClientRecords("client_research_runs", {
    tenant_slug: `eq.${session.tenantSlug}`,
    ...(notebookId ? { notebook_id: `eq.${notebookId}` } : {}),
    order: "created_at.desc",
    limit: "50",
  });
  if (!runs.ok) return fail(runs.status === 404 ? "research_schema_missing" : "research_read_failed", runs.status === 404 ? 503 : 502);
  if (!runs.records.length) return NextResponse.json({ ok: true, runs: [] }, { headers: noStore() });

  const ids = runs.records.map((run) => typeof run.id === "string" && UUID.test(run.id) ? run.id : "").filter(Boolean);
  const [records, citations] = await Promise.all([
    selectClientRecords("client_research_records", { tenant_slug: `eq.${session.tenantSlug}`, research_run_id: `in.(${ids.join(",")})`, order: "retrieved_at.asc", limit: "500" }),
    selectClientRecords("client_research_citations", { tenant_slug: `eq.${session.tenantSlug}`, research_run_id: `in.(${ids.join(",")})`, order: "retrieved_at.asc", limit: "1000" }),
  ]);
  if (!records.ok || !citations.ok) return fail("research_read_failed", 502);

  return NextResponse.json({
    ok: true,
    runs: runs.records.map((run) => {
      const id = typeof run.id === "string" ? run.id : "";
      return {
        ...run,
        records: records.records.filter((record) => record.research_run_id === id).map(publicRecord),
        citations: citations.records.filter((citation) => citation.research_run_id === id).map(publicCitation),
      };
    }),
  }, { headers: noStore() });
}

export async function POST(request: Request) {
  const session = await member();
  if (!session) return fail("not_authenticated", 401);
  if (!clientCapabilityEnabled("seo-research")) return fail("capability_not_enabled", 403);
  if (!clientProviderCallsEnabled()) return fail("provider_calls_require_approval", 403);
  if (!clientCapabilityProviderEnabled("seo-research", "firecrawl", "FIRECRAWL_API_KEY")) return fail("provider_not_allowlisted", 403);
  const rate = await checkClientRuntimeRateLimit("research-write", 10, 900);
  if (!rate.ok) return fail("runtime_limit_unavailable", 503);
  if (!rate.allowed) return fail("runtime_rate_limited", 429);

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const input = body.input && typeof body.input === "object" && !Array.isArray(body.input) ? body.input as Record<string, unknown> : body;
  const query = typeof input.query === "string" ? input.query.trim().slice(0, 400) : "";
  const limit = Math.max(1, Math.min(3, Math.round(Number(input.limit ?? 3))));
  const scrapeResults = input.scrapeResults === true;
  const notebookId = typeof input.notebookId === "string" && UUID.test(input.notebookId.trim()) ? input.notebookId.trim() : null;
  if (!query || query.length < 3 || containsClientSecretLike(query) || (typeof input.notebookId === "string" && input.notebookId.trim() && !notebookId)) return fail("research_input_invalid", 400);

  const idempotencyKey = deterministicCapabilityIdempotencyKey("research", [session.tenantSlug, notebookId ?? "unfiled", query, String(limit), String(scrapeResults)]);
  const jobId = await enqueueClientRuntimeJob({
    capability: "seo-research",
    provider: "firecrawl",
    model: null,
    idempotencyKey,
    inputMetadata: { operation: "research", query, limit, scrapeResults, notebookId, idempotencyKey },
  });
  if (!jobId) return fail("job_store_failed", 503);
  const task = await enqueueClientRuntimeTask({ jobId, tenantSlug: session.tenantSlug });
  if (!task.ok) return fail(task.error ?? "task_enqueue_failed", task.status >= 500 ? 503 : task.status);
  return NextResponse.json({ ok: true, jobId, idempotencyKey, status: "queued" }, { status: 202, headers: noStore() });
}

async function member() {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember()) || !clientCapabilityEnabled("tenant-data")) return null;
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  return tenantSlug ? { userId: user.id, tenantSlug } : null;
}

function publicRecord(record: Record<string, unknown>) {
  return {
    id: record.id,
    sourceUrl: record.source_url,
    retrievedAt: record.retrieved_at,
    fields: record.fields,
    confidence: record.confidence,
    status: record.status,
    failureReason: record.failure_reason,
  };
}

function publicCitation(citation: Record<string, unknown>) {
  return {
    id: citation.id,
    researchRecordId: citation.research_record_id,
    url: citation.url,
    title: citation.title,
    retrievedAt: citation.retrieved_at,
    evidence: citation.evidence,
  };
}

function noStore() {
  return { "cache-control": "private, no-store" };
}

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: noStore() });
}
