import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { loadReviewModule } from "./helpers/load-review-module";
import { clientExecutionCredential } from "../src/lib/clientExecutionCredential";
import { runClientTextAdapter } from "../src/lib/clientProviderAdapter";
import { transcribeWithGroq } from "../src/lib/groqSpeech";
import { readClientExportPages } from "../scripts/lib/client-export-pages.mjs";

const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;
test.afterEach(() => { process.env = { ...savedEnv }; globalThis.fetch = realFetch; });

for (const route of ["credential-submissions", "credentials/revoke"]) {
  test(`${route}: viewer/member are rejected before any Google write`, async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error("No network allowed"); };
    const module = loadReviewModule(`src/app/api/client-runtime/${route}/route.ts`, {
      "@/lib/clientAuth": { currentClientUser: async () => ({ id: "viewer" }), currentClientMember: async () => true, currentClientCredentialManager: async () => false },
      "@/lib/clientDataPlane": { checkClientRuntimeRateLimit: async () => { calls++; return { ok: true, allowed: true }; } },
      "@/lib/clientCredentialCatalog": {}, "@/lib/clientRuntimePolicy": {}, "@/lib/clientInputSafety": {},
      "@/lib/publicProviderCatalog": {}, "@/lib/clientActivationManifest": {},
    });
    const result = await module.POST(new Request("https://tenant.invalid", { method: "POST" }));
    expect(result.status).toBe(403);
    expect(await result.json()).toMatchObject({ error: "credential_admin_required" });
    expect(calls).toBe(0);
  });
}

test("credential manager resolves the caller's tenant role and denies malformed/unavailable reads", async () => {
  process.env.SUPABASE_URL = "https://db.invalid"; process.env.SUPABASE_ANON_KEY = "anon"; process.env.CLIENT_SLUG = "tenant-a";
  delete process.env.VELOCE_CLIENT_EDITION;
  const mod = loadReviewModule("src/lib/clientAuth.ts", { "next/headers": { cookies: async () => ({ get: () => ({ value: "session" }) }) } });
  for (const role of ["owner", "admin", "member", "viewer", null]) {
    globalThis.fetch = async (url) => {
      if (String(url).includes("/auth/v1/user")) return Response.json({ id: "user-a" });
      const query = new URL(String(url)).searchParams;
      expect(query.get("tenant_slug")).toBe("eq.tenant-a"); expect(query.get("user_id")).toBe("eq.user-a");
      return Response.json(role ? [{ role }] : null);
    };
    expect(await mod.currentClientCredentialManager()).toBe(role === "owner" || role === "admin");
  }
  globalThis.fetch = async () => { throw new Error("offline"); };
  expect(await mod.currentClientCredentialManager()).toBe(false);
});

function tenantEnv() {
  Object.assign(process.env, { VELOCE_CLIENT_EDITION: "1", SUPABASE_URL: "https://db.invalid", SUPABASE_ANON_KEY: "anon", CLIENT_SLUG: "tenant-a", CLIENT_WORKER_TOKEN: "worker-test-token-at-least-24", OPENAI_API_KEY: "test-existing-loaded-key", GROQ_API_KEY: "test-existing-groq-key", CLIENT_PROVIDER_CALLS_ENABLED: "1", CLIENT_PROVIDER_ALLOWLIST: "OPENAI_API_KEY", CLIENT_MODEL_ALLOWLIST: "gpt-4o-mini" });
}

test("credential admission rechecks revocation without caching and fails closed on bad RPCs", async () => {
  tenantEnv();
  let allowed: unknown = true;
  globalThis.fetch = async (url, init) => {
    expect(String(url)).toBe("https://db.invalid/rest/v1/rpc/client_provider_execution_allowed");
    expect(JSON.parse(String(init?.body))).toMatchObject({ p_tenant_slug: "tenant-a", p_provider_key: "OPENAI_API_KEY" });
    expect(init?.cache).toBe("no-store");
    return Response.json(allowed);
  };
  expect(await clientExecutionCredential("OPENAI_API_KEY")).toBe("test-existing-loaded-key");
  for (const denied of [false, null, "true", {}, []]) {
    allowed = denied;
    expect(await clientExecutionCredential("OPENAI_API_KEY")).toBeNull();
  }
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  expect(await clientExecutionCredential("OPENAI_API_KEY")).toBeNull();
  globalThis.fetch = async () => { throw new Error("offline"); };
  expect(await clientExecutionCredential("OPENAI_API_KEY")).toBeNull();
});

