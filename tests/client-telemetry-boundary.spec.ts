import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { captureClientProductEvent, CLIENT_PRODUCT_EVENTS, logClientRuntimeEvent } from "../src/lib/clientRuntimeObservability";
import { loadReviewModule } from "./helpers/load-review-module";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
test.afterEach(() => { process.env = { ...originalEnv }; globalThis.fetch = originalFetch; });

test("product telemetry accepts only shipped events and strips caller content", async () => {
  process.env.CLIENT_SLUG = "private-customer-name";
  const captured: Array<Record<string, unknown>> = [];
  const audited: Array<Record<string, unknown>> = [];
  const route = loadReviewModule("src/app/api/client-runtime/telemetry/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: "user-123" }), currentClientMember: async () => true },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
      recordClientAudit: async (event: string, metadata: Record<string, unknown>) => { audited.push({ event, metadata }); return true; },
    },
    "@/lib/clientRuntimeObservability": {
      CLIENT_PRODUCT_EVENTS,
      captureClientProductEvent: async (input: Record<string, unknown>) => { captured.push(input); return true; },
    },
  });
  const post = (event: string, properties: Record<string, unknown>) => route.POST(new Request("https://client.invalid/api/client-runtime/telemetry", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event, properties }),
  }));

  expect((await post("client_runtime_provider_response_failed", {
    provider: "openai", result: "sk-live-secret", route: "private-path", source: "private-source",
    prompt: "private-prompt", messageCount: 3,
  })).status).toBe(200);
  expect(captured).toEqual([{
    event: "client_runtime_provider_response_failed",
    distinctId: createHash("sha256").update("private-customer-name:user-123").digest("hex"),
    properties: {
      provider: "openai", messageCount: 3, result: "failed",
      tenant: `tenant:${createHash("sha256").update("private-customer-name").digest("hex").slice(0, 24)}`,
    },
  }]);
  expect(audited).toEqual([{
    event: "client_runtime_provider_response_failed",
    metadata: { provider: "openai", messageCount: 3, result: "failed", source: "client-telemetry" },
  }]);
  expect(JSON.stringify({ captured, audited })).not.toMatch(/sk-live-secret|private-path|private-source|private-prompt|private-customer-name|user-123/);

  expect((await post("client_runtime_secret_export", { provider: "openai" })).status).toBe(400);
  expect((await post("client_runtime_provider_response_failed", { provider: "sk-live-secret", result: "private-output" })).status).toBe(200);
  expect(captured[1].properties).toEqual({ result: "failed", tenant: captured[0].properties && (captured[0].properties as Record<string, unknown>).tenant });
  expect(audited).toHaveLength(2);
});

test("telemetry rejects unauthenticated and rate-limited requests before egress", async () => {
  let member = false;
  let allowed = true;
  let captures = 0;
  const route = loadReviewModule("src/app/api/client-runtime/telemetry/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: "user-123" }), currentClientMember: async () => member },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed }),
      recordClientAudit: async () => { throw new Error("audit must not run"); },
    },
    "@/lib/clientRuntimeObservability": { CLIENT_PRODUCT_EVENTS, captureClientProductEvent: async () => { captures++; return true; } },
  });
  const request = () => new Request("https://client.invalid/api/client-runtime/telemetry", {
    method: "POST", body: JSON.stringify({ event: "client_runtime_provider_prompt_submitted" }),
  });
  expect((await route.POST(request())).status).toBe(401);
  member = true;
  allowed = false;
  expect((await route.POST(request())).status).toBe(429);
  expect(captures).toBe(0);
});

test("PostHog capture is off by default and rejects unknown events or raw IDs", async () => {
  process.env.POSTHOG_API_KEY = "test-project-key";
  delete process.env.CLIENT_POSTHOG_CAPTURE_ENABLED;
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return Response.json({ ok: true });
  };
  const event = "client_runtime_provider_workspace_opened";
  const distinctId = createHash("sha256").update("tenant-a:user-1").digest("hex");
  expect(await captureClientProductEvent({ event, distinctId, properties: { provider: "openai" } })).toBe(false);
  expect(requests).toHaveLength(0);

  process.env.CLIENT_POSTHOG_CAPTURE_ENABLED = "1";
  expect(await captureClientProductEvent({ event: "private_customer_email", distinctId })).toBe(false);
  expect(await captureClientProductEvent({ event, distinctId: "user@example.com" })).toBe(false);
  expect(await captureClientProductEvent({ event, distinctId, properties: { provider: "openai", prompt: "private text", tenant: "private-customer-name", messageCount: 2 } })).toBe(true);
  expect(requests).toHaveLength(1);
  expect(requests[0].body).toMatchObject({ event, distinct_id: distinctId, properties: { provider: "openai", messageCount: 2, source: "veloce" } });
  expect(JSON.stringify(requests[0])).not.toMatch(/private text|private-customer-name/);
});

test("operational vendor events pseudonymize the tenant", () => {
  process.env.POSTHOG_API_KEY = "test-project-key";
  process.env.CLIENT_POSTHOG_CAPTURE_ENABLED = "1";
  delete process.env.SENTRY_DSN;
  const requests: Array<Record<string, unknown>> = [];
  const originalInfo = console.info;
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({ ok: true });
  };
  try {
    console.info = () => undefined;
    logClientRuntimeEvent("runtime.budget_exceeded", { tenant: "private-customer-name", provider: "openai", status: 429 });
  } finally { console.info = originalInfo; }
  expect(requests).toHaveLength(1);
  const tenant = `tenant:${createHash("sha256").update("private-customer-name").digest("hex").slice(0, 24)}`;
  expect(requests[0]).toMatchObject({ event: "runtime.budget_exceeded", distinct_id: tenant, properties: { tenant } });
  expect(JSON.stringify(requests[0])).not.toContain("private-customer-name");
});
