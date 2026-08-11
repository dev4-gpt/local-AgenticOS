import { NextResponse } from "next/server";
import { reserveClientRuntimeBudgetWorker, settleClientRuntimeBudgetWorker, workerRpc } from "@/lib/clientDataPlane";
import { clientProviderDefaultModel, clientTextMaxOutputTokens, clientTextUsageCostMicros, estimateClientTextCostMicros, runClientTextAdapter, safeClientProviderMetadata, safeClientProviderOutput } from "@/lib/clientProviderAdapter";
import { clientProviderCallsEnabled } from "@/lib/clientRuntimePolicy";
import { estimateElevenLabsMusicCostMicros, runClientElevenLabsMusicAdapter, estimateClientImageCostMicros, estimateClientMediaCostMicros, runClientHeyGenAdapter, runClientImageAdapter, runClientMusicAdapter, runClientSpeechAdapter, safeProviderOutputUrl } from "@/lib/clientMediaAdapter";
import { readBoundedResponseBytes } from "@/lib/clientNetworkSafety";
import { marketSearchToV96Records, runClientAeoCheck, runClientMarketSearch, runClientSeoAdapter } from "@/lib/clientSeoAdapter";
import { clientGcpAccessToken, clientStorageConfig, uploadClientStorageObject } from "@/lib/clientStorage";
import { enqueueClientRuntimeTask } from "@/lib/cloudTasks";
import { validClientTaskIdentity } from "@/lib/clientTaskAuth";
import { logClientRuntimeEvent } from "@/lib/clientRuntimeObservability";
import { runClientWorkflowRunner } from "@/lib/clientWorkflowRunner";
import { artifactFromWorkspaceOutput, isClientWorkspaceSurface, isWorkspaceArtifactIntent, workspacePrompt, workspaceTerminalEvents } from "@/lib/clientWorkspaceExecution";
import { paperclipRunSummary } from "@/lib/clientPaperclipAdapter";
import { parseRoomDirectives, roomActionSummary, roomPersona, roomPrompt } from "@/lib/clientRoomAdapter";
import { parsePipelineShape, pipelineStageAfterShaping } from "@/lib/clientPipelineAdapter";
import { loopBuilderPrompt, loopFinalStatus, loopJudgePrompt, parseLoopVerdict } from "@/lib/clientLoopAdapter";
import { rufloAgentPrompt, rufloReportPrompt, rufloRoster } from "@/lib/clientRufloAdapter";
import { HERMES_CONTENT_FACTORY_STEPS, createHermesContentFactoryPlan, hermesContentFactoryPrompt, type HermesContentFactoryPlan, type HermesContentFactoryStage } from "@/lib/hermesContentFactory";
import { createSeoIntelligenceRequest, firecrawlSearchToSeoIntelligenceRecord } from "@/lib/seoIntelligence";
import { applyOutputQualityPolicy } from "@/lib/outputQualityPolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (process.env.CLIENT_RUNTIME_WORKER_ENABLED !== "1") return NextResponse.json({ ok: false, error: "worker_disabled" }, { status: 404 });
  if (!(await validClientTaskIdentity(request))) return NextResponse.json({ ok: false, error: "worker_unauthorized" }, { status: 401 });
  const workerToken = process.env.CLIENT_WORKER_TOKEN?.trim();
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!workerToken || !tenantSlug) return NextResponse.json({ ok: false, error: "worker_not_configured" }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  const requestedTenant = typeof body.tenantSlug === "string" ? body.tenantSlug : "";
  if (!/^[0-9a-f-]{36}$/i.test(jobId) || requestedTenant !== tenantSlug) return NextResponse.json({ ok: false, error: "worker_payload_invalid" }, { status: 400 });

  const claim = await workerRpc("claim_client_runtime_job", { p_tenant_slug: tenantSlug, p_job_id: jobId, p_worker_token: workerToken });
  if (!claim.ok) return NextResponse.json({ ok: false, error: "job_claim_failed" }, { status: 503 });
  const job = claim.value as { id?: string; capability?: string; provider?: string; model?: string; idempotency_key?: string; input_metadata?: Record<string, unknown> | null } | null;
  if (!job?.id || typeof job.capability !== "string") return NextResponse.json({ ok: true, status: "already_claimed" });
  if (["text-agents", "media", "seo-research", "room-round", "pipeline-shape", "loop-run", "ruflo-swarm", "hermes-content-factory"].includes(job.capability) && !clientProviderCallsEnabled()) {
    await completeJob(tenantSlug, jobId, workerToken, "failed", { workflowId: workflowIdFrom(job.input_metadata) }, "provider_calls_require_approval");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  if (job.capability === "orchestration") return processOrchestrationJob(jobId, tenantSlug, workerToken, job);
  if (job.capability === "workspace-execution") return processWorkspaceExecutionJob(jobId, tenantSlug, workerToken, job);
  if (job.capability === "room-round") return processRoomRoundJob(jobId, tenantSlug, workerToken, job);
  if (job.capability === "pipeline-shape") return processPipelineShapeJob(jobId, tenantSlug, workerToken, job);
  if (job.capability === "loop-run") return processLoopRunJob(jobId, tenantSlug, workerToken, job);
  if (job.capability === "hermes-content-factory") return processHermesContentFactoryJob(jobId, tenantSlug, workerToken, job);
  if (job.capability === "ruflo-swarm") return processRufloSwarmJob(jobId, tenantSlug, workerToken, job);
  if (job.capability === "media") return processMediaJob(jobId, tenantSlug, workerToken, job);
  if (job.capability === "seo-research") return processSeoJob(jobId, tenantSlug, workerToken, job);
  if (job.capability !== "text-agents" || typeof job.provider !== "string" || typeof job.input_metadata?.prompt !== "string") {
    await completeJob(tenantSlug, jobId, workerToken, "failed", { workflowId: workflowIdFrom(job.input_metadata) }, "capability_adapter_missing");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const model = typeof job.model === "string" && job.model ? job.model : clientProviderDefaultModel(job.provider) ?? undefined;
  const history = Array.isArray(job.input_metadata.history) ? job.input_metadata.history.filter((item): item is { role: "system" | "user" | "assistant"; content: string } => Boolean(item && typeof item === "object" && ["system", "user", "assistant"].includes(String((item as Record<string, unknown>).role)) && typeof (item as Record<string, unknown>).content === "string")) : [];
  const messages = [...history, { role: "user" as const, content: job.input_metadata.prompt }].slice(-16);
  const pricingModel = model ?? "";
  const estimate = estimateClientTextCostMicros(pricingModel, messages, clientTextMaxOutputTokens());
  if (estimate === null || !model || !(await reserveClientRuntimeBudgetWorker({ provider: job.provider, model, amountMicros: estimate, jobId, workerToken }))) {
    logClientRuntimeEvent("runtime.budget_exceeded", { tenant: tenantSlug, provider: job.provider, status: 429 });
    await completeJob(tenantSlug, jobId, workerToken, "failed", { workflowId: workflowIdFrom(job.input_metadata) }, "budget_exceeded");
    return NextResponse.json({ ok: true, status: "failed" });
  }

  const result = await runClientTextAdapter({ provider: job.provider, model, prompt: job.input_metadata.prompt, history, reserveBudget: false, jobId });
  if (result.ok) {
    const actualAmountMicros = result.usage ? clientTextUsageCostMicros(model, result.usage) : null;
    const outputMetadata = { workflowId: workflowIdFrom(job.input_metadata), provider: result.provider, model: result.model, output: safeClientProviderOutput(result.output), steps: workflowStepsFrom(job.input_metadata) };
    if (!(await settleRequiredBudget(tenantSlug, jobId, workerToken, {
      actualAmountMicros: actualAmountMicros ?? estimate,
      usageMetadata: result.usage ?? { estimatedCostMicros: estimate, usageFallback: 1 },
    }, outputMetadata))) return NextResponse.json({ ok: true, status: "failed" });
    await completeJob(tenantSlug, jobId, workerToken, "succeeded", outputMetadata);
    return NextResponse.json({ ok: true, status: "succeeded" });
  }
  logClientRuntimeEvent("runtime.provider_failed", { tenant: tenantSlug, provider: job.provider, status: result.status, reason: result.error });
  if (result.status >= 500 && await retryJob(tenantSlug, jobId, workerToken, result.error)) return NextResponse.json({ ok: false, error: "provider_retryable" }, { status: 500 });
  await settleTerminalBudget(jobId, workerToken, 0, { actualAmountMicros: 0, providerFailure: 1 });
  await completeJob(tenantSlug, jobId, workerToken, "failed", { workflowId: workflowIdFrom(job.input_metadata) }, result.error);
  return NextResponse.json({ ok: true, status: "failed" });
}

async function processOrchestrationJob(jobId: string, tenantSlug: string, workerToken: string, job: { input_metadata?: Record<string, unknown> | null }) {
  const input = job.input_metadata ?? {};
  const execution = runClientWorkflowRunner(input);
  if (!execution) {
    await completeJob(tenantSlug, jobId, workerToken, "failed", { workflowId: workflowIdFrom(input) }, "workflow_input_invalid");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  await completeJob(tenantSlug, jobId, workerToken, "succeeded", execution);
  return NextResponse.json({ ok: true, status: "succeeded" });
}

async function processWorkspaceExecutionJob(jobId: string, tenantSlug: string, workerToken: string, job: { provider?: string; model?: string; input_metadata?: Record<string, unknown> | null }) {
  const input = job.input_metadata ?? {};
  const surface = typeof input.surface === "string" ? input.surface.trim().toLowerCase() : "";
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 240) : "";
  const goal = typeof input.goal === "string" ? input.goal.trim().slice(0, 10_000) : "";
  // Anything unrecognised falls back to preview, as before.
  const artifactIntent = typeof input.artifactIntent === "string" && isWorkspaceArtifactIntent(input.artifactIntent) ? input.artifactIntent : "preview";
  // A Paperclip agent run is still a workspace execution, but it carries its own
  // agent-persona prompt and reconciles the tenant issue and run rows.
  const paperclipRun = typeof input.paperclipRunId === "string" && /^[0-9a-f-]{36}$/i.test(input.paperclipRunId);
  const pipelineItem = typeof input.pipelineItemId === "string" && /^[0-9a-f-]{36}$/i.test(input.pipelineItemId);
  const boardTask = typeof input.boardTaskId === "string" && /^[0-9a-f-]{36}$/i.test(input.boardTaskId);
  if (!isClientWorkspaceSurface(surface) || !title || !goal || !job.provider) {
    if (paperclipRun) await settlePaperclipRun(tenantSlug, workerToken, jobId, "failed", { errorCode: "workspace_execution_input_invalid" });
    await completeJob(tenantSlug, jobId, workerToken, "failed", { terminalEvents: workspaceTerminalEvents("orchestrate", "failed", "Workspace execution input is incomplete.") }, "workspace_execution_input_invalid");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  if (paperclipRun) await settlePaperclipRun(tenantSlug, workerToken, jobId, "running", {});
  const model = job.model || clientProviderDefaultModel(job.provider) || "";
  const promptOverride = typeof input.promptOverride === "string" ? input.promptOverride.trim().slice(0, 20_000) : "";
  const prompt = promptOverride || workspacePrompt({ surface, title, goal, artifactIntent });
  const estimate = model ? estimateClientTextCostMicros(model, [{ role: "user", content: prompt }], clientTextMaxOutputTokens()) : null;
  if (!model || estimate === null || !(await reserveClientRuntimeBudgetWorker({ provider: job.provider, model, amountMicros: estimate, jobId, workerToken }))) {
    if (paperclipRun) await settlePaperclipRun(tenantSlug, workerToken, jobId, "failed", { errorCode: "budget_exceeded" });
    if (pipelineItem) await settlePipelineItem(tenantSlug, workerToken, jobId, { execution_state: "failed", execution_error: "budget_exceeded" });
    if (boardTask) await settleBoardTask(tenantSlug, workerToken, jobId, { execution_state: "failed", execution_error: "budget_exceeded" });
    await completeJob(tenantSlug, jobId, workerToken, "failed", { terminalEvents: workspaceTerminalEvents(surface, "failed", "The tenant budget or model policy did not approve this execution.") }, "budget_exceeded");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const result = await runClientTextAdapter({ provider: job.provider, model, prompt, reserveBudget: false, jobId, disableReviewedPlanTool: true });
  if (!result.ok) {
    logClientRuntimeEvent("runtime.provider_failed", { tenant: tenantSlug, provider: job.provider, status: result.status, reason: result.error });
    if (result.status >= 500 && await retryJob(tenantSlug, jobId, workerToken, result.error)) return NextResponse.json({ ok: false, error: "provider_retryable" }, { status: 500 });
    await settleTerminalBudget(jobId, workerToken, 0, { actualAmountMicros: 0, providerFailure: 1 });
    if (paperclipRun) await settlePaperclipRun(tenantSlug, workerToken, jobId, "failed", { errorCode: result.error });
    if (pipelineItem) await settlePipelineItem(tenantSlug, workerToken, jobId, { execution_state: "failed", execution_error: result.error });
    if (boardTask) await settleBoardTask(tenantSlug, workerToken, jobId, { execution_state: "failed", execution_error: result.error });
    await completeJob(tenantSlug, jobId, workerToken, "failed", { terminalEvents: [...workspaceTerminalEvents(surface, "started"), ...workspaceTerminalEvents(surface, "failed", result.error)] }, result.error);
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const safeOutput = safeClientProviderOutput(result.output);
  const artifact = artifactFromWorkspaceOutput({ surface, title, artifactIntent, output: safeOutput });
  if (!artifact) {
    await settleTerminalBudget(jobId, workerToken, 0, { actualAmountMicros: 0, artifactValidationFailure: 1 });
    if (paperclipRun) await settlePaperclipRun(tenantSlug, workerToken, jobId, "failed", { errorCode: "workspace_artifact_invalid" });
    if (pipelineItem) await settlePipelineItem(tenantSlug, workerToken, jobId, { execution_state: "failed", execution_error: "workspace_artifact_invalid" });
    if (boardTask) await settleBoardTask(tenantSlug, workerToken, jobId, { execution_state: "failed", execution_error: "workspace_artifact_invalid" });
    await completeJob(tenantSlug, jobId, workerToken, "failed", { terminalEvents: [...workspaceTerminalEvents(surface, "started"), ...workspaceTerminalEvents(surface, "failed", "The approved provider did not return a usable tenant artifact.")] }, "workspace_artifact_invalid");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const artifactId = await storeArtifact(tenantSlug, jobId, workerToken, artifact.fileName, artifact.contentType, artifact.bytes);
  if (!artifactId) {
    await settleTerminalBudget(jobId, workerToken, result.usage ? clientTextUsageCostMicros(model, result.usage) ?? estimate : estimate, { artifactStoreFailure: 1 });
    if (paperclipRun) await settlePaperclipRun(tenantSlug, workerToken, jobId, "failed", { errorCode: "artifact_store_failed" });
    if (pipelineItem) await settlePipelineItem(tenantSlug, workerToken, jobId, { execution_state: "failed", execution_error: "artifact_store_failed" });
    if (boardTask) await settleBoardTask(tenantSlug, workerToken, jobId, { execution_state: "failed", execution_error: "artifact_store_failed" });
    await completeJob(tenantSlug, jobId, workerToken, "failed", { terminalEvents: [...workspaceTerminalEvents(surface, "started"), ...workspaceTerminalEvents(surface, "failed", "The workspace result could not be committed to tenant storage.")] }, "artifact_store_failed");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const actualAmountMicros = result.usage ? clientTextUsageCostMicros(model, result.usage) ?? estimate : estimate;
  const outputMetadata = {
    adapter: "cloud-run-ephemeral-workspace",
    mode: "provider-artifact",
    provider: result.provider,
    model: result.model,
    artifactId,
    artifactIntent,
    ...(artifact.previewHtml ? { previewHtml: artifact.previewHtml } : {}),
    terminalEvents: [...workspaceTerminalEvents(surface, "started"), ...workspaceTerminalEvents(surface, "completed", `Committed ${artifact.fileName} to tenant storage.`)],
  };
  if (!(await settleRequiredBudget(tenantSlug, jobId, workerToken, { actualAmountMicros, usageMetadata: result.usage ?? { estimatedCostMicros: estimate, usageFallback: 1 } }, outputMetadata))) {
    if (paperclipRun) await settlePaperclipRun(tenantSlug, workerToken, jobId, "failed", { errorCode: "budget_settlement_failed" });
    if (pipelineItem) await settlePipelineItem(tenantSlug, workerToken, jobId, { execution_state: "failed", execution_error: "budget_settlement_failed" });
    if (boardTask) await settleBoardTask(tenantSlug, workerToken, jobId, { execution_state: "failed", execution_error: "budget_settlement_failed" });
    return NextResponse.json({ ok: true, status: "failed" });
  }
  if (boardTask) {
    await settleBoardTask(tenantSlug, workerToken, jobId, {
      execution_state: "succeeded",
      status: "reviewing",
      build_artifact_id: artifactId,
      ...(artifact.previewHtml ? { build_preview_html: artifact.previewHtml.slice(0, 40_000) } : {}),
    });
  }
  if (pipelineItem) {
    // A shipped pipeline item carries its artifact the same way Paperclip does.
    await settlePipelineItem(tenantSlug, workerToken, jobId, {
      execution_state: "succeeded",
      stage: "shipped",
      build_artifact_id: artifactId,
      ...(artifact.previewHtml ? { build_preview_html: artifact.previewHtml.slice(0, 40_000) } : {}),
    });
  }
  if (paperclipRun) {
    await settlePaperclipRun(tenantSlug, workerToken, jobId, "succeeded", {
      costMicros: actualAmountMicros,
      artifactId,
      previewHtml: artifact.previewHtml,
      summary: `Shipped ${artifact.fileName} to tenant storage.`,
    });
  }
  await completeJob(tenantSlug, jobId, workerToken, "succeeded", outputMetadata);
  return NextResponse.json({ ok: true, status: "succeeded" });
}

/**
 * Reconciles a Paperclip run and its issue. The Cloud Run job has no member
 * session, so this goes through the token-verified worker function; a failure
 * here is logged rather than thrown so the job itself still settles.
 */
async function settlePaperclipRun(
  tenantSlug: string,
  workerToken: string,
  jobId: string,
  status: "running" | "succeeded" | "failed" | "cancelled",
  detail: { summary?: string; errorCode?: string; costMicros?: number; artifactId?: string; previewHtml?: string },
) {
  // Always carry a summary for a terminal state. The reconciliation function
  // keeps the previous value when it receives null, which would otherwise leave
  // a failed run still reading "Queued for the approved hosted runner".
  const summary = detail.summary ?? paperclipRunSummary({
    status,
    errorCode: detail.errorCode ?? null,
    artifactCommitted: Boolean(detail.artifactId),
  });
  const result = await workerRpc("complete_client_paperclip_run_worker", {
    p_tenant_slug: tenantSlug,
    p_worker_token: workerToken,
    p_job_id: jobId,
    p_status: status,
    p_summary: summary,
    p_error_code: detail.errorCode?.slice(0, 120) ?? null,
    p_cost_micros: typeof detail.costMicros === "number" ? Math.max(0, Math.round(detail.costMicros)) : null,
    p_build_artifact_id: detail.artifactId ?? null,
    p_build_preview_html: detail.previewHtml?.slice(0, 40_000) ?? null,
  });
  if (!result.ok || result.value !== true) {
    logClientRuntimeEvent("runtime.paperclip_reconciliation_failed", { tenant: tenantSlug, jobId, status: 503 });
  }
}

/**
 * Shapes a captured idea: one structured provider call produces the route,
 * classification, plan, and tasks, then the item advances to the human gate.
 * The job never crosses that gate itself.
 */
async function processPipelineShapeJob(jobId: string, tenantSlug: string, workerToken: string, job: { provider?: string; model?: string; input_metadata?: Record<string, unknown> | null }) {
  const input = job.input_metadata ?? {};
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  const model = job.model || (job.provider ? clientProviderDefaultModel(job.provider) : "") || "";
  if (!job.provider || !model || !prompt) {
    await settlePipelineItem(tenantSlug, workerToken, jobId, { execution_state: "failed", execution_error: "pipeline_shape_input_invalid" });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "pipeline_shape_input_invalid");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const estimate = estimateClientTextCostMicros(model, [{ role: "user", content: prompt }], clientTextMaxOutputTokens());
  if (estimate === null || !(await reserveClientRuntimeBudgetWorker({ provider: job.provider, model, amountMicros: estimate, jobId, workerToken }))) {
    await settlePipelineItem(tenantSlug, workerToken, jobId, { execution_state: "failed", execution_error: "budget_exceeded" });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "budget_exceeded");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  await settlePipelineItem(tenantSlug, workerToken, jobId, { execution_state: "running" });

  const result = await runClientTextAdapter({ provider: job.provider, model, prompt, reserveBudget: false, jobId });
  if (!result.ok) {
    logClientRuntimeEvent("runtime.provider_failed", { tenant: tenantSlug, provider: job.provider, status: result.status, reason: result.error });
    if (result.status >= 500 && await retryJob(tenantSlug, jobId, workerToken, result.error)) return NextResponse.json({ ok: false, error: "provider_retryable" }, { status: 500 });
    await settleTerminalBudget(jobId, workerToken, 0, { actualAmountMicros: 0, providerFailure: 1 });
    await settlePipelineItem(tenantSlug, workerToken, jobId, { execution_state: "failed", execution_error: result.error });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, result.error);
    return NextResponse.json({ ok: true, status: "failed" });
  }

  const shaped = parsePipelineShape(safeClientProviderOutput(result.output));
  if (!shaped) {
    // Half-parsed shaping would write junk onto the tenant board, so fail
    // honestly and leave the item where the member can retry it.
    await settleTerminalBudget(jobId, workerToken, 0, { actualAmountMicros: 0, shapeParseFailure: 1 });
    await settlePipelineItem(tenantSlug, workerToken, jobId, { execution_state: "failed", execution_error: "pipeline_shape_unparsable" });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "pipeline_shape_unparsable");
    return NextResponse.json({ ok: true, status: "failed" });
  }

  const actualAmountMicros = result.usage ? clientTextUsageCostMicros(model, result.usage) ?? estimate : estimate;
  const outputMetadata = { adapter: "pipeline-shape", provider: result.provider, model: result.model, route: shaped.route };
  if (!(await settleRequiredBudget(tenantSlug, jobId, workerToken, { actualAmountMicros, usageMetadata: result.usage ?? { estimatedCostMicros: estimate, usageFallback: 1 } }, outputMetadata))) {
    await settlePipelineItem(tenantSlug, workerToken, jobId, { execution_state: "failed", execution_error: "budget_settlement_failed" });
    return NextResponse.json({ ok: true, status: "failed" });
  }
  await settlePipelineItem(tenantSlug, workerToken, jobId, {
    execution_state: "succeeded",
    stage: pipelineStageAfterShaping(),
    route: shaped.route,
    title: shaped.title,
    confidence: String(shaped.confidence),
    tags: shaped.tags,
    classification: shaped.classification,
    plan: shaped.plan,
    tasks: shaped.tasks,
  });
  await completeJob(tenantSlug, jobId, workerToken, "succeeded", outputMetadata);
  return NextResponse.json({ ok: true, status: "succeeded" });
}

/**
 * Runs the bounded Hermes factory envelope. Research stays on the existing
 * Firecrawl adapter, model work stays on the approved text lane, and the
 * result is held at the approval stage. No destination adapter is called here.
 */
async function processHermesContentFactoryJob(jobId: string, tenantSlug: string, workerToken: string, job: { provider?: string; model?: string; input_metadata?: Record<string, unknown> | null }) {
  const input = job.input_metadata ?? {};
  const runId = typeof input.hermesRunId === "string" ? input.hermesRunId : "";
  const sourceUrls = Array.isArray(input.sourceUrls) ? input.sourceUrls.filter((value): value is string => typeof value === "string").slice(0, 8) : [];
  const rawPlan = input.plan && typeof input.plan === "object" ? input.plan as HermesContentFactoryPlan : null;
  if (!/^[0-9a-f-]{36}$/i.test(runId) || !rawPlan || rawPlan.tenantSlug !== tenantSlug || sourceUrls.length < 1 || !job.provider || !job.model) {
    await completeJob(tenantSlug, jobId, workerToken, "failed", { hermesRunId: runId }, "content_factory_input_invalid");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const plan = createHermesContentFactoryPlan({
    tenantSlug,
    brief: rawPlan.brief,
    contentType: rawPlan.contentType,
    workflowId: rawPlan.workflowId,
  });
  const stages = HERMES_CONTENT_FACTORY_STEPS.map((step) => ({ workflowId: plan.workflowId, tenantSlug, stage: step.id, status: "pending" as const }));
  const patchRun = async (patch: Record<string, unknown>) => workerRpc("update_client_hermes_content_factory_worker", {
    p_tenant_slug: tenantSlug, p_worker_token: workerToken, p_job_id: jobId, p_patch: patch,
  });
  await patchRun({ status: "running", current_stage: "research", stages: stages.map((stage) => stage.stage === "brief" ? { ...stage, status: "complete" } : stage) });

  const citations: Array<{ id: string; url: string; retrievedAt: string; evidence: string }> = [];
  for (const [index, url] of sourceUrls.entries()) {
    const research = await runClientSeoAdapter({ url, focus: plan.brief });
    if (research.ok) citations.push({ id: `citation-${index + 1}`, url: research.url, retrievedAt: new Date().toISOString(), evidence: research.markdown.slice(0, 2_000) });
  }
  if (!citations.length) {
    await patchRun({ status: "failed", current_stage: "research", error_code: "citation_research_failed" });
    await completeJob(tenantSlug, jobId, workerToken, "failed", { hermesRunId: runId }, "citation_research_failed");
    return NextResponse.json({ ok: true, status: "failed" });
  }

  const planPrompt = hermesContentFactoryPrompt(plan, "plan");
  const draftPrompt = hermesContentFactoryPrompt(plan, "draft");
  const estimate = estimateClientTextCostMicros(job.model, [{ role: "user", content: `${planPrompt}\n${draftPrompt}` }], clientTextMaxOutputTokens() * 2);
  if (estimate === null || !(await reserveClientRuntimeBudgetWorker({ provider: job.provider, model: job.model, amountMicros: estimate, jobId, workerToken }))) {
    await patchRun({ status: "failed", current_stage: "plan", citations, error_code: "budget_exceeded" });
    await completeJob(tenantSlug, jobId, workerToken, "failed", { hermesRunId: runId }, "budget_exceeded");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const outline = await runClientTextAdapter({ provider: job.provider, model: job.model, prompt: planPrompt, reserveBudget: false, jobId, disableReviewedPlanTool: true });
  const draft = outline.ok ? await runClientTextAdapter({ provider: job.provider, model: job.model, prompt: draftPrompt, reserveBudget: false, jobId, disableReviewedPlanTool: true }) : outline;
  if (!outline.ok || !draft.ok) {
    const failure = !outline.ok ? outline.error : !draft.ok ? draft.error : "content_factory_provider_failed";
    await settleTerminalBudget(jobId, workerToken, 0, { providerFailure: 1 });
    await patchRun({ status: "failed", current_stage: outline.ok ? "draft" : "plan", citations, error_code: failure });
    await completeJob(tenantSlug, jobId, workerToken, "failed", { hermesRunId: runId }, failure);
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const quality = applyOutputQualityPolicy(safeClientProviderOutput(draft.output));
  const outlineArtifact = await storeArtifact(tenantSlug, jobId, workerToken, `${plan.workflowId}-outline.md`, "text/markdown", Buffer.from(safeClientProviderOutput(outline.output), "utf8"));
  const draftArtifact = await storeArtifact(tenantSlug, jobId, workerToken, `${plan.workflowId}-draft.md`, "text/markdown", Buffer.from(quality.output, "utf8"));
  if (!outlineArtifact || !draftArtifact) {
    await settleTerminalBudget(jobId, workerToken, 0, { artifactStoreFailure: 1 });
    await patchRun({ status: "failed", current_stage: "draft", citations, error_code: "artifact_store_failed" });
    await completeJob(tenantSlug, jobId, workerToken, "failed", { hermesRunId: runId }, "artifact_store_failed");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const report = {
    id: `quality-${runId}`,
    workflowId: plan.workflowId,
    tenantSlug,
    passed: citations.length > 0 && Boolean(draftArtifact) && quality.report.passed,
    score: citations.length > 0 && Boolean(draftArtifact) ? quality.report.score : 0,
    citationCount: citations.length,
    findings: quality.report.findings.map((finding) => `${finding.code}: ${finding.message}`),
    checkedAt: new Date().toISOString(),
  };
  const completedStages = stages.map((stage) => {
    if (stage.stage === "brief" || stage.stage === "research" || stage.stage === "plan" || stage.stage === "draft" || stage.stage === "assets" || stage.stage === "quality") return { ...stage, status: "complete" as const, ...(stage.stage === "research" ? { citationRecordId: `citations-${runId}` } : {}), ...(stage.stage === "plan" ? { artifactId: outlineArtifact } : {}), ...(stage.stage === "draft" ? { artifactId: draftArtifact } : {}), ...(stage.stage === "quality" ? { qualityReportId: report.id } : {}) };
    return stage;
  });
  const actual = outline.usage && draft.usage
    ? (clientTextUsageCostMicros(job.model, outline.usage) ?? estimate) + (clientTextUsageCostMicros(job.model, draft.usage) ?? estimate)
    : estimate;
  const outputMetadata = { adapter: "hermes-content-factory", hermesRunId: runId, completedSteps: 6, qualityPolicy: quality.report };
  if (!(await settleRequiredBudget(tenantSlug, jobId, workerToken, { actualAmountMicros: actual, usageMetadata: { actualAmountMicros: actual, citations: citations.length } }, outputMetadata))) return NextResponse.json({ ok: true, status: "failed" });
  await patchRun({ status: "awaiting_approval", current_stage: "approval", stages: completedStages, citations, quality_report: report });
  await completeJob(tenantSlug, jobId, workerToken, "succeeded", outputMetadata);
  return NextResponse.json({ ok: true, status: "succeeded" });
}

/**
 * Runs a Ruflo swarm: every roster agent works the shared objective from its
 * own angle, its finding is written the moment it lands, and a coordinator
 * synthesises whatever came back. One agent failing does not stop the swarm —
 * it contributes nothing and the report says so.
 */
async function processRufloSwarmJob(jobId: string, tenantSlug: string, workerToken: string, job: { provider?: string; model?: string; input_metadata?: Record<string, unknown> | null }) {
  const input = job.input_metadata ?? {};
  const objective = typeof input.objective === "string" ? input.objective.trim().slice(0, 4000) : "";
  const preset = typeof input.preset === "string" ? input.preset : "seo";
  const provider = typeof input.provider === "string" ? input.provider : job.provider ?? "";
  const model = typeof input.model === "string" ? input.model : job.model ?? "";
  const roster = rufloRoster(preset);
  if (!objective || !provider || !model || roster.length === 0) {
    await settleRufloSwarm(tenantSlug, workerToken, jobId, "failed", null, null, "ruflo_input_invalid");
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "ruflo_input_invalid");
    return NextResponse.json({ ok: true, status: "failed" });
  }

  // Reserve for every agent plus the coordinator up front.
  const perCall = estimateClientTextCostMicros(model, [{ role: "user", content: objective.padEnd(3000, " ") }], clientTextMaxOutputTokens());
  if (perCall === null || !(await reserveClientRuntimeBudgetWorker({ provider, model, amountMicros: perCall * (roster.length + 1), jobId, workerToken }))) {
    await settleRufloSwarm(tenantSlug, workerToken, jobId, "failed", null, null, "budget_exceeded");
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "budget_exceeded");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  await settleRufloSwarm(tenantSlug, workerToken, jobId, "running", null, null, null);

  const findings: Array<{ name: string; output: string }> = [];
  let spent = 0;
  for (const entry of roster) {
    await settleRufloAgent(tenantSlug, workerToken, jobId, entry.name, "running", null, null, 0);
    const result = await runClientTextAdapter({
      provider, model, prompt: rufloAgentPrompt({ entry, objective }), reserveBudget: false, jobId,
    });
    if (!result.ok) {
      logClientRuntimeEvent("runtime.provider_failed", { tenant: tenantSlug, provider, status: result.status, reason: result.error });
      await settleRufloAgent(tenantSlug, workerToken, jobId, entry.name, "failed", null, result.error, 0);
      continue;
    }
    const cost = result.usage ? clientTextUsageCostMicros(model, result.usage) ?? 0 : 0;
    spent += cost;
    const output = safeClientProviderOutput(result.output);
    findings.push({ name: entry.name, output });
    await settleRufloAgent(tenantSlug, workerToken, jobId, entry.name, "done", output, null, cost);
  }

  if (findings.length === 0) {
    await settleTerminalBudget(jobId, workerToken, spent, { rufloAgents: 0, providerFailure: 1 });
    await settleRufloSwarm(tenantSlug, workerToken, jobId, "failed", null, null, "ruflo_no_agent_output");
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "ruflo_no_agent_output");
    return NextResponse.json({ ok: true, status: "failed" });
  }

  const report = await runClientTextAdapter({
    provider, model, prompt: rufloReportPrompt({ objective, findings }), reserveBudget: false, jobId,
  });
  let artifactId: string | null = null;
  let reportHtml: string | null = null;
  if (report.ok) {
    spent += report.usage ? clientTextUsageCostMicros(model, report.usage) ?? 0 : 0;
    const artifact = artifactFromWorkspaceOutput({ surface: "ruflo", title: `swarm-${jobId.slice(0, 8)}`, artifactIntent: "preview", output: safeClientProviderOutput(report.output) });
    if (artifact) {
      reportHtml = artifact.previewHtml ?? null;
      artifactId = await storeArtifact(tenantSlug, jobId, workerToken, artifact.fileName, artifact.contentType, artifact.bytes);
    }
  }

  const settled = await settleClientRuntimeBudgetWorker({ jobId, actualAmountMicros: spent, usageMetadata: { rufloAgents: findings.length, actualAmountMicros: spent }, workerToken });
  if (!settled) logClientRuntimeEvent("runtime.budget_settlement_failed", { tenant: tenantSlug, jobId, status: 503 });
  // The agents' findings are real and stored, so this is not a total failure.
  // But a swarm with no coordinator report must not read as a clean run: record
  // why the synthesis is missing instead of settling with a null error code.
  const reportError = artifactId ? null : (report.ok ? "ruflo_report_invalid" : "ruflo_report_failed");
  await settleRufloSwarm(tenantSlug, workerToken, jobId, "completed", reportHtml, artifactId, reportError);
  await completeJob(tenantSlug, jobId, workerToken, "succeeded", { rufloAgents: findings.length, artifactId, costMicros: spent });
  return NextResponse.json({ ok: true, status: "succeeded" });
}

async function settleRufloAgent(tenantSlug: string, workerToken: string, jobId: string, name: string, status: string, output: string | null, errorCode: string | null, costMicros: number) {
  const result = await workerRpc("settle_client_ruflo_agent_worker", {
    p_tenant_slug: tenantSlug, p_worker_token: workerToken, p_job_id: jobId,
    p_agent_name: name, p_status: status, p_output: output,
    p_error_code: errorCode, p_cost_micros: Math.max(0, Math.round(costMicros)),
  });
  if (!result.ok || result.value !== true) logClientRuntimeEvent("runtime.ruflo_agent_settle_failed", { tenant: tenantSlug, jobId, status: 503 });
}

async function settleRufloSwarm(tenantSlug: string, workerToken: string, jobId: string, status: string, report: string | null, artifactId: string | null, errorCode: string | null) {
  const result = await workerRpc("settle_client_ruflo_swarm_worker", {
    p_tenant_slug: tenantSlug, p_worker_token: workerToken, p_job_id: jobId,
    p_status: status, p_report: report?.slice(0, 40_000) ?? null,
    p_report_artifact_id: artifactId, p_error_code: errorCode,
  });
  if (!result.ok || result.value !== true) logClientRuntimeEvent("runtime.ruflo_swarm_settle_failed", { tenant: tenantSlug, jobId, status: 503 });
}

type LoopSide = { provider: string; model: string };

/**
 * Runs a bounded builder/judge loop. The builder produces the work, the judge
 * grades it adversarially, and the builder gets those exact issues to fix next
 * round. It stops on a pass, on the round cap, or on a failure — and only the
 * final artifact is committed, so a rejected draft never becomes a deliverable.
 */
async function processLoopRunJob(jobId: string, tenantSlug: string, workerToken: string, job: { input_metadata?: Record<string, unknown> | null }) {
  const input = job.input_metadata ?? {};
  const goal = typeof input.goal === "string" ? input.goal.trim().slice(0, 10_000) : "";
  const maxRounds = Math.min(5, Math.max(1, Math.round(Number(input.maxRounds) || 3)));
  const builder = loopSide(input.builder);
  const judge = loopSide(input.judge);
  if (!goal || !builder || !judge) {
    await settleLoopRun(tenantSlug, workerToken, jobId, "failed", null, null, null, "loop_input_invalid");
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "loop_input_invalid");
    return NextResponse.json({ ok: true, status: "failed" });
  }

  // Reserve for the worst case up front: every round is a build plus a judge.
  const perCall = estimateClientTextCostMicros(builder.model, [{ role: "user", content: goal.padEnd(4000, " ") }], clientTextMaxOutputTokens());
  if (perCall === null || !(await reserveClientRuntimeBudgetWorker({ provider: builder.provider, model: builder.model, amountMicros: perCall * maxRounds * 2, jobId, workerToken }))) {
    await settleLoopRun(tenantSlug, workerToken, jobId, "failed", null, null, null, "budget_exceeded");
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "budget_exceeded");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  await settleLoopRun(tenantSlug, workerToken, jobId, "running", null, null, null, null);

  let artifactText = "";
  let issues: string[] = [];
  let passed = false;
  let spent = 0;
  let round = 0;
  let lastSummary = "";

  while (round < maxRounds && !passed) {
    round += 1;
    const buildResult = await runClientTextAdapter({
      provider: builder.provider, model: builder.model,
      prompt: loopBuilderPrompt({ goal, previous: artifactText, issues }),
      reserveBudget: false, jobId, disableReviewedPlanTool: true,
    });
    if (!buildResult.ok) {
      await appendLoopRound(tenantSlug, workerToken, jobId, round, false, 0, [], "", 0, 0, buildResult.error);
      await settleTerminalBudget(jobId, workerToken, spent, { loopRounds: round, providerFailure: 1 });
      await settleLoopRun(tenantSlug, workerToken, jobId, "failed", lastSummary || null, null, null, buildResult.error);
      await completeJob(tenantSlug, jobId, workerToken, "failed", { loopRounds: round }, buildResult.error);
      return NextResponse.json({ ok: true, status: "failed" });
    }
    spent += buildResult.usage ? clientTextUsageCostMicros(builder.model, buildResult.usage) ?? 0 : 0;
    artifactText = safeClientProviderOutput(buildResult.output);

    const judgeResult = await runClientTextAdapter({
      provider: judge.provider, model: judge.model,
      prompt: loopJudgePrompt({ goal, artifact: artifactText }),
      reserveBudget: false, jobId, disableReviewedPlanTool: true,
    });
    const judgeCost = judgeResult.ok && judgeResult.usage ? clientTextUsageCostMicros(judge.model, judgeResult.usage) ?? 0 : 0;
    spent += judgeCost;
    const verdict = judgeResult.ok ? parseLoopVerdict(safeClientProviderOutput(judgeResult.output)) : null;
    if (!verdict) {
      // An unreadable verdict is recorded as a failed round rather than being
      // treated as a pass, which would ship unjudged work.
      await appendLoopRound(tenantSlug, workerToken, jobId, round, false, 0, [], "", artifactText.length, judgeCost, judgeResult.ok ? "loop_verdict_unparsable" : judgeResult.error);
      issues = ["The verification gate did not return a readable verdict."];
      lastSummary = "Judge output could not be read.";
      continue;
    }
    passed = verdict.pass;
    issues = verdict.issues;
    lastSummary = verdict.summary;
    await appendLoopRound(tenantSlug, workerToken, jobId, round, verdict.pass, verdict.score, verdict.issues, verdict.summary, artifactText.length, judgeCost, null);
  }

  const artifact = artifactFromWorkspaceOutput({ surface: "loop", title: `loop-${jobId.slice(0, 8)}`, artifactIntent: "preview", output: artifactText });
  const artifactId = artifact ? await storeArtifact(tenantSlug, jobId, workerToken, artifact.fileName, artifact.contentType, artifact.bytes) : null;
  const status = loopFinalStatus({ passed, rounds: round, maxRounds });

  const settled = await settleClientRuntimeBudgetWorker({ jobId, actualAmountMicros: spent, usageMetadata: { loopRounds: round, actualAmountMicros: spent }, workerToken });
  if (!settled) logClientRuntimeEvent("runtime.budget_settlement_failed", { tenant: tenantSlug, jobId, status: 503 });
  await settleLoopRun(tenantSlug, workerToken, jobId, status, lastSummary || null, artifactId, artifact?.previewHtml ?? null, null);
  await completeJob(tenantSlug, jobId, workerToken, "succeeded", { loopRounds: round, passed, artifactId, costMicros: spent });
  return NextResponse.json({ ok: true, status: "succeeded" });
}

function loopSide(value: unknown): LoopSide | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const side = value as Record<string, unknown>;
  return typeof side.provider === "string" && typeof side.model === "string" && side.provider && side.model
    ? { provider: side.provider, model: side.model }
    : null;
}

async function appendLoopRound(tenantSlug: string, workerToken: string, jobId: string, round: number, passed: boolean, score: number, issues: string[], summary: string, artifactChars: number, costMicros: number, errorCode: string | null) {
  const result = await workerRpc("append_client_loop_round_worker", {
    p_tenant_slug: tenantSlug, p_worker_token: workerToken, p_job_id: jobId,
    p_round: round, p_passed: passed, p_score: Math.round(score),
    p_issues: issues.slice(0, 8), p_summary: summary,
    p_artifact_chars: artifactChars, p_cost_micros: Math.max(0, Math.round(costMicros)), p_error_code: errorCode,
  });
  if (!result.ok || result.value !== true) logClientRuntimeEvent("runtime.loop_round_append_failed", { tenant: tenantSlug, jobId, status: 503 });
}

async function settleLoopRun(tenantSlug: string, workerToken: string, jobId: string, status: string, summary: string | null, artifactId: string | null, previewHtml: string | null, errorCode: string | null) {
  const result = await workerRpc("settle_client_loop_run_worker", {
    p_tenant_slug: tenantSlug, p_worker_token: workerToken, p_job_id: jobId,
    p_status: status, p_final_summary: summary, p_build_artifact_id: artifactId,
    p_build_preview_html: previewHtml?.slice(0, 40_000) ?? null, p_error_code: errorCode,
  });
  if (!result.ok || result.value !== true) logClientRuntimeEvent("runtime.loop_settlement_failed", { tenant: tenantSlug, jobId, status: 503 });
}

async function settleBoardTask(tenantSlug: string, workerToken: string, jobId: string, patch: Record<string, unknown>) {
  const result = await workerRpc("update_client_board_task_worker", {
    p_tenant_slug: tenantSlug,
    p_worker_token: workerToken,
    p_job_id: jobId,
    p_patch: patch,
  });
  if (!result.ok || result.value !== true) {
    logClientRuntimeEvent("runtime.board_reconciliation_failed", { tenant: tenantSlug, jobId, status: 503 });
  }
}

async function settlePipelineItem(tenantSlug: string, workerToken: string, jobId: string, patch: Record<string, unknown>) {
  const result = await workerRpc("update_client_pipeline_item_worker", {
    p_tenant_slug: tenantSlug,
    p_worker_token: workerToken,
    p_job_id: jobId,
    p_patch: patch,
  });
  if (!result.ok || result.value !== true) {
    logClientRuntimeEvent("runtime.pipeline_reconciliation_failed", { tenant: tenantSlug, jobId, status: 503 });
  }
}

type RoomRoundAgent = { id: string; name: string; color: string; provider: string | null; model: string | null };

/**
 * Walks a room round: each agent speaks in turn, its reply is appended as soon
 * as it lands so the transcript fills in progressively, and any NOTE:: /
 * PIPELINE:: directive becomes a real tenant record. Budget is reserved once
 * for the round and settled once at the end, matching the one-reservation-per-
 * job contract the ledger expects.
 */
async function processRoomRoundJob(jobId: string, tenantSlug: string, workerToken: string, job: { input_metadata?: Record<string, unknown> | null }) {
  const input = job.input_metadata ?? {};
  const conversationId = typeof input.conversationId === "string" ? input.conversationId : "";
  const contextText = typeof input.contextText === "string" ? input.contextText : "";
  const agents = Array.isArray(input.agents) ? input.agents.filter(isRoomRoundAgent).slice(0, 8) : [];
  const transcript = Array.isArray(input.transcript)
    ? input.transcript.flatMap((turn) => turn && typeof turn === "object" && typeof (turn as Record<string, unknown>).speaker === "string" && typeof (turn as Record<string, unknown>).text === "string"
      ? [{ speaker: String((turn as Record<string, unknown>).speaker).slice(0, 60), text: String((turn as Record<string, unknown>).text).slice(0, 2000) }]
      : [])
    : [];
  if (!/^[0-9a-f-]{36}$/i.test(conversationId) || agents.length === 0) {
    await updateRoomRoundWorker(tenantSlug, workerToken, jobId, "failed", null, 0, 0, "room_round_input_invalid");
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "room_round_input_invalid");
    return NextResponse.json({ ok: true, status: "failed" });
  }

  // Reserve for the whole round up front so a mid-round agent cannot push the
  // tenant past its cap after earlier turns already spent.
  const estimates = agents.map((agent) => {
    const persona = roomPersona(agent.id);
    if (!persona || !agent.model) return null;
    const prompt = roomPrompt({ persona, transcript, context: contextText });
    return estimateClientTextCostMicros(agent.model, [{ role: "user", content: `${prompt.system}\n${prompt.user}` }], clientTextMaxOutputTokens());
  });
  const totalEstimate = estimates.reduce<number>((total, value) => total + (value ?? 0), 0);
  const primary = agents.find((agent) => agent.provider && agent.model);
  if (!primary?.provider || !primary.model || estimates.some((value) => value === null)
    || !(await reserveClientRuntimeBudgetWorker({ provider: primary.provider, model: primary.model, amountMicros: totalEstimate, jobId, workerToken }))) {
    await updateRoomRoundWorker(tenantSlug, workerToken, jobId, "failed", null, 0, 0, "budget_exceeded");
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "budget_exceeded");
    return NextResponse.json({ ok: true, status: "failed" });
  }

  const working = [...transcript];
  let spent = 0;
  let completed = 0;
  for (const agent of agents) {
    await updateRoomRoundWorker(tenantSlug, workerToken, jobId, "running", agent.id, completed, spent, null);
    const persona = roomPersona(agent.id);
    if (!agent.provider || !agent.model || !persona) {
      await appendRoomMessageWorker(tenantSlug, workerToken, conversationId, {
        role: "system", kind: "error", content: `${agent.name} could not speak: provider_not_allowlisted`,
        agentId: agent.id, agentName: agent.name, agentColor: agent.color, errorCode: "provider_not_allowlisted",
      });
      completed += 1;
      continue;
    }
    const prompt = roomPrompt({ persona, transcript: working, context: contextText });
    // Send persona + transcript as one user turn. The Gemini path drops
    // system-role messages entirely, so a separate system message would strip
    // this agent's character and its memory context on that provider alone.
    const result = await runClientTextAdapter({ provider: agent.provider, model: agent.model, prompt: `${prompt.system}\n\n${prompt.user}`, reserveBudget: false, jobId });
    if (!result.ok) {
      logClientRuntimeEvent("runtime.provider_failed", { tenant: tenantSlug, provider: agent.provider, status: result.status, reason: result.error });
      // One agent failing must not abort the round; the others still speak.
      await appendRoomMessageWorker(tenantSlug, workerToken, conversationId, {
        role: "system", kind: "error", content: `${agent.name} could not reply (${result.error})`,
        agentId: agent.id, agentName: agent.name, agentColor: agent.color,
        provider: agent.provider, model: agent.model, errorCode: result.error,
      });
      completed += 1;
      continue;
    }
    const turnCost = result.usage ? clientTextUsageCostMicros(agent.model, result.usage) ?? 0 : 0;
    spent += turnCost;
    const { clean, directives } = parseRoomDirectives(safeClientProviderOutput(result.output));
    working.push({ speaker: agent.name, text: clean });
    await appendRoomMessageWorker(tenantSlug, workerToken, conversationId, {
      role: "agent", kind: "message", content: clean || "…",
      agentId: agent.id, agentName: agent.name, agentColor: agent.color,
      provider: result.provider, model: result.model, costMicros: turnCost,
    });
    for (const directive of directives) {
      const recordId = await createRoomDirectiveRecord(tenantSlug, workerToken, directive, clean);
      await appendRoomMessageWorker(tenantSlug, workerToken, conversationId, {
        role: "system", kind: "action", content: roomActionSummary(directive, agent.name, Boolean(recordId)),
        agentId: agent.id, agentName: agent.name, agentColor: agent.color, linkedRecordId: recordId,
      });
    }
    completed += 1;
  }

  const settled = await settleClientRuntimeBudgetWorker({ jobId, actualAmountMicros: Math.min(spent, totalEstimate), usageMetadata: { roomTurns: completed, actualAmountMicros: spent }, workerToken });
  if (!settled) logClientRuntimeEvent("runtime.budget_settlement_failed", { tenant: tenantSlug, jobId, status: 503 });
  await updateRoomRoundWorker(tenantSlug, workerToken, jobId, "succeeded", null, completed, spent, null);
  await completeJob(tenantSlug, jobId, workerToken, "succeeded", { conversationId, turns: completed, costMicros: spent });
  return NextResponse.json({ ok: true, status: "succeeded" });
}

function isRoomRoundAgent(value: unknown): value is RoomRoundAgent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const agent = value as Record<string, unknown>;
  return typeof agent.id === "string" && typeof agent.name === "string" && typeof agent.color === "string";
}

async function appendRoomMessageWorker(tenantSlug: string, workerToken: string, conversationId: string, message: {
  role: string; kind: string; content: string;
  agentId?: string | null; agentName?: string | null; agentColor?: string | null;
  provider?: string | null; model?: string | null; costMicros?: number; errorCode?: string | null; linkedRecordId?: string | null;
}) {
  const result = await workerRpc("append_client_room_message_worker", {
    p_tenant_slug: tenantSlug,
    p_worker_token: workerToken,
    p_conversation_id: conversationId,
    p_role: message.role,
    p_kind: message.kind,
    p_content: message.content,
    p_agent_id: message.agentId ?? null,
    p_agent_name: message.agentName ?? null,
    p_agent_color: message.agentColor ?? null,
    p_provider: message.provider ?? null,
    p_model: message.model ?? null,
    p_cost_micros: Math.max(0, Math.round(message.costMicros ?? 0)),
    p_error_code: message.errorCode ?? null,
    p_linked_record_id: message.linkedRecordId ?? null,
  });
  if (!result.ok || result.value !== true) logClientRuntimeEvent("runtime.room_message_append_failed", { tenant: tenantSlug, status: 503 });
}

async function updateRoomRoundWorker(tenantSlug: string, workerToken: string, jobId: string, status: string, speakingAgentId: string | null, completed: number, costMicros: number, errorCode: string | null) {
  const result = await workerRpc("update_client_room_round_worker", {
    p_tenant_slug: tenantSlug,
    p_worker_token: workerToken,
    p_job_id: jobId,
    p_status: status,
    p_speaking_agent_id: speakingAgentId,
    p_completed_agents: completed,
    p_cost_micros: Math.max(0, Math.round(costMicros)),
    p_error_code: errorCode,
  });
  if (!result.ok || result.value !== true) logClientRuntimeEvent("runtime.room_round_update_failed", { tenant: tenantSlug, jobId, status: 503 });
}

/**
 * A NOTE:: directive becomes a tenant memory record; PIPELINE:: becomes a
 * pipeline workflow record. Both are real rows the other surfaces already
 * render, so a room action is visible outside the room.
 */
async function createRoomDirectiveRecord(tenantSlug: string, workerToken: string, directive: { kind: "note" | "pipeline"; label: string }, body: string) {
  const result = await workerRpc("create_client_runtime_record_worker", {
    p_tenant_slug: tenantSlug,
    p_worker_token: workerToken,
    p_kind: directive.kind === "note" ? "memory" : "workflow",
    p_title: directive.label.slice(0, 240),
    p_content: (directive.kind === "note" ? body : directive.label).slice(0, 30_000) || directive.label,
    p_metadata: directive.kind === "note"
      ? { source: "agent-room" }
      : { version: 1, surface: "pipeline", operation: "plan", source: "agent-room", steps: [] },
  });
  return result.ok && typeof result.value === "string" ? result.value : null;
}

async function processMediaJob(jobId: string, tenantSlug: string, workerToken: string, job: { provider?: string; input_metadata?: Record<string, unknown> | null }) {
  if (job.provider !== "elevenlabs" && job.provider !== "elevenlabs-music" && job.provider !== "heygen" && job.provider !== "suno" && job.provider !== "openai") {
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "provider_not_allowed");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const input = job.input_metadata ?? {};
  const text = typeof input.text === "string" ? input.text : "";
  const providerJobId = typeof input.provider_job_id === "string" ? input.provider_job_id : undefined;
  if (!providerJobId) {
    const provider = job.provider;
    const model = provider === "elevenlabs-music" ? (process.env.CLIENT_ELEVENLABS_MUSIC_MODEL?.trim() || "music_v1") : provider === "heygen" ? "heygen-video" : provider === "suno" ? (process.env.CLIENT_SUNO_MODEL?.trim() || "V4_5") : provider === "openai" ? (process.env.CLIENT_IMAGE_MODEL?.trim() || "gpt-image-1") : "eleven_multilingual_v2";
    const estimate = provider === "elevenlabs-music" ? estimateElevenLabsMusicCostMicros(Number(input.lengthMs ?? 30_000)) : provider === "heygen" ? Math.max(0, Math.round(Number(process.env.CLIENT_HEYGEN_COST_MICROS ?? 100_000))) : provider === "suno" ? Math.max(0, Math.round(Number(process.env.CLIENT_SUNO_COST_MICROS ?? 100_000))) : provider === "openai" ? estimateClientImageCostMicros(input.quality === "low" || input.quality === "medium" || input.quality === "high" ? input.quality : "auto", input.size === "1024x1536" || input.size === "1536x1024" ? input.size : "1024x1024") : estimateClientMediaCostMicros(text.length);
    if (!(await reserveClientRuntimeBudgetWorker({ provider, model, amountMicros: estimate, jobId, workerToken }))) {
      logClientRuntimeEvent("runtime.budget_exceeded", { tenant: tenantSlug, provider, status: 429 });
      await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "budget_exceeded");
      return NextResponse.json({ ok: true, status: "failed" });
    }
  }
  if (job.provider === "openai") return processOpenAiImageJob(jobId, tenantSlug, workerToken, input);
  if (job.provider === "heygen") return processHeyGenJob(jobId, tenantSlug, workerToken, input, providerJobId);
  if (job.provider === "suno") return processSunoJob(jobId, tenantSlug, workerToken, input, providerJobId);

  const result = job.provider === "elevenlabs-music"
    ? await runClientElevenLabsMusicAdapter({ text, lengthMs: typeof input.lengthMs === "number" ? input.lengthMs : undefined })
    : await runClientSpeechAdapter({ text, voiceId: typeof input.voiceId === "string" ? input.voiceId : undefined });
  if (!result.ok) {
    logClientRuntimeEvent("runtime.provider_failed", { tenant: tenantSlug, provider: job.provider, status: result.status, reason: result.error });
    if (result.status >= 500 && await retryJob(tenantSlug, jobId, workerToken, result.error)) return NextResponse.json({ ok: false, error: "provider_retryable" }, { status: 500 });
    await settleTerminalBudget(jobId, workerToken, 0, { actualAmountMicros: 0, providerFailure: 1 });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, result.error);
    return NextResponse.json({ ok: true, status: "failed" });
  }

  const artifactId = await storeArtifact(tenantSlug, jobId, workerToken, result.fileName, result.contentType, result.bytes);
  if (!artifactId) {
    await settleTerminalBudget(jobId, workerToken, result.estimatedCostMicros, { estimatedCostMicros: result.estimatedCostMicros, artifactStoreFailure: 1 });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "artifact_store_failed");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const outputMetadata = {
    adapter: job.provider === "elevenlabs-music" ? "elevenlabs-music" : "elevenlabs-speech",
    artifactId,
    provider: result.provider,
    model: result.model,
    contentType: result.contentType,
    byteSize: result.bytes.length,
  };
  if (!(await settleRequiredBudget(tenantSlug, jobId, workerToken, { actualAmountMicros: result.estimatedCostMicros, usageMetadata: { estimatedCostMicros: result.estimatedCostMicros } }, outputMetadata))) return NextResponse.json({ ok: true, status: "failed" });
  await completeJob(tenantSlug, jobId, workerToken, "succeeded", outputMetadata);
  return NextResponse.json({ ok: true, status: "succeeded" });
}