test("revoked text and speech credentials produce zero upstream calls despite loaded env keys", async () => {
  tenantEnv();
  let admissions = 0;
  globalThis.fetch = async (url) => {
    expect(String(url)).toContain("/rpc/client_provider_execution_allowed");
    admissions++; return Response.json(false);
  };
  const result = await runClientTextAdapter({ provider: "openai", prompt: "hello", reserveBudget: false });
  expect(result).toMatchObject({ ok: false, error: "provider_not_configured" });
  await expect(transcribeWithGroq({ audio: Buffer.from("audio"), filename: "a.webm", contentType: "audio/webm" })).rejects.toThrow("groq_not_configured");
  expect(admissions).toBe(2);
});

test("delivery rejects upstream redirects with the tenant payload", async () => {
  const mod = loadReviewModule("src/lib/clientDeliveryAdapter.ts", { "@/lib/clientSeoAdapter": { resolveSafePublicUrl: async (value: string) => value } });
  process.env.CLIENT_DELIVERY_ALLOWED_HOSTS = "approved.invalid";
  let sends = 0;
  globalThis.fetch = async (_url, init) => { sends++; expect(init?.redirect).toBe("error"); throw new TypeError("redirect rejected"); };
  expect(await mod.runClientDeliveryAdapter({ action: "handoff", destination: "https://approved.invalid", artifactIds: ["private-artifact"] })).toMatchObject({ ok: false });
  expect(sends).toBe(1);
});

test("export reads beyond the PostgREST row cap and never silently accepts invalid pages", async () => {
  const source = Array.from({ length: 1203 }, (_, id) => ({ id, tenant_slug: "tenant-a" }));
  const offsets: number[] = [];
  const request = async (path: string) => {
    const q = new URL(`https://db.invalid/${path}`).searchParams;
    expect(q.get("tenant_slug")).toBe("eq.tenant-a"); expect(q.get("order")).toBe("id");
    const offset = Number(q.get("offset")); offsets.push(offset);
    return Response.json(source.slice(offset, offset + 300));
  };
  const input = { table: "client_runtime_records", filter: "tenant_slug=eq.tenant-a", columns: "id,tenant_slug", request };
  expect(await readClientExportPages(input)).toEqual(source);
  expect(offsets).toEqual([0, 300, 600, 900, 1200, 1203]);
  await expect(readClientExportPages({ ...input, request: async () => Response.json({ error: "bad" }) })).rejects.toThrow("invalid rows");
  await expect(readClientExportPages({ ...input, request: async () => Response.json([{ id: 1 }]) })).rejects.toThrow("did not advance");
  await expect(readClientExportPages({ ...input, request: async () => new Response("", { status: 503 }) })).rejects.toThrow("Export failed");
});

test("provisioning refuses activation when its approved monthly cap cannot persist, including a zero cap", async () => {
  process.env.CONTROL_PLANE_OPERATOR_SECRET = "operator-test";
  const writes: Array<{ table: string; record: Record<string, unknown> }> = [];
  const mod = loadReviewModule("product-experience/src/app/api/onboarding/provision-result/route.ts", {
    "@/lib/publicLaunch": {
      supabaseServiceSelect: async (table: string) => ({ ok: true, rows: table === "client_provisioning_runs" ? [{ onboarding_id: "onboarding-a" }] : [{ approved_manifest: { clientSlug: "tenant-a", budget: { monthlyCap: 0 } } }] }),
      supabaseServiceUpdate: async (table: string, _filters: unknown, record: Record<string, unknown>) => { writes.push({ table, record }); return { ok: true }; },
      supabaseServiceUpsert: async (table: string, record: Record<string, unknown>) => { writes.push({ table, record }); return { ok: table !== "client_credit_accounts" }; },
    },
  });
  const result = await mod.POST(new Request("https://control.invalid", { method: "POST", headers: { "x-control-plane-secret": "operator-test", "Content-Type": "application/json" }, body: JSON.stringify({ runId: "run-a", status: "succeeded", resourceManifest: { phase: "deploy", runtimeUrl: "https://tenant-a.run.app", clientSlug: "tenant-a", clientName: "Tenant A", retentionDays: 30 }, evidenceBundle: { smoke: { ok: true, url: "https://tenant-a.run.app" } } }) }));
  expect(result.status).toBe(502);
  expect(await result.json()).toMatchObject({ error: "managed_credit_cap_persist_failed" });
  expect(writes.find((w) => w.table === "client_credit_accounts")?.record.monthly_cap_micros).toBe(0);
  expect(writes.some((w) => w.table === "client_onboarding_accounts")).toBe(false);
});

