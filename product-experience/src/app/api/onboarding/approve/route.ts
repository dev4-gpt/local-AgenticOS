import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
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
  const run = await supabaseServiceInsert("client_provisioning_runs", { onboarding_id: account.id, request_id: requestId, idempotency_key: `approve:${requestId}`, status: "queued", current_step: "provisioning", resource_manifest: {}, evidence_bundle: {} });
  await supabaseServiceUpdate("client_onboarding_accounts", { id: `eq.${account.id}` }, { status: "provisioning", manifest_version: typeof body.manifestVersion === "string" ? body.manifestVersion : null, manifest_hash: typeof body.manifestHash === "string" ? body.manifestHash : null, approved_manifest: body.manifest, updated_at: new Date().toISOString() });
  const provisionerUrl = process.env.CONTROL_PLANE_PROVISIONER_URL?.trim();
  let dispatched = false;
  const workerToken = process.env.CONTROL_PLANE_WORKER_TOKEN?.trim();
  if (provisionerUrl && workerToken && run.ok && run.rows[0]?.id) {
    const response = await fetch(provisionerUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${workerToken}`, "x-control-plane-secret": process.env.CONTROL_PLANE_OPERATOR_SECRET!.trim() }, body: JSON.stringify({ runId: run.rows[0].id, onboardingId: account.id, requestId, manifest: body.manifest }), signal: AbortSignal.timeout(8_000) }).catch(() => null);
    dispatched = response?.ok === true;
  }
  return NextResponse.json({ ok: run.ok, runId: run.rows[0]?.id ?? null, status: "provisioning", dispatched, error: run.ok ? undefined : "provisioning_run_create_failed" });
}
