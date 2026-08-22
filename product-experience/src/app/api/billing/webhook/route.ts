import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseServiceInsert, supabaseServiceRpc, supabaseServiceSelect, supabaseServiceUpdate, verifyStripeSignature } from "@/lib/publicLaunch";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.text();
  // Webhook delivery only needs the Stripe secret and signing secret. The
  // public-launch setup/platform prices are unrelated to managed-credit plans.
  if (!process.env.STRIPE_SECRET_KEY?.trim() || !verifyStripeSignature(payload, request.headers.get("stripe-signature"))) return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 400 });
  const event = JSON.parse(payload) as { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  if (!event.id || !event.type) return NextResponse.json({ ok: false, error: "invalid_event" }, { status: 400 });
  const prior = await supabaseServiceSelect("stripe_webhook_events", { event_id: `eq.${event.id}` });
  const object = event.data?.object ?? {};
  const metadata = (object.metadata ?? {}) as Record<string, unknown>;
  if (prior.rows.some((row) => row.status === "processed")) return NextResponse.json({ ok: true, duplicate: true });
  if (event.type === "checkout.session.completed" && metadata.product === "veloce-managed-credits-plan" && typeof metadata.credit_plan_id === "string") {
    const amountTotal = typeof object.amount_total === "number" ? object.amount_total : 0;
    const settled = await supabaseServiceRpc("settle_client_credit_purchase_plan", {
      p_plan_id: metadata.credit_plan_id,
      p_amount_micros: Math.round(amountTotal * 10_000),
      p_stripe_event_id: event.id,
      p_stripe_checkout_session_id: typeof object.id === "string" ? object.id : null,
      p_metadata: { source: "stripe", product: "veloce-managed-credits-plan" },
    });
    if (!settled.ok || settled.value !== true) {
      if (prior.rows.length > 0) await supabaseServiceUpdate("stripe_webhook_events", { event_id: `eq.${event.id}` }, { status: "failed", error_code: "credit_plan_settlement_failed" });
      else await supabaseServiceInsert("stripe_webhook_events", { event_id: event.id, event_type: event.type, payload_hash: createHash("sha256").update(payload).digest("hex"), status: "failed", error_code: "credit_plan_settlement_failed" });
      return NextResponse.json({ ok: false, error: "credit_plan_settlement_failed" }, { status: 502 });
    }
    if (prior.rows.length > 0) await supabaseServiceUpdate("stripe_webhook_events", { event_id: `eq.${event.id}` }, { status: "processed", error_code: null });
    else await supabaseServiceInsert("stripe_webhook_events", { event_id: event.id, event_type: event.type, payload_hash: createHash("sha256").update(payload).digest("hex"), status: "processed" });
    return NextResponse.json({ ok: true, eventId: event.id, status: "processed" });
  }
  const requestId = typeof metadata.request_id === "string" ? metadata.request_id : null;
  const eventRecord = await supabaseServiceInsert("stripe_webhook_events", { event_id: event.id, event_type: event.type, payload_hash: createHash("sha256").update(payload).digest("hex"), status: "processed" });
  if (!eventRecord.ok) return NextResponse.json({ ok: false, error: "event_store_failed" }, { status: 502 });
  if (requestId && event.type === "checkout.session.completed") {
    const customerId = typeof object.customer === "string" ? object.customer : null;
    const subscriptionId = typeof object.subscription === "string" ? object.subscription : null;
    await supabaseServiceUpdate("deployment_requests", { id: `eq.${requestId}` }, { billing_status: "succeeded", stripe_customer_id: customerId, stripe_checkout_session_id: typeof object.id === "string" ? object.id : null });
    const onboarding = await supabaseServiceSelect("client_onboarding_accounts", { request_id: `eq.${requestId}` });
    if (onboarding.rows[0]?.id) {
      await supabaseServiceUpdate("client_onboarding_accounts", { id: `eq.${onboarding.rows[0].id}` }, { status: "manifest_review", stripe_customer_id: customerId, stripe_subscription_id: subscriptionId, setup_payment_id: typeof object.payment_intent === "string" ? object.payment_intent : null, updated_at: new Date().toISOString() });
    }
  }
  if (event.type === "checkout.session.completed" && metadata.product === "veloce-managed-credits" && typeof metadata.tenant_slug === "string") {
    const amountTotal = typeof object.amount_total === "number" ? object.amount_total : 0;
    await supabaseServiceRpc("credit_client_managed_wallet", { p_tenant_slug: metadata.tenant_slug, p_amount_micros: Math.round(amountTotal * 10_000), p_stripe_event_id: event.id, p_metadata: { source: "stripe", sessionId: object.id ?? null } });
  }
  if (requestId && event.type === "invoice.payment_failed") await supabaseServiceUpdate("deployment_requests", { id: `eq.${requestId}` }, { billing_status: "failed" });
  if (event.type === "customer.subscription.deleted" && typeof object.customer === "string") await supabaseServiceUpdate("client_onboarding_accounts", { stripe_customer_id: `eq.${object.customer}` }, { status: "suspended", suspended_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  return NextResponse.json({ ok: true, eventId: event.id, status: "processed" });
}
