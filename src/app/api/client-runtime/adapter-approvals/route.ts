import { NextResponse } from "next/server";
import { GATEWAY_HTTP_STATUS, requestApproval, type GatewayErrorCode } from "@/lib/adapterApprovalGateway";
import { currentClientCredentialManager, currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, clientRpc, recordClientAudit, selectClientRecords } from "@/lib/clientDataPlane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

export async function GET() {
  const gate = await gateRequest("adapter-approval-read", 60);
  if (!gate.ok) return gate.response;
  const page = await selectClientRecords("client_adapter_approvals", {
    tenant_slug: `eq.${gate.tenantSlug}`,
    select: "id,adapter_id,action_kind,action_hash,action_canonical,destination,policy_version,requested_by,decided_by,status,expires_at,decided_at,executed_at,created_at",
    order: "created_at.desc,id.asc",
    limit: "100",
  });
  if (!page.ok) return jsonError("unavailable", 502);
  // The screen needs to know who is looking and whether they may decide, so it can hide buttons the database would refuse.
  // The database still enforces both: the requester can never decide, and only owners and admins can.
  const canDecide = await currentClientCredentialManager();
  return NextResponse.json({ ok: true, approvals: page.records, viewerId: gate.userId, canDecide }, { headers: noStore });
}

export async function POST(request: Request) {
  const gate = await gateRequest("adapter-approval-request", 20);
  if (!gate.ok) return gate.response;
  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) return jsonError("invalid_input", 413);
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return jsonError("invalid_input", 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonError("invalid_input", 400);
  }
  const result = await requestApproval(clientRpc, {
    tenantSlug: gate.tenantSlug,
    adapterId: body.adapterId,
    kind: body.kind,
    destination: body.destination,
    policyVersion: body.policyVersion,
    payload: body.payload,
    ttlSeconds: body.ttlSeconds,
  });
  if (!result.ok) return jsonError(result.error, GATEWAY_HTTP_STATUS[result.error]);
  await recordClientAudit("tenant.adapter.approval_requested");
  return NextResponse.json({ ok: true, approvalId: result.approvalId, actionHash: result.actionHash }, { status: 201, headers: noStore });
}

const noStore = { "cache-control": "private, no-store" };

function jsonError(error: GatewayErrorCode | "not_authenticated" | "adapter_host_disabled" | "runtime_limit_unavailable" | "runtime_rate_limited" | "tenant_not_configured", status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: noStore });
}

async function gateRequest(bucket: string, limit: number) {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return { ok: false as const, response: jsonError("not_authenticated", 401) };
  if (process.env.ADAPTER_HOST_ENABLED !== "true") return { ok: false as const, response: jsonError("adapter_host_disabled", 403) };
  const rateLimit = await checkClientRuntimeRateLimit(bucket, limit, 900);
  if (!rateLimit.ok) return { ok: false as const, response: jsonError("runtime_limit_unavailable", 503) };
  if (!rateLimit.allowed) return { ok: false as const, response: jsonError("runtime_rate_limited", 429) };
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!tenantSlug) return { ok: false as const, response: jsonError("tenant_not_configured", 503) };
  return { ok: true as const, tenantSlug, userId: user.id };
}
