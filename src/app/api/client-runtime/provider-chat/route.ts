import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientUser } from "@/lib/clientAuth";
import { cancelClientRuntimeJob, checkClientRuntimeRateLimit, enqueueClientRuntimeJob, refundClientRuntimeRateLimit } from "@/lib/clientDataPlane";
import { enqueueClientRuntimeTask } from "@/lib/cloudTasks";
import { clientCapabilityEnabled, clientProviderCallsEnabled } from "@/lib/clientRuntimePolicy";
import { clientProviderRequestAllowed } from "@/lib/clientProviderAdapter";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { readBoundedJsonObject } from "@/lib/clientNetworkSafety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_PROMPT_CHARS = 20_000;
const MAX_HISTORY_ITEMS = 16;
const MAX_HISTORY_ITEM_CHARS = 12_000;

export async function POST(request: Request) {
  const user = await currentClientUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!clientCapabilityEnabled("text-agents")) return NextResponse.json({ ok: false, error: "capability_not_enabled" }, { status: 403 });
  if (!clientProviderCallsEnabled()) return NextResponse.json({ ok: false, error: "provider_calls_require_approval" }, { status: 403 });
  const rateLimit = await checkClientRuntimeRateLimit("jobs", 20, 900);
  if (!rateLimit.ok) return NextResponse.json({ ok: false, error: "runtime_limit_unavailable" }, { status: 503 });
  if (!rateLimit.allowed) return NextResponse.json({ ok: false, error: "runtime_rate_limited" }, { status: 429, headers: { "Retry-After": "900" } });

  const parsed = await readBoundedJsonObject(request, MAX_REQUEST_BYTES);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.reason === "too_large" ? "job_request_too_large" : "job_input_invalid" }, { status: parsed.reason === "too_large" ? 413 : 400 });
  const body = parsed.value;
  const provider = typeof body.provider === "string" ? body.provider : "";
  const model = typeof body.model === "string" ? body.model.trim() : null;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const idempotencyKey = typeof body.idempotencyKey === "string" && body.idempotencyKey.trim().length >= 8
    ? body.idempotencyKey.trim().slice(0, 180)
    : randomUUID();
  const historyInput = body.history === undefined ? [] : body.history;
  if (!Array.isArray(historyInput) || historyInput.length > MAX_HISTORY_ITEMS) return NextResponse.json({ ok: false, error: "job_input_invalid" }, { status: 400 });
  const history = historyInput.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const entry = item as Record<string, unknown>;
    if (!["system", "user", "assistant"].includes(String(entry.role)) || typeof entry.content !== "string" || entry.content.length > MAX_HISTORY_ITEM_CHARS) return null;
    return { role: entry.role, content: entry.content };
  });
  if (!provider || !prompt || prompt.length > MAX_PROMPT_CHARS || history.some((item) => item === null)) return NextResponse.json({ ok: false, error: "job_input_invalid" }, { status: 400 });
  const providerPolicy = clientProviderRequestAllowed(provider, model);
  if (!providerPolicy.ok) return NextResponse.json({ ok: false, error: providerPolicy.error }, { status: providerPolicy.status });
  if (containsClientSecretLike(prompt, history)) return NextResponse.json({ ok: false, error: "secret_like_input_rejected" }, { status: 400 });

  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!tenantSlug) return NextResponse.json({ ok: false, error: "tenant_not_configured" }, { status: 503 });
  const jobId = await enqueueClientRuntimeJob({
    capability: "text-agents",
    provider: providerPolicy.provider,
    model: providerPolicy.model,
    idempotencyKey,
    inputMetadata: { prompt, history },
  });
  if (!jobId) return NextResponse.json({ ok: false, error: "job_store_failed" }, { status: 503 });
  const task = await enqueueClientRuntimeTask({ jobId, tenantSlug });
  if (!task.ok) {
    const error = task.error ?? "task_enqueue_failed";
    await cancelClientRuntimeJob(jobId, error);
    await refundClientRuntimeRateLimit("jobs", 900);
    return NextResponse.json({ ok: false, error }, { status: task.status >= 500 ? 503 : task.status });
  }
  return NextResponse.json({ ok: true, jobId, status: "queued" }, { status: 202, headers: { "cache-control": "no-store" } });
}
