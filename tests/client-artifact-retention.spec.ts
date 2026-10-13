import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { loadReviewModule } from "./helpers/load-review-module";
import { clientRetentionExpiresAt, clientRetentionSecondsRemaining } from "../src/lib/clientRetention";
import { proxyClientStorageObject } from "../src/lib/clientStorage";

const savedEnv = { ...process.env };
const DAY_MS = 86_400_000;
test.afterEach(() => { process.env = { ...savedEnv }; });

function uploadRoute() {
  const stored: Record<string, unknown>[] = [];
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
    },
  });
  const post = () => route.POST(new Request("https://tenant.invalid/api/client-runtime/artifacts", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileName: "evidence.json", contentType: "application/json", byteSize: 32 }),
  }));
  return { post, stored };
}

test("artifact uploads default to 45 days from creation and honor explicit disposable retention", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  delete process.env.CLIENT_RETENTION_DAYS;
  const fixture = uploadRoute();
  const before = Date.now();
  const response = await fixture.post();
  expect(response.status).toBe(201);
  expect((await response.json()).uploadUrl).toMatch(/^\/api\/client-runtime\/artifacts\/[0-9a-f-]{36}\/upload$/i);
  const expiry = Date.parse(String(fixture.stored[0].p_retention_expires_at));
  expect(expiry - before).toBeGreaterThanOrEqual(45 * DAY_MS);
  expect(expiry - before).toBeLessThan(45 * DAY_MS + 2_000);

  process.env.CLIENT_RETENTION_DAYS = "1";
  const disposable = Date.now();
  expect((await fixture.post()).status).toBe(201);
  const disposableExpiry = Date.parse(String(fixture.stored[1].p_retention_expires_at));
  expect(disposableExpiry - disposable).toBeGreaterThanOrEqual(DAY_MS);
  expect(disposableExpiry - disposable).toBeLessThan(DAY_MS + 2_000);
});

test("invalid artifact retention fails before proxy allocation or writing", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  const fixture = uploadRoute();
  for (const value of ["", "0", "3651", "1e2", " 45 ", "NaN"]) {
    process.env.CLIENT_RETENTION_DAYS = value;
    const response = await fixture.post();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "retention_not_configured" });
  }
  expect(fixture.stored).toHaveLength(0);
});

function artifactUploadBytesRoute() {
  const artifactId = "00000000-0000-4000-8000-000000000001";
  let currentUser = "member-a";
  let artifact: Record<string, unknown> = {
    id: artifactId,
    tenant_slug: "tenant-a",
    created_by: "member-a",
    status: "pending",
    object_key: "tenant-a/member-a/file.txt",
    content_type: "text/plain",
    byte_size: 5,
    retention_expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  const uploads: Array<{ bucket: string; objectKey: string; contentType: string; bytes: Buffer }> = [];
  const route = loadReviewModule("src/app/api/client-runtime/artifacts/[id]/upload/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: currentUser }), currentClientMember: async () => true },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
      selectClientRecords: async () => ({ ok: true, records: [artifact] }),
    },
    "@/lib/clientNetworkSafety": {
      readBoundedResponseBytes: async (response: Response, maxBytes: number) => {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.byteLength > maxBytes) throw new Error("too_large");
        return bytes;
      },
    },
    "@/lib/clientRuntimePolicy": { clientCapabilityEnabled: () => true },
    "@/lib/clientRetention": { clientRetentionSecondsRemaining },
    "@/lib/clientStorage": {
      clientStorageConfig: () => ({ namespace: "tenant-a", bucket: "fixture-bucket" }),
      safeClientObjectKey: (key: string, namespace: string) => key.startsWith(`${namespace}/`),
      clientGcpAccessToken: async () => "fixture-token",
      uploadClientStorageObject: async (input: { bucket: string; objectKey: string; contentType: string; bytes: Buffer }) => { uploads.push(input); return true; },
    },
  });
  const put = (body = "hello", contentType = "text/plain") => route.PUT(new Request(`https://tenant.invalid/api/client-runtime/artifacts/${artifactId}/upload`, {
    method: "PUT", headers: { "content-type": contentType }, body,
  }), { params: Promise.resolve({ id: artifactId }) });
  return { put, uploads, setUser: (user: string) => { currentUser = user; }, setArtifact: (value: Record<string, unknown>) => { artifact = value; } };
}

