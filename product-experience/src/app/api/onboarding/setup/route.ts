import { NextResponse } from "next/server";
import { hashSetupToken, publicLaunchConfig, supabaseServiceSelect, supabaseServiceUpdate } from "@/lib/publicLaunch";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 400 });
  const matches = await supabaseServiceSelect("client_onboarding_tokens", { token_hash: `eq.${hashSetupToken(token)}`, purpose: "eq.setup", consumed_at: "is.null" });
  const record = matches.rows[0];
  if (!matches.ok || !record || typeof record.onboarding_id !== "string" || (record.expires_at && Date.parse(String(record.expires_at)) < Date.now())) return NextResponse.json({ ok: false, error: "token_invalid_or_expired" }, { status: 400 });
  const account = await supabaseServiceSelect("client_onboarding_accounts", { id: `eq.${record.onboarding_id}` });
  const email = typeof account.rows[0]?.email === "string" ? account.rows[0].email : null;
  const config = publicLaunchConfig();
  if (!email || !config) return NextResponse.json({ ok: false, error: "setup_unavailable" }, { status: 503 });
  const invite = await fetch(`${config.url}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email, redirect_to: process.env.PUBLIC_APP_URL || "https://app.veloceos.cloud" }), cache: "no-store" }).catch(() => null);
  const inviteBody = await invite?.json().catch(() => null) as { action_link?: unknown; user?: { id?: unknown } } | null;
  if (!invite?.ok || typeof inviteBody?.action_link !== "string") return NextResponse.json({ ok: false, error: "auth_link_failed" }, { status: 502 });
  await supabaseServiceUpdate("client_onboarding_tokens", { id: `eq.${record.id}` }, { consumed_at: new Date().toISOString() });
  if (typeof inviteBody.user?.id === "string") await supabaseServiceUpdate("client_onboarding_accounts", { id: `eq.${record.onboarding_id}` }, { auth_user_id: inviteBody.user.id, updated_at: new Date().toISOString() });
  return NextResponse.json({ ok: true, actionLink: inviteBody.action_link });
}
