import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { cancelClientRuntimeJob, consumeClientRuntimeRateLimit, deleteClientRecord, enqueueClientRuntimeJob, insertClientRecord, recordClientAudit, selectClientRecords, updateClientRecord } from "@/lib/clientDataPlane";
import { clientProviderRequestAllowed } from "@/lib/clientProviderAdapter";
import { enqueueClientRuntimeTask } from "@/lib/cloudTasks";
import { clientCapabilityEnabled, clientProviderCallsEnabled } from "@/lib/clientRuntimePolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SURFACES = new Set(["orchestrate", "paperclip", "room", "pipeline", "agent-kanban", "kanban", "loop", "ruflo"]);
const OPERATIONS = new Set(["plan", "review", "build", "improve", "dispatch", "iterate"]);
const STATUSES = new Set(["active", "done", "archived"]);
const STEP_STATUSES = new Set(["todo", "in_progress", "done", "blocked"]);
const SECRET_LIKE = /(api[_ -]?key|secret|password|private[_ -]?key|access[_ -]?token)\s*[:=]/i;

export async function GET(request: Request) {
  const user = await authenticatedMember();
  if (!user) return error("not_authenticated", 401);
  if (!(await consumeClientRuntimeRateLimit("workflow-read", 120, 900))) return error("runtime_rate_limited", 429);
  const surface = new URL(request.url).searchParams.get("surface")?.trim().toLowerCase() ?? "";
  const filters: Record<string, string> = {
    tenant_slug: `eq.${process.env.CLIENT_SLUG ?? ""}`,
    kind: "eq.workflow",
    order: "created_at.desc",
    limit: "100",
  };
  if (surface && SURFACES.has(surface)) filters["metadata->>surface"] = `eq.${surface}`;
  const result = await selectClientRecords("client_runtime_records", filters);
  if (!result.ok) return error("workflow_read_failed", 502);
  return NextResponse.json({ ok: true, workflows: result.records }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  const user = await authenticatedMember();
  if (!user) return error("not_authenticated", 401);
  if (!(await consumeClientRuntimeRateLimit("workflow-write", 30, 900))) return error("runtime_rate_limited", 429);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const surface = typeof body.surface === "string" ? body.surface.trim().toLowerCase() : "orchestrate";
  const operation = typeof body.operation === "string" ? body.operation.trim().toLowerCase() : "plan";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 240) : "";
  const goal = typeof body.goal === "string" ? body.goal.trim().slice(0, 10000) : "";
  if (!SURFACES.has(surface) || !OPERATIONS.has(operation) || !title || !goal || SECRET_LIKE.test(`${title}\n${goal}`)) return error("workflow_input_invalid", 400);
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!tenantSlug) return error("tenant_not_configured", 503);
  const workflowId = randomUUID();
  const steps = buildSteps(surface, operation).map((step) => ({ id: randomUUID(), title: step, status: "todo" }));
  const metadata = { version: 1, surface, operation, steps };
  const stored = await insertClientRecord("client_runtime_records", {
    id: workflowId,
    tenant_slug: tenantSlug,
    created_by: user.id,
    kind: "workflow",
    title,
    content: goal,
    metadata,
  });
  if (!stored.ok) return error("workflow_write_failed", 502);
  if (operation === "dispatch") {
    if (!clientProviderCallsEnabled()) {
      await updateExecution(workflowId, tenantSlug, user.id, metadata, { status: "approval_required" });
      return error("provider_calls_require_approval", 403);
    }
    const provider = process.env.CLIENT_WORKFLOW_PROVIDER?.trim().toLowerCase() || "openrouter";
    const policy = clientProviderRequestAllowed(provider, process.env.CLIENT_WORKFLOW_MODEL);
    if (!policy.ok) {
      await updateExecution(workflowId, tenantSlug, user.id, metadata, { status: "failed", errorCode: policy.error });
      return error(policy.error, policy.status);
    }
    const prompt = `Execute the approved tenant workflow. Surface: ${surface}. Title: ${title}. Goal and constraints:\n${goal}`.slice(0, 20_000);
    const jobId = await enqueueClientRuntimeJob({
      capability: "text-agents",
      provider: policy.provider,
      model: policy.model,
      idempotencyKey: `workflow-${workflowId}`,
      inputMetadata: { prompt, history: [], workflowId, surface, steps },
    });
    if (!jobId) {
      await updateExecution(workflowId, tenantSlug, user.id, metadata, { status: "failed", errorCode: "workflow_job_store_failed" });
      return error("workflow_job_store_failed", 502);
    }
    const task = await enqueueClientRuntimeTask({ jobId, tenantSlug });
    if (!task.ok) {
      await cancelClientRuntimeJob(jobId, task.error ?? "task_enqueue_failed");
      await updateExecution(workflowId, tenantSlug, user.id, metadata, { status: "failed", jobId, errorCode: task.error ?? "task_enqueue_failed" });
      return error(task.error ?? "task_enqueue_failed", task.status >= 500 ? 503 : task.status);
    }
    await updateExecution(workflowId, tenantSlug, user.id, metadata, { status: "queued", jobId, provider: policy.provider, model: policy.model });
    await recordClientAudit("workflow.dispatched", { surface, provider: policy.provider });
    return NextResponse.json({ ok: true, workflowId, jobId, status: "queued" }, { status: 202, headers: { "cache-control": "private, no-store" } });
  }
  const jobId = await enqueueClientRuntimeJob({
    capability: "orchestration",
    idempotencyKey: `workflow-${workflowId}`,
    inputMetadata: { workflowId, surface, operation, title, goal, steps },
  });
  if (!jobId) {
    await updateExecution(workflowId, tenantSlug, user.id, metadata, { status: "failed", errorCode: "workflow_job_store_failed" });
    return error("workflow_job_store_failed", 502);
  }
  const task = await enqueueClientRuntimeTask({ jobId, tenantSlug });
  if (!task.ok) {
    const taskError = task.error ?? "task_enqueue_failed";
    await cancelClientRuntimeJob(jobId, taskError);
    await updateExecution(workflowId, tenantSlug, user.id, metadata, { status: "failed", jobId, errorCode: taskError });
    return error(taskError, task.status >= 500 ? 503 : task.status);
  }
  await updateExecution(workflowId, tenantSlug, user.id, metadata, { status: "queued", jobId, adapter: "tenant-workflow-runner", mode: "deterministic-free" });
  await recordClientAudit("workflow.queued", { surface, operation });
  return NextResponse.json({ ok: true, workflowId, jobId, status: "queued" }, { status: 202, headers: { "cache-control": "private, no-store" } });
}

