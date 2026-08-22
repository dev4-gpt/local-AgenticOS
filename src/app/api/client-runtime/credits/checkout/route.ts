import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit } from "@/lib/clientDataPlane";

export const runtime = "nodejs";

export async function POST() {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  const limit = await checkClientRuntimeRateLimit("credits-checkout", 5, 3600);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "runtime_limit_unavailable" }, { status: 503 });
  if (!limit.allowed) return NextResponse.json({ ok: false, error: "runtime_rate_limited" }, { status: 429 });
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  const price = process.env.STRIPE_CREDIT_PRICE_ID?.trim();
  if (!secret || !price) return NextResponse.json({ ok: false, error: "managed_credits_not_configured" }, { status: 503 });
  const params = new URLSearchParams({ mode: "payment", customer_email: user.email || "", success_url: `${(process.env.PUBLIC_APP_URL || "https://app.veloceos.cloud").replace(/\/$/, "")}/credits?purchase=success`, cancel_url: `${(process.env.PUBLIC_APP_URL || "https://app.veloceos.cloud").replace(/\/$/, "")}/credits?purchase=cancelled`, "line_items[0][price]": price, "line_items[0][quantity]": "1", "metadata[tenant_slug]": process.env.CLIENT_SLUG || "", "metadata[product]": "veloce-managed-credits" });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" }, body: params, cache: "no-store" }).catch(() => null);
  const body = await response?.json().catch(() => null) as { url?: unknown } | null;
  if (!response?.ok || typeof body?.url !== "string") return NextResponse.json({ ok: false, error: "checkout_create_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, checkoutUrl: body.url });
}
