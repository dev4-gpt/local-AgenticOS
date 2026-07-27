import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { consumeClientRuntimeRateLimit, deleteClientRecord, insertClientRecord, recordClientAudit, selectClientRecords, updateClientRecord } from "@/lib/clientDataPlane";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";

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
  const stored = await insertClientRecord("client_runtime_records", {
    id: workflowId,
    tenant_slug: tenantSlug,
    created_by: user.id,
    kind: "workflow",
    title,
    content: goal,
    metadata: { version: 1, surface, operation, steps },
  });
  if (!stored.ok) return error("workflow_write_failed", 502);
  await recordClientAudit("workflow.created", { surface, operation });
  return NextResponse.json({ ok: true, workflowId }, { status: 201, headers: { "cache-control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const user = await authenticatedMember();
  if (!user) return error("not_authenticated", 401);
  if (!(await consumeClientRuntimeRateLimit("workflow-write", 30, 900))) return error("runtime_rate_limited", 429);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const status = typeof body.status === "string" ? body.status.trim().toLowerCase() : null;
  const stepId = typeof body.stepId === "string" ? body.stepId.trim() : null;
  const stepStatus = typeof body.stepStatus === "string" ? body.stepStatus.trim().toLowerCase() : null;
  if (!/^[0-9a-f-]{36}$/i.test(id) || (status && !STATUSES.has(status)) || (stepId && (!/^[0-9a-f-]{36}$/i.test(stepId) || !stepStatus || !STEP_STATUSES.has(stepStatus)))) return error("workflow_update_invalid", 400);
  const tenantSlug = process.env.CLIENT_SLUG?.trim() ?? "";
  const result = await selectClientRecords("client_runtime_records", { id: `eq.${id}`, tenant_slug: `eq.${tenantSlug}`, kind: "eq.workflow", created_by: `eq.${user.id}`, limit: "1" });
  const workflow = result.records[0];
  if (!result.ok) return error("workflow_read_failed", 502);
  if (!workflow) return error("workflow_not_found", 404);
  const currentMetadata = workflow.metadata && typeof workflow.metadata === "object" && !Array.isArray(workflow.metadata) ? workflow.metadata as Record<string, unknown> : {};
  const currentSteps = Array.isArray(currentMetadata.steps) ? currentMetadata.steps as Array<Record<string, unknown>> : [];
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