async function updateExecution(workflowId: string, tenantSlug: string, userId: string, metadata: Record<string, unknown>, execution: Record<string, unknown>) {
  await updateClientRecord("client_runtime_records", { id: `eq.${workflowId}`, tenant_slug: `eq.${tenantSlug}`, kind: "eq.workflow", created_by: `eq.${userId}` }, {
    metadata: { ...metadata, execution },
    updated_at: new Date().toISOString(),
  });
}

export async function PATCH(request: Request) {
  const user = await authenticatedMember();
  if (!user) return error("not_authenticated", 401);
  if (!(await consumeClientRuntimeRateLimit("workflow-write", 30, 900))) return error("runtime_rate_limited", 429);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : null;
  const status = typeof body.status === "string" ? body.status.trim().toLowerCase() : null;
  const stepId = typeof body.stepId === "string" ? body.stepId.trim() : null;
  const stepStatus = typeof body.stepStatus === "string" ? body.stepStatus.trim().toLowerCase() : null;
  if (!/^[0-9a-f-]{36}$/i.test(id) || (action && action !== "retry_execution") || (status && !STATUSES.has(status)) || (stepId && (!/^[0-9a-f-]{36}$/i.test(stepId) || !stepStatus || !STEP_STATUSES.has(stepStatus)))) return error("workflow_update_invalid", 400);
  const tenantSlug = process.env.CLIENT_SLUG?.trim() ?? "";
  const result = await selectClientRecords("client_runtime_records", { id: `eq.${id}`, tenant_slug: `eq.${tenantSlug}`, kind: "eq.workflow", created_by: `eq.${user.id}`, limit: "1" });
  const workflow = result.records[0];
  if (!result.ok) return error("workflow_read_failed", 502);
  if (!workflow) return error("workflow_not_found", 404);
  const currentMetadata = workflow.metadata && typeof workflow.metadata === "object" && !Array.isArray(workflow.metadata) ? workflow.metadata as Record<string, unknown> : {};
  const currentSteps = Array.isArray(currentMetadata.steps) ? currentMetadata.steps as Array<Record<string, unknown>> : [];
  if (action === "retry_execution") {
    const execution = currentMetadata.execution && typeof currentMetadata.execution === "object" && !Array.isArray(currentMetadata.execution) ? currentMetadata.execution as Record<string, unknown> : {};
    if (execution.status !== "failed") return error("workflow_retry_not_allowed", 409);
    const workflowOperation = typeof currentMetadata.operation === "string" ? currentMetadata.operation : "plan";
    if (workflowOperation === "dispatch") return error("provider_calls_require_approval", 403);
    const workflowSurface = typeof currentMetadata.surface === "string" ? currentMetadata.surface : "orchestrate";
    const jobId = await enqueueClientRuntimeJob({
      capability: "orchestration",
      idempotencyKey: `workflow-${id}-retry-${randomUUID()}`,
      inputMetadata: { workflowId: id, surface: workflowSurface, operation: workflowOperation, title: String(workflow.title ?? "Hosted workflow"), goal: String(workflow.content ?? "Review the requested outcome"), steps: currentSteps },
    });
    if (!jobId) return error("workflow_job_store_failed", 502);
    const task = await enqueueClientRuntimeTask({ jobId, tenantSlug });
    if (!task.ok) {
      const taskError = task.error ?? "task_enqueue_failed";
      await cancelClientRuntimeJob(jobId, taskError);
      await updateExecution(id, tenantSlug, user.id, currentMetadata, { status: "failed", jobId, adapter: "tenant-workflow-runner", mode: "deterministic-free", errorCode: taskError });
      return error(taskError, task.status >= 500 ? 503 : task.status);
    }
    await updateExecution(id, tenantSlug, user.id, currentMetadata, { status: "queued", jobId, adapter: "tenant-workflow-runner", mode: "deterministic-free" });
    await recordClientAudit("workflow.retried", { surface: workflowSurface, operation: workflowOperation });
    return NextResponse.json({ ok: true, workflowId: id, jobId, status: "queued" }, { status: 202, headers: { "cache-control": "private, no-store" } });
  }
  const steps = stepId ? currentSteps.map((step) => step.id === stepId ? { ...step, status: stepStatus } : step) : currentSteps;
  const next = await updateClientRecord("client_runtime_records", { id: `eq.${id}`, tenant_slug: `eq.${tenantSlug}`, kind: "eq.workflow", created_by: `eq.${user.id}` }, { ...(status ? { status } : {}), metadata: { ...currentMetadata, steps }, updated_at: new Date().toISOString() });
  if (!next.ok) return error("workflow_update_failed", 502);
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
}

