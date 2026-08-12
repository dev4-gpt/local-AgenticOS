import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, enqueueClientRuntimeJob, recordClientAudit } from "@/lib/clientDataPlane";
import { clientProviderRequestAllowed } from "@/lib/clientProviderAdapter";
import { clientReadyPlaybooks, type ClientIntentSurface } from "@/lib/clientPlaybooks";
import { resolveClientIntent } from "@/lib/clientIntentRouter";
import { clientCapabilityEnabled, clientConfiguredList, clientIntentRoutingEnabled, clientProviderCallsEnabled } from "@/lib/clientRuntimePolicy";
import { enqueueClientRuntimeTask } from "@/lib/cloudTasks";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { selectClientRecords, cancelClientRuntimeJob, refundClientRuntimeRateLimit } from "@/lib/clientDataPlane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SURFACES = new Set<ClientIntentSurface>(["chat", "notebook", "orchestrate", "create", "guide", "integrations"]);

export async function POST(request: Request) {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return fail("not_authenticated", 401);
  if (!clientIntentRoutingEnabled()) return fail("intent_routing_disabled", 404);
  if (!clientProviderCallsEnabled()) return fail("provider_calls_require_approval", 403);
  if (!clientCapabilityEnabled("text-agents")) return fail("capability_not_enabled", 403);
  const rate = await checkClientRuntimeRateLimit("intent", 20, 900);
  if (!rate.ok) return fail("runtime_limit_unavailable", 503);
  if (!rate.allowed) return fail("runtime_rate_limited", 429, { "Retry-After": "900" });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const value = typeof body.request === "string" ? body.request.trim().slice(0, 10_000) : "";
  const surface = typeof body.surface === "string" ? body.surface.trim().toLowerCase() as ClientIntentSurface : "chat";
  if (!value || value.length < 2 || !SURFACES.has(surface)) return fail("intent_input_invalid", 400);
  if (containsClientSecretLike(value)) return fail("secret_like_input_rejected", 400);

  const provider = process.env.CLIENT_WORKSPACE_PROVIDER?.trim().toLowerCase() || "openrouter";
  const providerPolicy = clientProviderRequestAllowed(provider, typeof body.model === "string" ? body.model : null);
  if (!providerPolicy.ok) return fail(providerPolicy.error, providerPolicy.status);
  const enabledCapabilities = clientConfiguredList("CLIENT_ENABLED_CAPABILITIES");
  const playbooks = clientReadyPlaybooks(enabledCapabilities, surface);
  const candidates = resolveClientIntent({ request: value, surface, enabledCapabilities, availablePlaybooks: playbooks });
  const idempotencyKey = typeof body.idempotencyKey === "string" && body.idempotencyKey.trim().length >= 8
    ? `intent-${body.idempotencyKey.trim().slice(0, 160)}` : `intent-${randomUUID()}`;
  const jobId = await enqueueClientRuntimeJob({
    capability: "intent-routing", provider: providerPolicy.provider, model: providerPolicy.model, idempotencyKey,
    inputMetadata: {
      request: value, surface, title: typeof body.title === "string" ? body.title.trim().slice(0, 240) : null,
      requiresClassifier: !candidates.deterministic && candidates.candidates.length > 0,
      candidateIds: candidates.candidates.map((candidate) => candidate.playbook.id),
    },
  });
  if (!jobId) return fail("job_store_failed", 503);
  const task = await enqueueClientRuntimeTask({ jobId, tenantSlug: process.env.CLIENT_SLUG?.trim() ?? "" });
  if (!task.ok) {
    await cancelClientRuntimeJob(jobId, task.error ?? "task_enqueue_failed");
    await refundClientRuntimeRateLimit("intent", 900);
    return fail(task.error ?? "task_enqueue_failed", task.status >= 500 ? 503 : task.status);
  }
  await recordClientAudit("intent.plan_queued", { surface, candidateCount: candidates.candidates.length, requestChars: value.length });
  return NextResponse.json({ ok: true, planId: jobId, status: "queued" }, { status: 202, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return fail("not_authenticated", 401);
  if (!clientIntentRoutingEnabled()) return fail("intent_routing_disabled", 404);
  const planId = new URL(request.url).searchParams.get("planId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(planId)) return fail("plan_id_invalid", 400);
  const result = await selectClientRecords("client_runtime_jobs", { id: `eq.${planId}`, tenant_slug: `eq.${process.env.CLIENT_SLUG ?? ""}`, capability: "eq.intent-routing", limit: "1" });
  if (!result.ok) return fail("plan_read_failed", 502);
  const job = result.records[0] as Record<string, unknown> | undefined;
  if (!job) return fail("plan_not_found", 404);
  const output = job.output_metadata && typeof job.output_metadata === "object" && !Array.isArray(job.output_metadata) ? job.output_metadata as Record<string, unknown> : {};
  return NextResponse.json({
    ok: true, plan: {
      planId, status: typeof output.status === "string" ? output.status : job.status,
      intent: output.intent ?? null, capabilityId: output.capabilityId ?? null, playbookId: output.playbookId ?? null,
      skillIds: output.skillIds ?? [], confidence: output.confidence ?? null, riskClass: output.riskClass ?? null,
      approval: output.approval ?? null, reason: output.reason ?? null, requiredTraits: output.requiredTraits ?? [],
      evidence: output.evidence ?? null, clarificationQuestion: output.clarificationQuestion ?? null, dispatchedJobId: output.dispatchedJobId ?? null,
      output: output.output ?? null, errorCode: job.error_code ?? null,
    },
  }, { headers: { "cache-control": "private, no-store" } });
}

function fail(error: string, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "cache-control": "no-store", ...headers } });
}
