import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";
import { loadReviewModule } from "./helpers/load-review-module";

test("public intake rejects silent truncation and cross-request idempotency collisions", async () => {
  const priorUrl = process.env.SUPABASE_URL;
  const priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const priorTurnstile = process.env.TURNSTILE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-key";
  process.env.TURNSTILE_SECRET_KEY = "";
  let selected = 0;
  let stored = 0;
  const prior = { id: "existing-request", email: "other@example.test", name: "Other", company: "Other Co", workflow: "Other work" };
  try {
    const route = loadReviewModule("product-experience/src/app/api/deployment-request/route.ts", {
      "@/lib/publicRequestGuard": { allowPublicRequest: async () => true, payloadTooLarge: () => false },
      "@/lib/leadNotification": { notifyLead: async () => {} },
      "@/lib/commercialScope": { normalizeCommercialScopeInputs: () => ({}), recommendCommercialScope: () => ({ version: "test" }) },
      "@/lib/publicLaunch": {
        publicEmail: (value: string) => value.includes("@") ? value.toLowerCase() : null,
        requestId: () => "new-request",
        hashSetupToken: () => "hash",
        sendSetupEmail: async () => "sent",
        supabaseServiceInsert: async () => { stored += 1; return { ok: true, rows: [{ id: "new-onboarding" }] }; },
        supabaseServiceSelect: async () => { selected += 1; return { ok: true, rows: [prior] }; },
      },
    });
    const baseline = { name: "Buyer", email: "buyer@example.test", company: "Buyer Co", workflow: "Analyze intake", termsAccepted: true, privacyAccepted: true };
    const request = (body: unknown) => new Request("http://localhost/api/deployment-request", { method: "POST", body: JSON.stringify(body) });
    const oversized = await route.POST(request({ ...baseline, workflow: "a".repeat(4_001) }));
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toMatchObject({ error: "field_too_large" });
    const malformed = await route.POST(request({ ...baseline, company: { value: "Buyer Co" } }));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: "invalid_fields" });
    const longEmail = await route.POST(request({ ...baseline, email: `buyer@${"a".repeat(315)}.test` }));
    expect(longEmail.status).toBe(400);
    expect(await longEmail.json()).toMatchObject({ error: "invalid_email" });
    expect(selected).toBe(0);
    expect(stored).toBe(0);

    const collision = await route.POST(request({ ...baseline, idempotencyKey: "same-key" }));
    expect(collision.status).toBe(409);
    expect(await collision.json()).toMatchObject({ error: "idempotency_conflict" });
    expect(selected).toBe(1);
    expect(stored).toBe(0);
  } finally {
    if (priorUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = priorUrl;
    if (priorKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = priorKey;
    if (priorTurnstile === undefined) delete process.env.TURNSTILE_SECRET_KEY; else process.env.TURNSTILE_SECRET_KEY = priorTurnstile;
  }
});

