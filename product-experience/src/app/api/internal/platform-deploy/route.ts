import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseServiceInsert, supabaseServiceSelect, supabaseServiceUpdate } from "@/lib/publicLaunch";

export const runtime = "nodejs";

// Durable, resumable tracking for CI-driven staging/production deploys.
// Environment identity is derived from WHICH operator secret authenticated
// the request, never from a client-supplied field — a compromised staging
// secret must not be able to write a production run's status.
function authorizedEnvironment(request: Request): "production" | "staging" | null {
  const provided = request.headers.get("x-control-plane-secret")?.trim() || "";
  if (!provided) return null;
  const providedBuffer = Buffer.from(provided);
  const production = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim();
  if (production) {
    try { if (timingSafeEqual(Buffer.from(production), providedBuffer)) return "production"; } catch {}
  }
  const staging = process.env.CONTROL_PLANE_OPERATOR_SECRET_STAGING?.trim();
  if (staging) {
    try { if (timingSafeEqual(Buffer.from(staging), providedBuffer)) return "staging"; } catch {}
  }
  return null;
}

const workflows = ["control-plane-image-deploy", "product-experience-deploy"];
const triggers = ["ci-auto", "ci-manual-promotion"];
const terminalStatuses = ["succeeded", "failed", "rolled_back"];

export async function POST(request: Request) {
  const environment = authorizedEnvironment(request);
  if (!environment) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (body.action === "start") return start(environment, body);
  if (body.action === "step") return step(environment, body);
  if (body.action === "record-result") return recordResult(environment, body);
  if (body.action === "status") return status(body);
  return NextResponse.json({ ok: false, error: "unsupported_platform_deploy_action" }, { status: 400 });
}

