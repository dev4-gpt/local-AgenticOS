import { expect, test } from "@playwright/test";
import { loadReviewModule } from "./helpers/load-review-module";
import { safeClientJobTrace, traceClientJobStage } from "../src/lib/clientJobTrace";
import { containsClientSecretLike } from "../src/lib/clientInputSafety";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
test.afterEach(() => { process.env = { ...originalEnv }; globalThis.fetch = originalFetch; });

function budgetRoute(selectClientRecords: (table: string, filters: Record<string, string>) => Promise<unknown>) {
  return loadReviewModule("src/app/api/client-runtime/budget/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: "member" }), currentClientMember: async () => true },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
      selectClientRecords,
    },
    "@/lib/usageCredits": { microsToUsageCredits: (micros: number) => micros },
  });
}

test("customer budget meter includes ledger rows beyond the first page", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  process.env.CLIENT_BUDGET_CAP = "1";
  const entries = Array.from({ length: 1002 }, (_, index) => ({ id: 1002 - index, tenant_slug: "tenant-a", provider: "openai", amount_micros: 100 }));
  const cursors: string[] = [];
  const route = budgetRoute(async (table, filters) => {
    expect(table).toBe("client_runtime_budget_ledger");
    expect(filters.tenant_slug).toBe("eq.tenant-a");
    cursors.push(filters.id ?? "first");
    return { ok: true, records: entries.filter((entry) => !filters.id || entry.id < Number(filters.id.slice(3))).slice(0, 1000) };
  });
  const response = await route.GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ spentMicros: 100200, remainingMicros: 899800, byProvider: { openai: 100200 } });
  expect(cursors).toEqual(["first", "lt.3"]);
});

test("customer budget meter refuses an incomplete or malformed ledger", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  let pages = 0;
  const oversized = budgetRoute(async () => {
    pages++;
    return { ok: true, records: Array.from({ length: 1000 }, (_, index) => ({ id: 11000 - (pages - 1) * 1000 - index, tenant_slug: "tenant-a", provider: "openai", amount_micros: 1 })) };
  });
  expect((await oversized.GET()).status).toBe(502);
  expect(pages).toBe(11);
  const wrongTenant = budgetRoute(async () => ({ ok: true, records: [{ id: 1, tenant_slug: "tenant-b", provider: "openai", amount_micros: 1 }] }));
  expect(await (await wrongTenant.GET()).json()).toMatchObject({ error: "budget_scope_mismatch" });
  const badAmount = budgetRoute(async () => ({ ok: true, records: [{ id: 1, tenant_slug: "tenant-a", provider: "openai", amount_micros: -1 }] }));
  expect(await (await badAmount.GET()).json()).toMatchObject({ error: "budget_read_invalid" });
});

test("tenant artifact count uses the complete PostgREST count, not a one-row sample", async () => {
  const dataPlane = loadReviewModule("src/lib/clientDataPlane.ts", {
    "@/lib/clientAuth": { supabaseAuthConfig: () => ({ url: "https://db.invalid", key: "anon" }), currentClientAccessToken: async () => "member-token" },
    "@/lib/clientRuntimeObservability": {},
    "@/lib/capabilityTraits": {},
    "@/lib/clientJobTrace": { traceClientJobStage },
  });
  globalThis.fetch = async (url, init) => {
    const request = new URL(String(url));
    expect(request.pathname).toBe("/rest/v1/client_runtime_artifacts");
    expect(request.searchParams.get("tenant_slug")).toBe("eq.tenant-a");
    expect(init?.method).toBe("HEAD");
    expect((init?.headers as Record<string, string>).Prefer).toBe("count=exact");
    return new Response(null, { headers: { "content-range": "0-0/42" } });
  };
  expect(await dataPlane.countClientRecords("client_runtime_artifacts", { tenant_slug: "eq.tenant-a" })).toMatchObject({ ok: true, count: 42 });
  globalThis.fetch = async () => new Response(null, { headers: { "content-range": "0-0/*" } });
  expect(await dataPlane.countClientRecords("client_runtime_artifacts", { tenant_slug: "eq.tenant-a" })).toMatchObject({ ok: false, count: null });
});

