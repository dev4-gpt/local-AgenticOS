import { NextResponse } from "next/server";
import { allowPublicRequest } from "@/lib/publicRequestGuard";
import { stripeConfigured, stripeRequest, stripeSecretConfigured, stripeTestFixtureConfig, supabaseServiceSelect, supabaseServiceUpdate } from "@/lib/publicLaunch";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await allowPublicRequest(request, "billing-checkout"))) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  if (!stripeSecretConfigured()) return NextResponse.json({ ok: false, error: "billing_not_configured" }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { requestId?: unknown; email?: unknown };
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!requestId || !email) return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  const requests = await supabaseServiceSelect("deployment_requests", { id: `eq.${requestId}`, email: `eq.${email}`, select: "id,email,status,billing_status" });
  if (!requests.ok || !requests.rows[0]) return NextResponse.json({ ok: false, error: "request_not_found" }, { status: 404 });
  const onboarding = await supabaseServiceSelect("client_onboarding_accounts", { request_id: `eq.${requestId}`, select: "id,commercial_scope_status,commercial_scope_quote" });
  const account = onboarding.rows[0];
  if (account && account.commercial_scope_status === "recommended") return NextResponse.json({ ok: false, error: "commercial_scope_pending" }, { status: 409 });

  const quote = account?.commercial_scope_quote && typeof account.commercial_scope_quote === "object" && !Array.isArray(account.commercial_scope_quote)
    ? account.commercial_scope_quote as { setupUsd?: unknown; monthlyUsd?: unknown; lineItems?: unknown; testFixture?: unknown }
    : null;
  const setupUsd = Number(quote?.setupUsd);
  const monthlyUsd = Number(quote?.monthlyUsd);
  const lineItems = Array.isArray(quote?.lineItems) ? quote.lineItems.filter((item): item is { name?: unknown; amountUsd?: unknown; recurring?: unknown } => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
  const testFixture = quote?.testFixture === true ? stripeTestFixtureConfig() : null;
  if (quote?.testFixture === true && !testFixture) return NextResponse.json({ ok: false, error: "stripe_test_fixture_not_configured" }, { status: 503 });
  const customQuote = Boolean(quote && Number.isFinite(setupUsd) && Number.isFinite(monthlyUsd) && (setupUsd !== 2_500 || monthlyUsd !== 1_250 || lineItems.length > 0));
  if (!customQuote && !stripeConfigured()) return NextResponse.json({ ok: false, error: "billing_not_configured" }, { status: 503 });

  const checkoutBody: Record<string, string | number | string[]> = {
    mode: "subscription",
    customer_email: email,
    success_url: `${(process.env.PUBLIC_APP_URL || "https://app.veloceos.cloud").replace(/\/$/, "")}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${(process.env.PUBLIC_SITE_URL || "https://veloceos.cloud").replace(/\/$/, "")}/start?billing=cancelled`,
    "metadata[request_id]": requestId,
    "metadata[product]": "veloce-public-launch",
    "metadata[commercial_scope]": account?.commercial_scope_status === "approved" ? "approved" : "legacy",
    ...(testFixture ? { "metadata[stripe_mode]": "test", "metadata[test_fixture]": "true", "metadata[test_fixture_initial_total_cents]": String(testFixture.initialTotalCents) } : {}),
  };
  if (customQuote) {
    const allItems = [
      { name: "Veloce platform implementation", amountUsd: setupUsd, recurring: false },
      { name: "Veloce platform subscription", amountUsd: monthlyUsd, recurring: true },
      ...lineItems.map((item) => ({ name: String(item.name ?? "").trim(), amountUsd: Number(item.amountUsd), recurring: item.recurring === true })),
    ];
    const minimumAmount = testFixture ? 0.5 : 1;
    if (allItems.some((item) => !item.name || !Number.isFinite(item.amountUsd) || item.amountUsd < minimumAmount || item.amountUsd > 1_000_000)) return NextResponse.json({ ok: false, error: "invalid_commercial_quote" }, { status: 409 });
    allItems.forEach((item, index) => {
      checkoutBody[`line_items[${index}][price_data][currency]`] = "usd";
      checkoutBody[`line_items[${index}][price_data][unit_amount]`] = Math.round(item.amountUsd * 100);
      checkoutBody[`line_items[${index}][price_data][product_data][name]`] = item.name;
      if (item.recurring) checkoutBody[`line_items[${index}][price_data][recurring][interval]`] = "month";
      checkoutBody[`line_items[${index}][quantity]`] = 1;
    });
  } else {
    checkoutBody["line_items[0][price]"] = process.env.STRIPE_SETUP_PRICE_ID!.trim();
    checkoutBody["line_items[0][quantity]"] = 1;
    checkoutBody["line_items[1][price]"] = process.env.STRIPE_PLATFORM_PRICE_ID!.trim();
    checkoutBody["line_items[1][quantity]"] = 1;
  }
  const sessions = await stripeRequest("checkout/sessions", checkoutBody);
  const sessionId = typeof sessions.value?.id === "string" ? sessions.value.id : null;
  const url = typeof sessions.value?.url === "string" ? sessions.value.url : null;
  if (!sessions.ok || !sessionId || !url) return NextResponse.json({ ok: false, error: "checkout_create_failed" }, { status: 502 });
  await supabaseServiceUpdate("deployment_requests", { id: `eq.${requestId}` }, { billing_status: "checkout_created", stripe_checkout_session_id: sessionId });
  return NextResponse.json({ ok: true, checkoutUrl: url, sessionId });
}
