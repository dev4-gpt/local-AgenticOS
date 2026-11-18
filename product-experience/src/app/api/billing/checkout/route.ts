import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { allowPublicRequest, readPublicJsonBody } from "@/lib/publicRequestGuard";
import { stripeConfigured, stripeGet, stripeRequest, stripeSecretConfigured, stripeTestFixtureConfig, supabaseServiceSelect, supabaseServiceUpdate } from "@/lib/publicLaunch";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await allowPublicRequest(request, "billing-checkout"))) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  if (!stripeSecretConfigured()) return NextResponse.json({ ok: false, error: "billing_not_configured" }, { status: 503 });
  const parsed = await readPublicJsonBody(request);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error === "too_large" ? "payload_too_large" : "invalid_request" }, { status: parsed.error === "too_large" ? 413 : 400 });
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  const body = parsed.value as { requestId?: unknown; email?: unknown };
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId) || !email) return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  const requests = await supabaseServiceSelect("deployment_requests", { id: `eq.${requestId}`, email: `eq.${email}`, select: "id,email,status,billing_status,email_verified_at,stripe_checkout_session_id" });
  if (!requests.ok || !requests.rows[0]) return NextResponse.json({ ok: false, error: "request_not_found" }, { status: 404 });
  const deployment = requests.rows[0];
  if (typeof deployment.email_verified_at !== "string" || !Number.isFinite(Date.parse(deployment.email_verified_at))) {
    return NextResponse.json({ ok: false, error: "email_verification_required" }, { status: 409 });
  }
  if (deployment.billing_status !== "not_started" && deployment.billing_status !== "checkout_created") {
    return NextResponse.json({ ok: false, error: "billing_review_required" }, { status: 409 });
  }
  const onboarding = await supabaseServiceSelect("client_onboarding_accounts", { request_id: `eq.${requestId}`, select: "id,commercial_scope_status,commercial_scope_quote" });
  if (!onboarding.ok) return NextResponse.json({ ok: false, error: "commercial_scope_lookup_failed" }, { status: 502 });
  const account = onboarding.rows[0];
  if (!account || account.commercial_scope_status !== "approved") return NextResponse.json({ ok: false, error: "commercial_scope_pending" }, { status: 409 });

  const quote = account?.commercial_scope_quote && typeof account.commercial_scope_quote === "object" && !Array.isArray(account.commercial_scope_quote)
    ? account.commercial_scope_quote as { setupUsd?: unknown; monthlyUsd?: unknown; lineItems?: unknown; testFixture?: unknown }
    : null;
  if (!quote) return NextResponse.json({ ok: false, error: "commercial_scope_pending" }, { status: 409 });
  const setupUsd = Number(quote?.setupUsd);
  const monthlyUsd = Number(quote?.monthlyUsd);
  const lineItems = Array.isArray(quote?.lineItems) ? quote.lineItems.filter((item): item is { name?: unknown; amountUsd?: unknown; recurring?: unknown } => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
  if (!Number.isFinite(setupUsd) || !Number.isFinite(monthlyUsd) || !Array.isArray(quote.lineItems) || quote.lineItems.length > 20 || lineItems.length !== quote.lineItems.length) {
    return NextResponse.json({ ok: false, error: "invalid_commercial_quote" }, { status: 409 });
  }
  const testFixture = quote?.testFixture === true ? stripeTestFixtureConfig() : null;
  if (quote?.testFixture === true && !testFixture) return NextResponse.json({ ok: false, error: "stripe_test_fixture_not_configured" }, { status: 503 });
  const customQuote = setupUsd !== 2_500 || monthlyUsd !== 1_250 || lineItems.length > 0;
  if (!customQuote && !stripeConfigured()) return NextResponse.json({ ok: false, error: "billing_not_configured" }, { status: 503 });

  const checkoutBody: Record<string, string | number | string[]> = {
    mode: "subscription",
    client_reference_id: requestId,
    customer_email: email,
    success_url: `${(process.env.PUBLIC_APP_URL || "https://app.veloceos.cloud").replace(/\/$/, "")}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${(process.env.PUBLIC_SITE_URL || "https://veloceos.cloud").replace(/\/$/, "")}/start?billing=cancelled`,
    "metadata[request_id]": requestId,
    "metadata[product]": "veloce-public-launch",
    "metadata[commercial_scope]": "approved",
    ...(testFixture ? { "metadata[stripe_mode]": "test", "metadata[test_fixture]": "true", "metadata[test_fixture_initial_total_cents]": String(testFixture.initialTotalCents) } : {}),
    // Stripe Managed Payments requires tax-coded catalog products. Every
    // customQuote path (the disposable test fixture, and any real negotiated
    // enterprise deal) builds its line items from ad-hoc price_data without
    // a reviewed tax code. Stripe supports product_data.tax_code for inline
    // products; the current opt-out remains until that commercial/tax policy
    // is explicitly reviewed. Do not infer tax compliance from this override.
    // Confirmed live: this failed for a real custom quote in live mode
    // before this fix, not just the test fixture.
    ...(customQuote ? { "managed_payments[enabled]": "false" } : {}),
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
  const fingerprint = createHash("sha256").update(JSON.stringify(checkoutBody)).digest("hex");
  checkoutBody["metadata[checkout_fingerprint]"] = fingerprint;
  if (deployment.billing_status === "checkout_created" || deployment.stripe_checkout_session_id) {
    const existingId = deployment.stripe_checkout_session_id;
    if (typeof existingId !== "string" || !/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(existingId)) return NextResponse.json({ ok: false, error: "checkout_reconciliation_required" }, { status: 409 });
    const existing = await stripeGet(`checkout/sessions/${encodeURIComponent(existingId)}`);
    if (!existing.ok || !existing.value) return NextResponse.json({ ok: false, error: "checkout_lookup_failed" }, { status: 502 });
    const metadata = existing.value.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || (metadata as Record<string, unknown>).checkout_fingerprint !== fingerprint) {
      return NextResponse.json({ ok: false, error: "checkout_reconciliation_required" }, { status: 409 });
    }
    if (existing.value.status !== "open" || typeof existing.value.url !== "string") return NextResponse.json({ ok: false, error: "checkout_not_open" }, { status: 409 });
    return NextResponse.json({ ok: true, checkoutUrl: existing.value.url, sessionId: existingId, reused: true });
  }
  const sessions = await stripeRequest("checkout/sessions", checkoutBody, `veloce-checkout:${requestId}:${fingerprint}`);
  const sessionId = typeof sessions.value?.id === "string" ? sessions.value.id : null;
  const url = typeof sessions.value?.url === "string" ? sessions.value.url : null;
  if (!sessions.ok || !sessionId || !url) return NextResponse.json({ ok: false, error: "checkout_create_failed" }, { status: 502 });
  const saved = await supabaseServiceUpdate("deployment_requests", { id: `eq.${requestId}`, billing_status: "eq.not_started", stripe_checkout_session_id: "is.null" }, { billing_status: "checkout_created", stripe_checkout_session_id: sessionId });
  if (!saved.ok) return NextResponse.json({ ok: false, error: "checkout_store_failed" }, { status: 502 });
  if (saved.rows.length !== 1) return NextResponse.json({ ok: false, error: "checkout_state_changed" }, { status: 409 });
  return NextResponse.json({ ok: true, checkoutUrl: url, sessionId });
}
