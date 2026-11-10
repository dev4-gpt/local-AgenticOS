import { NextResponse } from "next/server";
import { clientMembershipForToken, currentClientAccessToken, currentClientUser } from "@/lib/clientAuth";
import { clientTenantScopeDigest } from "@/lib/clientRuntimeConfigDigest.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentClientUser();
  let workspaceAuthorized = Boolean(user);
  let accessError: string | null = null;
  let tenantScopeDigest: string | null = null;
  if (user && process.env.VELOCE_CLIENT_EDITION === "1") {
    const membership = await clientMembershipForToken(await currentClientAccessToken());
    workspaceAuthorized = membership.ok && membership.member;
    accessError = !membership.ok ? membership.error : membership.member ? null : "tenant_membership_required";
    if (workspaceAuthorized) {
      tenantScopeDigest = clientTenantScopeDigest(process.env.SUPABASE_URL, process.env.CLIENT_SLUG);
    }
  }
  return NextResponse.json({ ok: true, authenticated: Boolean(user), workspaceAuthorized, accessError, tenantScopeDigest, user: user ? { id: user.id, email: user.email ?? null } : null }, { headers: { "cache-control": "no-store" } });
}
