import { expect, test } from "@playwright/test";
import { readBoundedJsonObject } from "../src/lib/clientNetworkSafety";
import { loadReviewModule } from "./helpers/load-review-module";

const originalTenant = process.env.CLIENT_SLUG;
test.afterEach(() => {
  if (originalTenant === undefined) delete process.env.CLIENT_SLUG;
  else process.env.CLIENT_SLUG = originalTenant;
});

test("bounded JSON reader distinguishes oversized, malformed, and non-object bodies", async () => {
  const read = (body: string) => readBoundedJsonObject(new Request("https://client.invalid", { method: "POST", body }), 32);
  expect(await read('{"valid":true}')).toEqual({ ok: true, value: { valid: true } });
  expect(await read("x".repeat(33))).toEqual({ ok: false, reason: "too_large" });
  expect(await read("{")).toEqual({ ok: false, reason: "invalid" });
  expect(await read("[]")).toEqual({ ok: false, reason: "invalid" });
});

test("provider-bound routes reject oversized bodies and chat endpoints reject excessive history", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  let enqueues = 0;
  const mocks = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": {
      currentClientUser: async () => ({ id: "user-a" }),
      currentClientMember: async () => true,
    },
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
    "@/lib/capabilityContracts": { deterministicCapabilityIdempotencyKey: () => "research-key" },
    "@/lib/researchProviderRouter": { selectResearchProvider: () => ({ provider: "brave" }) },
    "@/lib/researchWorkerAdapters": { configuredResearchWorkerStates: () => [], selectResearchWorker: () => ({ error: "worker_not_configured" }) },
    "@/lib/clientExecutionCredential": { clientExecutionCredential: async () => null },
  };
  const routes = [
    loadReviewModule("src/app/api/client-runtime/jobs/route.ts", mocks),
    loadReviewModule("src/app/api/client-runtime/provider-chat/route.ts", mocks),
    loadReviewModule("src/app/api/client-runtime/research/route.ts", mocks),
    loadReviewModule("src/app/api/client-runtime/hosted-jobs/route.ts", mocks),
  ];
  for (const route of routes) {
    const oversized = await route.POST(new Request("https://client.invalid", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "openrouter", prompt: "x", padding: "x".repeat(70 * 1024) }),
    }));
    expect(oversized.status).toBe(413);
  }
  for (const route of routes.slice(0, 2)) {
    const tooManyMessages = await route.POST(new Request("https://client.invalid", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "openrouter", prompt: "hello", history: Array.from({ length: 17 }, () => ({ role: "user", content: "x" })) }),
    }));
    expect(tooManyMessages.status).toBe(400);
  }
  expect(enqueues).toBe(0);
});

test("tenant record, Markdown import, and credential revoke routes bound JSON before side effects", async () => {
  let writes = 0;
  let revokes = 0;
  const sharedAuth = {
    currentClientUser: async () => ({ id: "user-a" }),
    currentClientMember: async () => true,
    currentClientCredentialManager: async () => true,
  };
  const routeMocks = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": sharedAuth,
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
      countClientRecords: async () => ({ ok: true, count: 0 }),
      insertClientRecord: async () => { writes++; return { ok: true }; },
      updateClientRecord: async () => { writes++; return { ok: true }; },
      selectClientRecords: async () => ({ ok: true, records: [] }),
      clientRpc: async () => { revokes++; return { ok: true, value: true }; },
      recordClientAudit: async () => ({ ok: true }),
    },
    "@/lib/clientRuntimePolicy": { clientCapabilityEnabled: () => true },
    "@/lib/clientNetworkSafety": { readBoundedJsonObject },
    "@/lib/clientInputSafety": { containsClientSecretLike: () => false },
    "@/lib/clientRetention": { clientRetentionSecondsRemaining: () => 3600 },
    "@/lib/clientStorage": { safeClientFileName: (name: string) => name },
    "@/lib/clientCredentialCatalog": { clientCredentialOption: (key: string) => key === "GROQ_API_KEY" ? { key, label: "Groq" } : null },
  };
  process.env.CLIENT_SLUG = "tenant-a";
  const records = loadReviewModule("src/app/api/client-runtime/records/route.ts", routeMocks);
  const memoryImport = loadReviewModule("src/app/api/client-runtime/memory-import/route.ts", routeMocks);
  const credentialRevoke = loadReviewModule("src/app/api/client-runtime/credentials/revoke/route.ts", routeMocks);

  const oversized = (size: number) => new Request("https://tenant.invalid", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: "x".repeat(size) }),
  });
  const recordOversized = await records.POST(oversized(129 * 1024));
  expect(recordOversized.status).toBe(413);
  expect(await recordOversized.json()).toMatchObject({ error: "record_request_too_large" });
  const recordUpdateOversized = await records.PATCH(oversized(129 * 1024));
  expect(recordUpdateOversized.status).toBe(413);
  expect(await recordUpdateOversized.json()).toMatchObject({ error: "record_request_too_large" });

  const importOversized = await memoryImport.POST(oversized(129 * 1024));
  expect(importOversized.status).toBe(413);
  expect(await importOversized.json()).toMatchObject({ error: "memory_import_request_too_large" });

  const revokeOversized = await credentialRevoke.POST(oversized(5 * 1024));
  expect(revokeOversized.status).toBe(413);
  expect(await revokeOversized.json()).toMatchObject({ error: "credential_revoke_request_too_large" });

  for (const malformed of [
    await records.POST(new Request("https://tenant.invalid", { method: "POST", body: "{" })),
    await records.PATCH(new Request("https://tenant.invalid", { method: "PATCH", body: "{" })),
    await memoryImport.POST(new Request("https://tenant.invalid", { method: "POST", body: "{" })),
    await credentialRevoke.POST(new Request("https://tenant.invalid", { method: "POST", body: "{" })),
  ]) expect(malformed.status).toBe(400);
  expect(writes).toBe(0);
  expect(revokes).toBe(0);
});