async function processOpenAiImageJob(jobId: string, tenantSlug: string, workerToken: string, input: Record<string, unknown>) {
  const result = await runClientImageAdapter({
    prompt: typeof input.prompt === "string" ? input.prompt : typeof input.text === "string" ? input.text : "",
    size: typeof input.size === "string" ? input.size : undefined,
    quality: typeof input.quality === "string" ? input.quality : undefined,
  });
  if (!result.ok) {
    logClientRuntimeEvent("runtime.provider_failed", { tenant: tenantSlug, provider: "openai", status: result.status, reason: result.error });
    if (result.status >= 500 && await retryJob(tenantSlug, jobId, workerToken, result.error)) return NextResponse.json({ ok: false, error: "provider_retryable" }, { status: 500 });
    await settleTerminalBudget(jobId, workerToken, 0, { actualAmountMicros: 0, providerFailure: 1 });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, result.error);
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const artifactId = await storeArtifact(tenantSlug, jobId, workerToken, result.fileName, result.contentType, result.bytes);
  if (!artifactId) {
    await settleTerminalBudget(jobId, workerToken, result.estimatedCostMicros, { estimatedCostMicros: result.estimatedCostMicros, artifactStoreFailure: 1 });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "artifact_store_failed");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const outputMetadata = { adapter: "openai-image", artifactId, provider: result.provider, model: result.model, contentType: result.contentType, byteSize: result.bytes.length };
  if (!(await settleRequiredBudget(tenantSlug, jobId, workerToken, { actualAmountMicros: result.estimatedCostMicros, usageMetadata: { estimatedCostMicros: result.estimatedCostMicros } }, outputMetadata))) return NextResponse.json({ ok: true, status: "failed" });
  await completeJob(tenantSlug, jobId, workerToken, "succeeded", outputMetadata);
  return NextResponse.json({ ok: true, status: "succeeded" });
}

