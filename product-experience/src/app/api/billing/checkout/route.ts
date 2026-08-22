import { NextResponse } from "next/server";
import { allowPublicRequest } from "@/lib/publicRequestGuard";
import { stripeConfigured, stripeRequest, supabaseServiceSelect, supabaseServiceUpdate } from "@/lib/publicLaunch";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await allowPublicRequest(request, "billing-checkout"))) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  if (!stripeConfigured()) return NextResponse.json({ ok: false, error: "billing_not_configured" }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { requestId?: unknown; email?: unknown };
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!requestId || !email) return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  const requests = await supabaseServiceSelect("deployment_requests", { id: `eq.${requestId}`, email: `eq.${email}`, select: "id,email,status,billing_status" });
  if (!requests.ok || !requests.rows[0]) return NextResponse.json({ ok: false, error: "request_not_found" }, { status: 404 });
  const sessions = await stripeRequest("checkout/sessions", {
    mode: "subscription",
    customer_email: email,
    success_url: `${(process.env.PUBLIC_APP_URL || "https://app.veloceos.cloud").replace(/\/$/, "")}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${(process.env.PUBLIC_SITE_URL || "https://veloceos.cloud").replace(/\/$/, "")}/start?billing=cancelled`,
    "line_items[0][price]": process.env.STRIPE_SETUP_PRICE_ID!.trim(),
    "line_items[0][quantity]": 1,
    "line_items[1][price]": process.env.STRIPE_PLATFORM_PRICE_ID!.trim(),
    "line_items[1][quantity]": 1,
    "metadata[request_id]": requestId,
    "metadata[product]": "veloce-public-launch",
  });
  const sessionId = typeof sessions.value?.id === "string" ? sessions.value.id : null;
  const url = typeof sessions.value?.url === "string" ? sessions.value.url : null;
  if (!sessions.ok || !sessionId || !url) return NextResponse.json({ ok: false, error: "checkout_create_failed" }, { status: 502 });
  await supabaseServiceUpdate("deployment_requests", { id: `eq.${requestId}` }, { billing_status: "checkout_created", stripe_checkout_session_id: sessionId });
  return NextResponse.json({ ok: true, checkoutUrl: url, sessionId });
}
