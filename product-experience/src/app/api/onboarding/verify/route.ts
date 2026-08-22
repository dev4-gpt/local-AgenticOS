import { NextResponse } from "next/server";
import { hashSetupToken, supabaseServiceSelect, supabaseServiceUpdate } from "@/lib/publicLaunch";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (token.length < 20) return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 400 });
  const matches = await supabaseServiceSelect("client_onboarding_tokens", { token_hash: `eq.${hashSetupToken(token)}`, purpose: "eq.verify-email", consumed_at: "is.null" });
  const record = matches.rows[0];
  if (!matches.ok || !record || typeof record.onboarding_id !== "string") return NextResponse.json({ ok: false, error: "token_invalid_or_expired" }, { status: 400 });
  if (typeof record.expires_at === "string" && Date.parse(record.expires_at) < Date.now()) return NextResponse.json({ ok: false, error: "token_expired" }, { status: 400 });
  const onboardingId = record.onboarding_id;
  const consumed = await supabaseServiceUpdate("client_onboarding_tokens", { id: `eq.${record.id}` }, { consumed_at: new Date().toISOString() });
  const updated = await supabaseServiceUpdate("client_onboarding_accounts", { id: `eq.${onboardingId}` }, { status: "email_verified", updated_at: new Date().toISOString() });
  if (!consumed.ok || !updated.ok) return NextResponse.json({ ok: false, error: "verification_store_failed" }, { status: 502 });
  const account = await supabaseServiceSelect("client_onboarding_accounts", { id: `eq.${onboardingId}` });
  if (typeof account.rows[0]?.request_id === "string") await supabaseServiceUpdate("deployment_requests", { id: `eq.${account.rows[0].request_id}` }, { email_verified_at: new Date().toISOString() });
  return NextResponse.json({ ok: true, onboardingId, requestId: account.rows[0]?.request_id ?? null, email: account.rows[0]?.email ?? null, status: "email_verified", next: "payment" });
}
