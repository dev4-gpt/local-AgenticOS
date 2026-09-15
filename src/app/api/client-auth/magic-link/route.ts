import { NextResponse } from "next/server";
import { authCookieNames, clientUserEmailAllowed, supabaseAuthConfig } from "@/lib/clientAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const config = supabaseAuthConfig();
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  const body = await request.json().catch(() => ({})) as { accessToken?: unknown; refreshToken?: unknown };
  const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken.trim() : "";
  if (!config || !tenantSlug || refreshToken.length < 20 || refreshToken.length > 4096) return fail("invalid_magic_link");

  // Refresh once rather than trusting a browser-supplied access token. This
  // proves possession of the session, rotates the credential, and lets us
  // validate the resulting user against this runtime's RLS membership.
  const refreshed = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST", headers: { apikey: config.key, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }), cache: "no-store",
  }).catch(() => null);
  const session = await refreshed?.json().catch(() => null) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; user?: { id?: unknown; email?: unknown } } | null;
  const accessToken = typeof session?.access_token === "string" ? session.access_token : "";
  const nextRefresh = typeof session?.refresh_token === "string" ? session.refresh_token : "";
  const userId = typeof session?.user?.id === "string" ? session.user.id : "";
  const email = typeof session?.user?.email === "string" ? session.user.email : undefined;
  const expiresIn = Number(session?.expires_in) || 3600;
  if (!refreshed?.ok || !accessToken || !nextRefresh || !userId || !clientUserEmailAllowed(email)) return fail("session_rejected");
  const member = await fetch(`${config.url}/rest/v1/rpc/client_member`, {
    method: "POST", headers: { apikey: config.key, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_tenant_slug: tenantSlug }), cache: "no-store",
  }).catch(() => null);
  if (!member?.ok || await member.json().catch(() => false) !== true) return fail("tenant_membership_required");

  const result = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  const names = authCookieNames(); const secure = process.env.NODE_ENV === "production";
  result.cookies.set(names.access, accessToken, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: Math.max(300, expiresIn) });
  result.cookies.set(names.refresh, nextRefresh, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return result;
}

function fail(error: string) { return NextResponse.json({ ok: false, error }, { status: 401, headers: { "cache-control": "no-store" } }); }