async function processSunoJob(jobId: string, tenantSlug: string, workerToken: string, input: Record<string, unknown>, providerJobId?: string) {
  const result = await runClientMusicAdapter({
    text: typeof input.text === "string" ? input.text : "",
    model: typeof input.model === "string" ? input.model : undefined,
    instrumental: input.instrumental !== false,
    providerJobId,
  });
  if (!result.ok) {
    logClientRuntimeEvent("runtime.provider_failed", { tenant: tenantSlug, provider: "suno", status: result.status, reason: result.error });
    if (result.status >= 500 && await retryJob(tenantSlug, jobId, workerToken, result.error)) return NextResponse.json({ ok: false, error: "provider_retryable" }, { status: 500 });
    await settleTerminalBudget(jobId, workerToken, 0, { actualAmountMicros: 0, providerFailure: 1 });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, result.error);
    return NextResponse.json({ ok: true, status: "failed" });
  }
  if (result.state === "processing") {
    const checkpointed = await workerRpc("checkpoint_client_runtime_job_worker", { p_tenant_slug: tenantSlug, p_job_id: jobId, p_worker_token: workerToken, p_provider_job_id: result.providerJobId });
    if (!(checkpointed.ok && checkpointed.value === true) || !(await retryJob(tenantSlug, jobId, workerToken, "provider_processing"))) return NextResponse.json({ ok: false, error: "provider_poll_reschedule_failed" }, { status: 503 });
    const task = await enqueueClientRuntimeTask({ jobId, tenantSlug, delaySeconds: 15 });
    if (!task.ok) return NextResponse.json({ ok: false, error: "provider_poll_enqueue_failed" }, { status: 503 });
    return NextResponse.json({ ok: true, status: "processing" }, { status: 202 });
  }
  if (result.state === "failed" || !result.outputUrl || !safeProviderOutputUrl(result.outputUrl)) {
    await settleTerminalBudget(jobId, workerToken, result.estimatedCostMicros, { estimatedCostMicros: result.estimatedCostMicros, providerOutputFailure: 1 });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, result.error || "provider_music_failed");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const response = await fetch(result.outputUrl, { cache: "no-store", signal: AbortSignal.timeout(120_000) }).catch(() => null);
  if (!response?.ok) {
    if (await retryJob(tenantSlug, jobId, workerToken, "provider_output_download_failed")) return NextResponse.json({ ok: false, error: "provider_retryable" }, { status: 500 });
    await settleTerminalBudget(jobId, workerToken, result.estimatedCostMicros, { estimatedCostMicros: result.estimatedCostMicros, outputDownloadFailure: 1 });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "provider_output_download_failed");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const bytes = await readBoundedResponseBytes(response, 100 * 1024 * 1024);
  if (!bytes || bytes.length < 1) {
    await settleTerminalBudget(jobId, workerToken, result.estimatedCostMicros, { estimatedCostMicros: result.estimatedCostMicros, providerOutputFailure: 1 });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "provider_output_invalid");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const artifactId = await storeArtifact(tenantSlug, jobId, workerToken, `${jobId}.mp3`, "audio/mpeg", bytes);
  if (!artifactId) {
    await settleTerminalBudget(jobId, workerToken, result.estimatedCostMicros, { estimatedCostMicros: result.estimatedCostMicros, artifactStoreFailure: 1 });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "artifact_store_failed");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const outputMetadata = { adapter: "suno-music", artifactId, provider: result.provider, model: result.model, contentType: "audio/mpeg", byteSize: bytes.length };
  if (!(await settleRequiredBudget(tenantSlug, jobId, workerToken, { actualAmountMicros: result.estimatedCostMicros, usageMetadata: { estimatedCostMicros: result.estimatedCostMicros } }, outputMetadata))) return NextResponse.json({ ok: true, status: "failed" });
  await completeJob(tenantSlug, jobId, workerToken, "succeeded", outputMetadata);
  return NextResponse.json({ ok: true, status: "succeeded" });
}

