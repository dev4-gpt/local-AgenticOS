import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { loadReviewModule } from "./helpers/load-review-module";

const originalEnv = { ...process.env };
test.afterEach(() => { process.env = { ...originalEnv }; });

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
    "@/lib/clientRuntimeObservability": { captureClientProductEvent: async () => { captures++; return true; } },
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
