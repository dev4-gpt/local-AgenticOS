import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import {
  cancelClientRuntimeJob, checkClientRuntimeRateLimit, deleteClientRecord, enqueueClientRuntimeJob,
  clientRpc, insertClientRecord, recordClientAudit, refundClientRuntimeRateLimit, selectClientRecords, updateClientRecord,
} from "@/lib/clientDataPlane";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { clientProviderRequestAllowed } from "@/lib/clientProviderAdapter";
import { clientCapabilityEnabled, clientProviderCallsEnabled } from "@/lib/clientRuntimePolicy";
import { clientWorkspaceJobConfigured } from "@/lib/clientCloudRunJobs";
import { enqueueClientRuntimeTask } from "@/lib/cloudTasks";
import { isAllowedV96ResearchUrl } from "@/lib/v96Contracts";
import {
  HERMES_FACTORY_TABLE, hermesFactoryApprovalPatch, hermesFactoryCanPublish,
  hermesFactoryDeliveryReplay, initialHermesFactoryStages, normalizeClientHermesFactoryRun,
} from "@/lib/clientHermesContentFactory";
import { createHermesContentFactoryPlan, type HermesContentFactoryType } from "@/lib/hermesContentFactory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function session() {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember()) || !clientCapabilityEnabled("orchestration")) return null;
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  return tenantSlug ? { userId: user.id, tenantSlug } : null;
}

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "cache-control": "private, no-store" } });
}

function done(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ok: true, ...payload }, { status, headers: { "cache-control": "private, no-store" } });
}

async function readRun(tenantSlug: string, id: string) {
  const result = await selectClientRecords(HERMES_FACTORY_TABLE, { tenant_slug: `eq.${tenantSlug}`, id: `eq.${id}`, limit: "1" });
  return result.ok && result.records[0] ? normalizeClientHermesFactoryRun(result.records[0]) : null;
}

export async function GET(request: Request) {
  const user = await session();
  if (!user) return fail("not_authenticated", 401);
  const limit = await checkClientRuntimeRateLimit("hermes-content-factory-read", 240, 900);
  if (!limit.ok) return fail("runtime_limit_unavailable", 503);
  if (!limit.allowed) return fail("runtime_rate_limited", 429);
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (id) {
    const run = await readRun(user.tenantSlug, id);
    return run ? done({ run }) : fail("content_factory_not_found", 404);
  }
  const result = await selectClientRecords(HERMES_FACTORY_TABLE, { tenant_slug: `eq.${user.tenantSlug}`, order: "created_at.desc", limit: "50" });
  if (!result.ok) return result.status === 404 ? done({ configured: false, runs: [] }) : fail("content_factory_read_failed", 502);
  return done({ configured: true, runs: result.records.map(normalizeClientHermesFactoryRun) });
}

export async function POST(request: Request) {
  const user = await session();
  if (!user) return fail("not_authenticated", 401);
  if (!clientProviderCallsEnabled()) return fail("provider_calls_require_approval", 403);
  const limit = await checkClientRuntimeRateLimit("hermes-content-factory-write", 20, 900);
  if (!limit.ok) return fail("runtime_limit_unavailable", 503);
  if (!limit.allowed) return fail("runtime_rate_limited", 429);

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const brief = typeof body.brief === "string" ? body.brief.trim().slice(0, 4000) : "";
  const contentType = typeof body.contentType === "string" ? body.contentType.trim() as HermesContentFactoryType : undefined;
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || (typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "");
  const sourceUrls = Array.isArray(body.sourceUrls) ? body.sourceUrls.filter((url): url is string => typeof url === "string").map((url) => url.trim()).slice(0, 8) : [];
  if (!brief || containsClientSecretLike(brief)) return fail("content_factory_input_invalid", 400);
  if (sourceUrls.length < 1 || sourceUrls.some((url) => !isAllowedV96ResearchUrl(url))) return fail("content_factory_sources_invalid", 400);

  let plan;
  try {
    plan = createHermesContentFactoryPlan({ tenantSlug: user.tenantSlug, brief, contentType, idempotencyKey: idempotencyKey || undefined });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "content_factory_input_invalid", 400);
  }
  const effectiveIdempotencyKey = idempotencyKey || plan.workflowId;
  const existing = await selectClientRecords(HERMES_FACTORY_TABLE, { tenant_slug: `eq.${user.tenantSlug}`, idempotency_key: `eq.${effectiveIdempotencyKey}`, limit: "1" });
  if (existing.ok && existing.records[0]) return done({ run: normalizeClientHermesFactoryRun(existing.records[0]), replayed: true });

  const runId = randomUUID();
  const providerName = process.env.CLIENT_WORKSPACE_PROVIDER?.trim().toLowerCase() || "hermes";
  const provider = clientProviderRequestAllowed(providerName, process.env.CLIENT_WORKSPACE_MODEL?.trim() || null);
  if (!provider.ok) return fail(provider.error, provider.status);
  const stored = await insertClientRecord(HERMES_FACTORY_TABLE, {
    id: runId,
    tenant_slug: user.tenantSlug,
    created_by: user.userId,
    workflow_id: plan.workflowId,
    idempotency_key: effectiveIdempotencyKey,
    content_type: plan.contentType,
    brief: plan.brief,
    plan,
    stages: initialHermesFactoryStages(plan),
    citations: [],
    status: "queued",
    current_stage: "brief",
  });
  if (!stored.ok) {
    const replay = await selectClientRecords(HERMES_FACTORY_TABLE, { tenant_slug: `eq.${user.tenantSlug}`, idempotency_key: `eq.${effectiveIdempotencyKey}`, limit: "1" });
    if (replay.ok && replay.records[0]) return done({ run: normalizeClientHermesFactoryRun(replay.records[0]), replayed: true });
    return fail(stored.status === 404 ? "content_factory_schema_missing" : "content_factory_write_failed", stored.status === 404 ? 503 : 502);
  }

  const jobId = await enqueueClientRuntimeJob({
    capability: "hermes-content-factory",
    provider: provider.provider,
    model: provider.model,
    idempotencyKey: `hermes-content-factory-${runId}`,
    inputMetadata: { hermesRunId: runId, workflowId: plan.workflowId, plan, sourceUrls },
  });
  if (!jobId) {
    await updateClientRecord(HERMES_FACTORY_TABLE, { id: `eq.${runId}`, tenant_slug: `eq.${user.tenantSlug}` }, { status: "failed", error_code: "content_factory_job_store_failed" });
    return fail("content_factory_job_store_failed", 502);
  }
  await updateClientRecord(HERMES_FACTORY_TABLE, { id: `eq.${runId}`, tenant_slug: `eq.${user.tenantSlug}` }, { job_id: jobId });
  const task = await enqueueClientRuntimeTask({ jobId, tenantSlug: user.tenantSlug, path: clientWorkspaceJobConfigured() ? "dispatch" : "jobs" });
  if (!task.ok) {
    await cancelClientRuntimeJob(jobId, task.error ?? "task_enqueue_failed");
    await refundClientRuntimeRateLimit("hermes-content-factory-write", 900);
    await updateClientRecord(HERMES_FACTORY_TABLE, { id: `eq.${runId}`, tenant_slug: `eq.${user.tenantSlug}` }, { status: "failed", error_code: (task.error ?? "task_enqueue_failed").slice(0, 120) });
    return fail(task.error ?? "task_enqueue_failed", task.status >= 500 ? 503 : task.status);
  }
  await recordClientAudit("hermes.content_factory_dispatched", { workflowId: plan.workflowId });
  const run = await readRun(user.tenantSlug, runId);
  return done({ run: run ?? { id: runId, workflowId: plan.workflowId, status: "queued" }, replayed: false }, 202);
}

