import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseServiceSelect, supabaseServiceUpdate, supabaseServiceUpsert } from "@/lib/publicLaunch";

export const runtime = "nodejs";

function authorized(request: Request) {
  const expected = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim();
  const provided = request.headers.get("x-control-plane-secret")?.trim() || "";
  if (!expected || !provided) return false;
  try { return timingSafeEqual(Buffer.from(expected), Buffer.from(provided)); } catch { return false; }
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const runId = typeof body.runId === "string" ? body.runId.trim() : "";
  const status = body.status === "succeeded" ? "succeeded" : body.status === "rolled_back" ? "rolled_back" : "failed";
  if (!runId) return NextResponse.json({ ok: false, error: "missing_run_id" }, { status: 400 });
  const existing = await supabaseServiceSelect("client_provisioning_runs", { id: `eq.${runId}` });
  const runRecord = existing.rows[0];
  if (!existing.ok || typeof runRecord?.onboarding_id !== "string") return NextResponse.json({ ok: false, error: "run_not_found" }, { status: 404 });
  const resourceManifest = body.resourceManifest && typeof body.resourceManifest === "object" && !Array.isArray(body.resourceManifest) ? body.resourceManifest as Record<string, unknown> : {};
  const evidenceBundle = body.evidenceBundle && typeof body.evidenceBundle === "object" && !Array.isArray(body.evidenceBundle) ? body.evidenceBundle as Record<string, unknown> : {};
  const phase = resourceManifest.phase === "deploy" ? "deploy" : resourceManifest.phase === "prepare" ? "prepare" : null;
  const runtimeUrl = typeof resourceManifest.runtimeUrl === "string" ? resourceManifest.runtimeUrl.trim().replace(/\/$/, "") : "";
  const clientSlug = typeof resourceManifest.clientSlug === "string" ? resourceManifest.clientSlug.trim() : "";
  const clientName = typeof resourceManifest.clientName === "string" ? resourceManifest.clientName.trim().slice(0, 240) : "";
  const retentionDays = Number(resourceManifest.retentionDays);
  const smoke = evidenceBundle.smoke && typeof evidenceBundle.smoke === "object" && !Array.isArray(evidenceBundle.smoke) ? evidenceBundle.smoke as Record<string, unknown> : null;
  const deploySucceeded = status === "succeeded" && phase === "deploy" && /^https:\/\/[^\s/]+\.run\.app$/i.test(runtimeUrl) && smoke?.ok === true && smoke.url === runtimeUrl;
  const run = await supabaseServiceUpdate("client_provisioning_runs", { id: `eq.${runId}` }, { status, current_step: deploySucceeded ? "smoke_testing" : status === "succeeded" ? "prepared" : "rollback", completed_steps: Array.isArray(body.completedSteps) ? body.completedSteps : [], resource_manifest: resourceManifest, evidence_bundle: evidenceBundle, image_digest: typeof body.imageDigest === "string" ? body.imageDigest : null, cloud_run_revision: typeof body.cloudRunRevision === "string" ? body.cloudRunRevision : null, error_code: typeof body.errorCode === "string" ? body.errorCode : null, error_message: typeof body.errorMessage === "string" ? body.errorMessage : null, finished_at: new Date().toISOString() });
  if (!run.ok) return NextResponse.json({ ok: false, error: "run_update_failed" }, { status: 502 });
  if (status === "succeeded" && phase === "prepare") {
    const accountUpdate = await supabaseServiceUpdate("client_onboarding_accounts", { id: `eq.${runRecord.onboarding_id}` }, { status: "provisioning", updated_at: new Date().toISOString() });
    if (!accountUpdate.ok) return NextResponse.json({ ok: false, error: "prepare_state_update_failed" }, { status: 502 });
    return NextResponse.json({ ok: true, runId, status, phase, activationReady: false });
  }
  if (!deploySucceeded) return NextResponse.json({ ok: true, runId, status, phase, activationReady: false });

  const accounts = await supabaseServiceSelect("client_onboarding_accounts", { id: `eq.${runRecord.onboarding_id}` });
  const account = accounts.rows[0];
  const approvedManifest = account?.approved_manifest && typeof account.approved_manifest === "object" && !Array.isArray(account.approved_manifest) ? account.approved_manifest as Record<string, unknown> : {};
  if (!accounts.ok || approvedManifest.clientSlug !== clientSlug || !/^[a-z][a-z0-9-]{2,40}$/.test(clientSlug) || !clientName || !Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
    await supabaseServiceUpdate("client_onboarding_accounts", { id: `eq.${runRecord.onboarding_id}` }, { status: "provision_failed", updated_at: new Date().toISOString() });
    return NextResponse.json({ ok: false, error: "provisioning_callback_manifest_mismatch" }, { status: 409 });
  }
  const tenant = await supabaseServiceUpsert("client_tenants", { slug: clientSlug, name: clientName, status: "active", retention_days: retentionDays, updated_at: new Date().toISOString() }, "slug");
  if (!tenant.ok) return NextResponse.json({ ok: false, error: "tenant_bind_failed" }, { status: 502 });
  // Wire the approved manifest's optional monthly spend cap/alert threshold
  // into the managed-credit wallet. Best-effort: this is an additive safety
  // feature, not a provisioning prerequisite -- a write failure here must
  // never block activation, it only means the tenant starts with no
  // enforced cap until an operator retries this write.
  const manifestBudget = approvedManifest.budget && typeof approvedManifest.budget === "object" && !Array.isArray(approvedManifest.budget)
    ? approvedManifest.budget as Record<string, unknown>
    : {};
  const monthlyCapDollars = Number(manifestBudget.monthlyCap);
  const warningThresholdDollars = Number(manifestBudget.warningThreshold);
  if (Number.isFinite(monthlyCapDollars) && monthlyCapDollars > 0) {
    const creditAccountFields: Record<string, unknown> = {
      tenant_slug: clientSlug,
      monthly_cap_micros: Math.round(monthlyCapDollars * 1_000_000),
      updated_at: new Date().toISOString(),
    };
    if (Number.isFinite(warningThresholdDollars) && warningThresholdDollars > 0) {
      creditAccountFields.warning_threshold_micros = Math.round(warningThresholdDollars * 1_000_000);
    }
    await supabaseServiceUpsert("client_credit_accounts", creditAccountFields, "tenant_slug").catch(() => undefined);
  }
  const accountUpdate = await supabaseServiceUpdate("client_onboarding_accounts", { id: `eq.${runRecord.onboarding_id}` }, { status: "smoke_testing", tenant_slug: clientSlug, runtime_url: runtimeUrl, updated_at: new Date().toISOString() });
  if (!accountUpdate.ok) return NextResponse.json({ ok: false, error: "onboarding_bind_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, runId, status, phase, activationReady: true });
}