test("provisioning accepts a validated decimal-string monthly cap and persists it in micros", async () => {
  process.env.CONTROL_PLANE_OPERATOR_SECRET = "operator-test";
  const writes: Array<{ table: string; record: Record<string, unknown> }> = [];
  const mod = loadReviewModule("product-experience/src/app/api/onboarding/provision-result/route.ts", {
    "@/lib/publicLaunch": {
      supabaseServiceSelect: async (table: string) => ({ ok: true, rows: table === "client_provisioning_runs" ? [{ onboarding_id: "onboarding-a" }] : [{ approved_manifest: { clientSlug: "tenant-a", budget: { monthlyCap: "0.25", warningThreshold: "0.20" } } }] }),
      supabaseServiceUpdate: async (table: string, _filters: unknown, record: Record<string, unknown>) => { writes.push({ table, record }); return { ok: true }; },
      supabaseServiceUpsert: async (table: string, record: Record<string, unknown>) => { writes.push({ table, record }); return { ok: true }; },
    },
  });
  const result = await mod.POST(new Request("https://control.invalid", { method: "POST", headers: { "x-control-plane-secret": "operator-test", "Content-Type": "application/json" }, body: JSON.stringify({ runId: "run-a", status: "succeeded", resourceManifest: { phase: "deploy", runtimeUrl: "https://tenant-a.run.app", clientSlug: "tenant-a", clientName: "Tenant A", retentionDays: 30 }, evidenceBundle: { smoke: { ok: true, url: "https://tenant-a.run.app" } } }) }));
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ ok: true, activationReady: true });
  expect(writes.find((w) => w.table === "client_credit_accounts")?.record).toMatchObject({ tenant_slug: "tenant-a", monthly_cap_micros: 250000, warning_threshold_micros: 200000 });
  expect(writes.find((w) => w.table === "client_onboarding_accounts")?.record).toMatchObject({ status: "smoke_testing", tenant_slug: "tenant-a", runtime_url: "https://tenant-a.run.app" });
});

test("activation fails closed when its setup email is not accepted", async () => {
  process.env.CONTROL_PLANE_OPERATOR_SECRET = "operator-test";
  const updates: Array<{ table: string; record: Record<string, unknown> }> = [];
  const mod = loadReviewModule("product-experience/src/app/api/onboarding/activate/route.ts", {
    "@/lib/publicLaunch": {
      hashSetupToken: () => "hashed-token",
      sendSetupEmail: async () => "failed",
      supabaseServiceInsert: async () => ({ ok: true, rows: [{ id: "token-a" }] }),
      supabaseServiceSelect: async (table: string) => ({
        ok: true,
        rows: table === "client_onboarding_accounts"
          ? [{ request_id: "request-a", email: "owner@example.com", status: "smoke_testing", tenant_slug: "tenant-a", runtime_url: "https://tenant-a.run.app" }]
          : table === "client_provisioning_runs"
            ? [{ evidence_bundle: { smoke: { ok: true, url: "https://tenant-a.run.app" } } }]
            : [{ name: "Tenant A" }],
      }),
      supabaseServiceUpdate: async (table: string, _filters: unknown, record: Record<string, unknown>) => { updates.push({ table, record }); return { ok: true }; },
    },
  });
  const result = await mod.POST(new Request("https://control.invalid", { method: "POST", headers: { "x-control-plane-secret": "operator-test", "Content-Type": "application/json" }, body: JSON.stringify({ onboardingId: "onboarding-a" }) }));
  expect(result.status).toBe(502);
  expect(await result.json()).toMatchObject({ error: "setup_email_delivery_failed", delivery: "failed" });
  expect(updates).toEqual([]);
});

