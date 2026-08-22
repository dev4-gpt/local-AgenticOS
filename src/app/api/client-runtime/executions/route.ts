import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { cancelClientRuntimeJob, checkClientRuntimeRateLimit, enqueueClientRuntimeJob, refundClientRuntimeRateLimit, selectClientRecords } from "@/lib/clientDataPlane";
import { enqueueClientRuntimeTask } from "@/lib/cloudTasks";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { clientProviderRequestAllowed } from "@/lib/clientProviderAdapter";
import { clientCapabilityEnabled, clientProviderCallsEnabled } from "@/lib/clientRuntimePolicy";
import { clientWorkspaceJobConfigured } from "@/lib/clientCloudRunJobs";
import { isClientWorkspaceSurface, workspaceTerminalEvents } from "@/lib/clientWorkspaceExecution";
import { presentClientJobUsage } from "@/lib/clientJobUsage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ARTIFACT_INTENTS = new Set(["preview", "brief", "copy"]);

export async function GET(request: Request) {
  const user = await member();
  if (!user) return error("not_authenticated", 401);
  const rate = await checkClientRuntimeRateLimit("workspace-execution-read", 120, 900);
  if (!rate.ok) return error("runtime_limit_unavailable", 503);
  if (!rate.allowed) return error("runtime_rate_limited", 429);
  const surface = new URL(request.url).searchParams.get("surface")?.trim().toLowerCase();
  const filters: Record<string, string> = {
    tenant_slug: `eq.${process.env.CLIENT_SLUG ?? ""}`,
    requested_by: `eq.${user.id}`,
    capability: "eq.workspace-execution",
    order: "created_at.desc",
    limit: "30",
  };
  if (surface && isClientWorkspaceSurface(surface)) filters["input_metadata->>surface"] = `eq.${surface}`;
  const result = await selectClientRecords("client_runtime_jobs", filters);
  if (!result.ok) return error("workspace_execution_read_failed", 502);
  const ledger = await selectClientRecords("client_runtime_budget_ledger", { tenant_slug: `eq.${process.env.CLIENT_SLUG ?? ""}`, limit: "1000" });
  return NextResponse.json({ ok: true, executions: result.records.map((record) => publicExecution(record, ledger.ok ? ledger.records : [])) }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  const user = await member();
  if (!user) return error("not_authenticated", 401);
  if (!clientProviderCallsEnabled()) return error("provider_calls_require_approval", 403);
  const rate = await checkClientRuntimeRateLimit("workspace-execution-write", 12, 900);
  if (!rate.ok) return error("runtime_limit_unavailable", 503);
  if (!rate.allowed) return error("runtime_rate_limited", 429);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const surfaceValue = typeof body.surface === "string" ? body.surface.trim().toLowerCase() : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 240) : "";
  const goal = typeof body.goal === "string" ? body.goal.trim().slice(0, 10_000) : "";
  const artifactIntent = typeof body.artifactIntent === "string" ? body.artifactIntent.trim().toLowerCase() : "preview";
  const provider = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : (process.env.CLIENT_WORKSPACE_PROVIDER?.trim().toLowerCase() || "openrouter");
  const requestedModel = typeof body.model === "string" ? body.model.trim() : (process.env.CLIENT_WORKSPACE_MODEL?.trim() || null);
  if (!isClientWorkspaceSurface(surfaceValue) || !title || !goal || !ARTIFACT_INTENTS.has(artifactIntent) || containsClientSecretLike(`${title}\n${goal}`)) return error("workspace_execution_input_invalid", 400);
  const policy = clientProviderRequestAllowed(provider, requestedModel);
  if (!policy.ok) return error(policy.error, policy.status);
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!tenantSlug) return error("tenant_not_configured", 503);
  const idempotencyKey = typeof body.idempotencyKey === "string" && body.idempotencyKey.trim().length >= 8 ? body.idempotencyKey.trim().slice(0, 180) : `workspace-${randomUUID()}`;
  const jobId = await enqueueClientRuntimeJob({
    capability: "workspace-execution",
    provider: policy.provider,
    model: policy.model,
    idempotencyKey,
    inputMetadata: {
      surface: surfaceValue,
      title,
      goal,
      artifactIntent,
      terminalEvents: workspaceTerminalEvents(surfaceValue, "queued"),
    },
  });
  if (!jobId) return error("workspace_execution_store_failed", 502);
  const task = await enqueueClientRuntimeTask({ jobId, tenantSlug, path: clientWorkspaceJobConfigured() ? "dispatch" : "jobs" });
  if (!task.ok) {
    await cancelClientRuntimeJob(jobId, task.error ?? "task_enqueue_failed");
    await refundClientRuntimeRateLimit("workspace-execution-write", 900);
    return error(task.error ?? "task_enqueue_failed", task.status >= 500 ? 503 : task.status);
  }
  return NextResponse.json({ ok: true, jobId, status: "queued" }, { status: 202, headers: { "cache-control": "private, no-store" } });
}

function publicExecution(record: Record<string, unknown>, ledgerRecords: Record<string, unknown>[]) {
  const metadata = record.input_metadata && typeof record.input_metadata === "object" && !Array.isArray(record.input_metadata) ? record.input_metadata as Record<string, unknown> : {};
  const output = record.output_metadata && typeof record.output_metadata === "object" && !Array.isArray(record.output_metadata) ? record.output_metadata as Record<string, unknown> : {};
  return {
    id: typeof record.id === "string" ? record.id : "",
    status: typeof record.status === "string" ? record.status : "queued",
    provider: typeof record.provider === "string" ? record.provider : null,
    model: typeof record.model === "string" ? record.model : null,
    errorCode: typeof record.error_code === "string" ? record.error_code : null,
    createdAt: typeof record.created_at === "string" ? record.created_at : null,
    finishedAt: typeof record.finished_at === "string" ? record.finished_at : null,
    surface: typeof metadata.surface === "string" ? metadata.surface : null,
    title: typeof metadata.title === "string" ? metadata.title : null,
    artifactIntent: typeof metadata.artifactIntent === "string" ? metadata.artifactIntent : null,
    artifactId: typeof output.artifactId === "string" ? output.artifactId : null,
    previewHtml: typeof output.previewHtml === "string" ? output.previewHtml : null,
    terminalEvents: Array.isArray(output.terminalEvents) ? output.terminalEvents : (Array.isArray(metadata.terminalEvents) ? metadata.terminalEvents : []),
    usage: presentClientJobUsage({ provider: record.provider, inputMetadata: metadata, outputMetadata: output, ledgerRecords: ledgerRecords.filter((ledger) => ledger.job_id === record.id) }),
  };
}

async function member() {
  const user = await currentClientUser();
  return user && await currentClientMember() && clientCapabilityEnabled("orchestration") && clientCapabilityEnabled("artifacts") && clientCapabilityEnabled("text-agents") ? user : null;
}

function error(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code }, { status, headers: { "cache-control": "private, no-store", ...(code === "runtime_rate_limited" ? { "Retry-After": "900" } : {}) } });
}