export async function DELETE(request: Request) {
  const user = await authenticatedMember();
  if (!user) return error("not_authenticated", 401);
  if (!(await consumeClientRuntimeRateLimit("workflow-write", 30, 900))) return error("runtime_rate_limited", 429);
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return error("workflow_id_invalid", 400);
  const result = await deleteClientRecord("client_runtime_records", { id: `eq.${id}`, tenant_slug: `eq.${process.env.CLIENT_SLUG ?? ""}`, kind: "eq.workflow", created_by: `eq.${user.id}` });
  if (!result.ok) return error("workflow_delete_failed", 502);
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
}

async function authenticatedMember() {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember()) || !clientCapabilityEnabled("orchestration")) return null;
  return user;
}

function buildSteps(surface: string, operation: string) {
  if (surface === "loop" || operation === "iterate") return ["Define the iteration target", "Implement the bounded change", "Run review checks", "Record the next loop decision"];
  if (surface === "ruflo" || surface === "room") return ["Clarify the brief", "Assign reviewed workstreams", "Resolve dependencies", "Review the coordinated result"];
  if (surface === "agent-kanban" || surface === "kanban" || surface === "pipeline") return ["Capture the work item", "Set owner and priority", "Move through review", "Approve the handoff"];
  return operation === "review" ? ["Inspect the current workflow", "Identify risks and missing inputs", "Propose changes", "Approve the next step"] : ["Scope and constraints", "Work items and ownership", "Human review", "Approved delivery"];
}

function error(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code }, { status, headers: { "cache-control": "private, no-store" } });
}
