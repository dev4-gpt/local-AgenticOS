import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cloudRunIdTokenFromVercel, controlPlaneOidcConfigured } from "@/lib/cloudRunOidc";
import { supabaseServiceInsert, supabaseServiceSelect, supabaseServiceUpdate } from "@/lib/publicLaunch";

export const runtime = "nodejs";

function authorized(request: Request) {
  const expected = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim();
  const provided = request.headers.get("x-control-plane-secret")?.trim() || "";
  if (!expected || !provided) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { requestId?: unknown };
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  if (!requestId) return NextResponse.json({ ok: false, error: "missing_request_id" }, { status: 400 });

  const onboarding = await supabaseServiceSelect("client_onboarding_accounts", { request_id: `eq.${requestId}` });
  const account = onboarding.rows[0];
  if (!onboarding.ok || typeof account?.id !== "string") return NextResponse.json({ ok: false, error: "onboarding_not_found" }, { status: 404 });
  if (account.status !== "provisioning") return NextResponse.json({ ok: false, error: "prepare_required" }, { status: 409 });

  const preparedRuns = await supabaseServiceSelect("client_provisioning_runs", {
    onboarding_id: `eq.${account.id}`,
    status: "eq.succeeded",
    current_step: "eq.prepared",
    order: "finished_at.desc",
    limit: "1",
  });
  if (!preparedRuns.ok || typeof preparedRuns.rows[0]?.id !== "string") {
    return NextResponse.json({ ok: false, error: "prepare_required" }, { status: 409 });
  }

  const existingDeploy = await supabaseServiceSelect("client_provisioning_runs", {
    onboarding_id: `eq.${account.id}`,
    idempotency_key: `eq.deploy:${requestId}`,
    limit: "1",
  });
  if (existingDeploy.ok && typeof existingDeploy.rows[0]?.id === "string") {
    return NextResponse.json({
      ok: true,
      runId: existingDeploy.rows[0].id,
      status: existingDeploy.rows[0].status || "queued",
      dispatched: existingDeploy.rows[0].status === "queued" || existingDeploy.rows[0].status === "running",
      idempotent: true,
    });
  }

  const approved = account.approved_manifest;
  if (!approved || typeof approved !== "object" || Array.isArray(approved)) {
    return NextResponse.json({ ok: false, error: "approved_manifest_required" }, { status: 409 });
  }
  const priorProvisioning = (approved as Record<string, unknown>).provisioning;
  const deploymentManifest = {
    ...(approved as Record<string, unknown>),
    provisioning: {
      ...(priorProvisioning && typeof priorProvisioning === "object" && !Array.isArray(priorProvisioning)
        ? priorProvisioning as Record<string, unknown>
        : {}),
      phase: "deploy",
    },
  };

  const provisionerUrl = process.env.CONTROL_PLANE_PROVISIONER_URL?.trim() || "";
  const workerToken = process.env.CONTROL_PLANE_WORKER_TOKEN?.trim() || "";
  if (!provisionerUrl || !workerToken || !controlPlaneOidcConfigured()) {
    return NextResponse.json({ ok: false, error: "control_plane_not_configured" }, { status: 503 });
  }
  const identity = await cloudRunIdTokenFromVercel(request, provisionerUrl);
  if (!identity.ok) return NextResponse.json({ ok: false, error: identity.error }, { status: 503 });

  const run = await supabaseServiceInsert("client_provisioning_runs", {
    onboarding_id: account.id,
    request_id: requestId,
    idempotency_key: `deploy:${requestId}`,
    status: "queued",
    current_step: "deploying",
    resource_manifest: {},
    evidence_bundle: {
      prepared_run_id: preparedRuns.rows[0].id,
      approved_manifest_sha256: createHash("sha256").update(JSON.stringify(deploymentManifest)).digest("hex"),
    },
  });
  if (!run.ok || typeof run.rows[0]?.id !== "string") {
    return NextResponse.json({ ok: false, error: "deployment_run_create_failed" }, { status: 502 });
  }

  const response = await fetch(provisionerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${workerToken}`,
      "X-Serverless-Authorization": `Bearer ${identity.token}`,
    },
    body: JSON.stringify({ runId: run.rows[0].id, onboardingId: account.id, requestId, manifest: deploymentManifest }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  const dispatched = response?.status === 202;
  return NextResponse.json({ ok: true, runId: run.rows[0].id, status: dispatched ? "queued" : "deploying", dispatched });
}
