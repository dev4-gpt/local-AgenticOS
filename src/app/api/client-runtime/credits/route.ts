import { NextResponse } from "next/server";
import { currentClientMember } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, clientRpc } from "@/lib/clientDataPlane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  const limit = await checkClientRuntimeRateLimit("credits-read", 60, 900);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "runtime_limit_unavailable" }, { status: 503 });
  if (!limit.allowed) return NextResponse.json({ ok: false, error: "runtime_rate_limited" }, { status: 429 });
  const result = await clientRpc("client_credit_account_snapshot", { p_tenant_slug: process.env.CLIENT_SLUG || "" });
  if (!result.ok || !result.value) return NextResponse.json({ ok: false, error: "credits_unavailable" }, { status: 503 });
  return NextResponse.json({ ok: true, account: result.value }, { headers: { "cache-control": "no-store" } });
}
