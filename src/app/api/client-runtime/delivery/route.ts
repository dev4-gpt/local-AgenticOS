import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, clientRpc, insertClientRecord, recordClientAudit } from "@/lib/clientDataPlane";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { safeDeliveryUrl } from "@/lib/clientDeliveryAdapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set(["review", "handoff", "release", "record"]);

export async function GET() {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  return NextResponse.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
}

export async function POST(request: Request) {
  const user = await currentClientUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!clientCapabilityEnabled("delivery-actions")) return NextResponse.json({ ok: false, error: "capability_not_enabled" }, { status: 403 });
  const rateLimit = await checkClientRuntimeRateLimit("delivery-actions", 10, 900);
  if (!rateLimit.ok) return NextResponse.json({ ok: false, error: "runtime_limit_unavailable" }, { status: 503 });
  if (!rateLimit.allowed) return NextResponse.json({ ok: false, error: "runtime_rate_limited" }, { status: 429, headers: { "Retry-After": "900" } });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 180) : "";
  const details = typeof body.details === "string" ? body.details.trim().slice(0, 10_000) : "";
  const destination = typeof body.destination === "string" ? body.destination.trim().slice(0, 500) : "";
  const artifactIds = Array.isArray(body.artifactIds) ? body.artifactIds.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 20) : [];
  const idempotencyKey = typeof body.idempotencyKey === "string" && body.idempotencyKey.trim().length >= 8 ? body.idempotencyKey.trim().slice(0, 180) : randomUUID();
  if (!ACTIONS.has(action) || title.length < 3 || details.length < 10) return NextResponse.json({ ok: false, error: "delivery_input_invalid" }, { status: 400 });
  if ((action === "handoff" || action === "release") && !destination) return NextResponse.json({ ok: false, error: "delivery_destination_required" }, { status: 400 });
  if (containsClientSecretLike(title, details, destination)) return NextResponse.json({ ok: false, error: "secret_like_input_rejected" }, { status: 400 });
  if (destination && !(await safeDeliveryUrl(destination))) return NextResponse.json({ ok: false, error: "delivery_destination_invalid" }, { status: 400 });

  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!tenantSlug) return NextResponse.json({ ok: false, error: "tenant_not_configured" }, { status: 503 });
  const requestId = randomUUID();
  const stored = await insertClientRecord("client_runtime_requests", {
    id: requestId,
    tenant_slug: tenantSlug,
    submitted_by: user.id,
    request_type: "deliver",
    title,
    details,
    fields: { action, destination: destination || null, artifactIds, approvalRequired: true },
  });
  if (!stored.ok) return NextResponse.json({ ok: false, error: "delivery_request_store_failed" }, { status: 502 });

  const created = await clientRpc("create_client_delivery_action", {
    p_tenant_slug: tenantSlug,
    p_request_id: requestId,
    p_action: action,
    p_destination: destination,
    p_artifact_ids: artifactIds,
    p_idempotency_key: idempotencyKey,
  });
  const actionId = typeof created.value === "string" ? created.value : "";
  if (!created.ok || !actionId) return NextResponse.json({ ok: false, error: "delivery_action_store_failed" }, { status: 502 });
  await recordClientAudit("delivery.requested", { action, approvalRequired: true });
  return NextResponse.json({ ok: true, requestId, actionId, status: "pending_approval" }, { status: 202, headers: { "cache-control": "no-store" } });
}
