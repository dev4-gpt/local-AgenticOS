import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientUser } from "@/lib/clientAuth";
import { cancelClientRuntimeJob, consumeClientRuntimeRateLimit, enqueueClientRuntimeJob } from "@/lib/clientDataPlane";
import { clientProviderRequestAllowed } from "@/lib/clientProviderAdapter";
import { enqueueClientRuntimeTask } from "@/lib/cloudTasks";
import { clientCapabilityEnabled, clientProviderCallsEnabled } from "@/lib/clientRuntimePolicy";
import { containsClientSecretLike } from "@/lib/clientInputSafety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await currentClientUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!clientCapabilityEnabled("text-agents")) return NextResponse.json({ ok: false, error: "capability_not_enabled" }, { status: 403 });
  if (!clientProviderCallsEnabled()) return NextResponse.json({ ok: false, error: "provider_calls_require_approval" }, { status: 403 });
  if (!(await consumeClientRuntimeRateLimit("jobs", 20, 900))) return NextResponse.json({ ok: false, error: "runtime_rate_limited" }, { status: 429 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const provider = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : "";
  const model = typeof body.model === "string" ? body.model.trim() : null;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 20000) : "";
  const idempotencyKey = typeof body.idempotencyKey === "string" && body.idempotencyKey.trim().length >= 8
    ? body.idempotencyKey.trim().slice(0, 180)
    : randomUUID();
  const history = Array.isArray(body.history) ? body.history.filter((item): item is Record<string, string> => Boolean(item && typeof item === "object" && ["system", "user", "assistant"].includes(String((item as Record<string, unknown>).role)) && typeof (item as Record<string, unknown>).content === "string")).slice(-16) : [];
  if (!provider || !prompt) return NextResponse.json({ ok: false, error: "job_input_invalid" }, { status: 400 });
  const providerPolicy = clientProviderRequestAllowed(provider, model);
  if (!providerPolicy.ok) return NextResponse.json({ ok: false, error: providerPolicy.error }, { status: providerPolicy.status });
  if (containsClientSecretLike(prompt, history)) return NextResponse.json({ ok: false, error: "secret_like_input_rejected" }, { status: 400 });

  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!tenantSlug) return NextResponse.json({ ok: false, error: "tenant_not_configured" }, { status: 503 });
  const jobId = await enqueueClientRuntimeJob({ capability: "text-agents", provider: providerPolicy.provider, model: providerPolicy.model, idempotencyKey, inputMetadata: { prompt, history } });
  if (!jobId) return NextResponse.json({ ok: false, error: "job_store_failed" }, { status: 503 });
  const task = await enqueueClientRuntimeTask({ jobId, tenantSlug });
  if (!task.ok) {
    const error = task.error ?? "task_enqueue_failed";
    await cancelClientRuntimeJob(jobId, error);
    return NextResponse.json({ ok: false, error }, { status: task.status >= 500 ? 503 : task.status });
  }
  return NextResponse.json({ ok: true, jobId, status: "queued" }, { status: 202, headers: { "cache-control": "no-store" } });
}