test("observability pages the full monthly ledger and identifies capped event/job samples", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  process.env.POSTHOG_API_KEY = "test-project-key";
  delete process.env.CLIENT_POSTHOG_CAPTURE_ENABLED;
  const entries = Array.from({ length: 1002 }, (_, index) => ({ id: 1002 - index, tenant_slug: "tenant-a", provider: "openai", model: "test", amount_micros: 100, usage_metadata: { inputTokens: 1, outputTokens: 2 } }));
  const calls: Array<{ table: string; filters: Record<string, string> }> = [];
  const route = loadReviewModule("src/app/api/client-runtime/observability/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: "member" }), currentClientMember: async () => true },
    "@/lib/clientJobTrace": { safeClientJobTrace },
    "@/lib/clientInputSafety": { containsClientSecretLike },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
      countClientRecords: async () => ({ ok: true, count: 42 }),
      selectClientRecords: async (table: string, filters: Record<string, string>) => {
        calls.push({ table, filters });
        if (table === "client_runtime_budget_ledger") return { ok: true, records: entries.filter((entry) => !filters.id || entry.id < Number(filters.id.slice(3))).slice(0, 1000) };
        return { ok: true, records: Array.from({ length: 250 }, () => table === "client_runtime_jobs" ? { tenant_slug: "tenant-a", provider: "openai", status: "succeeded" } : { tenant_slug: "tenant-a", event_type: "client_runtime_provider_response_succeeded" }) };
      },
    },
  });
  const response = await route.GET();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.artifacts.total).toBe(42);
  expect(body.monthlyUsage.totalCostMicros).toBe(100200);
  expect(body.monthlyUsage.inputTokens).toBe(1002);
  expect(body.sample).toEqual({ eventsLimited: true, jobsLimited: true, limit: 250 });
  expect(body.posthogConfigured).toBe(true);
  expect(body.posthogCaptureEnabled).toBe(false);
  expect(calls.filter((call) => call.table === "client_runtime_budget_ledger")).toHaveLength(2);
  expect(calls.every((call) => call.filters.tenant_slug === "eq.tenant-a")).toBe(true);
  process.env.CLIENT_POSTHOG_CAPTURE_ENABLED = "1";
  const enabled = await route.GET();
  expect((await enabled.json()).posthogCaptureEnabled).toBe(true);
});

test("observability refuses an incomplete monthly ledger", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  let pages = 0;
  const route = loadReviewModule("src/app/api/client-runtime/observability/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: "member" }), currentClientMember: async () => true },
    "@/lib/clientJobTrace": { safeClientJobTrace },
    "@/lib/clientInputSafety": { containsClientSecretLike },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
      countClientRecords: async () => ({ ok: true, count: 0 }),
      selectClientRecords: async (table: string) => {
        if (table !== "client_runtime_budget_ledger") return { ok: true, records: [] };
        pages++;
        return { ok: true, records: Array.from({ length: 1000 }, (_, index) => ({ id: 11000 - (pages - 1) * 1000 - index, amount_micros: 1 })) };
      },
    },
  });
  const response = await route.GET();
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ error: "observability_read_failed" });
  expect(pages).toBe(11);
});

test("observability refuses a malformed ledger page cursor", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  const route = loadReviewModule("src/app/api/client-runtime/observability/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: "member" }), currentClientMember: async () => true },
    "@/lib/clientJobTrace": { safeClientJobTrace },
    "@/lib/clientInputSafety": { containsClientSecretLike },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
      countClientRecords: async () => ({ ok: true, count: 0 }),
      selectClientRecords: async (table: string) => ({ ok: true, records: table === "client_runtime_budget_ledger" ? Array.from({ length: 1000 }, () => ({ id: "invalid", amount_micros: 1 })) : [] }),
    },
  });
  const response = await route.GET();
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ error: "observability_read_failed" });
});

