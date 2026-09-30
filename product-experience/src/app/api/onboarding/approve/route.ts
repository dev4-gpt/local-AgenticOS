import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { applyCommercialScopeToManifest } from "@/lib/commercialScope";
import { cloudRunIdTokenFromVercel, controlPlaneOidcConfigured } from "@/lib/cloudRunOidc";
import { supabaseServiceInsert, supabaseServiceSelect, supabaseServiceUpdate } from "@/lib/publicLaunch";

export const runtime = "nodejs";

function authorized(request: Request) {
  const expected = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim();
  const provided = request.headers.get("x-control-plane-secret")?.trim() || "";
  if (!expected || !provided) return false;
  try { return timingSafeEqual(Buffer.from(expected), Buffer.from(provided)); } catch { return false; }
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { action?: unknown; requestId?: unknown; manifestVersion?: unknown; manifestHash?: unknown; manifest?: unknown };
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  if (!requestId) return NextResponse.json({ ok: false, error: "missing_request_id" }, { status: 400 });
  if (!body.manifest || typeof body.manifest !== "object" || Array.isArray(body.manifest)) return NextResponse.json({ ok: false, error: "approved_manifest_required" }, { status: 400 });
  const onboarding = await supabaseServiceSelect("client_onboarding_accounts", { request_id: `eq.${requestId}` });
  const account = onboarding.rows[0];
  if (!onboarding.ok || typeof account?.id !== "string") return NextResponse.json({ ok: false, error: "onboarding_not_found" }, { status: 404 });
  const normalApprovalState = ["manifest_review", "payment_succeeded"].includes(String(account.status));
  if (!normalApprovalState && account.status !== "provisioning") return NextResponse.json({ ok: false, error: "invalid_state" }, { status: 409 });
  if (account.commercial_scope_status !== "approved") return NextResponse.json({ ok: false, error: "commercial_scope_approval_required" }, { status: 409 });
  const scopeInputs = account.commercial_scope_inputs && typeof account.commercial_scope_inputs === "object" && !Array.isArray(account.commercial_scope_inputs)
    ? account.commercial_scope_inputs as Record<string, unknown>
    : null;
  const approvedManifest = scopeInputs ? applyCommercialScopeToManifest(body.manifest as Record<string, unknown>, scopeInputs) : body.manifest;
  const manifestHash = createHash("sha256").update(JSON.stringify(approvedManifest)).digest("hex");
  if (body.action === "preview") return NextResponse.json({ ok: true, manifest: approvedManifest, manifestHash }, { headers: { "cache-control": "private, no-store" } });
  if (body.action !== "approve" || typeof body.manifestHash !== "string" || !/^[a-f0-9]{64}$/.test(body.manifestHash)) return NextResponse.json({ ok: false, error: "manifest_review_required" }, { status: 400 });
  if (body.manifestHash !== manifestHash) return NextResponse.json({ ok: false, error: "manifest_hash_mismatch" }, { status: 409 });
  const provisionerUrl = process.env.CONTROL_PLANE_PROVISIONER_URL?.trim() || "";
  const workerToken = process.env.CONTROL_PLANE_WORKER_TOKEN?.trim() || "";
  if (!provisionerUrl || !workerToken || !controlPlaneOidcConfigured()) {
    return NextResponse.json({ ok: false, error: "control_plane_not_configured" }, { status: 503 });
  }
  const identity = await cloudRunIdTokenFromVercel(request, provisionerUrl);
  if (!identity.ok) return NextResponse.json({ ok: false, error: identity.error }, { status: 503 });
  const manifestVersion = typeof body.manifestVersion === "string" && body.manifestVersion.trim() ? body.manifestVersion.trim() : "commercial-scope-v1";
  // A corrected manifest must be able to retry a failed prepare without
  // replaying an unchanged approval. The old request-only key permanently
  // collided after any failed attempt.
  const approvalKey = `approve:${requestId}:${manifestHash}`;
  const priorRun = await supabaseServiceSelect("client_provisioning_runs", {
    idempotency_key: `eq.${approvalKey}`,
    limit: "1",
  });
  if (!priorRun.ok) return NextResponse.json({ ok: false, error: "approval_lookup_failed" }, { status: 502 });
  if (priorRun.ok && typeof priorRun.rows[0]?.id === "string") {
    const prior = priorRun.rows[0];
    const evidence = prior.evidence_bundle && typeof prior.evidence_bundle === "object" && !Array.isArray(prior.evidence_bundle) ? prior.evidence_bundle as Record<string, unknown> : {};
    const accountManifest = account.approved_manifest && typeof account.approved_manifest === "object" && !Array.isArray(account.approved_manifest) ? account.approved_manifest : null;
    const accountManifestHash = accountManifest ? createHash("sha256").update(JSON.stringify(accountManifest)).digest("hex") : null;
    if (evidence.approved_manifest_sha256 !== manifestHash || !["queued", "running", "succeeded"].includes(String(prior.status)) || (account.status === "provisioning" && ((account.manifest_hash && account.manifest_hash !== manifestHash) || (accountManifestHash && accountManifestHash !== manifestHash)))) {
      return NextResponse.json({ ok: false, error: "approval_evidence_mismatch" }, { status: 409 });
    }
    // Reconcile the durable approval record before reporting an idempotent
    // prepare result. A prior version dispatched the manifest but ignored a
    // failed persistence update, which left deploy unable to reconstruct the
    // reviewed manifest after prepare completed.
    const persisted = await supabaseServiceUpdate("client_onboarding_accounts", { id: `eq.${account.id}`, status: "in.(manifest_review,payment_succeeded,provisioning)" }, {
      status: "provisioning",
      manifest_version: manifestVersion,
      manifest_hash: manifestHash,
      approved_manifest: approvedManifest,
      updated_at: new Date().toISOString(),
    });
    if (!persisted.ok || persisted.rows.length !== 1) return NextResponse.json({ ok: false, error: "approved_manifest_persist_failed" }, { status: 502 });
    return NextResponse.json({
      ok: true,
      runId: prior.id,
      status: prior.status || "queued",
      dispatched: prior.status === "queued" || prior.status === "running",
      idempotent: true,
    });
  }

  if (!normalApprovalState) return NextResponse.json({ ok: false, error: "invalid_state" }, { status: 409 });

  const run = await supabaseServiceInsert("client_provisioning_runs", { onboarding_id: account.id, request_id: requestId, idempotency_key: approvalKey, status: "queued", current_step: "provisioning", resource_manifest: {}, evidence_bundle: { approved_manifest_sha256: manifestHash, manifest_version: manifestVersion } });
  if (!run.ok || !run.rows[0]?.id) return NextResponse.json({ ok: false, runId: null, status: "provisioning", dispatched: false, error: "provisioning_run_create_failed" }, { status: 502 });
  const persisted = await supabaseServiceUpdate("client_onboarding_accounts", { id: `eq.${account.id}`, status: "in.(manifest_review,payment_succeeded)" }, { status: "provisioning", manifest_version: manifestVersion, manifest_hash: manifestHash, approved_manifest: approvedManifest, updated_at: new Date().toISOString() });
  if (!persisted.ok || persisted.rows.length !== 1) {
    await supabaseServiceUpdate("client_provisioning_runs", { id: `eq.${run.rows[0].id}` }, { status: "failed", current_step: "rollback", error_code: "approved_manifest_persist_failed", error_message: "The approved manifest could not be persisted before dispatch.", finished_at: new Date().toISOString() });
    return NextResponse.json({ ok: false, runId: run.rows[0].id, status: "failed", dispatched: false, error: "approved_manifest_persist_failed" }, { status: 502 });
  }
  let dispatched = false;
  const response = await fetch(provisionerUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${workerToken}`, "X-Serverless-Authorization": `Bearer ${identity.token}` }, body: JSON.stringify({ runId: run.rows[0].id, onboardingId: account.id, requestId, manifest: approvedManifest }), signal: AbortSignal.timeout(15_000) }).catch(() => null);
  dispatched = response?.status === 202;
  return NextResponse.json({ ok: true, runId: run.rows[0].id, status: dispatched ? "queued" : "provisioning", dispatched });
}