test("Checkout does not create a session before email verification", async () => {
  const requestId = "00000000-0000-4000-8000-000000000009";
  let verifiedAt: string | null = null;
  let billingStatus = "not_started";
  let existingId: string | null = null;
  let accountStatus = "approved";
  let onboardingOk = true;
  let savedOk = true;
  let quote = { setupUsd: 50, monthlyUsd: 50, lineItems: [] as unknown[] };
  let created = 0;
  let fetched = 0;
  const keys: string[] = [];
  let fingerprint = "";
  const route = loadReviewModule("product-experience/src/app/api/billing/checkout/route.ts", {
    "@/lib/publicRequestGuard": { allowPublicRequest: async () => true },
    "@/lib/publicLaunch": {
      stripeSecretConfigured: () => true,
      stripeConfigured: () => true,
      stripeTestFixtureConfig: () => null,
      supabaseServiceSelect: async (table: string) => table === "deployment_requests"
        ? { ok: true, rows: [{ id: requestId, email: "buyer@example.test", email_verified_at: verifiedAt, billing_status: billingStatus, stripe_checkout_session_id: existingId }] }
        : { ok: onboardingOk, rows: [{ id: "onboarding-1", commercial_scope_status: accountStatus, commercial_scope_quote: quote }] },
      stripeRequest: async (_path: string, body: Record<string, unknown>, key: string) => {
        created += 1;
        fingerprint = String(body["metadata[checkout_fingerprint]"]);
        keys.push(key);
        return { ok: true, value: { id: "cs_test_session1", url: "https://checkout.example.test/session-1" } };
      },
      stripeGet: async () => { fetched += 1; return { ok: true, value: { id: existingId, status: "open", url: "https://checkout.example.test/session-1", metadata: { checkout_fingerprint: fingerprint } } }; },
      supabaseServiceUpdate: async () => ({ ok: savedOk, rows: savedOk ? [{ id: requestId }] : [] }),
    },
  });
  const request = () => new Request("http://localhost/api/billing/checkout", { method: "POST", body: JSON.stringify({ requestId, email: "buyer@example.test" }) });
  const premature = await route.POST(request());
  expect(premature.status).toBe(409);
  expect(await premature.json()).toMatchObject({ error: "email_verification_required" });
  expect(created).toBe(0);
  verifiedAt = new Date().toISOString();
  onboardingOk = false;
  const lookupFailure = await route.POST(request());
  expect(lookupFailure.status).toBe(502);
  expect(created).toBe(0);
  onboardingOk = true;
  accountStatus = "recommended";
  const unapproved = await route.POST(request());
  expect(unapproved.status).toBe(409);
  expect(await unapproved.json()).toMatchObject({ error: "commercial_scope_pending" });
  expect(created).toBe(0);
  accountStatus = "approved";
  quote = { setupUsd: 50, monthlyUsd: 50, lineItems: [null] };
  const malformedQuote = await route.POST(request());
  expect(malformedQuote.status).toBe(409);
  expect(await malformedQuote.json()).toMatchObject({ error: "invalid_commercial_quote" });
  expect(created).toBe(0);
  quote = { setupUsd: 50, monthlyUsd: 50, lineItems: [] };
  const approved = await route.POST(request());
  expect(approved.status).toBe(200);
  expect(await approved.json()).toMatchObject({ ok: true, sessionId: "cs_test_session1" });
  expect(created).toBe(1);
  expect(keys[0]).toMatch(/^veloce-checkout:[0-9a-f-]{36}:[a-f0-9]{64}$/);
  billingStatus = "checkout_created";
  existingId = "cs_test_session1";
  const retry = await route.POST(request());
  expect(retry.status).toBe(200);
  expect(await retry.json()).toMatchObject({ ok: true, reused: true, sessionId: existingId });
  expect(created).toBe(1);
  expect(fetched).toBe(1);
  quote = { setupUsd: 75, monthlyUsd: 50, lineItems: [] };
  const changedQuote = await route.POST(request());
  expect(changedQuote.status).toBe(409);
  expect(await changedQuote.json()).toMatchObject({ error: "checkout_reconciliation_required" });
  expect(created).toBe(1);
  quote = { setupUsd: 50, monthlyUsd: 50, lineItems: [] };
  billingStatus = "succeeded";
  const alreadyPaid = await route.POST(request());
  expect(alreadyPaid.status).toBe(409);
  expect(created).toBe(1);
  billingStatus = "not_started";
  existingId = null;
  savedOk = false;
  const storeFailure = await route.POST(request());
  expect(storeFailure.status).toBe(502);
  expect(await storeFailure.json()).toMatchObject({ error: "checkout_store_failed" });
  expect(keys[1]).toBe(keys[0]);
});

test("Stripe transport sends the idempotency key only on the creating POST", async () => {
  const savedKey = process.env.STRIPE_SECRET_KEY;
  const originalFetch = globalThis.fetch;
  const calls: Array<{ method: string; key: string | null; url: string }> = [];
  try {
    process.env.STRIPE_SECRET_KEY = "sk_test_local_fixture_not_live";
    globalThis.fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      calls.push({ method: init?.method ?? "GET", key: headers.get("Idempotency-Key"), url: String(input) });
      return Response.json({ id: "cs_test_session1" });
    };
    const launch = loadReviewModule("product-experience/src/lib/publicLaunch.ts", {});
    expect((await launch.stripeRequest("checkout/sessions", { mode: "subscription" }, "stable-request-key")).ok).toBe(true);
    expect((await launch.stripeGet("checkout/sessions/cs_test_session1")).ok).toBe(true);
    expect(calls).toEqual([
      { method: "POST", key: "stable-request-key", url: "https://api.stripe.com/v1/checkout/sessions" },
      { method: "GET", key: null, url: "https://api.stripe.com/v1/checkout/sessions/cs_test_session1" },
    ]);
  } finally {
    if (savedKey === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = savedKey;
    globalThis.fetch = originalFetch;
  }
});

