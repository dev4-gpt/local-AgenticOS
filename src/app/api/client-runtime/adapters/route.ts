import { NextResponse } from "next/server";
import { buildAdapterCards, parseSummaryRows } from "@/lib/adapterOverview";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, clientRpc } from "@/lib/clientDataPlane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "private, no-store" };

// Read-only. The database function returns rows only to active members of the tenant, and the tenant comes from
// the server setting, never from the request.
export async function GET() {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return jsonError("not_authenticated", 401);
  if (process.env.ADAPTER_HOST_ENABLED !== "true") return jsonError("adapter_host_disabled", 403);
  const rate = await checkClientRuntimeRateLimit("adapter-overview-read", 60, 900);
  if (!rate.ok) return jsonError("runtime_limit_unavailable", 503);
  if (!rate.allowed) return jsonError("runtime_rate_limited", 429);
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!tenantSlug) return jsonError("tenant_not_configured", 503);

  const result = await clientRpc("client_adapter_budget_summary", { p_tenant_slug: tenantSlug });
  if (!result.ok) return jsonError("adapters_read_failed", 502);
  const rows = parseSummaryRows(result.value);
  if (!rows) return jsonError("adapters_read_invalid", 502);
  return NextResponse.json({ ok: true, adapters: buildAdapterCards(rows) }, { headers: noStore });
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: noStore });
}
