import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { loadReviewModule } from "./helpers/load-review-module";
import { clientRetentionExpiresAt, clientRetentionSecondsRemaining } from "../src/lib/clientRetention";
import { signedClientStorageUrl } from "../src/lib/clientStorage";

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
    "@/lib/clientRetention": { clientRetentionExpiresAt, clientRetentionSecondsRemaining },
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
    "@/lib/clientRetention": { clientRetentionExpiresAt, clientRetentionSecondsRemaining },
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

test("expired and undated Notebook sources are omitted from member reads", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  const now = Date.now();
  const records = [
    { id: "active", retention_expires_at: new Date(now + 20_000).toISOString() },
    { id: "expired", retention_expires_at: new Date(now - 1_000).toISOString() },
    { id: "undated", retention_expires_at: null },
  ];
  let readFilter: Record<string, string> | null = null;
  const route = loadReviewModule("src/app/api/client-runtime/notebook-sources/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: "member-a" }), currentClientMember: async () => true },
    "@/lib/clientDataPlane": { checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }), selectClientRecords: async (_table: string, filters: Record<string, string>) => { readFilter = filters; return { ok: true, records }; } },
    "@/lib/clientRuntimePolicy": { clientCapabilityEnabled: () => true },
    "@/lib/clientRetention": { clientRetentionExpiresAt, clientRetentionSecondsRemaining },
  });
  const response = await route.GET(new Request("https://tenant.invalid/api/client-runtime/notebook-sources"));
  expect(response.status).toBe(200);
  expect((await response.json()).sources.map((item: { id: string }) => item.id)).toEqual(["active"]);
  expect(readFilter?.retention_expires_at).toMatch(/^gt\./);
});

