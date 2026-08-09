import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import {
  cancelClientRuntimeJob, checkClientRuntimeRateLimit, deleteClientRecord, enqueueClientRuntimeJob,
  insertClientRecord, recordClientAudit, refundClientRuntimeRateLimit, selectClientRecords, updateClientRecord,
} from "@/lib/clientDataPlane";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { clientProviderRequestAllowed } from "@/lib/clientProviderAdapter";
import { clientCapabilityEnabled, clientProviderCallsEnabled } from "@/lib/clientRuntimePolicy";
import { clientWorkspaceJobConfigured } from "@/lib/clientCloudRunJobs";
import { enqueueClientRuntimeTask } from "@/lib/cloudTasks";
import {
  PIPELINE_STAGES, normalizePipelineItem, pipelineBuildPrompt, pipelineCanBuild, pipelineCanShape,
  pipelineSchemaMissing, pipelineShapePrompt, pipelineUniqueSlug, type PipelineItem,
} from "@/lib/clientPipelineAdapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "client_pipeline_items";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function session() {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember()) || !clientCapabilityEnabled("orchestration")) return null;
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  return tenantSlug ? { userId: user.id, tenantSlug } : null;
}

function fail(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code }, {
    status,
    headers: { "cache-control": "private, no-store", ...(code === "runtime_rate_limited" ? { "Retry-After": "900" } : {}) },
  });
}

function done(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ok: true, ...payload }, { status, headers: { "cache-control": "private, no-store" } });
}

async function readItems(tenantSlug: string) {
  const result = await selectClientRecords(TABLE, { tenant_slug: `eq.${tenantSlug}`, order: "created_at.desc", limit: "200" });
  if (!result.ok) return { ok: false as const, schemaMissing: pipelineSchemaMissing(result.status), status: result.status };
  return { ok: true as const, items: result.records.map(normalizePipelineItem) };
}

async function readItem(tenantSlug: string, id: string): Promise<PipelineItem | null> {
  const result = await selectClientRecords(TABLE, { tenant_slug: `eq.${tenantSlug}`, id: `eq.${id}`, limit: "1" });
  return result.ok && result.records[0] ? normalizePipelineItem(result.records[0]) : null;
}

export async function GET() {
  const user = await session();
  if (!user) return fail("not_authenticated", 401);
  const limit = await checkClientRuntimeRateLimit("pipeline-read", 240, 900);
  if (!limit.ok) return fail("runtime_limit_unavailable", 503);
  if (!limit.allowed) return fail("runtime_rate_limited", 429);
  const items = await readItems(user.tenantSlug);
  if (!items.ok) {
    return items.schemaMissing
      ? done({ configured: false, reason: "pipeline_schema_missing", items: [] })
      : fail("pipeline_read_failed", 502);
  }
  return done({ configured: true, items: items.items });
}

/** Capture a new idea, or run an approved job action against an existing item. */
export async function POST(request: Request) {
  const user = await session();
  if (!user) return fail("not_authenticated", 401);
  const limit = await checkClientRuntimeRateLimit("pipeline-write", 40, 900);
  if (!limit.ok) return fail("runtime_limit_unavailable", 503);
  if (!limit.allowed) return fail("runtime_rate_limited", 429);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "capture";

  if (action === "capture") return capture(user, body);
  if (action === "shape" || action === "build") return dispatch(user, body, action);
  return fail("pipeline_action_invalid", 400);
}

async function capture(user: { userId: string; tenantSlug: string }, body: Record<string, unknown>) {
  const idea = typeof body.idea === "string" ? body.idea.trim().slice(0, 20_000) : "";
  if (!idea) return fail("pipeline_input_invalid", 400);
  if (containsClientSecretLike(idea)) return fail("secret_like_input_rejected", 400);
  const title = typeof body.title === "string" && body.title.trim()
    ? body.title.trim().slice(0, 240)
    : idea.split("\n")[0].slice(0, 80);

  const existing = await readItems(user.tenantSlug);
  if (!existing.ok) return fail(existing.schemaMissing ? "pipeline_schema_missing" : "pipeline_read_failed", existing.schemaMissing ? 503 : 502);

  const id = randomUUID();
  const stored = await insertClientRecord(TABLE, {
    id,
    tenant_slug: user.tenantSlug,
    created_by: user.userId,
    slug: pipelineUniqueSlug(title, existing.items.map((item) => item.slug)),
    title,
    idea,
  });
  if (!stored.ok) return fail(stored.status === 404 ? "pipeline_schema_missing" : "pipeline_write_failed", stored.status === 404 ? 503 : 502);
  await recordClientAudit("pipeline.captured", {});
  return done({ id }, 201);
}

/**
 * Queues the shaping or execute job. Shaping classifies and plans; execute
 * builds the artifact. Both run through the approved provider lane, and neither
 * may cross the human gate — approval stays a member action.
 */