async function processHeyGenJob(jobId: string, tenantSlug: string, workerToken: string, input: Record<string, unknown>, providerJobId?: string) {
  const result = await runClientHeyGenAdapter({
    text: typeof input.text === "string" ? input.text : "",
    avatarId: typeof input.avatarId === "string" ? input.avatarId : undefined,
    voiceId: typeof input.voiceId === "string" ? input.voiceId : undefined,
    providerJobId,
  });
  if (!result.ok) {
    logClientRuntimeEvent("runtime.provider_failed", { tenant: tenantSlug, provider: "heygen", status: result.status, reason: result.error });
    if (result.status >= 500 && await retryJob(tenantSlug, jobId, workerToken, result.error)) return NextResponse.json({ ok: false, error: "provider_retryable" }, { status: 500 });
    await settleTerminalBudget(jobId, workerToken, 0, { actualAmountMicros: 0, providerFailure: 1 });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, result.error);
    return NextResponse.json({ ok: true, status: "failed" });
  }
  if (result.state === "processing") {
    const checkpointed = await workerRpc("checkpoint_client_runtime_job_worker", { p_tenant_slug: tenantSlug, p_job_id: jobId, p_worker_token: workerToken, p_provider_job_id: result.providerJobId });
    const retried = checkpointed.ok && checkpointed.value === true && await retryJob(tenantSlug, jobId, workerToken, "provider_processing");
    if (!retried) return NextResponse.json({ ok: false, error: "provider_poll_reschedule_failed" }, { status: 503 });
    const task = await enqueueClientRuntimeTask({ jobId, tenantSlug, delaySeconds: 15 });
    if (!task.ok) return NextResponse.json({ ok: false, error: "provider_poll_enqueue_failed" }, { status: 503 });
    return NextResponse.json({ ok: true, status: "processing" }, { status: 202 });
  }
  if (result.state === "failed" || !result.outputUrl || !safeProviderOutputUrl(result.outputUrl)) {
    await settleTerminalBudget(jobId, workerToken, result.estimatedCostMicros, { estimatedCostMicros: result.estimatedCostMicros, providerOutputFailure: 1 });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, result.error || "provider_video_failed");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const response = await fetch(result.outputUrl, { cache: "no-store", signal: AbortSignal.timeout(120_000) }).catch(() => null);
  if (!response?.ok) {
    if (await retryJob(tenantSlug, jobId, workerToken, "provider_output_download_failed")) return NextResponse.json({ ok: false, error: "provider_retryable" }, { status: 500 });
    await settleTerminalBudget(jobId, workerToken, result.estimatedCostMicros, { estimatedCostMicros: result.estimatedCostMicros, outputDownloadFailure: 1 });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "provider_output_download_failed");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const bytes = await readBoundedResponseBytes(response, 100 * 1024 * 1024);
  if (!bytes || bytes.length < 1) {
    await settleTerminalBudget(jobId, workerToken, result.estimatedCostMicros, { estimatedCostMicros: result.estimatedCostMicros, providerOutputFailure: 1 });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "provider_output_invalid");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const artifactId = await storeArtifact(tenantSlug, jobId, workerToken, `${jobId}.mp4`, "video/mp4", bytes);
  if (!artifactId) {
    await settleTerminalBudget(jobId, workerToken, result.estimatedCostMicros, { estimatedCostMicros: result.estimatedCostMicros, artifactStoreFailure: 1 });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "artifact_store_failed");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const outputMetadata = { adapter: "heygen-video", artifactId, provider: result.provider, model: result.model, contentType: "video/mp4", byteSize: bytes.length };
  if (!(await settleRequiredBudget(tenantSlug, jobId, workerToken, { actualAmountMicros: result.estimatedCostMicros, usageMetadata: { estimatedCostMicros: result.estimatedCostMicros } }, outputMetadata))) return NextResponse.json({ ok: true, status: "failed" });
  await completeJob(tenantSlug, jobId, workerToken, "succeeded", outputMetadata);
  return NextResponse.json({ ok: true, status: "succeeded" });
}

