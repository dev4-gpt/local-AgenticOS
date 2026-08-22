import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseServiceUpdate } from "@/lib/publicLaunch";

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
  const run = await supabaseServiceUpdate("client_provisioning_runs", { id: `eq.${runId}` }, { status, current_step: status === "succeeded" ? "smoke_testing" : "rollback", completed_steps: Array.isArray(body.completedSteps) ? body.completedSteps : [], resource_manifest: body.resourceManifest && typeof body.resourceManifest === "object" ? body.resourceManifest : {}, evidence_bundle: body.evidenceBundle && typeof body.evidenceBundle === "object" ? body.evidenceBundle : {}, image_digest: typeof body.imageDigest === "string" ? body.imageDigest : null, cloud_run_revision: typeof body.cloudRunRevision === "string" ? body.cloudRunRevision : null, error_code: typeof body.errorCode === "string" ? body.errorCode : null, error_message: typeof body.errorMessage === "string" ? body.errorMessage : null, finished_at: new Date().toISOString() });
  if (!run.ok) return NextResponse.json({ ok: false, error: "run_update_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, runId, status });
}