async function dispatch(user: { userId: string; tenantSlug: string }, body: Record<string, unknown>, action: "shape" | "build") {
  if (!clientProviderCallsEnabled()) return fail("provider_calls_require_approval", 403);
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!UUID_RE.test(id)) return fail("pipeline_input_invalid", 400);
  const item = await readItem(user.tenantSlug, id);
  if (!item) return fail("pipeline_item_not_found", 404);
  if (action === "shape" && !pipelineCanShape(item)) return fail("pipeline_shape_not_allowed", 409);
  if (action === "build" && !pipelineCanBuild(item)) return fail("pipeline_build_not_allowed", 409);

  const provider = process.env.CLIENT_WORKSPACE_PROVIDER?.trim().toLowerCase() || "openrouter";
  const policy = clientProviderRequestAllowed(provider, process.env.CLIENT_WORKSPACE_MODEL?.trim() || null);
  if (!policy.ok) return fail(policy.error, policy.status);

  const capability = action === "shape" ? "pipeline-shape" : "workspace-execution";
  const jobId = await enqueueClientRuntimeJob({
    capability,
    provider: policy.provider,
    model: policy.model,
    idempotencyKey: `pipeline-${action}-${id}-${randomUUID()}`,
    inputMetadata: action === "shape"
      ? { pipelineItemId: id, prompt: pipelineShapePrompt({ idea: item.idea, title: item.title }) }
      : {
        surface: "pipeline",
        title: item.title,
        goal: item.idea,
        artifactIntent: "preview",
        promptOverride: pipelineBuildPrompt(item),
        pipelineItemId: id,
      },
  });
  if (!jobId) return fail("pipeline_job_store_failed", 502);

  await updateClientRecord(TABLE, { id: `eq.${id}`, tenant_slug: `eq.${user.tenantSlug}` }, {
    execution_job_id: jobId,
    execution_state: "queued",
    execution_error: null,
    ...(action === "shape" ? { stage: "shaping" } : {}),
    updated_at: new Date().toISOString(),
  });

  const task = await enqueueClientRuntimeTask({ jobId, tenantSlug: user.tenantSlug, path: clientWorkspaceJobConfigured() ? "dispatch" : "jobs" });
  if (!task.ok) {
    const taskError = task.error ?? "task_enqueue_failed";
    await cancelClientRuntimeJob(jobId, taskError);
    await refundClientRuntimeRateLimit("pipeline-write", 900);
    await updateClientRecord(TABLE, { id: `eq.${id}`, tenant_slug: `eq.${user.tenantSlug}` }, {
      execution_state: "failed", execution_error: taskError.slice(0, 120), updated_at: new Date().toISOString(),
    });
    return fail(taskError, task.status >= 500 ? 503 : task.status);
  }
  await recordClientAudit(`pipeline.${action}_dispatched`, { provider: policy.provider });
  return done({ jobId, status: "queued" }, 202);
}

/** Human gate decisions, pinning, and manual stage moves. */
export async function PATCH(request: Request) {
  const user = await session();
  if (!user) return fail("not_authenticated", 401);
  const limit = await checkClientRuntimeRateLimit("pipeline-write", 40, 900);
  if (!limit.ok) return fail("runtime_limit_unavailable", 503);
  if (!limit.allowed) return fail("runtime_rate_limited", 429);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!UUID_RE.test(id)) return fail("pipeline_input_invalid", 400);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const decision = typeof body.decision === "string" ? body.decision.trim().toLowerCase() : null;
  if (decision) {
    if (decision !== "approve" && decision !== "reject") return fail("pipeline_input_invalid", 400);
    const item = await readItem(user.tenantSlug, id);
    if (!item) return fail("pipeline_item_not_found", 404);
    // The gate exists precisely so approval cannot happen implicitly.
    if (item.stage !== "review") return fail("pipeline_decision_not_allowed", 409);
    patch.stage = decision === "approve" ? "building" : "rejected";
    patch.decided_by = user.userId;
    patch.decided_at = new Date().toISOString();
  }
  if (typeof body.pinned === "boolean") patch.pinned = body.pinned;
  if (typeof body.stage === "string" && (PIPELINE_STAGES as readonly string[]).includes(body.stage)) patch.stage = body.stage;
  if (typeof body.title === "string" && body.title.trim()) {
    if (containsClientSecretLike(body.title)) return fail("secret_like_input_rejected", 400);
    patch.title = body.title.trim().slice(0, 240);
  }
  if (Object.keys(patch).length <= 1) return fail("pipeline_input_invalid", 400);

  const updated = await updateClientRecord(TABLE, { id: `eq.${id}`, tenant_slug: `eq.${user.tenantSlug}` }, patch);
  if (!updated.ok) return fail("pipeline_write_failed", 502);
  if (decision) await recordClientAudit(`pipeline.${decision}d`, {});
  return done({});
}

export async function DELETE(request: Request) {
  const user = await session();
  if (!user) return fail("not_authenticated", 401);
  const limit = await checkClientRuntimeRateLimit("pipeline-write", 40, 900);
  if (!limit.ok) return fail("runtime_limit_unavailable", 503);
  if (!limit.allowed) return fail("runtime_rate_limited", 429);
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!UUID_RE.test(id)) return fail("pipeline_input_invalid", 400);
  const removed = await deleteClientRecord(TABLE, { id: `eq.${id}`, tenant_slug: `eq.${user.tenantSlug}` });
  if (!removed.ok) return fail("pipeline_delete_failed", 502);
  await recordClientAudit("pipeline.deleted", {});
  return done({});
}