test("integration runtime rejects missing, blank and pending provenance for enabled high-risk entries", () => {
  for (const field of ["sbomReference", "provenanceReference"]) {
    for (const missing of [null, "", "  ", " pending:review", "Pending:review"]) {
      const entry = { id: "test", state: "native-enabled", riskTier: "high", sbomReference: "sha256:evidence", provenanceReference: "https://evidence.invalid", [field]: missing };
      const mod = loadReviewModule("product-experience/src/lib/integrationCatalogBroker.ts", { "../data/integration-control-plane.manifest.json": { integrations: [entry] } });
      expect(mod.isIntegrationActivatable("test").ok).toBe(false);
      expect(mod.isIntegrationActive("test")).toBe(false);
      expect(mod.isIntegrationActive("unknown")).toBe(false);
    }
  }
});

test("Stripe retries failed effects and processes paid async events only after writes succeed", async () => {
  process.env.STRIPE_SECRET_KEY = "test-stripe-key";
  let effectsSucceed = false;
  let processed = false;
  const operations: string[] = [];
  const mod = loadReviewModule("product-experience/src/app/api/billing/webhook/route.ts", {
    "@/lib/publicLaunch": {
      verifyStripeSignature: () => true,
      supabaseServiceSelect: async () => ({ ok: true, rows: processed ? [{ status: "processed" }] : [] }),
      supabaseServiceInsert: async () => { operations.push("processed"); processed = true; return { ok: true }; },
      supabaseServiceUpdate: async () => { throw new Error("unexpected update"); },
      supabaseServiceRpc: async () => { operations.push("credit"); return { ok: true, value: effectsSucceed }; },
    },
  });
  const request = (paymentStatus = "paid", type = "checkout.session.completed") => new Request("https://control.invalid", { method: "POST", body: JSON.stringify({ id: "evt-fixture", type, data: { object: { payment_status: paymentStatus, amount_total: 100, metadata: { product: "veloce-managed-credits", tenant_slug: "tenant-a" } } } }) });
  expect((await mod.POST(request())).status).toBe(502);
  expect(processed).toBe(false);
  effectsSucceed = true;
  expect((await mod.POST(request())).status).toBe(200);
  expect(operations).toEqual(["credit", "credit", "processed"]);
  expect(await (await mod.POST(request())).json()).toMatchObject({ duplicate: true });
  processed = false; operations.length = 0;
  expect(await (await mod.POST(request("unpaid"))).json()).toMatchObject({ status: "awaiting_payment" });
  expect(operations).toEqual(["processed"]);
  processed = false; operations.length = 0;
  expect((await mod.POST(request("paid", "checkout.session.async_payment_succeeded"))).status).toBe(200);
  expect(operations).toEqual(["credit", "processed"]);
});

test("a durable public-launch payment reference classifies a refund without touching managed credits", async () => {
  process.env.STRIPE_SECRET_KEY = "test-stripe-key";
  const inserts: Array<{ table: string; record: Record<string, unknown> }> = [];
  const mod = loadReviewModule("product-experience/src/app/api/billing/webhook/route.ts", {
    "@/lib/publicLaunch": {
      verifyStripeSignature: () => true,
      supabaseServiceSelect: async (table: string) => {
        if (table === "client_credit_purchase_plans") return { ok: true, rows: [] };
        if (table === "client_onboarding_accounts") return { ok: true, rows: [{ id: "onboarding-a", request_id: "request-a", setup_payment_id: "pi-public" }] };
        return { ok: true, rows: [] };
      },
      supabaseServiceInsert: async (table: string, record: Record<string, unknown>) => { inserts.push({ table, record }); return { ok: true, rows: [] }; },
      supabaseServiceUpdate: async () => ({ ok: true, rows: [] }),
      supabaseServiceRpc: async () => { throw new Error("public launch refund must not invoke a managed-credit RPC"); },
    },
  });
  const result = await mod.POST(new Request("https://control.invalid", {
    method: "POST",
    body: JSON.stringify({ id: "evt-public-refund", type: "charge.refunded", data: { object: { payment_intent: "pi-public", amount_refunded: 200, metadata: {} } } }),
  }));
  expect(result.status).toBe(422);
  expect(await result.json()).toMatchObject({ error: "public_launch_review_required" });
  expect(inserts).toContainEqual(expect.objectContaining({
    table: "stripe_financial_event_dispositions",
    record: expect.objectContaining({ financial_scope: "public_launch", disposition: "review_required" }),
  }));
  expect(inserts).toContainEqual(expect.objectContaining({
    table: "stripe_webhook_events",
    record: expect.objectContaining({ financial_scope: "public_launch", status: "failed", error_code: "public_launch_review_required" }),
  }));
});

