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

function isEmptyObject(value: unknown) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0;
}

function isSafePreMutationFailure(run: Record<string, unknown>) {
  return ["failed", "rolled_back"].includes(String(run.status))
    && run.error_code === "gcp_provisioning_command_failed"
    && Array.isArray(run.completed_steps)
    && run.completed_steps.length === 0
    && isEmptyObject(run.resource_manifest);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { requestId?: unknown };
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  if (!requestId) return NextResponse.json({ ok: false, error: "missing_request_id" }, { status: 400 });

  const onboarding = await supabaseServiceSelect("client_onboarding_accounts", { request_id: `eq.${requestId}` });
  const account = onboarding.rows[0];
  if (!onboarding.ok || typeof account?.id !== "string") return NextResponse.json({ ok: false, error: "onboarding_not_found" }, { status: 404 });
  if (!["manifest_review", "provisioning"].includes(String(account.status))) return NextResponse.json({ ok: false, error: "prepare_required" }, { status: 409 });

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
  if (account.status !== "provisioning") {
    const accountUpdate = await supabaseServiceUpdate("client_onboarding_accounts", { id: `eq.${account.id}` }, { status: "provisioning", updated_at: new Date().toISOString() });
    if (!accountUpdate.ok) return NextResponse.json({ ok: false, error: "prepare_state_update_failed" }, { status: 502 });
  }

  const deployRuns = await supabaseServiceSelect("client_provisioning_runs", {
    onboarding_id: `eq.${account.id}`,
    order: "created_at.desc",
    limit: "20",
  });
  if (!deployRuns.ok) return NextResponse.json({ ok: false, error: "deployment_runs_lookup_failed" }, { status: 502 });
  const initialDeployKey = `deploy:${requestId}`;
  const priorDeploys = deployRuns.rows.filter((run) => {
    const key = typeof run.idempotency_key === "string" ? run.idempotency_key : "";
    return key === initialDeployKey || key.startsWith(`${initialDeployKey}:retry:`);
  });
  const latestDeploy = priorDeploys[0];
  if (typeof latestDeploy?.id === "string" && ["queued", "running", "succeeded"].includes(String(latestDeploy.status))) {
    return NextResponse.json({
      ok: true,
      runId: latestDeploy.id,
      status: latestDeploy.status || "queued",
      dispatched: latestDeploy.status === "queued" || latestDeploy.status === "running",
      idempotent: true,
    });
  }
  if (latestDeploy && !isSafePreMutationFailure(latestDeploy)) {
    return NextResponse.json({ ok: false, error: "deployment_retry_requires_manual_review" }, { status: 409 });
  }
  const retryAttempt = priorDeploys.length;
  if (retryAttempt > 2) return NextResponse.json({ ok: false, error: "deployment_retry_limit_reached" }, { status: 409 });

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
    // Cloud Tasks derives its durable task name from runId. A safe retry must
    // therefore create a fresh run, not reopen a completed task with the same
    // idempotency key. Only zero-mutation adapter failures reach this branch.
    idempotency_key: retryAttempt === 0 ? initialDeployKey : `${initialDeployKey}:retry:${retryAttempt}`,
    status: "queued",
    current_step: "deploying",
    resource_manifest: {},
    evidence_bundle: {
      prepared_run_id: preparedRuns.rows[0].id,
      approved_manifest_sha256: createHash("sha256").update(JSON.stringify(deploymentManifest)).digest("hex"),
      ...(retryAttempt > 0 ? {
        retry_of_run_id: latestDeploy?.id,
        retry_attempt: retryAttempt,
        prior_error_code: latestDeploy?.error_code,
      } : {}),
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