async function storeArtifact(tenantSlug: string, jobId: string, workerToken: string, fileName: string, contentType: string, bytes: Buffer) {
  const config = clientStorageConfig();
  const token = await clientGcpAccessToken();
  if (!config || !token) return null;
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  const objectKey = `${config.namespace}/jobs/${jobId}/${safeName}`;
  const artifact = await workerRpc("create_client_runtime_artifact_worker", {
    p_tenant_slug: tenantSlug,
    p_job_id: jobId,
    p_worker_token: workerToken,
    p_namespace: config.namespace,
    p_object_key: objectKey,
    p_original_name: fileName,
    p_content_type: contentType,
    p_byte_size: bytes.length,
    p_retention_expires_at: new Date(Date.now() + Number(process.env.CLIENT_RETENTION_DAYS ?? 30) * 86400000).toISOString(),
  });
  const artifactId = typeof artifact.value === "string" ? artifact.value : "";
  if (!artifact.ok || !artifactId || !(await uploadClientStorageObject({ bucket: config.bucket, objectKey, contentType, bytes, token }))) return null;
  const confirmed = await workerRpc("confirm_client_runtime_artifact_worker", { p_tenant_slug: tenantSlug, p_artifact_id: artifactId, p_worker_token: workerToken, p_byte_size: bytes.length, p_content_type: contentType });
  return confirmed.ok && confirmed.value === true ? artifactId : null;
}