test("an unclassified refund stays failed closed and cannot mutate managed credits", async () => {
  process.env.STRIPE_SECRET_KEY = "test-stripe-key";
  const inserts: Array<{ table: string; record: Record<string, unknown> }> = [];
  const mod = loadReviewModule("product-experience/src/app/api/billing/webhook/route.ts", {
    "@/lib/publicLaunch": {
      verifyStripeSignature: () => true,
      supabaseServiceSelect: async () => ({ ok: true, rows: [] }),
      supabaseServiceInsert: async (table: string, record: Record<string, unknown>) => { inserts.push({ table, record }); return { ok: true, rows: [] }; },
      supabaseServiceUpdate: async () => ({ ok: true, rows: [] }),
      supabaseServiceRpc: async () => { throw new Error("unknown refund must not invoke a managed-credit RPC"); },
    },
  });
  const result = await mod.POST(new Request("https://control.invalid", {
    method: "POST",
    body: JSON.stringify({ id: "evt-unknown-refund", type: "charge.refunded", data: { object: { payment_intent: "pi-unknown", amount_refunded: 200, metadata: {} } } }),
  }));
  expect(result.status).toBe(422);
  expect(inserts).toContainEqual(expect.objectContaining({
    table: "stripe_webhook_events",
    record: expect.objectContaining({ financial_scope: "unknown", status: "failed", error_code: "credit_plan_metadata_missing" }),
  }));
});

test("ambiguous Stripe scopes and event identity conflicts have zero financial effects", async () => {
  process.env.STRIPE_SECRET_KEY = "test-stripe-key";
  for (const scenario of ["multiple-plans", "both-scopes", "mixed-checkout", "missing-plan", "changed-payload"]) {
    const mod = loadReviewModule("product-experience/src/app/api/billing/webhook/route.ts", {
      "@/lib/publicLaunch": {
        verifyStripeSignature: () => true,
        supabaseServiceSelect: async (table: string) => ({ ok: true, rows:
          table === "stripe_webhook_events" && scenario === "changed-payload" ? [{ status: "processed", payload_hash: "b".repeat(64) }]
          : table === "client_credit_purchase_plans" ? (scenario === "multiple-plans" ? [{ id: "plan-a" }, { id: "plan-b" }] : scenario === "both-scopes" ? [{ id: "plan-a" }] : [])
          : table === "client_onboarding_accounts" && scenario === "both-scopes" ? [{ id: "onboarding-a" }] : [] }),
        supabaseServiceInsert: async (table: string) => { expect(table).toBe("stripe_webhook_events"); return { ok: true, rows: [] }; },
        supabaseServiceUpdate: async () => { throw new Error("no mutation permitted"); },
        supabaseServiceRpc: async () => { throw new Error("no financial RPC permitted"); },
      },
    });
    const checkout = scenario === "mixed-checkout" || scenario === "missing-plan";
    const response = await mod.POST(new Request("https://control.invalid", { method: "POST", body: JSON.stringify({
      id: "evt-ambiguous", type: checkout ? "checkout.session.completed" : "charge.refunded",
      data: { object: { payment_intent: "pi-conflict", payment_status: "paid", metadata: checkout ? { product: "veloce-managed-credits-plan", ...(scenario === "mixed-checkout" ? { credit_plan_id: "plan-a", request_id: "request-a" } : {}) } : {} } },
    }) }));
    expect(response.status, scenario).toBe(422);
  }
});

test("operator review rejects null, oversized identity fields and managed-credit failures", async () => {
  process.env.CONTROL_PLANE_OPERATOR_SECRET = "operator-test";
  const mod = loadReviewModule("product-experience/src/app/api/internal/billing/webhook-review/route.ts", {
    "@/lib/publicLaunch": {
      supabaseServiceSelect: async () => ({ ok: true, rows: [{ event_type: "charge.refunded", payload_hash: "a".repeat(64), status: "failed", financial_scope: "managed_credit" }] }),
      supabaseServiceInsert: async () => { throw new Error("must not create a review"); },
    },
  });
  const valid = { eventId: "evt-test", eventType: "charge.refunded", payloadHash: "a".repeat(64), reviewedBy: "owner", reason: "fixture" };
  for (const body of [null, [], { ...valid, payloadHash: "a".repeat(65) }, { ...valid, eventId: "x".repeat(256) }]) {
    expect((await mod.POST(new Request("https://control.invalid", { method: "POST", headers: { "x-control-plane-secret": "operator-test" }, body: JSON.stringify(body) }))).status).toBe(400);
  }
  expect((await mod.POST(new Request("https://control.invalid", { method: "POST", headers: { "x-control-plane-secret": "operator-test" }, body: JSON.stringify(valid) }))).status).toBe(409);
});