test("artifact list and both download routes enforce expiry and owner or requesting member", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  process.env.CLIENT_STORAGE_NAMESPACE = "tenant-a";
  process.env.CLIENT_STORAGE_BUCKET = "fixture-bucket";
  const artifactId = "00000000-0000-4000-8000-000000000001";
  const jobId = "00000000-0000-4000-8000-000000000002";
  const active = new Date(Date.now() + 120_000).toISOString();
  let currentUser = "member-a";
  let artifact: Record<string, unknown> = { id: artifactId, tenant_slug: "tenant-a", created_by: "member-a", status: "ready", object_key: "tenant-a/private/file.txt", retention_expires_at: active };
  let signed = 0;
  const listFilters: Record<string, string>[] = [];
  const auth = { currentClientUser: async () => ({ id: currentUser }), currentClientMember: async () => true };
  const data = {
    checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
    selectClientRecords: async (table: string, filters: Record<string, string>) => {
      if (table === "client_runtime_jobs") return { ok: true, records: filters.requested_by === "eq.member-a" ? [{ id: jobId, tenant_slug: "tenant-a", requested_by: "member-a" }] : [] };
      if (filters.id) return { ok: true, records: [artifact] };
      listFilters.push(filters);
      return { ok: true, records: [artifact] };
    },
  };
  const storage = {
    clientStorageConfig: () => ({ namespace: "tenant-a", bucket: "fixture-bucket", serviceAccount: "fixture@example.invalid" }),
    safeClientObjectKey: (key: string, namespace: string) => key.startsWith(`${namespace}/`),
    clientGcpAccessToken: async () => "fixture-token",
    clientServiceAccountEmail: async () => "fixture@example.invalid",
    signedClientStorageUrl: async (input: { expiresInSeconds?: number }) => { signed++; expect(input.expiresInSeconds).toBeGreaterThan(0); expect(input.expiresInSeconds).toBeLessThanOrEqual(120); return "https://storage.example.invalid/private?X-Goog-Expires=60"; },
  };
  const common = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init), redirect: (url: string, init?: ResponseInit) => Response.redirect(url, init?.status) } },
    "@/lib/clientAuth": auth,
    "@/lib/clientDataPlane": data,
    "@/lib/clientRuntimePolicy": { clientCapabilityEnabled: () => true },
    "@/lib/clientRetention": { clientRetentionExpiresAt, clientRetentionSecondsRemaining },
    "@/lib/clientStorage": storage,
  };
  const listRoute = loadReviewModule("src/app/api/client-runtime/artifacts/route.ts", common);
  const downloadRoute = loadReviewModule("src/app/api/client-runtime/artifacts/[id]/download/route.ts", common);
  const list = () => listRoute.GET(new Request("https://tenant.invalid/api/client-runtime/artifacts"));
  const primary = () => listRoute.GET(new Request(`https://tenant.invalid/api/client-runtime/artifacts?id=${artifactId}`));
  const alternate = () => downloadRoute.GET(new Request(`https://tenant.invalid/api/client-runtime/artifacts/${artifactId}/download`), { params: Promise.resolve({ id: artifactId }) });
  expect((await (await list()).json()).artifacts).toHaveLength(1);
  expect(listFilters[0].retention_expires_at).toMatch(/^gt\./);
  const signedResponse = await primary();
  expect(signedResponse.status).toBe(200);
  expect((await signedResponse.json()).expiresInSeconds).toBe(60);
  expect((await alternate()).status).toBe(302);
  expect(signed).toBe(2);

  currentUser = "member-b";
  expect((await (await list()).json()).artifacts).toHaveLength(0);
  expect((await primary()).status).toBe(404);
  expect((await alternate()).status).toBe(404);
  expect(signed).toBe(2);

  artifact = { ...artifact, created_by: null, job_id: jobId };
  currentUser = "member-a";
  expect((await primary()).status).toBe(200);
  expect((await alternate()).status).toBe(302);
  currentUser = "member-b";
  expect((await primary()).status).toBe(404);
  expect((await alternate()).status).toBe(404);
  expect(signed).toBe(4);

  artifact = { ...artifact, tenant_slug: "tenant-b" };
  currentUser = "member-a";
  expect((await (await list()).json()).artifacts).toHaveLength(0);
  expect((await primary()).status).toBe(404);
  expect((await alternate()).status).toBe(404);
  artifact = { ...artifact, tenant_slug: "tenant-a" };

  currentUser = "member-a";
  for (const retention_expires_at of [new Date(Date.now() - 1_000).toISOString(), null, "not-a-date"]) {
    artifact = { ...artifact, retention_expires_at };
    expect((await (await list()).json()).artifacts).toHaveLength(0);
    expect((await primary()).status).toBe(404);
    expect((await alternate()).status).toBe(404);
  }
  expect(signed).toBe(4);
});

test("storage signing refuses invalid expiry lengths", async () => {
  for (const expiresInSeconds of [0, -1, 901, 1.5, Number.NaN]) {
    expect(await signedClientStorageUrl({ method: "GET", bucket: "fixture", objectKey: "tenant-a/file", serviceAccount: "fixture@example.invalid", token: "fixture", expiresInSeconds })).toBeNull();
  }
});

test("storage signature cannot outlive an artifact's absolute expiry", async () => {
  const originalFetch = globalThis.fetch;
  let signingCalls = 0;
  try {
    globalThis.fetch = async () => {
      signingCalls++;
      return Response.json({ signedBlob: Buffer.from("fixture-signature").toString("base64") });
    };
    const expiresAt = new Date(Date.now() + 15_000).toISOString();
    const url = await signedClientStorageUrl({
      method: "GET", bucket: "fixture", objectKey: "tenant-a/file", serviceAccount: "fixture@example.invalid", token: "fixture",
      expiresInSeconds: 900, expiresAt,
    });
    expect(url).not.toBeNull();
    const signed = new URL(url!);
    expect(Number(signed.searchParams.get("X-Goog-Expires"))).toBeGreaterThan(0);
    expect(Number(signed.searchParams.get("X-Goog-Expires"))).toBeLessThanOrEqual(15);
    expect(signingCalls).toBe(1);
    const expired = await signedClientStorageUrl({
      method: "GET", bucket: "fixture", objectKey: "tenant-a/file", serviceAccount: "fixture@example.invalid", token: "fixture",
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    expect(expired).toBeNull();
    expect(signingCalls).toBe(1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
