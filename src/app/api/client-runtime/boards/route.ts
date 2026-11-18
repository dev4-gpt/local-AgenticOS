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
  boardBuildPrompt, boardCanBuild, defaultBoardStatus, isBoardKind, isBoardStatus,
  normalizeBoardComment, normalizeBoardEvent, normalizeBoardTask, boardSchemaMissing, type BoardKind,
} from "@/lib/clientBoardAdapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TASKS = "client_board_tasks";
const COMMENTS = "client_board_comments";
const EVENTS = "client_board_events";
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

export async function GET(request: Request) {
  const user = await session();
  if (!user) return fail("not_authenticated", 401);
  const limit = await checkClientRuntimeRateLimit("board-read", 240, 900);
  if (!limit.ok) return fail("runtime_limit_unavailable", 503);
  if (!limit.allowed) return fail("runtime_rate_limited", 429);
  const params = new URL(request.url).searchParams;
  const board = params.get("board")?.trim() ?? "";
  if (!isBoardKind(board)) return fail("board_input_invalid", 400);
  const taskId = params.get("taskId")?.trim() ?? "";

  if (taskId) {
    if (!UUID_RE.test(taskId)) return fail("board_input_invalid", 400);
    const activeAfter = new Date().toISOString();
    const [comments, events] = await Promise.all([
      selectClientRecords(COMMENTS, { tenant_slug: `eq.${user.tenantSlug}`, task_id: `eq.${taskId}`, retention_expires_at: `gt.${activeAfter}`, order: "created_at.asc", limit: "100" }),
      selectClientRecords(EVENTS, { tenant_slug: `eq.${user.tenantSlug}`, task_id: `eq.${taskId}`, retention_expires_at: `gt.${activeAfter}`, order: "created_at.desc", limit: "50" }),
    ]);
    if (!comments.ok || !events.ok) return fail("board_read_failed", 502);
    return done({
      configured: true,
      comments: comments.records.map(normalizeBoardComment),
      events: events.records.map(normalizeBoardEvent),
    });
  }

  const result = await selectClientRecords(TASKS, {
    tenant_slug: `eq.${user.tenantSlug}`, board: `eq.${board}`, retention_expires_at: `gt.${new Date().toISOString()}`, order: "created_at.desc", limit: "200",
  });
  if (!result.ok) {
    return boardSchemaMissing(result.status)
      ? done({ configured: false, reason: "board_schema_missing", tasks: [] })
      : fail("board_read_failed", 502);
  }
  return done({ configured: true, tasks: result.records.map(normalizeBoardTask) });
}

export async function POST(request: Request) {
  const user = await session();
  if (!user) return fail("not_authenticated", 401);
  const limit = await checkClientRuntimeRateLimit("board-write", 60, 900);
  if (!limit.ok) return fail("runtime_limit_unavailable", 503);
  if (!limit.allowed) return fail("runtime_rate_limited", 429);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "create";
  if (action === "comment") return comment(user, body);
  if (action === "build") return build(user, body);
  if (action !== "create") return fail("board_action_invalid", 400);

  const board = typeof body.board === "string" ? body.board.trim() : "";
  if (!isBoardKind(board)) return fail("board_input_invalid", 400);
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 240) : "";
  const taskBody = typeof body.body === "string" ? body.body.trim().slice(0, 20_000) : "";
  if (!title) return fail("board_input_invalid", 400);
  if (containsClientSecretLike(title, taskBody)) return fail("secret_like_input_rejected", 400);

  const id = randomUUID();
  const stored = await insertClientRecord(TASKS, {
    id,
    tenant_slug: user.tenantSlug,
    created_by: user.userId,
    board,
    title,
    body: taskBody,
    status: defaultBoardStatus(board as BoardKind),
    priority: typeof body.priority === "number" ? Math.min(4, Math.max(0, Math.round(body.priority))) : 2,
    assignee: typeof body.assignee === "string" && body.assignee.trim() ? body.assignee.trim().slice(0, 80) : null,
  });
  if (!stored.ok) return fail(stored.status === 404 ? "board_schema_missing" : "board_write_failed", stored.status === 404 ? 503 : 502);
  await insertClientRecord(EVENTS, { tenant_slug: user.tenantSlug, task_id: id, kind: "created", detail: "" });
  await recordClientAudit("board.task_created", { board });
  return done({ id }, 201);
}

async function comment(user: { userId: string; tenantSlug: string }, body: Record<string, unknown>) {
  const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 10_000) : "";
  if (!UUID_RE.test(taskId) || !text) return fail("board_input_invalid", 400);
  if (containsClientSecretLike(text)) return fail("secret_like_input_rejected", 400);
  const stored = await insertClientRecord(COMMENTS, {
    tenant_slug: user.tenantSlug, task_id: taskId, created_by: user.userId, body: text,
  });
  if (!stored.ok) return fail("board_write_failed", 502);
  return done({}, 201);
}