test("a reviewed historical public-launch refund can be redelivered without a credit-plan effect", async () => {
  process.env.STRIPE_SECRET_KEY = "test-stripe-key";
  const inserts: Array<{ table: string; record: Record<string, unknown> }> = [];
  const payload = JSON.stringify({ id: "evt-reviewed-refund", type: "charge.refunded", data: { object: { payment_intent: "pi-deleted-fixture", amount_refunded: 200, metadata: {} } } });
  const hash = createHash("sha256").update(payload).digest("hex");
  const mod = loadReviewModule("product-experience/src/app/api/billing/webhook/route.ts", {
    "@/lib/publicLaunch": {
      verifyStripeSignature: () => true,
      supabaseServiceSelect: async (table: string) => {
        if (table === "stripe_financial_event_dispositions") return { ok: true, rows: [{ event_type: "charge.refunded", payload_hash: hash, financial_scope: "public_launch", disposition: "public_launch_refund_reviewed" }] };
        return { ok: true, rows: [] };
      },
      supabaseServiceInsert: async (table: string, record: Record<string, unknown>) => { inserts.push({ table, record }); return { ok: true, rows: [] }; },
      supabaseServiceUpdate: async () => ({ ok: true, rows: [] }),
      supabaseServiceRpc: async () => { throw new Error("reviewed public launch refund must not invoke a managed-credit RPC"); },
    },
  });
  const result = await mod.POST(new Request("https://control.invalid", { method: "POST", body: payload }));
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ status: "public_launch_refund_reviewed" });
  expect(inserts).toEqual([expect.objectContaining({
    table: "stripe_webhook_events",
    record: expect.objectContaining({ financial_scope: "public_launch", status: "processed" }),
  })]);
});

test("only the operator can create an immutable reviewed disposition for a failed refund", async () => {
  process.env.CONTROL_PLANE_OPERATOR_SECRET = "operator-test";
  const records: Record<string, unknown>[] = [];
  const mod = loadReviewModule("product-experience/src/app/api/internal/billing/webhook-review/route.ts", {
    "@/lib/publicLaunch": {
      supabaseServiceSelect: async (table: string) => {
        if (table === "stripe_webhook_events") return { ok: true, rows: [{ event_id: "evt-refund", event_type: "charge.refunded", payload_hash: "a".repeat(64), status: "failed" }] };
        return { ok: true, rows: [] };
      },
      supabaseServiceInsert: async (_table: string, record: Record<string, unknown>) => { records.push(record); return { ok: true, rows: [] }; },
    },
  });
  const body = JSON.stringify({ eventId: "evt-refund", eventType: "charge.refunded", payloadHash: "a".repeat(64), reviewedBy: "billing-owner", reason: "Confirmed public-launch fixture refund." });
  expect((await mod.POST(new Request("https://control.invalid", { method: "POST", body }))).status).toBe(401);
  const result = await mod.POST(new Request("https://control.invalid", { method: "POST", headers: { "x-control-plane-secret": "operator-test" }, body }));
  expect(result.status).toBe(200);
  expect(records).toEqual([expect.objectContaining({
    financial_scope: "public_launch",
    disposition: "public_launch_refund_reviewed",
  })]);
});

test("Stripe cancellation targets the exact subscription and retries failed account writes", async () => {
  process.env.STRIPE_SECRET_KEY = "test-stripe-key";
  let marked = false;
  const mod = loadReviewModule("product-experience/src/app/api/billing/webhook/route.ts", {
    "@/lib/publicLaunch": {
      verifyStripeSignature: () => true,
      supabaseServiceSelect: async () => ({ ok: true, rows: [] }),
      supabaseServiceInsert: async () => { marked = true; return { ok: true }; },
      supabaseServiceUpdate: async (_table: string, filters: Record<string, string>) => { expect(filters).toEqual({ stripe_customer_id: "eq.customer-a", stripe_subscription_id: "eq.subscription-a" }); return { ok: false, rows: [] }; },
    },
  });
  const result = await mod.POST(new Request("https://control.invalid", { method: "POST", body: JSON.stringify({ id: "evt-cancel", type: "customer.subscription.deleted", data: { object: { id: "subscription-a", customer: "customer-a" } } }) }));
  expect(result.status).toBe(502); expect(marked).toBe(false);
});

