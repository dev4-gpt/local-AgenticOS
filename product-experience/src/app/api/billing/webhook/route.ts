import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseServiceInsert, supabaseServiceRpc, supabaseServiceSelect, supabaseServiceUpdate, verifyStripeSignature } from "@/lib/publicLaunch";

export const runtime = "nodejs";

const MANAGED_CREDIT_LIFECYCLE_EVENTS = new Set([
  "checkout.session.expired",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
]);

async function storeWebhookEvent(eventId: string, eventType: string, payload: string, status: "processed" | "failed", errorCode: string | null = null) {
  const record = {
    event_id: eventId,
    event_type: eventType,
    payload_hash: createHash("sha256").update(payload).digest("hex"),
    status,
    error_code: errorCode,
  };
  const prior = await supabaseServiceSelect("stripe_webhook_events", { event_id: "eq." + eventId });
  if (!prior.ok) return { ok: false };
  if (prior.rows.length > 0) return supabaseServiceUpdate("stripe_webhook_events", { event_id: "eq." + eventId }, record);
  return supabaseServiceInsert("stripe_webhook_events", record);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export async function POST(request: Request) {
  const payload = await request.text();
  // Webhook delivery only needs the Stripe secret and signing secret. The
  // public-launch setup/platform prices are unrelated to managed-credit plans.
  if (!process.env.STRIPE_SECRET_KEY?.trim() || !verifyStripeSignature(payload, request.headers.get("stripe-signature"))) return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 400 });
  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(payload) as { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_event" }, { status: 400 });
  }
  if (!event.id || !event.type) return NextResponse.json({ ok: false, error: "invalid_event" }, { status: 400 });
  const prior = await supabaseServiceSelect("stripe_webhook_events", { event_id: `eq.${event.id}` });
  if (!prior.ok) return NextResponse.json({ ok: false, error: "event_lookup_failed" }, { status: 502 });
  const object = event.data?.object ?? {};
  const metadata = (object.metadata ?? {}) as Record<string, unknown>;
  if (prior.rows.some((row) => row.status === "processed")) return NextResponse.json({ ok: true, duplicate: true });
  const checkoutPaidEvent = event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded";
  if (checkoutPaidEvent && object.payment_status !== "paid") {
    const stored = await storeWebhookEvent(event.id, event.type, payload, "processed");
    if (!stored.ok) return NextResponse.json({ ok: false, error: "event_store_failed" }, { status: 502 });
    return NextResponse.json({ ok: true, eventId: event.id, status: "awaiting_payment" });
  }
  if (checkoutPaidEvent && metadata.product === "veloce-managed-credits-plan" && typeof metadata.credit_plan_id === "string") {
    const amountTotal = typeof object.amount_total === "number" ? object.amount_total : 0;
    const settled = await supabaseServiceRpc("settle_client_credit_purchase_plan", {
      p_plan_id: metadata.credit_plan_id,
      p_amount_micros: Math.round(amountTotal * 10_000),
      p_stripe_event_id: event.id,
      p_stripe_checkout_session_id: typeof object.id === "string" ? object.id : null,
      p_metadata: { source: "stripe", product: "veloce-managed-credits-plan", stripeMode: metadata.stripe_mode === "live" ? "live" : "test", paymentIntentId: typeof object.payment_intent === "string" ? object.payment_intent : null },
    });
    if (!settled.ok || settled.value !== true) {
      if (prior.rows.length > 0) await supabaseServiceUpdate("stripe_webhook_events", { event_id: `eq.${event.id}` }, { status: "failed", error_code: "credit_plan_settlement_failed" });
      else await supabaseServiceInsert("stripe_webhook_events", { event_id: event.id, event_type: event.type, payload_hash: createHash("sha256").update(payload).digest("hex"), status: "failed", error_code: "credit_plan_settlement_failed" });
      return NextResponse.json({ ok: false, error: "credit_plan_settlement_failed" }, { status: 502 });
    }
    const planUpdate = await supabaseServiceUpdate("client_credit_purchase_plans", { id: `eq.${metadata.credit_plan_id}` }, {
      stripe_payment_intent_id: stringValue(object.payment_intent),
      stripe_mode: metadata.stripe_mode === "live" ? "live" : "test",
      reconciliation_status: "matched",
      updated_at: new Date().toISOString(),
    });
    if (!planUpdate.ok || planUpdate.rows.length === 0) {
      if (prior.rows.length > 0) await supabaseServiceUpdate("stripe_webhook_events", { event_id: `eq.${event.id}` }, { status: "failed", error_code: "credit_plan_metadata_update_failed" });
      else await supabaseServiceInsert("stripe_webhook_events", { event_id: event.id, event_type: event.type, payload_hash: createHash("sha256").update(payload).digest("hex"), status: "failed", error_code: "credit_plan_metadata_update_failed" });
      return NextResponse.json({ ok: false, error: "credit_plan_metadata_update_failed" }, { status: 502 });
    }
    const stored = await storeWebhookEvent(event.id, event.type, payload, "processed");
    if (!stored.ok) return NextResponse.json({ ok: false, error: "event_store_failed" }, { status: 502 });
    return NextResponse.json({ ok: true, eventId: event.id, status: "processed" });
  }

  if (MANAGED_CREDIT_LIFECYCLE_EVENTS.has(event.type)) {
    const paymentIntentId = stringValue(object.payment_intent) || stringValue(object.id);
    let creditPlanId = stringValue(metadata.credit_plan_id);
    if (!creditPlanId && paymentIntentId) {
      const matchingPlan = await supabaseServiceSelect("client_credit_purchase_plans", { stripe_payment_intent_id: "eq." + paymentIntentId });
      creditPlanId = stringValue(matchingPlan.rows[0]?.id);
    }
    if (!creditPlanId) {
      const stored = await storeWebhookEvent(event.id, event.type, payload, "failed", "credit_plan_metadata_missing");
      if (!stored.ok) return NextResponse.json({ ok: false, error: "event_store_failed" }, { status: 502 });
      return NextResponse.json({ ok: false, error: "credit_plan_metadata_missing" }, { status: 422 });
    }

    const amountMicros = typeof object.amount_refunded === "number"
      ? Math.round(object.amount_refunded * 10_000)
      : 0;
    const lifecycle = await supabaseServiceRpc("record_client_credit_purchase_lifecycle_event", {
      p_plan_id: creditPlanId,
      p_event_type: event.type,
      p_stripe_event_id: event.id,
      p_amount_micros: amountMicros,
      p_metadata: {
        source: "stripe",
        stripeMode: metadata.stripe_mode === "live" ? "live" : "test",
        payment_intent_id: paymentIntentId,
        checkout_session_id: stringValue(object.id),
        failure_reason: stringValue((object.last_payment_error as Record<string, unknown> | undefined)?.message),
      },
    });
    if (!lifecycle.ok || lifecycle.value !== true) {
      const stored = await storeWebhookEvent(event.id, event.type, payload, "failed", "credit_plan_lifecycle_failed");
      if (!stored.ok) return NextResponse.json({ ok: false, error: "event_store_failed" }, { status: 502 });
      return NextResponse.json({ ok: false, error: "credit_plan_lifecycle_failed" }, { status: 502 });
    }
    const stored = await storeWebhookEvent(event.id, event.type, payload, "processed");
    if (!stored.ok) return NextResponse.json({ ok: false, error: "event_store_failed" }, { status: 502 });
    return NextResponse.json({ ok: true, eventId: event.id, status: "processed" });
  }

  const requestId = typeof metadata.request_id === "string" ? metadata.request_id : null;
  // Record processed only after all required effects succeed. A failed write
  // must return non-2xx so Stripe retries the event instead of losing it.
  const effectFailed = () => NextResponse.json({ ok: false, error: "billing_effect_failed" }, { status: 502 });
  if (requestId && checkoutPaidEvent) {
    const customerId = typeof object.customer === "string" ? object.customer : null;
    const subscriptionId = typeof object.subscription === "string" ? object.subscription : null;
    const requestUpdate = await supabaseServiceUpdate("deployment_requests", { id: `eq.${requestId}` }, { billing_status: "succeeded", stripe_customer_id: customerId, stripe_checkout_session_id: typeof object.id === "string" ? object.id : null });
    if (!requestUpdate.ok || !requestUpdate.rows.length) return effectFailed();
    const onboarding = await supabaseServiceSelect("client_onboarding_accounts", { request_id: `eq.${requestId}` });
    if (!onboarding.ok || !onboarding.rows[0]?.id) return effectFailed();
    // Retried/out-of-order checkout delivery must not move an activated or
    // suspended account back into the onboarding funnel.
    const onboardingUpdate = await supabaseServiceUpdate("client_onboarding_accounts", { id: `eq.${onboarding.rows[0].id}`, status: "in.(requested,email_verified,payment_pending,payment_succeeded,manifest_review)" }, { status: "manifest_review", stripe_customer_id: customerId, stripe_subscription_id: subscriptionId, setup_payment_id: typeof object.payment_intent === "string" ? object.payment_intent : null, updated_at: new Date().toISOString() });
    if (!onboardingUpdate.ok) return effectFailed();
  }
  if (checkoutPaidEvent && metadata.product === "veloce-managed-credits" && typeof metadata.tenant_slug === "string") {
    const amountTotal = typeof object.amount_total === "number" ? object.amount_total : 0;
    const credited = await supabaseServiceRpc("credit_client_managed_wallet", { p_tenant_slug: metadata.tenant_slug, p_amount_micros: Math.round(amountTotal * 10_000), p_stripe_event_id: event.id, p_metadata: { source: "stripe", sessionId: object.id ?? null, stripeMode: metadata.stripe_mode === "live" ? "live" : "test", paymentIntentId: typeof object.payment_intent === "string" ? object.payment_intent : null } });
    if (!credited.ok || credited.value !== true) return effectFailed();
  }
  if (requestId && event.type === "invoice.payment_failed") {
    const updated = await supabaseServiceUpdate("deployment_requests", { id: `eq.${requestId}` }, { billing_status: "failed" });
    if (!updated.ok || !updated.rows.length) return effectFailed();
  }
  if (event.type === "customer.subscription.deleted" && typeof object.customer === "string" && typeof object.id === "string") {
    const updated = await supabaseServiceUpdate("client_onboarding_accounts", { stripe_customer_id: `eq.${object.customer}`, stripe_subscription_id: `eq.${object.id}` }, { status: "suspended", suspended_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (!updated.ok) return effectFailed();
    for (const account of updated.rows) {
      if (typeof account.tenant_slug !== "string") continue;
      const suspended = await supabaseServiceUpdate("client_tenants", { slug: `eq.${account.tenant_slug}` }, { status: "suspended", updated_at: new Date().toISOString() });
      if (!suspended.ok) return effectFailed();
    }
  }
  const stored = await storeWebhookEvent(event.id, event.type, payload, "processed");
  if (!stored.ok) return NextResponse.json({ ok: false, error: "event_store_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, eventId: event.id, status: "processed" });
}
