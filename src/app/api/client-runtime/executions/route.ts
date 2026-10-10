import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
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
import { NOTEBOOK_STUDIO_OUTPUTS, notebookSourceLinks, safeNotebookSourceUrl, type NotebookSource } from "@/lib/clientNotebookLanes";
import { notebookSourceMetadataSha256 } from "@/lib/clientNotebookExecutionProvenance";

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
  let notebookMetadata: Record<string, unknown> = {};
  let sourceReferences: Record<string, unknown>[] = [];
  const artifactIntent = typeof body.artifactIntent === "string" ? body.artifactIntent.trim().toLowerCase() : "preview";
  const provider = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : (process.env.CLIENT_WORKSPACE_PROVIDER?.trim().toLowerCase() || "openrouter");
  const requestedModel = typeof body.model === "string" ? body.model.trim() : (process.env.CLIENT_WORKSPACE_MODEL?.trim() || null);
  if (!isClientWorkspaceSurface(surfaceValue) || !title || !ARTIFACT_INTENTS.has(artifactIntent)) return error("workspace_execution_input_invalid", 400);
  if (surfaceValue === "notebook") {
    const sourceIds = Array.isArray(body.sourceIds) ? body.sourceIds : [];
    const output = typeof body.notebookOutput === "string" ? body.notebookOutput : "";
    const notebookScope = typeof body.notebookScope === "string" ? body.notebookScope : "";
    const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, 1_000) : "";
    const notebookId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(notebookScope) ? notebookScope : null;
    if (!Array.isArray(body.sourceIds) || sourceIds.length < 1 || sourceIds.length > 5 || sourceIds.some((id) => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) || new Set(sourceIds).size !== sourceIds.length || !NOTEBOOK_STUDIO_OUTPUTS.some((item) => item.key === output) || !(notebookScope === "all" || notebookScope === "unfiled" || notebookId) || containsClientSecretLike(instruction)) return error("notebook_execution_input_invalid", 400);
    if (notebookId) {
      const notebook = await selectClientRecords("client_notebooks", { id: `eq.${notebookId}`, tenant_slug: `eq.${process.env.CLIENT_SLUG ?? ""}`, status: "eq.active", limit: "1" });
      if (!notebook.ok) return error("notebook_scope_read_failed", 502);
      if (notebook.records.length !== 1) return error("notebook_scope_unavailable", 422);
    }
    const sourceResult = await selectClientRecords("client_runtime_records", {
      id: `in.(${sourceIds.join(",")})`,
      tenant_slug: `eq.${process.env.CLIENT_SLUG ?? ""}`,
      kind: "eq.notebook",
      status: "eq.active",
      ...(notebookScope === "unfiled" ? { notebook_id: "is.null" } : notebookId ? { notebook_id: `eq.${notebookId}` } : {}),
      order: "created_at.asc,id.asc",
      limit: "5",
    });
    if (!sourceResult.ok) return error("notebook_sources_read_failed", 502);
    const byId = new Map(sourceResult.records.map((record) => [record.id, record]));
    if (sourceIds.some((id) => {
      const record = byId.get(id);
      return !record || record.tenant_slug !== (process.env.CLIENT_SLUG ?? "") || record.kind !== "notebook" || record.status !== "active"
        || (notebookScope === "unfiled" && record.notebook_id != null)
        || (notebookId !== null && record.notebook_id !== notebookId);
    })) return error("notebook_source_unavailable", 422);
    const sources: NotebookSource[] = sourceIds.map((id) => {
      const record = byId.get(id)!;
      const metadata = record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata) ? record.metadata as Record<string, unknown> : {};
      return {
        id,
        title: typeof record.title === "string" ? record.title : "Untitled source",
        content: typeof record.content === "string" ? record.content : "",
        sourceUrl: safeNotebookSourceUrl(metadata.source_url),
        links: notebookSourceLinks(metadata.source_links),
      };
    });
    if (sources.some((source) => !source.content.trim())) return error("notebook_source_unavailable", 422);
    if (sources.some((source) => containsClientSecretLike(`${source.title}\n${source.content}`))) return error("notebook_source_secret_like", 422);
    sourceReferences = sources.map((source) => {
      const record = byId.get(source.id)!;
      const recordCreatedAt = typeof record.created_at === "string" ? record.created_at : null;
      const sourceUrl = source.sourceUrl ?? null;
      const links = source.links ?? [];
      return {
        id: source.id,
        title: source.title.slice(0, 240),
        contentSha256: createHash("sha256").update(source.content).digest("hex"),
        sourceMetadataSha256: notebookSourceMetadataSha256({ id: source.id, title: source.title, sourceUrl, links, recordCreatedAt }),
        sourceUrl,
        links,
        recordCreatedAt,
      };
    });
    notebookMetadata = { notebookOutput: output, instruction, sourceIds, notebookScope };
    if (containsClientSecretLike(`${title}\n${instruction}`)) return error("workspace_execution_input_invalid", 400);
  } else if (!goal) return error("workspace_execution_input_invalid", 400);
  if (surfaceValue !== "notebook" && containsClientSecretLike(`${title}\n${goal}`)) return error("workspace_execution_input_invalid", 400);
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
      ...(surfaceValue === "notebook" ? notebookMetadata : { goal }),
      artifactIntent,
      ...(sourceReferences.length ? { sourceReferences } : {}),
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
    sourceReferences: publicSourceReferences(metadata.sourceReferences),
    artifactId: typeof output.artifactId === "string" ? output.artifactId : null,
    previewHtml: typeof output.previewHtml === "string" ? output.previewHtml : null,
    terminalEvents: Array.isArray(output.terminalEvents) ? output.terminalEvents : (Array.isArray(metadata.terminalEvents) ? metadata.terminalEvents : []),
    usage: presentClientJobUsage({ provider: record.provider, inputMetadata: metadata, outputMetadata: output, ledgerRecords: ledgerRecords.filter((ledger) => ledger.job_id === record.id) }),
  };
}

function publicSourceReferences(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const source = item as Record<string, unknown>;
    if (typeof source.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(source.id) || typeof source.title !== "string") return [];
    return [{
      id: source.id,
      title: source.title.slice(0, 240),
      sourceUrl: safeNotebookSourceUrl(source.sourceUrl),
      links: notebookSourceLinks(source.links),
      ...(typeof source.contentSha256 === "string" && /^[a-f0-9]{64}$/i.test(source.contentSha256) ? { contentSha256: source.contentSha256.toLowerCase() } : {}),
      ...(typeof source.recordCreatedAt === "string" ? { recordCreatedAt: source.recordCreatedAt } : {}),
    }];
  });
}

async function member() {
  const user = await currentClientUser();
  return user && await currentClientMember() && clientCapabilityEnabled("orchestration") && clientCapabilityEnabled("artifacts") && clientCapabilityEnabled("text-agents") ? user : null;
}

function error(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code }, { status, headers: { "cache-control": "private, no-store", ...(code === "runtime_rate_limited" ? { "Retry-After": "900" } : {}) } });
}
