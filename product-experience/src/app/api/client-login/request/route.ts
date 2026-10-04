import { NextResponse } from "next/server";
import { publicEmail, publicLaunchConfig, supabaseServiceSelect } from "@/lib/publicLaunch";
import { allowPublicRequest, payloadTooLarge } from "@/lib/publicRequestGuard";

export const runtime = "nodejs";

const accepted = () => NextResponse.json({ ok: true }, { status: 202, headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  const config = publicLaunchConfig();
  const authKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (process.env.CLIENT_LOGIN_ENABLED !== "1" || !config || !authKey) {
    return NextResponse.json({ ok: false, error: "login_unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json" || payloadTooLarge(request)) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  if (!(await allowPublicRequest(request, "client-login", true))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: { "Retry-After": "900", "cache-control": "no-store" } });
  }
  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = publicEmail(body?.email);
  if (!email) return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });

  const appOrigin = process.env.PUBLIC_APP_URL?.trim();
  let appUrl: URL;
  try { appUrl = new URL(appOrigin || ""); }
  catch { return NextResponse.json({ ok: false, error: "login_unavailable" }, { status: 503 }); }
  if (appUrl.protocol !== "https:" || appUrl.username || appUrl.password || appUrl.port || appUrl.pathname !== "/" || appUrl.search || appUrl.hash) {
    return NextResponse.json({ ok: false, error: "login_unavailable" }, { status: 503 });
  }
  const callback = new URL("/auth/callback", appUrl);

  const accounts = await supabaseServiceSelect("client_onboarding_accounts", {
    email: `eq.${email}`, status: "eq.active", select: "auth_user_id,tenant_slug", limit: "2",
  });
  if (!accounts.ok) return NextResponse.json({ ok: false, error: "login_unavailable" }, { status: 503 });
  if (accounts.rows.length !== 1 || typeof accounts.rows[0]?.auth_user_id !== "string" || !accounts.rows[0].auth_user_id
    || typeof accounts.rows[0]?.tenant_slug !== "string" || !accounts.rows[0].tenant_slug) return accepted();

  const target = new URL(`${config.url}/auth/v1/otp`);
  target.searchParams.set("redirect_to", callback.toString());
  const sent = await fetch(target, {
    method: "POST", headers: { apikey: authKey, Authorization: `Bearer ${authKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, create_user: false }), cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);
  if (!sent?.ok) console.warn("client login email request failed", { status: sent?.status ?? 0 });
  return accepted();
}