async function processSeoJob(jobId: string, tenantSlug: string, workerToken: string, job: { provider?: string; idempotency_key?: string; input_metadata?: Record<string, unknown> | null }) {
  if (job.provider !== "firecrawl") {
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "provider_not_allowed");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const input = job.input_metadata ?? {};
  const operation = typeof input.operation === "string" ? input.operation : "scrape";
  if (operation === "aeo") return processAeoJob(jobId, tenantSlug, workerToken, input);
  if (operation === "research") return processMarketResearchJob(jobId, tenantSlug, workerToken, job, input);
  const estimate = Math.max(0, Math.round(Number(process.env.CLIENT_FIRECRAWL_COST_MICROS ?? 1000)));
  if (!(await reserveClientRuntimeBudgetWorker({ provider: "firecrawl", model: "scrape-markdown", amountMicros: estimate, jobId, workerToken }))) {
    logClientRuntimeEvent("runtime.budget_exceeded", { tenant: tenantSlug, provider: "firecrawl", status: 429 });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "budget_exceeded");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const result = await runClientSeoAdapter({
    url: typeof input.url === "string" ? input.url : "",
    focus: typeof input.focus === "string" ? input.focus : undefined,
  });
  if (!result.ok) {
    if (result.status >= 500 && await retryJob(tenantSlug, jobId, workerToken, result.error)) return NextResponse.json({ ok: false, error: "provider_retryable" }, { status: 500 });
    await settleTerminalBudget(jobId, workerToken, 0, { actualAmountMicros: 0, providerFailure: 1 });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, result.error);
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const outputMetadata = {
    adapter: "firecrawl-scrape",
    provider: result.provider,
    model: result.model,
    url: result.url,
    focus: result.focus,
    markdown: safeClientProviderOutput(result.markdown),
    metadata: safeClientProviderMetadata(result.metadata),
  };
  if (!(await settleRequiredBudget(tenantSlug, jobId, workerToken, { actualAmountMicros: result.estimatedCostMicros, usageMetadata: { estimatedCostMicros: result.estimatedCostMicros } }, outputMetadata))) return NextResponse.json({ ok: true, status: "failed" });
  await completeJob(tenantSlug, jobId, workerToken, "succeeded", outputMetadata);
  return NextResponse.json({ ok: true, status: "succeeded" });
}

