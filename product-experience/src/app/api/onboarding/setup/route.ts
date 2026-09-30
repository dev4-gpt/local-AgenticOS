import { NextResponse } from "next/server";
import { hashSetupToken, publicLaunchConfig, supabaseServiceRpc, supabaseServiceSelect } from "@/lib/publicLaunch";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 400 });
  const matches = await supabaseServiceSelect("client_onboarding_tokens", { token_hash: `eq.${hashSetupToken(token)}`, purpose: "eq.setup", consumed_at: "is.null" });
  const record = matches.rows[0];
  if (!matches.ok || !record || typeof record.onboarding_id !== "string" || (record.expires_at && Date.parse(String(record.expires_at)) < Date.now())) return NextResponse.json({ ok: false, error: "token_invalid_or_expired" }, { status: 400 });
  const account = await supabaseServiceSelect("client_onboarding_accounts", { id: `eq.${record.onboarding_id}` });
  const onboarding = account.rows[0];
  const email = typeof onboarding?.email === "string" ? onboarding.email : null;
  const config = publicLaunchConfig();
  if (!account.ok || !email || typeof onboarding?.tenant_slug !== "string" || onboarding?.status !== "active" || !config) return NextResponse.json({ ok: false, error: "setup_unavailable" }, { status: 503 });
  let callback: URL;
  try { callback = new URL("/auth/callback", process.env.PUBLIC_APP_URL?.trim() || "https://app.veloceos.cloud"); }
  catch { return NextResponse.json({ ok: false, error: "setup_unavailable" }, { status: 503 }); }
  if (callback.protocol !== "https:" || callback.username || callback.password) return NextResponse.json({ ok: false, error: "setup_unavailable" }, { status: 503 });
  const invite = await fetch(`${config.url}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email, redirect_to: callback.toString() }), cache: "no-store" }).catch(() => null);
  const inviteBody = await invite?.json().catch(() => null) as { action_link?: unknown; id?: unknown; user?: { id?: unknown } } | null;
  if (!invite?.ok || typeof inviteBody?.action_link !== "string") return NextResponse.json({ ok: false, error: "auth_link_failed" }, { status: 502 });
  let actionLink: URL;
  let authBase: URL;
  try { actionLink = new URL(inviteBody.action_link); authBase = new URL(config.url); }
  catch { return NextResponse.json({ ok: false, error: "auth_link_invalid" }, { status: 502 }); }
  if (actionLink.protocol !== "https:" || actionLink.origin !== authBase.origin || actionLink.pathname !== "/auth/v1/verify"
    || actionLink.username || actionLink.password || actionLink.hash || actionLink.searchParams.get("type") !== "magiclink"
    || !actionLink.searchParams.get("token") || actionLink.searchParams.get("redirect_to") !== callback.toString()) {
    return NextResponse.json({ ok: false, error: "auth_link_invalid" }, { status: 502 });
  }
  // GoTrue's Admin generate_link response exposes the created user's fields
  // at the top level. Older client wrappers nested them under user, so accept
  // both trusted-server response shapes.
  const authUserId = typeof inviteBody.id === "string" ? inviteBody.id : typeof inviteBody.user?.id === "string" ? inviteBody.user.id : null;
  if (!authUserId) return NextResponse.json({ ok: false, error: "auth_user_missing" }, { status: 502 });
  const completed = await supabaseServiceRpc("consume_client_onboarding_setup_token", { p_token_hash: hashSetupToken(token), p_auth_user_id: authUserId });
  if (!completed.ok) return NextResponse.json({ ok: false, error: "setup_store_failed" }, { status: 502 });
  if (!completed.value || typeof completed.value !== "object" || Array.isArray(completed.value) || (completed.value as Record<string, unknown>).status !== "ready") return NextResponse.json({ ok: false, error: "token_invalid_or_expired" }, { status: 400 });
  return NextResponse.json({ ok: true, actionLink: actionLink.toString() }, { headers: { "cache-control": "no-store" } });
}
