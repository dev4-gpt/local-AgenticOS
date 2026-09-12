import { NextResponse } from "next/server";
import { eccSession } from "@/lib/eccAuth";
import { eccHash, parseEccInput } from "@/lib/eccAdapter";
import { eccAdapter } from "@/lib/eccCatalog";
import { readEccBody } from "@/lib/eccLearning";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";
import { checkClientRuntimeRateLimit, clientRpc, enqueueClientRuntimeJob, selectClientRecords } from "@/lib/clientDataPlane";
import { enqueueClientRuntimeTask } from "@/lib/cloudTasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "cache-control": "private, no-store" } });
const fail = (error: string, status: number) => json({ ok: false, error }, status);
async function rate(write: boolean) {
  const result = await checkClientRuntimeRateLimit(write ? "ecc-workflow-write" : "ecc-workflow-read", write ? 20 : 120, 900);
  return !result.ok ? fail("runtime_limit_unavailable", 503) : !result.allowed ? fail("runtime_rate_limited", 429) : null;
}
async function enabled(tenant: string) {
  const result = await selectClientRecords("client_ecc_policy", { tenant_slug: `eq.${tenant}`, limit: "1" });
  return result.ok && result.records[0]?.enabled === true;
}

export async function GET() {
  const session = await eccSession(); if (!session) return fail("not_authenticated", 401);
  const limited = await rate(false); if (limited) return limited;
  const jobs = await selectClientRecords("client_runtime_jobs", { tenant_slug: `eq.${session.tenantSlug}`, capability: "eq.ecc-workflows", order: "created_at.desc", limit: "30", select: "id,status,error_code,created_at,finished_at,output_metadata" });
  if (!jobs.ok) return fail("ecc_jobs_unavailable", 503);
  return json({ ok: true, role: session.role, runtimeEnabled: clientCapabilityEnabled("ecc-workflows") && clientCapabilityEnabled("artifacts"), policyEnabled: await enabled(session.tenantSlug), jobs: jobs.records });
}

export async function PATCH(request: Request) {
  const session = await eccSession(); if (!session) return fail("not_authenticated", 401);
  if (!["owner", "admin"].includes(session.role)) return fail("ecc_policy_forbidden", 403);
  const limited = await rate(true); if (limited) return limited;
  const body = await readEccBody(request, ["enabled"]);
  if (!body || typeof body.enabled !== "boolean") return fail("ecc_input_invalid", 400);
  const result = await clientRpc("set_client_ecc_enabled", { p_tenant_slug: session.tenantSlug, p_enabled: body.enabled });
  return result.ok && result.value === true ? json({ ok: true }) : fail("ecc_policy_update_failed", 503);
}

export async function POST(request: Request) {
  const session = await eccSession(); if (!session) return fail("not_authenticated", 401);
  if (session.role === "viewer") return fail("ecc_execution_forbidden", 403);
  if (!clientCapabilityEnabled("ecc-workflows") || !clientCapabilityEnabled("artifacts") || !(await enabled(session.tenantSlug))) return fail("ecc_capability_not_enabled", 403);
  const limited = await rate(true); if (limited) return limited;
  const body = await readEccBody(request, ["input", "idempotencyKey", "learningRevisions"]);
  const input = parseEccInput(body?.input);
  if (!body || !input || typeof body.idempotencyKey !== "string" || !/^[a-zA-Z0-9:._-]{8,80}$/.test(body.idempotencyKey)) return fail("ecc_input_invalid", 400);
  if (!eccAdapter(input.adapterId)) return fail("ecc_adapter_unavailable", 422);
  const selections = body.learningRevisions ?? [];
  if (!Array.isArray(selections) || selections.length > 10 || selections.some(item => !item || typeof item !== "object" || Object.keys(item).some(key => !["id", "contentHash"].includes(key)) || typeof item.id !== "string" || !/^[0-9a-f-]{36}$/.test(item.id) || typeof item.contentHash !== "string" || !/^[0-9a-f]{64}$/.test(item.contentHash)) || new Set(selections.map(item => item.id)).size !== selections.length) return fail("ecc_lesson_selection_invalid", 400);
  const active = await clientRpc("active_client_ecc_revisions", { p_tenant_slug: session.tenantSlug });
  if (!active.ok || !Array.isArray(active.value)) return fail("ecc_learning_unavailable", 503);
  const reviewedLessons = [];
  for (const selection of selections) {
    const revision = active.value.find(row => row.id === selection.id && row.content_hash === selection.contentHash);
    if (!revision) return fail("ecc_lesson_not_active", 409);
    reviewedLessons.push({ id: revision.id, contentHash: revision.content_hash, content: revision.content });
  }
  if (Buffer.byteLength(JSON.stringify(reviewedLessons), "utf8") > 16000) return fail("ecc_lesson_context_too_large", 400);
  const requestHash = eccHash(JSON.stringify({ input, reviewedLessons }));
  const jobId = await enqueueClientRuntimeJob({ capability: "ecc-workflows", idempotencyKey: `ecc:${session.userId}:${body.idempotencyKey}`, inputMetadata: { surface: "orchestrate", eccInput: input, reviewedLessons, requestHash } });
  if (!jobId) return fail("ecc_job_store_failed", 503);
  const stored = await selectClientRecords("client_runtime_jobs", { tenant_slug: `eq.${session.tenantSlug}`, id: `eq.${jobId}`, requested_by: `eq.${session.userId}`, limit: "1" });
  const job = stored.records[0];
  const metadata = job?.input_metadata as Record<string, unknown> | undefined;
  if (!stored.ok || !job || metadata?.requestHash !== requestHash) return fail("ecc_idempotency_conflict", 409);
  if (job.status !== "queued") return json({ ok: true, jobId, status: job.status });
  // Retain queued state after a dispatch failure: the same key can safely
  // retry task creation, and the existing worker claim prevents duplicates.
  const task = await enqueueClientRuntimeTask({ jobId, tenantSlug: session.tenantSlug });
  if (!task.ok) return fail("ecc_dispatch_unavailable", 503);
  return json({ ok: true, jobId, status: "queued" }, 202);
}