async function start(environment: string, body: Record<string, unknown>) {
  const workflow = typeof body.workflow === "string" ? body.workflow : "";
  if (!workflows.includes(workflow)) return NextResponse.json({ ok: false, error: "invalid_workflow" }, { status: 400 });
  const gitCommit = typeof body.gitCommit === "string" ? body.gitCommit : "";
  if (!/^[0-9a-f]{40}$/i.test(gitCommit)) return NextResponse.json({ ok: false, error: "invalid_git_commit" }, { status: 400 });
  const triggeredBy = typeof body.triggeredBy === "string" ? body.triggeredBy : "";
  if (!triggers.includes(triggeredBy)) return NextResponse.json({ ok: false, error: "invalid_triggered_by" }, { status: 400 });
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (!idempotencyKey) return NextResponse.json({ ok: false, error: "missing_idempotency_key" }, { status: 400 });
  const promotedFromRunId = typeof body.promotedFromRunId === "string" ? body.promotedFromRunId : null;

  const existing = await supabaseServiceSelect("platform_deploy_runs", {
    environment: `eq.${environment}`, workflow: `eq.${workflow}`, idempotency_key: `eq.${idempotencyKey}`,
  });
  if (!existing.ok) return NextResponse.json({ ok: false, error: "platform_deploy_lookup_failed" }, { status: 502 });
  if (existing.rows.length) {
    const row = existing.rows[0];
    return NextResponse.json({ ok: true, existing: true, runId: row.id, status: row.status });
  }

  const inserted = await supabaseServiceInsert("platform_deploy_runs", {
    environment, workflow, git_commit: gitCommit, triggered_by: triggeredBy,
    idempotency_key: idempotencyKey, status: "running", started_at: new Date().toISOString(),
    promoted_from_run_id: promotedFromRunId,
  });
  const runId = typeof inserted.rows[0]?.id === "string" ? inserted.rows[0].id : "";
  if (!inserted.ok || !runId) return NextResponse.json({ ok: false, error: "platform_deploy_start_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, existing: false, runId, status: "running" });
}

async function step(environment: string, body: Record<string, unknown>) {
  const runId = typeof body.runId === "string" ? body.runId : "";
  const currentStep = typeof body.currentStep === "string" ? body.currentStep : "";
  if (!runId || !currentStep) return NextResponse.json({ ok: false, error: "missing_step_fields" }, { status: 400 });
  const existing = await supabaseServiceSelect("platform_deploy_runs", { id: `eq.${runId}`, environment: `eq.${environment}` });
  if (!existing.ok || !existing.rows.length) return NextResponse.json({ ok: false, error: "platform_deploy_run_not_found" }, { status: 404 });
  const run = existing.rows[0];
  const completedSteps = Array.isArray(run.completed_steps) ? run.completed_steps : [];
  const priorStep = typeof run.current_step === "string" ? run.current_step : null;
  const nextCompleted = priorStep && !completedSteps.includes(priorStep) ? [...completedSteps, priorStep] : completedSteps;
  const updated = await supabaseServiceUpdate("platform_deploy_runs", { id: `eq.${runId}` }, {
    current_step: currentStep,
    completed_steps: nextCompleted,
    attempt_count: Number(run.attempt_count || 0) + 1,
  });
  if (!updated.ok) return NextResponse.json({ ok: false, error: "platform_deploy_step_record_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, runId, currentStep });
}

async function recordResult(environment: string, body: Record<string, unknown>) {
  const runId = typeof body.runId === "string" ? body.runId : "";
  const resultStatus = typeof body.status === "string" ? body.status : "";
  if (!runId || !terminalStatuses.includes(resultStatus)) return NextResponse.json({ ok: false, error: "invalid_result_fields" }, { status: 400 });
  const existing = await supabaseServiceSelect("platform_deploy_runs", { id: `eq.${runId}`, environment: `eq.${environment}` });
  if (!existing.ok || !existing.rows.length) return NextResponse.json({ ok: false, error: "platform_deploy_run_not_found" }, { status: 404 });
  const run = existing.rows[0];
  const priorEvidence = run.evidence_bundle && typeof run.evidence_bundle === "object" && !Array.isArray(run.evidence_bundle) ? run.evidence_bundle as Record<string, unknown> : {};
  const evidence = body.evidence && typeof body.evidence === "object" && !Array.isArray(body.evidence) ? body.evidence as Record<string, unknown> : {};
  const updated = await supabaseServiceUpdate("platform_deploy_runs", { id: `eq.${runId}` }, {
    status: resultStatus,
    finished_at: new Date().toISOString(),
    evidence_bundle: { ...priorEvidence, ...evidence },
    image_digest: typeof body.imageDigest === "string" ? body.imageDigest : run.image_digest ?? null,
    cloud_run_revision: typeof body.cloudRunRevision === "string" ? body.cloudRunRevision : run.cloud_run_revision ?? null,
    vercel_deployment_id: typeof body.vercelDeploymentId === "string" ? body.vercelDeploymentId : run.vercel_deployment_id ?? null,
    rollback_target: typeof body.rollbackTarget === "string" ? body.rollbackTarget : run.rollback_target ?? null,
    error_code: typeof body.errorCode === "string" ? body.errorCode : null,
    error_message: typeof body.errorMessage === "string" ? body.errorMessage : null,
  });
  if (!updated.ok) return NextResponse.json({ ok: false, error: "platform_deploy_result_record_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, runId, status: resultStatus });
}

async function status(body: Record<string, unknown>) {
  const runId = typeof body.runId === "string" ? body.runId : "";
  if (!runId) return NextResponse.json({ ok: false, error: "missing_run_id" }, { status: 400 });
  // Deliberately not filtered by the caller's own environment: production
  // promotion authenticates as production but must be able to read the
  // staging run it is promoting. This table holds only deploy metadata
  // (commit SHAs, image digests, revisions) — nothing secret.
  const existing = await supabaseServiceSelect("platform_deploy_runs", { id: `eq.${runId}` });
  if (!existing.ok || !existing.rows.length) return NextResponse.json({ ok: false, error: "platform_deploy_run_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, run: existing.rows[0] });
}
