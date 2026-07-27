import { NextResponse } from "next/server";
import { reserveClientRuntimeBudgetWorker, workerRpc } from "@/lib/clientDataPlane";
import { clientProviderDefaultModel, estimateClientTextCostMicros, clientTextMaxOutputTokens, runClientTextAdapter } from "@/lib/clientProviderAdapter";
import { clientProviderCallsEnabled } from "@/lib/clientRuntimePolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (process.env.CLIENT_RUNTIME_WORKER_ENABLED !== "1") return NextResponse.json({ ok: false, error: "worker_disabled" }, { status: 404 });
  if (!clientProviderCallsEnabled()) return NextResponse.json({ ok: false, error: "provider_calls_require_approval" }, { status: 403 });
  if (!(await validTaskIdentity(request))) return NextResponse.json({ ok: false, error: "worker_unauthorized" }, { status: 401 });
  const workerToken = process.env.CLIENT_WORKER_TOKEN?.trim();
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!workerToken || !tenantSlug) return NextResponse.json({ ok: false, error: "worker_not_configured" }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  const requestedTenant = typeof body.tenantSlug === "string" ? body.tenantSlug : "";
  if (!/^[0-9a-f-]{36}$/i.test(jobId) || requestedTenant !== tenantSlug) return NextResponse.json({ ok: false, error: "worker_payload_invalid" }, { status: 400 });

  const claim = await workerRpc("claim_client_runtime_job", { p_tenant_slug: tenantSlug, p_job_id: jobId, p_worker_token: workerToken });
  if (!claim.ok) return NextResponse.json({ ok: false, error: "job_claim_failed" }, { status: 503 });
  const job = claim.value as { id?: string; provider?: string; model?: string; input_metadata?: { prompt?: string; history?: Array<{ role: "system" | "user" | "assistant"; content: string }> } } | null;
  if (!job?.id || typeof job.provider !== "string" || typeof job.input_metadata?.prompt !== "string") return NextResponse.json({ ok: true, status: "already_claimed" });
  const model = typeof job.model === "string" && job.model ? job.model : clientProviderDefaultModel(job.provider) ?? undefined;
  const messages = [...(job.input_metadata.history ?? []), { role: "user" as const, content: job.input_metadata.prompt }].slice(-16);
  const pricingModel = model ?? "";
  const estimate = estimateClientTextCostMicros(pricingModel, messages, clientTextMaxOutputTokens());
  if (estimate === null || !model || !(await reserveClientRuntimeBudgetWorker({ provider: job.provider, model, amountMicros: estimate, jobId, workerToken }))) {
    await completeJob(tenantSlug, jobId, workerToken, "failed", {}, "budget_exceeded");
    return NextResponse.json({ ok: true, status: "failed" });
  }

  const result = await runClientTextAdapter({ provider: job.provider, model, prompt: job.input_metadata.prompt, history: job.input_metadata.history, reserveBudget: false, jobId });
  if (result.ok) {
    await completeJob(tenantSlug, jobId, workerToken, "succeeded", { provider: result.provider, model: result.model, output: result.output });
    return NextResponse.json({ ok: true, status: "succeeded" });
  }
  if (result.status >= 500 && await retryJob(tenantSlug, jobId, workerToken, result.error)) return NextResponse.json({ ok: false, error: "provider_retryable" }, { status: 500 });
  await completeJob(tenantSlug, jobId, workerToken, "failed", {}, result.error);
  return NextResponse.json({ ok: true, status: "failed" });
}

async function completeJob(tenantSlug: string, jobId: string, workerToken: string, status: string, outputMetadata: Record<string, unknown>, errorCode?: string) {
  await workerRpc("complete_client_runtime_job", { p_tenant_slug: tenantSlug, p_job_id: jobId, p_worker_token: workerToken, p_status: status, p_output_metadata: outputMetadata, p_error_code: errorCode ?? null });
}

async function retryJob(tenantSlug: string, jobId: string, workerToken: string, errorCode: string) {
  const result = await workerRpc("retry_client_runtime_job", { p_tenant_slug: tenantSlug, p_job_id: jobId, p_worker_token: workerToken, p_error_code: errorCode });
  return result.ok && result.value === true;
}

async function validTaskIdentity(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const expectedEmail = process.env.CLIENT_TASK_INVOKER_SERVICE_ACCOUNT?.trim();
  const expectedAudience = process.env.CLIENT_RUNTIME_BASE_URL?.trim().replace(/\/$/, "");
  if (!token || !expectedEmail || !expectedAudience) return false;
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`, { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return false;
  const info = await response.json().catch(() => null) as { email?: unknown; aud?: unknown; email_verified?: unknown } | null;
  return info?.email === expectedEmail && info?.aud === expectedAudience && info?.email_verified !== false;
}
