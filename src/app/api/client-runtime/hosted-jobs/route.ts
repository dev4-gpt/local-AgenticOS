import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember } from "@/lib/clientAuth";
import { cancelClientRuntimeJob, consumeClientRuntimeRateLimit, enqueueClientRuntimeJob } from "@/lib/clientDataPlane";
import { enqueueClientRuntimeTask } from "@/lib/cloudTasks";
import { clientCapabilityEnabled, clientProviderCallsEnabled } from "@/lib/clientRuntimePolicy";
import { containsClientSecretLike } from "@/lib/clientInputSafety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPECS: Record<string, { capability: string; providers: string[]; maxInput: number }> = {
  orchestration: { capability: "orchestration", providers: [], maxInput: 16_000 },
  media: { capability: "media", providers: ["elevenlabs", "heygen", "suno"], maxInput: 10_000 },
  seo: { capability: "seo-research", providers: ["firecrawl"], maxInput: 2_500 },
};

export async function POST(request: Request) {
  if (!(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!(await consumeClientRuntimeRateLimit("hosted-jobs", 20, 900))) return NextResponse.json({ ok: false, error: "runtime_rate_limited" }, { status: 429 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const requested = typeof body.capability === "string" ? body.capability.trim().toLowerCase() : "";
  const spec = SPECS[requested];
  if (!spec || !clientCapabilityEnabled(spec.capability)) return NextResponse.json({ ok: false, error: "capability_not_enabled" }, { status: 403 });
  const provider = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : null;
  if (spec.providers.length > 0) {
    if (!clientProviderCallsEnabled() || !provider || !spec.providers.includes(provider)) return NextResponse.json({ ok: false, error: "provider_calls_require_approval" }, { status: 403 });
  } else if (provider) {
    return NextResponse.json({ ok: false, error: "provider_not_allowed" }, { status: 400 });
  }

  const input = body.input && typeof body.input === "object" && !Array.isArray(body.input) ? body.input : {};
  const inputMetadata = JSON.stringify(input);
  if (inputMetadata.length < 3 || inputMetadata.length > spec.maxInput) return NextResponse.json({ ok: false, error: "job_input_invalid" }, { status: 400 });
  if (containsClientSecretLike(inputMetadata)) return NextResponse.json({ ok: false, error: "secret_like_input_rejected" }, { status: 400 });
  const idempotencyKey = typeof body.idempotencyKey === "string" && body.idempotencyKey.trim().length >= 8 ? body.idempotencyKey.trim().slice(0, 180) : randomUUID();
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!tenantSlug) return NextResponse.json({ ok: false, error: "tenant_not_configured" }, { status: 503 });

  const jobId = await enqueueClientRuntimeJob({ capability: spec.capability, provider, model: null, idempotencyKey, inputMetadata: input as Record<string, unknown> });
  if (!jobId) return NextResponse.json({ ok: false, error: "job_store_failed" }, { status: 503 });
  const task = await enqueueClientRuntimeTask({ jobId, tenantSlug });
  if (!task.ok) {
    const error = task.error ?? "task_enqueue_failed";
    await cancelClientRuntimeJob(jobId, error);
    return NextResponse.json({ ok: false, error }, { status: task.status >= 500 ? 503 : task.status });
  }
  return NextResponse.json({ ok: true, jobId, status: "queued", capability: spec.capability }, { status: 202, headers: { "cache-control": "no-store" } });
}
