import { NextResponse } from "next/server";
import { reserveClientRuntimeBudgetWorker, settleClientRuntimeBudgetWorker, workerRpc } from "@/lib/clientDataPlane";
import { clientProviderDefaultModel, clientTextMaxOutputTokens, clientTextUsageCostMicros, estimateClientTextCostMicros, runClientTextAdapter, safeClientProviderMetadata, safeClientProviderOutput } from "@/lib/clientProviderAdapter";
import { clientProviderCallsEnabled } from "@/lib/clientRuntimePolicy";
import { estimateClientImageCostMicros, estimateClientMediaCostMicros, runClientHeyGenAdapter, runClientImageAdapter, runClientMusicAdapter, runClientSpeechAdapter, safeProviderOutputUrl } from "@/lib/clientMediaAdapter";
import { runClientSeoAdapter } from "@/lib/clientSeoAdapter";
import { clientGcpAccessToken, clientStorageConfig, uploadClientStorageObject } from "@/lib/clientStorage";
import { enqueueClientRuntimeTask } from "@/lib/cloudTasks";
import { validClientTaskIdentity } from "@/lib/clientTaskAuth";
import { logClientRuntimeEvent } from "@/lib/clientRuntimeObservability";
import { runClientWorkflowRunner } from "@/lib/clientWorkflowRunner";

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
    await settleClientRuntimeBudgetWorker({
      jobId,
      actualAmountMicros: actualAmountMicros ?? estimate,
      usageMetadata: result.usage ?? { estimatedCostMicros: estimate, usageFallback: 1 },
      workerToken,
    });
    await completeJob(tenantSlug, jobId, workerToken, "succeeded", { workflowId: workflowIdFrom(job.input_metadata), provider: result.provider, model: result.model, output: safeClientProviderOutput(result.output), steps: workflowStepsFrom(job.input_metadata) });
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
  await settleClientRuntimeBudgetWorker({
    jobId,
    actualAmountMicros: result.estimatedCostMicros,
    usageMetadata: { estimatedCostMicros: result.estimatedCostMicros },
    workerToken,
  });
  await completeJob(tenantSlug, jobId, workerToken, "succeeded", {
    adapter: "elevenlabs-speech",
    artifactId,
    provider: result.provider,
    model: result.model,
    contentType: result.contentType,
    byteSize: result.bytes.length,
  });
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
  await settleClientRuntimeBudgetWorker({ jobId, actualAmountMicros: result.estimatedCostMicros, usageMetadata: { estimatedCostMicros: result.estimatedCostMicros }, workerToken });
  await completeJob(tenantSlug, jobId, workerToken, "succeeded", { adapter: "openai-image", artifactId, provider: result.provider, model: result.model, contentType: result.contentType, byteSize: result.bytes.length });
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
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1 || bytes.length > 100 * 1024 * 1024) {
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
  await settleClientRuntimeBudgetWorker({
    jobId,
    actualAmountMicros: result.estimatedCostMicros,
    usageMetadata: { estimatedCostMicros: result.estimatedCostMicros },
    workerToken,
  });
  await completeJob(tenantSlug, jobId, workerToken, "succeeded", { adapter: "suno-music", artifactId, provider: result.provider, model: result.model, contentType: "audio/mpeg", byteSize: bytes.length });
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
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1 || bytes.length > 100 * 1024 * 1024) {
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
  await settleClientRuntimeBudgetWorker({
    jobId,
    actualAmountMicros: result.estimatedCostMicros,
    usageMetadata: { estimatedCostMicros: result.estimatedCostMicros },
    workerToken,
  });
  await completeJob(tenantSlug, jobId, workerToken, "succeeded", { adapter: "heygen-video", artifactId, provider: result.provider, model: result.model, contentType: "video/mp4", byteSize: bytes.length });
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
  await settleClientRuntimeBudgetWorker({
    jobId,
    actualAmountMicros: result.estimatedCostMicros,
    usageMetadata: { estimatedCostMicros: result.estimatedCostMicros },
    workerToken,
  });
  await completeJob(tenantSlug, jobId, workerToken, "succeeded", {
    adapter: "firecrawl-scrape",
    provider: result.provider,
    model: result.model,
    url: result.url,
    focus: result.focus,
    markdown: safeClientProviderOutput(result.markdown),
    metadata: safeClientProviderMetadata(result.metadata),
  });
  return NextResponse.json({ ok: true, status: "succeeded" });
}

async function completeJob(tenantSlug: string, jobId: string, workerToken: string, status: string, outputMetadata: Record<string, unknown>, errorCode?: string) {
  await workerRpc("complete_client_runtime_job", { p_tenant_slug: tenantSlug, p_job_id: jobId, p_worker_token: workerToken, p_status: status, p_output_metadata: outputMetadata, p_error_code: errorCode ?? null });
  const workflowId = typeof outputMetadata.workflowId === "string" && /^[0-9a-f-]{36}$/i.test(outputMetadata.workflowId) ? outputMetadata.workflowId : null;
  if (workflowId) {
    await workerRpc("update_client_runtime_record_worker", {
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
  }
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
