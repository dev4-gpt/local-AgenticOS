import { expect, test } from "@playwright/test";
import { readBoundedJsonObject } from "../src/lib/clientNetworkSafety";
import { loadReviewModule } from "./helpers/load-review-module";

test("bounded JSON reader distinguishes oversized, malformed, and non-object bodies", async () => {
  const read = (body: string) => readBoundedJsonObject(new Request("https://client.invalid", { method: "POST", body }), 32);
  expect(await read('{"valid":true}')).toEqual({ ok: true, value: { valid: true } });
  expect(await read("x".repeat(33))).toEqual({ ok: false, reason: "too_large" });
  expect(await read("{")).toEqual({ ok: false, reason: "invalid" });
  expect(await read("[]")).toEqual({ ok: false, reason: "invalid" });
});

test("text job endpoints reject oversized bodies and excessive history before enqueue", async () => {
  let enqueues = 0;
  const mocks = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: "user-a" }) },
    "@/lib/clientDataPlane": {
      cancelClientRuntimeJob: async () => true,
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
      enqueueClientRuntimeJob: async () => { enqueues++; return "job-a"; },
      refundClientRuntimeRateLimit: async () => true,
    },
    "@/lib/cloudTasks": { enqueueClientRuntimeTask: async () => ({ ok: true }) },
    "@/lib/clientRuntimePolicy": { clientCapabilityEnabled: () => true, clientProviderCallsEnabled: () => true },
    "@/lib/clientProviderAdapter": {
      clientProviderRequestAllowed: () => ({ ok: true, provider: "openrouter", model: "test-model" }),
      estimateClientTextCostMicros: () => 0,
      clientTextMaxOutputTokens: () => 100,
    },
    "@/lib/clientInputSafety": { containsClientSecretLike: () => false },
    "@/lib/clientNetworkSafety": { readBoundedJsonObject },
  };
  const routes = [
    loadReviewModule("src/app/api/client-runtime/jobs/route.ts", mocks),
    loadReviewModule("src/app/api/client-runtime/provider-chat/route.ts", mocks),
  ];
  for (const route of routes) {
    const oversized = await route.POST(new Request("https://client.invalid", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "openrouter", prompt: "x", padding: "x".repeat(70 * 1024) }),
    }));
    expect(oversized.status).toBe(413);

    const tooManyMessages = await route.POST(new Request("https://client.invalid", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "openrouter", prompt: "hello", history: Array.from({ length: 17 }, () => ({ role: "user", content: "x" })) }),
    }));
    expect(tooManyMessages.status).toBe(400);
  }
  expect(enqueues).toBe(0);
});
