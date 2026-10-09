import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { loadReviewModule } from "./helpers/load-review-module";
import { clientRetentionExpiresAt } from "../src/lib/clientRetention";

const savedEnv = { ...process.env };
const DAY_MS = 86_400_000;
test.afterEach(() => { process.env = { ...savedEnv }; });

function uploadRoute() {
  const stored: Record<string, unknown>[] = [];
  let signed = 0;
  const route = loadReviewModule("src/app/api/client-runtime/artifacts/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: "member-a" }), currentClientMember: async () => true },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
      clientRpc: async (_name: string, args: Record<string, unknown>) => {
        stored.push(args);
        return { ok: true, value: args.p_artifact_id };
      },
    },
    "@/lib/clientRuntimePolicy": { clientCapabilityEnabled: () => true },
    "@/lib/clientRetention": { clientRetentionExpiresAt },
    "@/lib/clientStorage": {
      clientStorageConfig: () => ({ namespace: "tenant-a", bucket: "fixture-bucket", serviceAccount: "fixture@example.invalid" }),
      safeClientFileName: (name: string) => name,
      clientGcpAccessToken: async () => "fixture-token",
      clientServiceAccountEmail: async () => "fixture@example.invalid",
      signedClientStorageUrl: async () => { signed++; return "https://storage.example.invalid/upload"; },
    },
  });
  const post = () => route.POST(new Request("https://tenant.invalid/api/client-runtime/artifacts", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileName: "evidence.json", contentType: "application/json", byteSize: 32 }),
  }));
  return { post, stored, signedCalls: () => signed };
}

test("artifact uploads default to 45 days from creation and honor explicit disposable retention", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  delete process.env.CLIENT_RETENTION_DAYS;
  const fixture = uploadRoute();
  const before = Date.now();
  expect((await fixture.post()).status).toBe(201);
  const expiry = Date.parse(String(fixture.stored[0].p_retention_expires_at));
  expect(expiry - before).toBeGreaterThanOrEqual(45 * DAY_MS);
  expect(expiry - before).toBeLessThan(45 * DAY_MS + 2_000);

  process.env.CLIENT_RETENTION_DAYS = "1";
  const disposable = Date.now();
  expect((await fixture.post()).status).toBe(201);
  const disposableExpiry = Date.parse(String(fixture.stored[1].p_retention_expires_at));
  expect(disposableExpiry - disposable).toBeGreaterThanOrEqual(DAY_MS);
  expect(disposableExpiry - disposable).toBeLessThan(DAY_MS + 2_000);
  expect(fixture.signedCalls()).toBe(2);
});

test("invalid artifact retention fails before signing or writing", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  const fixture = uploadRoute();
  for (const value of ["", "0", "3651", "1e2", " 45 ", "NaN"]) {
    process.env.CLIENT_RETENTION_DAYS = value;
    const response = await fixture.post();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "retention_not_configured" });
  }
  expect(fixture.signedCalls()).toBe(0);
  expect(fixture.stored).toHaveLength(0);
});

function notebookRoute() {
  const stored: Record<string, unknown>[] = [];
  const route = loadReviewModule("src/app/api/client-runtime/notebook-sources/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: "member-a" }), currentClientMember: async () => true },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
      insertClientRecord: async (_table: string, record: Record<string, unknown>) => { stored.push(record); return { ok: true }; },
      recordClientAudit: async () => undefined,
    },
    "@/lib/clientInputSafety": { containsClientSecretLike: () => false },
    "@/lib/clientRuntimePolicy": { clientCapabilityEnabled: () => true },
    "@/lib/clientRetention": { clientRetentionExpiresAt },
    "@/lib/v96NotebookContracts": { validateNotebookSource: () => [] },
  });
  const post = () => route.POST(new Request("https://tenant.invalid/api/client-runtime/notebook-sources", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "web", title: "Reference", sourceUrl: "https://example.invalid/lesson" }),
  }));
  return { post, stored };
}

test("Notebook sources use the 45-day tenant default and an explicit disposable override", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  delete process.env.CLIENT_RETENTION_DAYS;
  delete process.env.CLIENT_NOTEBOOK_RETENTION_DAYS;
  const fixture = notebookRoute();
  const before = Date.now();
  expect((await fixture.post()).status).toBe(201);
  expect(Date.parse(String(fixture.stored[0].retention_expires_at)) - before).toBeGreaterThanOrEqual(45 * DAY_MS);
  process.env.CLIENT_RETENTION_DAYS = "14";
  const tenantDefault = Date.now();
  expect((await fixture.post()).status).toBe(201);
  expect(Date.parse(String(fixture.stored[1].retention_expires_at)) - tenantDefault).toBeGreaterThanOrEqual(14 * DAY_MS);
  process.env.CLIENT_NOTEBOOK_RETENTION_DAYS = "1";
  const override = Date.now();
  expect((await fixture.post()).status).toBe(201);
  expect(Date.parse(String(fixture.stored[2].retention_expires_at)) - override).toBeGreaterThanOrEqual(DAY_MS);
});

test("invalid Notebook retention fails before a source record is written", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  const fixture = notebookRoute();
  for (const value of ["", "0", "3651", "1e2", "NaN"]) {
    process.env.CLIENT_NOTEBOOK_RETENTION_DAYS = value;
    expect((await fixture.post()).status).toBe(503);
  }
  expect(fixture.stored).toHaveLength(0);
});

test("invalid worker retention stops before claiming a job or calling a provider", async () => {
  process.env.CLIENT_RUNTIME_WORKER_ENABLED = "1";
  process.env.CLIENT_WORKER_TOKEN = "test-worker-token-at-least-24-characters";
  process.env.CLIENT_SLUG = "tenant-a";
  process.env.CLIENT_RETENTION_DAYS = "NaN";
  const source = readFileSync("src/app/api/internal/client-runtime/jobs/route.ts", "utf8");
  const mocks = Object.fromEntries([...source.matchAll(/from "(@\/lib\/[^\"]+)"/g)].map((match) => [match[1], {}])) as Record<string, unknown>;
  mocks["next/server"] = { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } };
  mocks["@/lib/clientTaskAuth"] = { validClientTaskIdentity: async () => true };
  mocks["@/lib/clientRetention"] = { clientRetentionExpiresAt };
  mocks["@/lib/clientDataPlane"] = { workerRpc: async () => { throw new Error("job_claimed_with_invalid_retention"); } };
  const route = loadReviewModule("src/app/api/internal/client-runtime/jobs/route.ts", mocks);
  const response = await route.POST(new Request("https://tenant.invalid/api/internal/client-runtime/jobs", {
    method: "POST", body: JSON.stringify({ jobId: "00000000-0000-4000-8000-000000000001", tenantSlug: "tenant-a" }),
  }));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: "retention_not_configured" });
});