test("observability returns only validated job trace fields", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  const id = "00000000-0000-4000-8000-000000000001";
  const trace = { version: 1, jobId: id, totalDurationMs: 123, truncated: false, spans: [{ stage: "provider_call", offsetMs: 4, durationMs: 119, outcome: "ok", prompt: "private-prompt" }], output: "private-output" };
  const route = loadReviewModule("src/app/api/client-runtime/observability/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: "member" }), currentClientMember: async () => true },
    "@/lib/clientJobTrace": { safeClientJobTrace },
    "@/lib/clientInputSafety": { containsClientSecretLike },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
      countClientRecords: async () => ({ ok: true, count: 0 }),
      selectClientRecords: async (table: string) => ({ ok: true, records: table === "client_runtime_jobs" ? [{ id, tenant_slug: "tenant-a", provider: "openai", status: "succeeded", output_metadata: { __veloceExecutionTrace: trace, output: "private-output" } }] : [] }),
    },
  });
  const response = await route.GET();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.recentJobs[0].trace).toEqual({ version: 1, jobId: id, totalDurationMs: 123, truncated: false, spans: [{ stage: "provider_call", offsetMs: 4, durationMs: 119, outcome: "ok" }] });
  expect(JSON.stringify(body)).not.toMatch(/private-prompt|private-output/);
});

test("observability redacts malformed historical audit metadata", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  const route = loadReviewModule("src/app/api/client-runtime/observability/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: "member" }), currentClientMember: async () => true },
    "@/lib/clientJobTrace": { safeClientJobTrace },
    "@/lib/clientInputSafety": { containsClientSecretLike },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
      countClientRecords: async () => ({ ok: true, count: 0 }),
      selectClientRecords: async (table: string) => ({ ok: true, records: table === "client_runtime_audit_events" ? [
        { tenant_slug: "tenant-a", event_type: "client_runtime_provider_response_succeeded", metadata: { provider: "openai", route: "https://private.example/path", source: `sk-${"x".repeat(20)}`, result: { prompt: "private-prompt" }, messageCount: 3, output: "private-output" } },
        { tenant_slug: "tenant-a", event_type: "client_runtime_secret?token=private-token", metadata: { source: "client-telemetry" } },
      ] : table === "client_runtime_jobs" ? [{ id: "00000000-0000-4000-8000-000000000001", tenant_slug: "tenant-a", provider: `sk-${"x".repeat(20)}`, model: "openai", status: "failed", error_code: "private-output" }] : [] }),
    },
  });
  const response = await route.GET();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.recentEvents[0].metadata).toEqual({ provider: "openai", messageCount: 3 });
  expect(body.recentEvents[1].event).toBe("runtime.event");
  expect(body.recentJobs[0].provider).toBeNull();
  expect(body.recentJobs[0].errorCode).toBeNull();
  expect(JSON.stringify(body)).not.toMatch(/private-prompt|private-output|private-token|private\.example|sk-x{20}/);
});

test("observability fails closed if a returned row belongs to another tenant", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  const route = loadReviewModule("src/app/api/client-runtime/observability/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: "member" }), currentClientMember: async () => true },
    "@/lib/clientJobTrace": { safeClientJobTrace },
    "@/lib/clientInputSafety": { containsClientSecretLike },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
      countClientRecords: async () => ({ ok: true, count: 0 }),
      selectClientRecords: async (table: string) => ({ ok: true, records: table === "client_runtime_jobs" ? [{ tenant_slug: "tenant-b", provider: "openai", status: "succeeded" }] : [] }),
    },
  });
  const response = await route.GET();
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ ok: false, error: "observability_scope_mismatch" });
});
