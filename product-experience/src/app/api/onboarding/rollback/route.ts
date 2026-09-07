import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseServiceInsert, supabaseServiceSelect, supabaseServiceUpdate } from "@/lib/publicLaunch";

export const runtime = "nodejs";

// Reverts a tenant's live Cloud Run traffic to a previously-good revision.
// This is a distinct concept from client_provisioning_runs' existing
// "rolled_back" status/"rollback" current_step (a worker's own auto-undo of
// a FAILED prepare/deploy attempt) -- this route only ever acts on an
// already-succeeded tenant, so it uses its own current_step
// ("traffic_rollback") and keeps status within the table's existing
// queued/succeeded/failed values to avoid colliding with that meaning.
// client_tenants.status is never written here -- its check constraint
// ('active','suspended','offboarding','deleted') has no rollback_required
// value; only the onboarding-funnel row tracks that.
const accountStatuses = new Set([
  "requested", "email_verified", "payment_pending", "payment_succeeded",
  "manifest_review", "provisioning", "smoke_testing", "active",
  "provision_failed", "rollback_required", "suspended", "offboarding", "offboarded",
]);
const rollbackEligibleStatuses = new Set(["smoke_testing", "active", "rollback_required"]);

function authorized(request: Request) {
  const expected = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim();
  const provided = request.headers.get("x-control-plane-secret")?.trim() || "";
  if (!expected || !provided) return false;
  try { return timingSafeEqual(Buffer.from(expected), Buffer.from(provided)); } catch { return false; }
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (body.action === "start") return start(body);
  if (body.action === "record-result") return recordResult(body);
  return NextResponse.json({ ok: false, error: "unsupported_rollback_action" }, { status: 400 });
}

async function start(body: Record<string, unknown>) {
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  if (!requestId) return NextResponse.json({ ok: false, error: "missing_request_id" }, { status: 400 });
  const targetRevision = typeof body.targetRevision === "string" ? body.targetRevision.trim() : "";
  if (!targetRevision) return NextResponse.json({ ok: false, error: "missing_target_revision" }, { status: 400 });
  const previousRevision = typeof body.previousRevision === "string" ? body.previousRevision.trim() : null;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null;

  const onboarding = await supabaseServiceSelect("client_onboarding_accounts", { request_id: `eq.${requestId}` });
  const account = onboarding.rows[0];
  if (!onboarding.ok || typeof account?.id !== "string") return NextResponse.json({ ok: false, error: "onboarding_not_found" }, { status: 404 });
  if (!rollbackEligibleStatuses.has(String(account.status))) return NextResponse.json({ ok: false, error: "invalid_state" }, { status: 409 });

  const idempotencyKey = `rollback:${requestId}:${targetRevision}`;
  const existing = await supabaseServiceSelect("client_provisioning_runs", {
    onboarding_id: `eq.${account.id}`, idempotency_key: `eq.${idempotencyKey}`, limit: "1",
  });
  if (existing.ok && typeof existing.rows[0]?.id === "string") {
    const prior = existing.rows[0];
    return NextResponse.json({ ok: true, runId: prior.id, status: prior.status || "queued", priorStatus: account.status, idempotent: true });
  }

  const priorStatus = String(account.status);
  const run = await supabaseServiceInsert("client_provisioning_runs", {
    onboarding_id: account.id,
    request_id: requestId,
    idempotency_key: idempotencyKey,
    status: "queued",
    current_step: "traffic_rollback",
    rollback_target: targetRevision,
    resource_manifest: { targetRevision, previousRevision, priorAccountStatus: priorStatus, reason },
    evidence_bundle: {},
  });
  const runId = typeof run.rows[0]?.id === "string" ? run.rows[0].id : "";
  if (!run.ok || !runId) return NextResponse.json({ ok: false, error: "rollback_run_create_failed" }, { status: 502 });

  if (priorStatus !== "rollback_required") {
    const patched = await supabaseServiceUpdate("client_onboarding_accounts", { id: `eq.${account.id}` }, {
      status: "rollback_required", updated_at: new Date().toISOString(),
    });
    if (!patched.ok) return NextResponse.json({ ok: false, error: "account_status_update_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, runId, status: "queued", priorStatus, idempotent: false });
}

async function recordResult(body: Record<string, unknown>) {
  const runId = typeof body.runId === "string" ? body.runId.trim() : "";
  const resultStatus = typeof body.status === "string" ? body.status : "";
  if (!runId || !["succeeded", "failed"].includes(resultStatus)) return NextResponse.json({ ok: false, error: "invalid_result_fields" }, { status: 400 });

  const existing = await supabaseServiceSelect("client_provisioning_runs", { id: `eq.${runId}` });
  const run = existing.rows[0];
  if (!existing.ok || typeof run?.id !== "string") return NextResponse.json({ ok: false, error: "rollback_run_not_found" }, { status: 404 });

  const priorEvidence = run.evidence_bundle && typeof run.evidence_bundle === "object" && !Array.isArray(run.evidence_bundle) ? run.evidence_bundle as Record<string, unknown> : {};
  const evidence = body.evidence && typeof body.evidence === "object" && !Array.isArray(body.evidence) ? body.evidence as Record<string, unknown> : {};
  const updated = await supabaseServiceUpdate("client_provisioning_runs", { id: `eq.${runId}` }, {
    status: resultStatus,
    finished_at: new Date().toISOString(),
    evidence_bundle: { ...priorEvidence, ...evidence },
    cloud_run_revision: typeof body.currentTrafficRevision === "string" ? body.currentTrafficRevision : run.cloud_run_revision ?? null,
    error_code: typeof body.errorCode === "string" ? body.errorCode : null,
    error_message: typeof body.errorMessage === "string" ? body.errorMessage : null,
  });
  if (!updated.ok) return NextResponse.json({ ok: false, error: "rollback_result_record_failed" }, { status: 502 });

  let accountStatus: string | null = null;
  if (resultStatus === "succeeded") {
    const manifest = run.resource_manifest && typeof run.resource_manifest === "object" && !Array.isArray(run.resource_manifest) ? run.resource_manifest as Record<string, unknown> : {};
    const priorAccountStatus = typeof manifest.priorAccountStatus === "string" && accountStatuses.has(manifest.priorAccountStatus) ? manifest.priorAccountStatus : "active";
    const restored = await supabaseServiceUpdate("client_onboarding_accounts", { id: `eq.${run.onboarding_id}` }, {
      status: priorAccountStatus, updated_at: new Date().toISOString(),
    });
    if (!restored.ok) return NextResponse.json({ ok: false, error: "account_status_restore_failed" }, { status: 502 });
    accountStatus = priorAccountStatus;
  }

  return NextResponse.json({ ok: true, runId, status: resultStatus, accountStatus });
}
