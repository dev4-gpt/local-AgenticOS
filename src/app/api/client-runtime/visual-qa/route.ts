import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { cancelClientRuntimeJob, checkClientRuntimeRateLimit, enqueueClientRuntimeJob, refundClientRuntimeRateLimit, selectClientRecords } from "@/lib/clientDataPlane";
import { enqueueClientRuntimeTask } from "@/lib/cloudTasks";
import { clientVisualQaJobConfigured } from "@/lib/clientCloudRunJobs";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";
import { validateClientVisualQaInput } from "@/lib/clientVisualQaAdapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return error("not_authenticated", 401);
  if (!clientCapabilityEnabled("visual-qa")) return error("capability_not_enabled", 403);
  const rate = await checkClientRuntimeRateLimit("visual-qa-read", 60, 900);
  if (!rate.ok) return error("runtime_limit_unavailable", 503);
  if (!rate.allowed) return error("runtime_rate_limited", 429);
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!tenantSlug) return error("tenant_not_configured", 503);
  const artifactId = new URL(request.url).searchParams.get("artifactId")?.trim();
  const reports = await selectClientRecords("client_visual_qa_reports", {
    tenant_slug: `eq.${tenantSlug}`,
    ...(artifactId ? { artifact_id: `eq.${artifactId}` } : {}),
    order: "created_at.desc",
    limit: "30",
  });
  if (!reports.ok) return error("visual_qa_read_failed", 502);
  const findings = await selectClientRecords("client_visual_qa_findings", {
    tenant_slug: `eq.${tenantSlug}`,
    order: "id.desc",
    limit: "300",
  });
  return NextResponse.json({ ok: true, reports: reports.records, findings: findings.ok ? findings.records : [] }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return error("not_authenticated", 401);
  if (!clientCapabilityEnabled("visual-qa")) return error("capability_not_enabled", 403);
  const rate = await checkClientRuntimeRateLimit("visual-qa-write", 12, 900);
  if (!rate.ok) return error("runtime_limit_unavailable", 503);
  if (!rate.allowed) return error("runtime_rate_limited", 429);
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!tenantSlug) return error("tenant_not_configured", 503);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const input: Record<string, unknown> = body.input && typeof body.input === "object" && !Array.isArray(body.input)
    ? { ...(body.input as Record<string, unknown>), tenantSlug }
    : { ...body, tenantSlug };
  const validation = validateClientVisualQaInput(input);
  if (validation.length > 0) return error(validation[0], 400);
  const artifactId = String(input.artifactId);
  const artifact = await selectClientRecords("client_runtime_artifacts", { id: `eq.${artifactId}`, tenant_slug: `eq.${tenantSlug}`, limit: "1" });
  if (!artifact.ok || !artifact.records[0]) return error("artifact_not_found", 404);
  const createdBy = typeof artifact.records[0].created_by === "string" ? artifact.records[0].created_by : "";
  const jobId = typeof artifact.records[0].job_id === "string" ? artifact.records[0].job_id : "";
  if (createdBy !== user.id && jobId) {
    const owner = await selectClientRecords("client_runtime_jobs", { id: `eq.${jobId}`, tenant_slug: `eq.${tenantSlug}`, requested_by: `eq.${user.id}`, limit: "1" });
    if (!owner.ok || !owner.records[0]) return error("artifact_not_found", 404);
  } else if (createdBy !== user.id) {
    return error("artifact_not_found", 404);
  }
  const idempotencyKey = typeof body.idempotencyKey === "string" && body.idempotencyKey.trim().length >= 8 ? body.idempotencyKey.trim().slice(0, 180) : `visual-qa-${randomUUID()}`;
  const job = await enqueueClientRuntimeJob({ capability: "visual-qa", provider: null, model: "contract-only", idempotencyKey, inputMetadata: { ...input, surface: "quality" } });
  if (!job) return error("visual_qa_store_failed", 503);
  const task = await enqueueClientRuntimeTask({ jobId: job, tenantSlug, path: clientVisualQaJobConfigured() ? "visual-qa-dispatch" : "jobs" });
  if (!task.ok) {
    await cancelClientRuntimeJob(job, task.error ?? "task_enqueue_failed");
    await refundClientRuntimeRateLimit("visual-qa-write", 900);
    return error(task.error ?? "task_enqueue_failed", task.status >= 500 ? 503 : task.status);
  }
  return NextResponse.json({ ok: true, jobId: job, status: "queued", capability: "visual-qa" }, { status: 202, headers: { "cache-control": "no-store" } });
}

function error(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code }, { status, headers: { "cache-control": "no-store" } });
}