export async function PATCH(request: Request) {
  const user = await session();
  if (!user) return fail("not_authenticated", 401);
  const limit = await checkClientRuntimeRateLimit("hermes-content-factory-write", 20, 900);
  if (!limit.ok) return fail("runtime_limit_unavailable", 503);
  if (!limit.allowed) return fail("runtime_rate_limited", 429);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  const run = id ? await readRun(user.tenantSlug, id) : null;
  if (!run) return fail("content_factory_not_found", 404);
  if (action === "approve") {
    if (run.status !== "awaiting_approval") return fail("content_factory_approval_not_allowed", 409);
    const patch = hermesFactoryApprovalPatch(run, user.userId);
    if (!patch) return fail("content_factory_approval_invalid", 409);
    const recorded = await clientRpc("record_client_hermes_content_factory_approval", {
      p_tenant_slug: user.tenantSlug, p_run_id: id, p_workflow_id: run.workflowId,
      p_approved_by: user.userId, p_approved_at: patch.approval.approvedAt,
    });
    if (!recorded.ok || !recorded.value) return fail(recorded.status === 409 ? "content_factory_approval_not_allowed" : "content_factory_write_failed", recorded.status === 409 ? 409 : 502);
    await recordClientAudit("hermes.content_factory_approved", { workflowId: run.workflowId });
    return done({ status: "approved", approval: recorded.value });
  }
  if (action === "publish") {
    if (hermesFactoryDeliveryReplay(run)) return done({ status: "published", delivery: run.delivery, replayed: true });
    if (run.status !== "approved") return fail("approval_required", 409);
    if (!hermesFactoryCanPublish(run)) return fail("approval_required", 409);
    const destination = typeof body.destination === "string" ? body.destination.trim().slice(0, 120) : "internal-review";
    if (!/^[a-z0-9][a-z0-9_-]{1,119}$/.test(destination)) return fail("content_factory_destination_invalid", 400);
    const recorded = await clientRpc("record_client_hermes_content_factory_delivery", {
      p_tenant_slug: user.tenantSlug, p_run_id: id, p_destination: destination,
    });
    if (!recorded.ok || !recorded.value) return fail("content_factory_write_failed", 502);
    await recordClientAudit("hermes.content_factory_delivery_recorded", { workflowId: run.workflowId, destination });
    return done({ status: "published", delivery: recorded.value });
  }
  return fail("content_factory_action_invalid", 400);
}

export async function DELETE(request: Request) {
  const user = await session();
  if (!user) return fail("not_authenticated", 401);
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return fail("content_factory_input_invalid", 400);
  const removed = await deleteClientRecord(HERMES_FACTORY_TABLE, { id: `eq.${id}`, tenant_slug: `eq.${user.tenantSlug}` });
  if (!removed.ok) return fail("content_factory_delete_failed", 502);
  await recordClientAudit("hermes.content_factory_deleted", {});
  return done({});
}
