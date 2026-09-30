import { NextResponse } from "next/server";
import { hashSetupToken, supabaseServiceRpc } from "@/lib/publicLaunch";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (token.length < 20) return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 400 });
  const consumed = await supabaseServiceRpc("consume_client_onboarding_verify_token", { p_token_hash: hashSetupToken(token) });
  if (!consumed.ok) return NextResponse.json({ ok: false, error: "verification_store_failed" }, { status: 502 });
  if (consumed.value === null) return NextResponse.json({ ok: false, error: "token_invalid_or_expired" }, { status: 400 });
  if (typeof consumed.value !== "object" || Array.isArray(consumed.value)) return NextResponse.json({ ok: false, error: "verification_store_failed" }, { status: 502 });
  const result = consumed.value as Record<string, unknown>;
  if (typeof result.onboardingId !== "string" || typeof result.requestId !== "string" || typeof result.email !== "string" || result.status !== "email_verified") {
    return NextResponse.json({ ok: false, error: "verification_store_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, onboardingId: result.onboardingId, requestId: result.requestId, email: result.email, status: "email_verified", next: "payment" });
}