/**
 * AEO reads only robots.txt and llms.txt on a host the client named, so it
 * costs nothing at the provider and reserves no budget.
 */
async function processAeoJob(jobId: string, tenantSlug: string, workerToken: string, input: Record<string, unknown>) {
  const result = await runClientAeoCheck({ site: typeof input.site === "string" ? input.site : "" });
  if (!result.ok) {
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, result.error);
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const outputMetadata = { adapter: "firecrawl-aeo", provider: result.provider, model: result.model, report: safeClientProviderMetadata(result.report) };
  await completeJob(tenantSlug, jobId, workerToken, "succeeded", outputMetadata);
  return NextResponse.json({ ok: true, status: "succeeded" });
}

/**
 * Market research: search, then optionally read what it found. Scraping is off
 * unless asked for, and only URLs the search itself returned are followed - the
 * caller cannot widen that by passing its own list. Results are normalised
 * through the v96 contract so every claim is attributable.
 */
async function processMarketResearchJob(jobId: string, tenantSlug: string, workerToken: string, job: { idempotency_key?: string }, input: Record<string, unknown>) {
  const query = typeof input.query === "string" ? input.query : "";
  const scrapeResults = input.scrapeResults === true;
  const limit = Math.max(1, Math.min(3, Math.round(Number(input.limit ?? 3))));
  const perUnit = Math.max(0, Math.round(Number(process.env.CLIENT_FIRECRAWL_COST_MICROS ?? 1000)));
  // Reserve for the worst case up front so a scrape cannot push the tenant past
  // its cap after the search has already spent.
  const estimate = perUnit * (scrapeResults ? limit + 1 : 1);
  if (!(await reserveClientRuntimeBudgetWorker({ provider: "firecrawl", model: scrapeResults ? "search-scrape" : "search", amountMicros: estimate, jobId, workerToken }))) {
    logClientRuntimeEvent("runtime.budget_exceeded", { tenant: tenantSlug, provider: "firecrawl", status: 429 });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "budget_exceeded");
    return NextResponse.json({ ok: true, status: "failed" });
  }

  const search = await runClientMarketSearch({ query, limit, scrapeResults });
  if (!search.ok) {
    if (search.status >= 500 && await retryJob(tenantSlug, jobId, workerToken, search.error)) return NextResponse.json({ ok: false, error: "provider_retryable" }, { status: 500 });
    await settleTerminalBudget(jobId, workerToken, 0, { actualAmountMicros: 0, providerFailure: 1 });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, search.error);
    return NextResponse.json({ ok: true, status: "failed" });
  }

  const records = marketSearchToV96Records({ tenantSlug, query: search.query, results: search.results, scraped: scrapeResults });
  const seoRecord = firecrawlSearchToSeoIntelligenceRecord({
    request: createSeoIntelligenceRequest({
      requestId: jobId,
      tenantSlug,
      provider: "firecrawl",
      domain: "https://search.firecrawl.dev",
      metrics: ["competitors"],
      maxRows: limit,
    }),
    results: search.results,
    providerCostMicros: search.estimatedCostMicros,
  });
  const outputMetadata = {
    adapter: scrapeResults ? "firecrawl-search-scrape" : "firecrawl-search",
    provider: search.provider,
    model: search.model,
    query: search.query,
    resultCount: search.results.length,
    // The discovered set is recorded so a follow-up read can be checked against
    // what the search actually returned rather than against a caller's list.
    discovered: search.results.map((result) => result.url),
    records: safeClientProviderMetadata(records),
    seoIntelligence: safeClientProviderMetadata(seoRecord),
    researchRunId: null as string | null,
  };
  const researchRun = await workerRpc("record_client_research_result_worker", {
    p_tenant_slug: tenantSlug,
    p_job_id: jobId,
    p_worker_token: workerToken,
    p_idempotency_key: job.idempotency_key ?? `seo-research-${jobId}`,
    p_provider: search.provider,
    p_query: search.query,
    p_notebook_id: typeof input.notebookId === "string" && /^[0-9a-f-]{36}$/i.test(input.notebookId) ? input.notebookId : null,
    p_records: records,
  });
  if (!researchRun.ok || typeof researchRun.value !== "string") {
    await settleTerminalBudget(jobId, workerToken, 0, { researchPersistenceFailure: 1 });
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "research_persistence_failed");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  outputMetadata.researchRunId = researchRun.value;
  if (!(await settleRequiredBudget(tenantSlug, jobId, workerToken, { actualAmountMicros: search.estimatedCostMicros, usageMetadata: { estimatedCostMicros: search.estimatedCostMicros } }, outputMetadata))) return NextResponse.json({ ok: true, status: "failed" });
  await completeJob(tenantSlug, jobId, workerToken, "succeeded", outputMetadata);
  return NextResponse.json({ ok: true, status: "succeeded" });
}

