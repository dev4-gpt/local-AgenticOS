import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import {
  cancelClientRuntimeJob, checkClientRuntimeRateLimit, deleteClientRecord, enqueueClientRuntimeJob,
  insertClientRecord, recordClientAudit, refundClientRuntimeRateLimit, selectClientRecords, updateClientRecord,
} from "@/lib/clientDataPlane";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { clientProviderRequestAllowed } from "@/lib/clientProviderAdapter";
import { clientCapabilityEnabled, clientProviderCallsEnabled } from "@/lib/clientRuntimePolicy";
import { clientWorkspaceJobConfigured } from "@/lib/clientCloudRunJobs";
import { enqueueClientRuntimeTask } from "@/lib/cloudTasks";
import {
  LOOP_DEFAULT_ROUNDS, LOOP_MAX_ROUNDS, loopSchemaMissing, normalizeLoopRound, normalizeLoopRun,
} from "@/lib/clientLoopAdapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUNS = "client_loop_runs";
const ROUNDS = "client_loop_rounds";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function session() {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return null;
  if (!clientCapabilityEnabled("orchestration") || !clientCapabilityEnabled("text-agents")) return null;
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  return tenantSlug ? { userId: user.id, tenantSlug } : null;
}

function fail(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code }, {
    status,
    headers: { "cache-control": "private, no-store", ...(code === "runtime_rate_limited" ? { "Retry-After": "900" } : {}) },
  });
}

function done(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ok: true, ...payload }, { status, headers: { "cache-control": "private, no-store" } });
}

export async function GET(request: Request) {
  const user = await session();
  if (!user) return fail("not_authenticated", 401);
  const limit = await checkClientRuntimeRateLimit("loop-read", 240, 900);
  if (!limit.ok) return fail("runtime_limit_unavailable", 503);
  if (!limit.allowed) return fail("runtime_rate_limited", 429);
  const runId = new URL(request.url).searchParams.get("runId")?.trim() ?? "";

  if (runId) {
    if (!UUID_RE.test(runId)) return fail("loop_input_invalid", 400);
    const rounds = await selectClientRecords(ROUNDS, {
      tenant_slug: `eq.${user.tenantSlug}`, run_id: `eq.${runId}`, order: "round.asc", limit: "10",
    });
    if (!rounds.ok) return fail("loop_read_failed", 502);
    return done({ configured: true, rounds: rounds.records.map(normalizeLoopRound) });
  }

  const runs = await selectClientRecords(RUNS, {
    tenant_slug: `eq.${user.tenantSlug}`, order: "created_at.desc", limit: "50",
  });
  if (!runs.ok) {
    return loopSchemaMissing(runs.status)
      ? done({ configured: false, reason: "loop_schema_missing", runs: [] })
      : fail("loop_read_failed", 502);
  }
  return done({ configured: true, runs: runs.records.map(normalizeLoopRun) });
}

/** Starts a bounded builder/judge loop. */
export async function POST(request: Request) {
  const user = await session();
  if (!user) return fail("not_authenticated", 401);
  if (!clientProviderCallsEnabled()) return fail("provider_calls_require_approval", 403);
  const limit = await checkClientRuntimeRateLimit("loop-write", 20, 900);
  if (!limit.ok) return fail("runtime_limit_unavailable", 503);
  if (!limit.allowed) return fail("runtime_rate_limited", 429);

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const goal = typeof body.goal === "string" ? body.goal.trim().slice(0, 10_000) : "";
  if (!goal) return fail("loop_input_invalid", 400);
  if (containsClientSecretLike(goal)) return fail("secret_like_input_rejected", 400);
  const title = typeof body.title === "string" && body.title.trim()
    ? body.title.trim().slice(0, 240)
    : goal.split("\n")[0].slice(0, 80);
  const maxRounds = Math.min(LOOP_MAX_ROUNDS, Math.max(1, Math.round(Number(body.maxRounds) || LOOP_DEFAULT_ROUNDS)));

  // Builder and judge each clear the allowlist before anything is queued. They
  // may be the same model; the point is that both are approved.
  const builderProvider = process.env.CLIENT_WORKSPACE_PROVIDER?.trim().toLowerCase() || "openrouter";
  const builder = clientProviderRequestAllowed(builderProvider, process.env.CLIENT_WORKSPACE_MODEL?.trim() || null);
  if (!builder.ok) return fail(builder.error, builder.status);
  const judgeProvider = process.env.CLIENT_LOOP_JUDGE_PROVIDER?.trim().toLowerCase() || builderProvider;
  const judge = clientProviderRequestAllowed(judgeProvider, process.env.CLIENT_LOOP_JUDGE_MODEL?.trim() || null);
  if (!judge.ok) return fail(judge.error, judge.status);

  const runId = randomUUID();
  const stored = await insertClientRecord(RUNS, {
    id: runId,
    tenant_slug: user.tenantSlug,
    created_by: user.userId,
    goal,
    title,
    max_rounds: maxRounds,
    builder_provider: builder.provider,
    builder_model: builder.model,
    judge_provider: judge.provider,
    judge_model: judge.model,
  });
  if (!stored.ok) return fail(stored.status === 404 ? "loop_schema_missing" : "loop_write_failed", stored.status === 404 ? 503 : 502);

  const jobId = await enqueueClientRuntimeJob({
    capability: "loop-run",
    provider: builder.provider,
    model: builder.model,
    idempotencyKey: `loop-run-${runId}`,
    inputMetadata: {
      loopRunId: runId,
      goal,
      maxRounds,
      builder: { provider: builder.provider, model: builder.model },
      judge: { provider: judge.provider, model: judge.model },
    },
  });
  if (!jobId) {
    await updateClientRecord(RUNS, { id: `eq.${runId}`, tenant_slug: `eq.${user.tenantSlug}` }, { status: "failed", error_code: "loop_job_store_failed" });
    return fail("loop_job_store_failed", 502);
  }
  await updateClientRecord(RUNS, { id: `eq.${runId}`, tenant_slug: `eq.${user.tenantSlug}` }, { job_id: jobId });

  const task = await enqueueClientRuntimeTask({ jobId, tenantSlug: user.tenantSlug, path: clientWorkspaceJobConfigured() ? "dispatch" : "jobs" });
  if (!task.ok) {
    const taskError = task.error ?? "task_enqueue_failed";
    await cancelClientRuntimeJob(jobId, taskError);
    await refundClientRuntimeRateLimit("loop-write", 900);
    await updateClientRecord(RUNS, { id: `eq.${runId}`, tenant_slug: `eq.${user.tenantSlug}` }, { status: "failed", error_code: taskError.slice(0, 120) });
    return fail(taskError, task.status >= 500 ? 503 : task.status);
  }
  await recordClientAudit("loop.run_dispatched", { maxRounds, provider: builder.provider });
  return done({ runId, jobId, status: "queued" }, 202);
}

export async function DELETE(request: Request) {
  const user = await session();
  if (!user) return fail("not_authenticated", 401);
  const limit = await checkClientRuntimeRateLimit("loop-write", 20, 900);
  if (!limit.ok) return fail("runtime_limit_unavailable", 503);
  if (!limit.allowed) return fail("runtime_rate_limited", 429);
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!UUID_RE.test(id)) return fail("loop_input_invalid", 400);
  const removed = await deleteClientRecord(RUNS, { id: `eq.${id}`, tenant_slug: `eq.${user.tenantSlug}` });
  if (!removed.ok) return fail("loop_delete_failed", 502);
  await recordClientAudit("loop.run_deleted", {});
  return done({});
}
