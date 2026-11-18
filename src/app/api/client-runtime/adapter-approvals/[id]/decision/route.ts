import { NextResponse } from "next/server";
import { decideApproval, GATEWAY_HTTP_STATUS } from "@/lib/adapterApprovalGateway";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, clientRpc, recordClientAudit } from "@/lib/clientDataPlane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "private, no-store" };
const MAX_BODY_BYTES = 4 * 1024;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return jsonError("not_authenticated", 401);
  if (process.env.ADAPTER_HOST_ENABLED !== "true") return jsonError("adapter_host_disabled", 403);
  const rateLimit = await checkClientRuntimeRateLimit("adapter-approval-decide", 30, 900);
  if (!rateLimit.ok) return jsonError("runtime_limit_unavailable", 503);
  if (!rateLimit.allowed) return jsonError("runtime_rate_limited", 429);
  if (!process.env.CLIENT_SLUG?.trim()) return jsonError("tenant_not_configured", 503);

  const { id } = await context.params;
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
  // The approver identity is never read from the body; the database uses the signed-in session.
  const result = await decideApproval(clientRpc, { approvalId: id, decision: body.decision, expectedActionHash: body.expectedActionHash });
  if (!result.ok) return jsonError(result.error, GATEWAY_HTTP_STATUS[result.error]);
  await recordClientAudit(`tenant.adapter.approval_${result.status}`);
  return NextResponse.json({ ok: true, status: result.status }, { headers: noStore });
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: noStore });
}
