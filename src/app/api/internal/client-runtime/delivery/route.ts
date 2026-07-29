import { NextResponse } from "next/server";
import { workerRpc } from "@/lib/clientDataPlane";
import { validClientTaskIdentity } from "@/lib/clientTaskAuth";
import { logClientRuntimeEvent } from "@/lib/clientRuntimeObservability";
import { runClientDeliveryAdapter } from "@/lib/clientDeliveryAdapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (process.env.CLIENT_RUNTIME_WORKER_ENABLED !== "1") return NextResponse.json({ ok: false, error: "worker_disabled" }, { status: 404 });
  if (!(await validClientTaskIdentity(request))) return NextResponse.json({ ok: false, error: "worker_unauthorized" }, { status: 401 });
  const workerToken = process.env.CLIENT_WORKER_TOKEN?.trim();
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!workerToken || !tenantSlug) return NextResponse.json({ ok: false, error: "worker_not_configured" }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const actionId = typeof body.actionId === "string" ? body.actionId : "";
  const requestedTenant = typeof body.tenantSlug === "string" ? body.tenantSlug : "";
  if (!/^[0-9a-f-]{36}$/i.test(actionId) || requestedTenant !== tenantSlug) return NextResponse.json({ ok: false, error: "worker_payload_invalid" }, { status: 400 });

  const claim = await workerRpc("claim_client_delivery_action_worker", { p_tenant_slug: tenantSlug, p_action_id: actionId, p_worker_token: workerToken });
  if (!claim.ok) {
    logClientRuntimeEvent("runtime.delivery_claim_failed", { tenant: tenantSlug, status: claim.status, reason: "delivery_claim_failed" });
    return NextResponse.json({ ok: false, error: "delivery_claim_failed" }, { status: 503 });
  }
  const action = claim.value as { id?: string; action?: string; destination?: string; request_id?: string; artifact_ids?: unknown } | null;
  if (!action?.id || typeof action.action !== "string") return NextResponse.json({ ok: true, status: "already_claimed" });
  const artifactIds = Array.isArray(action.artifact_ids) ? action.artifact_ids.filter((value): value is string => typeof value === "string") : [];
  const result = await runClientDeliveryAdapter({ action: action.action, destination: typeof action.destination === "string" ? action.destination : undefined, requestId: action.request_id, artifactIds });
  const status = result.ok ? "executed" : "failed";
  if (!result.ok) logClientRuntimeEvent("runtime.delivery_failed", { tenant: tenantSlug, status: result.status, reason: result.error });
  await workerRpc("complete_client_delivery_action_worker", { p_tenant_slug: tenantSlug, p_action_id: actionId, p_worker_token: workerToken, p_status: status, p_error_code: result.ok ? null : result.error });
  // The action is durably marked failed before returning. A second automatic
  // Cloud Tasks retry cannot claim it and accidentally repeat an external POST.
  return NextResponse.json({ ok: result.ok, status, error: result.ok ? null : result.error }, { status: 200 });
}