async function completeJob(tenantSlug: string, jobId: string, workerToken: string, status: string, outputMetadata: Record<string, unknown>, errorCode?: string) {
  const completed = await workerRpc("complete_client_runtime_job", { p_tenant_slug: tenantSlug, p_job_id: jobId, p_worker_token: workerToken, p_status: status, p_output_metadata: outputMetadata, p_error_code: errorCode ?? null });
  if (!completed.ok || completed.value !== true) {
    logClientRuntimeEvent("runtime.job_completion_failed", { tenant: tenantSlug, jobId, status: 503 });
    throw new Error("job_completion_failed");
  }
  const workflowId = typeof outputMetadata.workflowId === "string" && /^[0-9a-f-]{36}$/i.test(outputMetadata.workflowId) ? outputMetadata.workflowId : null;
  if (workflowId) {
    const reconciled = await workerRpc("update_client_runtime_record_worker", {
      p_tenant_slug: tenantSlug,
      p_record_id: workflowId,
      p_worker_token: workerToken,
      p_execution: {
        status: status === "succeeded" ? "completed" : "failed",
        jobId,
        errorCode: errorCode ?? null,
        ...(Array.isArray(outputMetadata.steps) ? { steps: outputMetadata.steps.slice(0, 8) } : {}),
        ...(typeof outputMetadata.completedSteps === "number" ? { completedSteps: Math.min(8, Math.max(0, Math.round(outputMetadata.completedSteps))) } : {}),
        ...(typeof outputMetadata.adapter === "string" ? { adapter: outputMetadata.adapter } : {}),
        ...(typeof outputMetadata.mode === "string" ? { mode: outputMetadata.mode } : {}),
        ...(typeof outputMetadata.completedAt === "string" ? { completedAt: outputMetadata.completedAt } : {}),
        updatedAt: new Date().toISOString(),
      },
    });
    if (!reconciled.ok || reconciled.value !== true) logClientRuntimeEvent("runtime.workflow_reconciliation_failed", { tenant: tenantSlug, jobId, status: 503 });
  }
}

async function settleRequiredBudget(tenantSlug: string, jobId: string, workerToken: string, input: { actualAmountMicros: number; usageMetadata: Record<string, number> }, outputMetadata: Record<string, unknown>) {
  const settled = await settleClientRuntimeBudgetWorker({ jobId, actualAmountMicros: input.actualAmountMicros, usageMetadata: input.usageMetadata, workerToken });
  if (settled) return true;
  logClientRuntimeEvent("runtime.budget_settlement_failed", { tenant: tenantSlug, jobId, status: 503 });
  await completeJob(tenantSlug, jobId, workerToken, "failed", outputMetadata, "budget_settlement_failed");
  return false;
}

async function settleTerminalBudget(jobId: string, workerToken: string, actualAmountMicros: number, usageMetadata: Record<string, number>) {
  const settled = await settleClientRuntimeBudgetWorker({ jobId, actualAmountMicros, usageMetadata, workerToken });
  if (!settled) logClientRuntimeEvent("runtime.budget_settlement_failed", { jobId, status: 503 });
}

function workflowIdFrom(input: Record<string, unknown> | null | undefined) {
  const value = input && typeof input.workflowId === "string" ? input.workflowId : "";
  return /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

function workflowStepsFrom(input: Record<string, unknown> | null | undefined) {
  return Array.isArray(input?.steps) ? input.steps.slice(0, 8) : undefined;
}

async function retryJob(tenantSlug: string, jobId: string, workerToken: string, errorCode: string) {
  const result = await workerRpc("retry_client_runtime_job", { p_tenant_slug: tenantSlug, p_job_id: jobId, p_worker_token: workerToken, p_error_code: errorCode });
  return result.ok && result.value === true;
}