/** Agent Kanban cards build through the shared workspace-execution lane. */
async function build(user: { userId: string; tenantSlug: string }, body: Record<string, unknown>) {
  if (!clientProviderCallsEnabled()) return fail("provider_calls_require_approval", 403);
  const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
  if (!UUID_RE.test(taskId)) return fail("board_input_invalid", 400);
  const found = await selectClientRecords(TASKS, { tenant_slug: `eq.${user.tenantSlug}`, id: `eq.${taskId}`, retention_expires_at: `gt.${new Date().toISOString()}`, limit: "1" });
  if (!found.ok || !found.records[0]) return fail("board_task_not_found", 404);
  const task = normalizeBoardTask(found.records[0]);
  if (!boardCanBuild(task)) return fail("board_build_not_allowed", 409);

  const provider = process.env.CLIENT_WORKSPACE_PROVIDER?.trim().toLowerCase() || "openrouter";
  const policy = clientProviderRequestAllowed(provider, process.env.CLIENT_WORKSPACE_MODEL?.trim() || null);
  if (!policy.ok) return fail(policy.error, policy.status);

  const jobId = await enqueueClientRuntimeJob({
    capability: "workspace-execution",
    provider: policy.provider,
    model: policy.model,
    idempotencyKey: `board-build-${taskId}-${randomUUID()}`,
    inputMetadata: {
      surface: "agent-kanban",
      title: task.title,
      goal: task.body || task.title,
      artifactIntent: "preview",
      promptOverride: boardBuildPrompt(task),
      boardTaskId: taskId,
    },
  });
  if (!jobId) return fail("board_job_store_failed", 502);

  await updateClientRecord(TASKS, { id: `eq.${taskId}`, tenant_slug: `eq.${user.tenantSlug}` }, {
    execution_job_id: jobId, execution_state: "queued", execution_error: null,
    status: "building", updated_at: new Date().toISOString(),
  });

  const task_ = await enqueueClientRuntimeTask({ jobId, tenantSlug: user.tenantSlug, path: clientWorkspaceJobConfigured() ? "dispatch" : "jobs" });
  if (!task_.ok) {
    const taskError = task_.error ?? "task_enqueue_failed";
    await cancelClientRuntimeJob(jobId, taskError);
    await refundClientRuntimeRateLimit("board-write", 900);
    await updateClientRecord(TASKS, { id: `eq.${taskId}`, tenant_slug: `eq.${user.tenantSlug}` }, {
      execution_state: "failed", execution_error: taskError.slice(0, 120), updated_at: new Date().toISOString(),
    });
    return fail(taskError, task_.status >= 500 ? 503 : task_.status);
  }
  await recordClientAudit("board.build_dispatched", { provider: policy.provider });
  return done({ jobId, status: "queued" }, 202);
}

export async function PATCH(request: Request) {
  const user = await session();
  if (!user) return fail("not_authenticated", 401);
  const limit = await checkClientRuntimeRateLimit("board-write", 60, 900);
  if (!limit.ok) return fail("runtime_limit_unavailable", 503);
  if (!limit.allowed) return fail("runtime_rate_limited", 429);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const board = typeof body.board === "string" ? body.board.trim() : "";
  if (!UUID_RE.test(id) || !isBoardKind(board)) return fail("board_input_invalid", 400);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  // A status only applies on the board that owns that vocabulary.
  if (typeof body.status === "string") {
    if (!isBoardStatus(board, body.status)) return fail("board_status_invalid", 400);
    patch.status = body.status;
    if (body.status === "done" || body.status === "rejected") patch.completed_at = new Date().toISOString();
  }
  if (typeof body.priority === "number") patch.priority = Math.min(4, Math.max(0, Math.round(body.priority)));
  if (body.assignee === null) patch.assignee = null;
  else if (typeof body.assignee === "string") patch.assignee = body.assignee.trim().slice(0, 80) || null;
  if (typeof body.title === "string" && body.title.trim()) {
    if (containsClientSecretLike(body.title)) return fail("secret_like_input_rejected", 400);
    patch.title = body.title.trim().slice(0, 240);
  }
  if (typeof body.body === "string") {
    if (containsClientSecretLike(body.body)) return fail("secret_like_input_rejected", 400);
    patch.body = body.body.trim().slice(0, 20_000);
  }
  if (Object.keys(patch).length <= 1) return fail("board_input_invalid", 400);

  const updated = await updateClientRecord(TASKS, { id: `eq.${id}`, tenant_slug: `eq.${user.tenantSlug}`, board: `eq.${board}`, retention_expires_at: `gt.${new Date().toISOString()}` }, patch);
  if (!updated.ok) return fail("board_write_failed", 502);
  if (patch.status) {
    await insertClientRecord(EVENTS, { tenant_slug: user.tenantSlug, task_id: id, kind: `moved:${patch.status}`, detail: "" });
  }
  return done({});
}

export async function DELETE(request: Request) {
  const user = await session();
  if (!user) return fail("not_authenticated", 401);
  const limit = await checkClientRuntimeRateLimit("board-write", 60, 900);
  if (!limit.ok) return fail("runtime_limit_unavailable", 503);
  if (!limit.allowed) return fail("runtime_rate_limited", 429);
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!UUID_RE.test(id)) return fail("board_input_invalid", 400);
  const removed = await deleteClientRecord(TASKS, { id: `eq.${id}`, tenant_slug: `eq.${user.tenantSlug}`, retention_expires_at: `gt.${new Date().toISOString()}` });
  if (!removed.ok) return fail("board_delete_failed", 502);
  await recordClientAudit("board.task_deleted", {});
  return done({});
}
