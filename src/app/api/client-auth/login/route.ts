import { NextResponse } from "next/server";
import { authCookieNames, clientUserEmailAllowed, supabaseAuthConfig } from "@/lib/clientAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const config = supabaseAuthConfig();
  if (!config) return NextResponse.json({ ok: false, error: "auth_not_configured" }, { status: 503 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 256) {
    return NextResponse.json({ ok: false, error: "invalid_login" }, { status: 400 });
  }

  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: config.key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return NextResponse.json({ ok: false, error: "invalid_login" }, { status: 401 });

  const session = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; user?: { id?: string; email?: string } };
  if (!session.access_token || !session.refresh_token || !session.user?.id) {
    return NextResponse.json({ ok: false, error: "invalid_session" }, { status: 401 });
  }
  if (!clientUserEmailAllowed(session.user.email ?? email)) {
    return NextResponse.json({ ok: false, error: "client_user_not_approved" }, { status: 403 });
  }

  const result = NextResponse.json({ ok: true, user: { id: session.user.id, email: session.user.email ?? email } }, { headers: { "cache-control": "no-store" } });
  const names = authCookieNames();
  const secure = process.env.NODE_ENV === "production";
  result.cookies.set(names.access, session.access_token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: Math.max(300, session.expires_in ?? 3600) });
  result.cookies.set(names.refresh, session.refresh_token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return result;
}
