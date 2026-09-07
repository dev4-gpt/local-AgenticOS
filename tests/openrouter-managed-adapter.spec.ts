import { expect, test } from "@playwright/test";
import { createOpenRouterManagedAdapter } from "../src/lib/openRouterManagedAdapter";
import { createSupabaseManagedCreditLedger } from "../src/lib/supabaseManagedCreditLedger";
import type { ManagedCreditLedger } from "../src/lib/managedProviderAdapter";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function harness() {
  const calls: Array<{ path: string; body?: Record<string, unknown> }> = [];
  const ledger: ManagedCreditLedger = {
    async reserve() { return "reservation-1"; },
    async settle() { return true; },
    async refund() { return true; },
  };
  const adapter = createOpenRouterManagedAdapter({
    ledger,
    resolveCredential: async () => "managed-test-key",
    pricingSnapshotId: "openrouter-2026-08",
    pricing: { "openai/gpt-4o-mini": { inputMicrosPer1k: 100, outputMicrosPer1k: 200 } },
    fetcher: async (url, init) => {
      const path = new URL(String(url)).pathname;
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
      calls.push({ path, body });
      if (path.endsWith("/models")) return response({ data: [{ id: "openai/gpt-4o-mini" }] });
      if (path.endsWith("/credits")) return response({ data: { total_credits: 10, total_usage: 2.5 } });
      return response({ id: "gen-1", model: "openai/gpt-4o-mini", choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.00002 } });
    },
  });
  return { adapter, calls };
}

const context = {
  tenantSlug: "tenant-a",
  catalogId: "provider-openrouter_api_key",
  providerKey: "openrouter",
  idempotencyKey: "job-1",
};

test("managed OpenRouter quotes, calls, and settles through the injected ledger", async () => {
  const { adapter, calls } = harness();
  const quote = await adapter.quote(context, {
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "hello" }],
    maxOutputTokens: 256,
  });
  const reservation = await adapter.reserve(context, quote);
  const usage = await adapter.execute(context, reservation, {
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "hello" }],
    maxOutputTokens: 256,
  });
  await adapter.settle(context, reservation, usage);

  expect(quote.pricingSnapshotId).toBe("openrouter-2026-08");
  expect(usage.providerRequestId).toBe("gen-1");
  expect(usage.actualMicros).toBe(20);
  expect(calls.map((call) => call.path)).toContain("/api/v1/chat/completions");
});

test("balance and health checks use the managed account, never a client credential", async () => {
  const { adapter, calls } = harness();
  expect(await adapter.healthCheck(context)).toEqual({ ok: true });
  expect(await adapter.balance(context)).toEqual({ availableMicros: 7_500_000, currency: "usd" });
  expect(calls.filter((call) => call.path.endsWith("/models") || call.path.endsWith("/credits")).length).toBe(2);
});

test("disable fails closed for future health, balance, and execution calls", async () => {
  const { adapter } = harness();
  await adapter.disable(context, "operator_requested");
  expect((await adapter.healthCheck(context)).ok).toBe(false);
  await expect(adapter.balance(context)).rejects.toThrow("managed_provider_credential_unavailable");
});

test("missing pricing and over-reservation are rejected", async () => {
  const { adapter } = harness();
  await expect(adapter.quote(context, { model: "unknown", messages: [{ content: "x" }] })).rejects.toThrow("managed_pricing_not_configured");
  const reservation = { reservationId: "reservation-1", reservedMicros: 1, expiresAt: new Date(Date.now() + 60_000).toISOString() };
  await expect(adapter.execute(context, reservation, { model: "openai/gpt-4o-mini", messages: [{ content: "x" }] })).rejects.toThrow("managed_usage_exceeds_reservation");
});

test("managed quotes fail closed without an approved pricing snapshot ID", async () => {
  const adapter = createOpenRouterManagedAdapter({
    ledger: {
      async reserve() { return "reservation-1"; },
      async settle() { return true; },
      async refund() { return true; },
    },
    resolveCredential: async () => "managed-test-key",
    pricing: { "openai/gpt-4o-mini": { inputMicrosPer1k: 150, outputMicrosPer1k: 600 } },
  });
  await expect(adapter.quote(context, {
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "hello" }],
  })).rejects.toThrow("managed_pricing_snapshot_not_configured");
});

test("the Supabase ledger bridge uses only service-role RPCs and preserves idempotency", async () => {
  const calls: Array<{ functionName: string; body: Record<string, unknown>; authorization: string }> = [];
  const ledger = createSupabaseManagedCreditLedger({
    url: "https://example.supabase.co",
    serviceRoleKey: "server-only-test-key",
    fetcher: async (url, init) => {
      const functionName = new URL(String(url)).pathname.split("/").pop() ?? "";
      calls.push({
        functionName,
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        authorization: String(new Headers(init?.headers).get("authorization")),
      });
      return response(functionName === "reserve_client_credit" ? "reservation-1" : true);
    },
  });
  const quote = { estimatedMicros: 100, currency: "usd" as const, pricingSnapshotId: "price-1", expiresAt: new Date(Date.now() + 60_000).toISOString() };
  const reserved = await ledger.reserve({ context, quote, idempotencyKey: "job-1" });
  await ledger.settle({ context, reservationId: reserved!, actualMicros: 50, providerRequestId: "gen-1", idempotencyKey: "settle:reservation-1", metadata: { inputTokens: 1 } });
  await ledger.refund({ context, reservationId: reserved!, reason: "test", idempotencyKey: "refund:reservation-1" });

  expect(reserved).toBe("reservation-1");
  expect(calls.map((call) => call.functionName)).toEqual(["reserve_client_credit", "settle_client_credit", "refund_client_credit"]);
  expect(calls.every((call) => call.authorization === "Bearer server-only-test-key")).toBe(true);
  expect(calls[0]?.body.p_idempotency_key).toBe("job-1");
});
