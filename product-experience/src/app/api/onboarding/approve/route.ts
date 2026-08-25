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
  const body = await request.json().catch(() => ({})) as { requestId?: unknown; manifestVersion?: unknown; manifestHash?: unknown; manifest?: unknown };
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  if (!requestId) return NextResponse.json({ ok: false, error: "missing_request_id" }, { status: 400 });
  if (!body.manifest || typeof body.manifest !== "object" || Array.isArray(body.manifest)) return NextResponse.json({ ok: false, error: "approved_manifest_required" }, { status: 400 });
  const onboarding = await supabaseServiceSelect("client_onboarding_accounts", { request_id: `eq.${requestId}` });
  const account = onboarding.rows[0];
  if (!onboarding.ok || typeof account?.id !== "string") return NextResponse.json({ ok: false, error: "onboarding_not_found" }, { status: 404 });
  if (!["manifest_review", "payment_succeeded"].includes(String(account.status))) return NextResponse.json({ ok: false, error: "invalid_state" }, { status: 409 });
  if (account.commercial_scope_status === "recommended") return NextResponse.json({ ok: false, error: "commercial_scope_approval_required" }, { status: 409 });
  const provisionerUrl = process.env.CONTROL_PLANE_PROVISIONER_URL?.trim() || "";
  const workerToken = process.env.CONTROL_PLANE_WORKER_TOKEN?.trim() || "";
  if (!provisionerUrl || !workerToken || !controlPlaneOidcConfigured()) {
    return NextResponse.json({ ok: false, error: "control_plane_not_configured" }, { status: 503 });
  }
  const identity = await cloudRunIdTokenFromVercel(request, provisionerUrl);
  if (!identity.ok) return NextResponse.json({ ok: false, error: identity.error }, { status: 503 });
  const scopeInputs = account.commercial_scope_inputs && typeof account.commercial_scope_inputs === "object" && !Array.isArray(account.commercial_scope_inputs)
    ? account.commercial_scope_inputs as Record<string, unknown>
    : null;
  const approvedManifest = scopeInputs ? applyCommercialScopeToManifest(body.manifest as Record<string, unknown>, scopeInputs) : body.manifest;
  const manifestHash = createHash("sha256").update(JSON.stringify(approvedManifest)).digest("hex");
  const manifestVersion = typeof body.manifestVersion === "string" && body.manifestVersion.trim() ? body.manifestVersion.trim() : "commercial-scope-v1";
  const run = await supabaseServiceInsert("client_provisioning_runs", { onboarding_id: account.id, request_id: requestId, idempotency_key: `approve:${requestId}`, status: "queued", current_step: "provisioning", resource_manifest: {}, evidence_bundle: {} });
  await supabaseServiceUpdate("client_onboarding_accounts", { id: `eq.${account.id}` }, { status: "provisioning", manifest_version: manifestVersion, manifest_hash: manifestHash, approved_manifest: approvedManifest, updated_at: new Date().toISOString() });
  let dispatched = false;
  if (run.ok && run.rows[0]?.id) {
    const response = await fetch(provisionerUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${workerToken}`, "X-Serverless-Authorization": `Bearer ${identity.token}` }, body: JSON.stringify({ runId: run.rows[0].id, onboardingId: account.id, requestId, manifest: approvedManifest }), signal: AbortSignal.timeout(15_000) }).catch(() => null);
    dispatched = response?.ok === true;
  }
  return NextResponse.json({ ok: run.ok, runId: run.rows[0]?.id ?? null, status: "provisioning", dispatched, error: run.ok ? undefined : "provisioning_run_create_failed" });
}