test("paid public-launch webhooks bind to the recorded Checkout session", async () => {
  const priorKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_local_fixture_not_live";
  const requestId = "00000000-0000-4000-8000-000000000009";
  let recordedSessionId: string | null = "cs_test_expected";
  const writes: Array<{ table: string; filters: Record<string, string> }> = [];
  const failures: string[] = [];
  try {
    const route = loadReviewModule("product-experience/src/app/api/billing/webhook/route.ts", {
      "@/lib/publicLaunch": {
        verifyStripeSignature: () => true,
        supabaseServiceSelect: async (table: string) => ({ ok: true, rows: table === "deployment_requests"
          ? [{ id: requestId, stripe_checkout_session_id: recordedSessionId }]
          : table === "client_onboarding_accounts" ? [{ id: "onboarding-1" }] : [] }),
        supabaseServiceUpdate: async (table: string, filters: Record<string, string>) => {
          writes.push({ table, filters });
          return { ok: true, rows: [{ id: table === "client_onboarding_accounts" ? "onboarding-1" : requestId }] };
        },
        supabaseServiceInsert: async (table: string, record: Record<string, unknown>) => {
          if (table === "stripe_webhook_events" && record.status === "failed") failures.push(String(record.error_code));
          return { ok: true, rows: [record] };
        },
      },
    });
    const event = (sessionId: string) => new Request("https://control.invalid/api/billing/webhook", { method: "POST", body: JSON.stringify({
      id: `evt_${sessionId}`, type: "checkout.session.completed", data: { object: {
        id: sessionId, payment_status: "paid", customer: "cus_test", subscription: "sub_test",
        metadata: { product: "veloce-public-launch", request_id: requestId },
      } },
    }) });
    const mismatch = await route.POST(event("cs_test_other"));
    expect(mismatch.status).toBe(422);
    expect(await mismatch.json()).toMatchObject({ error: "checkout_session_mismatch" });
    expect(writes).toHaveLength(0);
    expect(failures).toEqual(["checkout_session_mismatch"]);

    const matched = await route.POST(event("cs_test_expected"));
    expect(matched.status).toBe(200);
    expect(writes[0]).toEqual({ table: "deployment_requests", filters: { id: `eq.${requestId}`, stripe_checkout_session_id: "eq.cs_test_expected" } });

    writes.length = 0;
    recordedSessionId = null;
    const recovered = await route.POST(event("cs_test_recovered"));
    expect(recovered.status).toBe(200);
    expect(writes[0]).toEqual({ table: "deployment_requests", filters: { id: `eq.${requestId}`, stripe_checkout_session_id: "is.null" } });
  } finally {
    if (priorKey === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = priorKey;
  }
});

test("signed checkout webhooks reject tampering and do not replay or regress an activated account", async () => {
  const priorKey = process.env.STRIPE_SECRET_KEY;
  const priorWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_SECRET_KEY = "sk_test_local_fixture_not_live";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_local_fixture_not_live";
  const requestId = "00000000-0000-4000-8000-000000000009";
  const events = new Map<string, Record<string, unknown>>();
  const writes: string[] = [];
  let onboardingStatus = "activated";
  try {
    const launch = loadReviewModule("product-experience/src/lib/publicLaunch.ts", {});
    const route = loadReviewModule("product-experience/src/app/api/billing/webhook/route.ts", {
      "@/lib/publicLaunch": {
        verifyStripeSignature: launch.verifyStripeSignature,
        supabaseServiceSelect: async (table: string, filters: Record<string, string>) => {
          if (table === "stripe_webhook_events") return { ok: true, rows: events.has(filters.event_id.slice(3)) ? [events.get(filters.event_id.slice(3))] : [] };
          if (table === "deployment_requests") return { ok: true, rows: [{ id: requestId, stripe_checkout_session_id: "cs_test_same" }] };
          if (table === "client_onboarding_accounts") return { ok: true, rows: [{ id: "onboarding-1", status: onboardingStatus }] };
          return { ok: true, rows: [] };
        },
        supabaseServiceUpdate: async (table: string, filters: Record<string, string>, value: Record<string, unknown>) => {
          writes.push(table);
          if (table === "stripe_webhook_events") {
            events.set(filters.event_id.slice(3), { ...events.get(filters.event_id.slice(3)), ...value });
            return { ok: true, rows: [value] };
          }
          if (table === "client_onboarding_accounts") {
            if (onboardingStatus === "activated" && filters.status?.startsWith("in.")) return { ok: true, rows: [] };
            onboardingStatus = String(value.status);
          }
          return { ok: true, rows: [value] };
        },
        supabaseServiceInsert: async (table: string, value: Record<string, unknown>) => {
          writes.push(table);
          if (table === "stripe_webhook_events") events.set(String(value.event_id), value);
          return { ok: true, rows: [value] };
        },
      },
    });
    const event = (id: string, paymentStatus = "paid") => JSON.stringify({ id, type: "checkout.session.completed", data: { object: {
      id: "cs_test_same", payment_status: paymentStatus, customer: "cus_test", subscription: "sub_test",
      metadata: { product: "veloce-public-launch", request_id: requestId },
    } } });
    const request = (payload: string, valid = true) => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET!).update(`${timestamp}.${valid ? payload : "different"}`).digest("hex");
      return new Request("https://control.invalid/api/billing/webhook", { method: "POST", headers: { "stripe-signature": `t=${timestamp},v1=${signature}` }, body: payload });
    };
    const payload = event("evt_same");
    expect((await route.POST(request(payload, false))).status).toBe(400);
    expect(writes).toHaveLength(0);
    const first = await route.POST(request(payload));
    expect(first.status).toBe(200);
    expect(onboardingStatus).toBe("activated");
    const writesAfterFirst = writes.length;
    const duplicate = await route.POST(request(payload));
    expect(await duplicate.json()).toMatchObject({ ok: true, duplicate: true });
    expect(writes).toHaveLength(writesAfterFirst);
    const conflict = await route.POST(request(event("evt_same", "unpaid")));
    expect(conflict.status).toBe(422);
    expect(await conflict.json()).toMatchObject({ error: "event_identity_conflict" });
    expect(writes).toHaveLength(writesAfterFirst);
    const late = await route.POST(request(event("evt_late")));
    expect(late.status).toBe(200);
    expect(onboardingStatus).toBe("activated");
  } finally {
    if (priorKey === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = priorKey;
    if (priorWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = priorWebhookSecret;
  }
});