test("Stripe cancellation propagates suspension to the runtime tenant before marking processed", async () => {
  process.env.STRIPE_SECRET_KEY = "test-stripe-key";
  const operations: string[] = [];
  const mod = loadReviewModule("product-experience/src/app/api/billing/webhook/route.ts", {
    "@/lib/publicLaunch": {
      verifyStripeSignature: () => true,
      supabaseServiceSelect: async () => ({ ok: true, rows: [] }),
      supabaseServiceInsert: async () => { operations.push("processed"); return { ok: true }; },
      supabaseServiceUpdate: async (table: string, filters: Record<string, string>, record: Record<string, string>) => {
        operations.push(table); expect(record.status).toBe("suspended");
        if (table === "client_tenants") expect(filters).toEqual({ slug: "eq.tenant-a" });
        return { ok: true, rows: [{ tenant_slug: "tenant-a" }] };
      },
    },
  });
  const result = await mod.POST(new Request("https://control.invalid", { method: "POST", body: JSON.stringify({ id: "evt-cancel", type: "customer.subscription.deleted", data: { object: { id: "subscription-a", customer: "customer-a" } } }) }));
  expect(result.status).toBe(200);
  expect(operations).toEqual(["client_onboarding_accounts", "client_tenants", "processed"]);
});

test("reconciliation rejects absent costs and cannot report matched after a failed persistence write", async () => {
  Object.assign(process.env, { CONTROL_PLANE_OPERATOR_SECRET: "operator-test", OPENROUTER_MANAGED_SECRET_RESOURCE: "projects/test/secrets/managed", OPENROUTER_MANAGED_GATEWAY_URL: "https://gateway.invalid" });
  let totalCost: unknown = null;
  let writes = 0;
  let disableAttempts = 0;
  let persist = false;
  globalThis.fetch = async () => Response.json({ data: { total_cost: totalCost } });
  const mod = loadReviewModule("product-experience/src/app/api/internal/managed-provider/openrouter/route.ts", {
    "@/lib/cloudRunOidc": { cloudRunIdTokenFromVercel: async () => ({ ok: true, token: "identity" }) },
    "@/lib/managedProviderRuntime": { createSupabaseManagedCreditLedger: () => ({}), createOpenRouterManagedAdapter: () => ({ disable: async () => { disableAttempts++; throw new Error("first disable failed"); } }) },
    "@/lib/managedProviderPricing": { parseManagedTextPricing: () => null },
    "@/lib/managedProviderReadiness": { evaluateManagedProviderReadiness: () => ({ ok: true, credentialReference: "projects/test/secrets/managed", manifestVersion: "manifest" }) },
    "@/lib/managedVideoRuntime": {},
    "@/lib/publicLaunch": {
      publicLaunchConfig: () => ({ url: "https://db.invalid", serviceKey: "test-key" }),
      supabaseServiceSelect: async (table: string) => ({ ok: true, rows: table === "client_credit_reservations" ? [{ status: "settled", provider_request_id: "gen-test", actual_amount_micros: 8 }] : [{}] }),
      supabaseServiceUpdate: async () => { writes++; return { ok: persist, rows: persist ? [{}] : [] }; },
    },
  });
  const request = () => new Request("https://control.invalid", { method: "POST", headers: { "x-control-plane-secret": "operator-test" }, body: JSON.stringify({ operation: "reconcile", tenantSlug: "tenant-a", reservationId: "00000000-0000-4000-8000-000000000001" }) });
  expect(await (await mod.POST(request())).json()).toMatchObject({ ok: false, error: "managed_provider_generation_cost_invalid" });
  expect(writes).toBe(0);
  totalCost = 0.000008;
  expect(await (await mod.POST(request())).json()).toMatchObject({ ok: false, error: "reconciliation_record_failed" });
  persist = true;
  expect(await (await mod.POST(request())).json()).toMatchObject({ ok: true, status: "matched" });
  persist = false; totalCost = 1; writes = 0;
  const drift = await mod.POST(request());
  expect(drift.status).toBe(502);
  expect(await drift.json()).toMatchObject({ ok: false, status: "drift", disabled: false });
  expect(disableAttempts).toBe(1); expect(writes).toBe(3);
});
