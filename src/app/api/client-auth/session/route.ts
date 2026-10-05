import { NextResponse } from "next/server";
import { clientMembershipForToken, currentClientAccessToken, currentClientUser } from "@/lib/clientAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentClientUser();
  let workspaceAuthorized = Boolean(user);
  let accessError: string | null = null;
  if (user && process.env.VELOCE_CLIENT_EDITION === "1") {
    const membership = await clientMembershipForToken(await currentClientAccessToken());
    workspaceAuthorized = membership.ok && membership.member;
    accessError = !membership.ok ? membership.error : membership.member ? null : "tenant_membership_required";
  }
  return NextResponse.json({ ok: true, authenticated: Boolean(user), workspaceAuthorized, accessError, user: user ? { id: user.id, email: user.email ?? null } : null }, { headers: { "cache-control": "no-store" } });
}