test("artifact byte proxy binds uploads to the pending owner's size, type, and retention", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  const fixture = artifactUploadBytesRoute();
  const uploaded = await fixture.put();
  expect(uploaded.status).toBe(200);
  expect(await uploaded.json()).toMatchObject({ ok: true, status: "uploaded" });
  expect(fixture.uploads).toHaveLength(1);
  expect(fixture.uploads[0]).toMatchObject({ bucket: "fixture-bucket", objectKey: "tenant-a/member-a/file.txt", contentType: "text/plain" });
  expect(fixture.uploads[0].bytes.toString()).toBe("hello");

  expect((await fixture.put("hello", "application/pdf")).status).toBe(400);
  expect((await fixture.put("other-size")).status).toBe(409);
  fixture.setUser("member-b");
  expect((await fixture.put()).status).toBe(404);
  fixture.setUser("member-a");
  fixture.setArtifact({ ...fixture.uploads[0], id: "00000000-0000-4000-8000-000000000001", tenant_slug: "tenant-a", created_by: "member-a", status: "pending", object_key: "tenant-a/member-a/file.txt", content_type: "text/plain", byte_size: 5, retention_expires_at: new Date(Date.now() - 1_000).toISOString() });
  expect((await fixture.put()).status).toBe(404);
  expect(fixture.uploads).toHaveLength(1);
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
  let artifact: Record<string, unknown> = { id: artifactId, tenant_slug: "tenant-a", created_by: "member-a", status: "ready", object_key: "tenant-a/private/file.txt", original_name: "file.txt", content_type: "text/plain", byte_size: 5, retention_expires_at: active };
  let proxied = 0;
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
    safeClientFileName: (name: string) => name,
    proxyClientStorageObject: async (input: { maxBytes: number; expectedBytes: number }) => { proxied++; expect(input.maxBytes).toBeGreaterThan(0); expect(input.expectedBytes).toBe(5); return { body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("file!")); controller.close(); } }), contentType: "text/plain", contentLength: "5" }; },
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
  const proxyResponse = await primary();
  expect(proxyResponse.status).toBe(200);
  expect(await proxyResponse.json()).toMatchObject({ downloadUrl: `/api/client-runtime/artifacts/${artifactId}/download` });
  const download = await alternate();
  expect(download.status).toBe(200);
  expect(download.headers.get("content-disposition")).toBe('attachment; filename="file.txt"');
  expect(await download.text()).toBe("file!");
  expect(proxied).toBe(1);

  currentUser = "member-b";
  expect((await (await list()).json()).artifacts).toHaveLength(0);
  expect((await primary()).status).toBe(404);
  expect((await alternate()).status).toBe(404);
  expect(proxied).toBe(1);

  artifact = { ...artifact, created_by: null, job_id: jobId };
  currentUser = "member-a";
  expect((await primary()).status).toBe(200);
  expect((await alternate()).status).toBe(200);
  currentUser = "member-b";
  expect((await primary()).status).toBe(404);
  expect((await alternate()).status).toBe(404);
  expect(proxied).toBe(2);

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
  expect(proxied).toBe(2);
});

test("storage proxy streams bounded bytes without returning an external URL", async () => {
  const originalFetch = globalThis.fetch;
  let storageRequest = "";
  try {
    globalThis.fetch = async (input, init) => {
      storageRequest = `${String(input)} ${String((init?.headers as Record<string, string>)?.Authorization ?? "")}`;
      return new Response("payload", { headers: { "content-length": "7", "content-type": "text/plain" } });
    };
    const proxied = await proxyClientStorageObject({ bucket: "fixture", objectKey: "tenant-a/file", token: "fixture-token", maxBytes: 10, expectedBytes: 7 });
    expect(proxied).not.toBeNull();
    expect(proxied?.contentType).toBe("text/plain");
    expect(await new Response(proxied!.body).text()).toBe("payload");
    expect(storageRequest).toContain("https://storage.googleapis.com/storage/v1/b/fixture/o/tenant-a%2Ffile?alt=media Bearer fixture-token");

    globalThis.fetch = async () => new Response("too large", { headers: { "content-length": "9" } });
    expect(await proxyClientStorageObject({ bucket: "fixture", objectKey: "tenant-a/file", token: "fixture-token", maxBytes: 8, expectedBytes: 9 })).toBeNull();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
