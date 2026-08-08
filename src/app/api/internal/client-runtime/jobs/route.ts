import { NextResponse } from "next/server";
import { reserveClientRuntimeBudgetWorker, settleClientRuntimeBudgetWorker, workerRpc } from "@/lib/clientDataPlane";
import { clientProviderDefaultModel, clientTextMaxOutputTokens, clientTextUsageCostMicros, estimateClientTextCostMicros, runClientTextAdapter, safeClientProviderMetadata, safeClientProviderOutput } from "@/lib/clientProviderAdapter";
import { clientProviderCallsEnabled } from "@/lib/clientRuntimePolicy";
import { estimateClientImageCostMicros, estimateClientMediaCostMicros, runClientHeyGenAdapter, runClientImageAdapter, runClientMusicAdapter, runClientSpeechAdapter, safeProviderOutputUrl } from "@/lib/clientMediaAdapter";
import { readBoundedResponseBytes } from "@/lib/clientNetworkSafety";
import { runClientSeoAdapter } from "@/lib/clientSeoAdapter";
import { clientGcpAccessToken, clientStorageConfig, uploadClientStorageObject } from "@/lib/clientStorage";
import { enqueueClientRuntimeTask } from "@/lib/cloudTasks";
import { validClientTaskIdentity } from "@/lib/clientTaskAuth";
import { logClientRuntimeEvent } from "@/lib/clientRuntimeObservability";
import { runClientWorkflowRunner } from "@/lib/clientWorkflowRunner";
import { artifactFromWorkspaceOutput, isClientWorkspaceSurface, workspacePrompt, workspaceTerminalEvents } from "@/lib/clientWorkspaceExecution";
import { paperclipRunSummary } from "@/lib/clientPaperclipAdapter";

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
  const job = claim.value as { id?: string; capability?: string; provider?: string; model?: string; input_metadata?: Record<string, unknown> | null } | null;
  if (!job?.id || typeof job.capability !== "string") return NextResponse.json({ ok: true, status: "already_claimed" });
  if (["text-agents", "media", "seo-research"].includes(job.capability) && !clientProviderCallsEnabled()) {
    await completeJob(tenantSlug, jobId, workerToken, "failed", { workflowId: workflowIdFrom(job.input_metadata) }, "provider_calls_require_approval");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  if (job.capability === "orchestration") return processOrchestrationJob(jobId, tenantSlug, workerToken, job);
  if (job.capability === "workspace-execution") return processWorkspaceExecutionJob(jobId, tenantSlug, workerToken, job);
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
  const artifactIntent = input.artifactIntent === "brief" ? "brief" : "preview";
  // A Paperclip agent run is still a workspace execution, but it carries its own
  // agent-persona prompt and reconciles the tenant issue and run rows.
  const paperclipRun = typeof input.paperclipRunId === "string" && /^[0-9a-f-]{36}$/i.test(input.paperclipRunId);
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
    await completeJob(tenantSlug, jobId, workerToken, "failed", { terminalEvents: workspaceTerminalEvents(surface, "failed", "The tenant budget or model policy did not approve this execution.") }, "budget_exceeded");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const result = await runClientTextAdapter({ provider: job.provider, model, prompt, reserveBudget: false, jobId });
  if (!result.ok) {
    logClientRuntimeEvent("runtime.provider_failed", { tenant: tenantSlug, provider: job.provider, status: result.status, reason: result.error });
    if (result.status >= 500 && await retryJob(tenantSlug, jobId, workerToken, result.error)) return NextResponse.json({ ok: false, error: "provider_retryable" }, { status: 500 });
    await settleTerminalBudget(jobId, workerToken, 0, { actualAmountMicros: 0, providerFailure: 1 });
    if (paperclipRun) await settlePaperclipRun(tenantSlug, workerToken, jobId, "failed", { errorCode: result.error });
    await completeJob(tenantSlug, jobId, workerToken, "failed", { terminalEvents: [...workspaceTerminalEvents(surface, "started"), ...workspaceTerminalEvents(surface, "failed", result.error)] }, result.error);
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const safeOutput = safeClientProviderOutput(result.output);
  const artifact = artifactFromWorkspaceOutput({ surface, title, artifactIntent, output: safeOutput });
  if (!artifact) {
    await settleTerminalBudget(jobId, workerToken, 0, { actualAmountMicros: 0, artifactValidationFailure: 1 });
    if (paperclipRun) await settlePaperclipRun(tenantSlug, workerToken, jobId, "failed", { errorCode: "workspace_artifact_invalid" });
    await completeJob(tenantSlug, jobId, workerToken, "failed", { terminalEvents: [...workspaceTerminalEvents(surface, "started"), ...workspaceTerminalEvents(surface, "failed", "The approved provider did not return a usable tenant artifact.")] }, "workspace_artifact_invalid");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const artifactId = await storeArtifact(tenantSlug, jobId, workerToken, artifact.fileName, artifact.contentType, artifact.bytes);
  if (!artifactId) {
    await settleTerminalBudget(jobId, workerToken, result.usage ? clientTextUsageCostMicros(model, result.usage) ?? estimate : estimate, { artifactStoreFailure: 1 });
    if (paperclipRun) await settlePaperclipRun(tenantSlug, workerToken, jobId, "failed", { errorCode: "artifact_store_failed" });
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
    return NextResponse.json({ ok: true, status: "failed" });
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

async function processMediaJob(jobId: string, tenantSlug: string, workerToken: string, job: { provider?: string; input_metadata?: Record<string, unknown> | null }) {
  if (job.provider !== "elevenlabs" && job.provider !== "heygen" && job.provider !== "suno" && job.provider !== "openai") {
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "provider_not_allowed");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const input = job.input_metadata ?? {};
  const text = typeof input.text === "string" ? input.text : "";
  const providerJobId = typeof input.provider_job_id === "string" ? input.provider_job_id : undefined;
  if (!providerJobId) {
    const provider = job.provider;
    const model = provider === "heygen" ? "heygen-video" : provider === "suno" ? (process.env.CLIENT_SUNO_MODEL?.trim() || "V4_5") : provider === "openai" ? (process.env.CLIENT_IMAGE_MODEL?.trim() || "gpt-image-1") : "eleven_multilingual_v2";
    const estimate = provider === "heygen" ? Math.max(0, Math.round(Number(process.env.CLIENT_HEYGEN_COST_MICROS ?? 100_000))) : provider === "suno" ? Math.max(0, Math.round(Number(process.env.CLIENT_SUNO_COST_MICROS ?? 100_000))) : provider === "openai" ? estimateClientImageCostMicros(input.quality === "low" || input.quality === "medium" || input.quality === "high" ? input.quality : "auto", input.size === "1024x1536" || input.size === "1536x1024" ? input.size : "1024x1024") : estimateClientMediaCostMicros(text.length);
    if (!(await reserveClientRuntimeBudgetWorker({ provider, model, amountMicros: estimate, jobId, workerToken }))) {
      logClientRuntimeEvent("runtime.budget_exceeded", { tenant: tenantSlug, provider, status: 429 });
      await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "budget_exceeded");
      return NextResponse.json({ ok: true, status: "failed" });
    }
  }
  if (job.provider === "openai") return processOpenAiImageJob(jobId, tenantSlug, workerToken, input);
  if (job.provider === "heygen") return processHeyGenJob(jobId, tenantSlug, workerToken, input, providerJobId);
  if (job.provider === "suno") return processSunoJob(jobId, tenantSlug, workerToken, input, providerJobId);

  const result = await runClientSpeechAdapter({ text, voiceId: typeof input.voiceId === "string" ? input.voiceId : undefined });
  if (!result.ok) {
    logClientRuntimeEvent("runtime.provider_failed", { tenant: tenantSlug, provider: "elevenlabs", status: result.status, reason: result.error });
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
    adapter: "elevenlabs-speech",
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

async function processSeoJob(jobId: string, tenantSlug: string, workerToken: string, job: { provider?: string; input_metadata?: Record<string, unknown> | null }) {
  if (job.provider !== "firecrawl") {
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "provider_not_allowed");
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const input = job.input_metadata ?? {};
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
