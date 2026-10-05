import { expect, test } from "@playwright/test";
import { loadReviewModule } from "./helpers/load-review-module";

const token = "synthetic-local-token-123456789";
const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
let calls: unknown[][];
let cliResult: { status: number | null; stdout: string; error?: Error };

test.beforeEach(() => {
  process.env = { ...originalEnv, NODE_ENV: "development", VELOCE_CLIENT_EDITION: "1", CLIENT_RUNTIME_LOCAL_GCLOUD_AUTH: "1" };
  calls = [];
  cliResult = { status: 0, stdout: `${token}\n` };
  globalThis.fetch = async () => new Response(null, { status: 404 });
});

test.afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

function identity() {
  return loadReviewModule("src/lib/clientGcpIdentity.ts", {
    "node:child_process": { spawnSync: (...args: unknown[]) => { calls.push(args); return cliResult; } },
  });
}

test("Cloud Run metadata identity takes precedence without invoking the CLI", async () => {
  globalThis.fetch = async (url, init) => {
    expect(String(url)).toBe("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token");
    expect(new Headers(init?.headers).get("Metadata-Flavor")).toBe("Google");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    return Response.json({ access_token: "metadata-token" });
  };
  expect(await identity().clientRuntimeAccessToken()).toBe("metadata-token");
  expect(calls).toHaveLength(0);
});

for (const [name, overrides] of Object.entries({
  production: { NODE_ENV: "production" },
  test: { NODE_ENV: "test" },
  unspecified: { NODE_ENV: "" },
  "non-client": { VELOCE_CLIENT_EDITION: "0" },
  "no opt-in": { CLIENT_RUNTIME_LOCAL_GCLOUD_AUTH: "0" },
})) {
  test(`${name} never invokes local credentials when metadata is unavailable`, async () => {
    Object.assign(process.env, overrides);
    expect(await identity().clientRuntimeAccessToken()).toBeNull();
    expect(calls).toHaveLength(0);
  });
}

test("explicit development opt-in uses bounded CLI execution without printing credentials", async () => {
  globalThis.fetch = async () => { throw new Error("No local metadata service"); };
  expect(await identity().clientRuntimeAccessToken()).toBe(token);
  expect(calls).toEqual([["gcloud", ["auth", "print-access-token"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10_000,
  }]]);
});

test("failed, missing, or malformed CLI credentials fail closed", async () => {
  for (const result of [
    { status: 1, stdout: token },
    { status: null, stdout: token, error: new Error("timeout") },
    { status: 0, stdout: "" },
    { status: 0, stdout: "not a valid token\nwith output" },
  ]) {
    cliResult = result;
    expect(await identity().clientRuntimeAccessToken()).toBeNull();
  }
});

test("malformed metadata falls back only for an opted-in development client", async () => {
  for (const body of ["invalid-json", JSON.stringify({ access_token: 7 }), JSON.stringify({ access_token: "" })]) {
    globalThis.fetch = async () => new Response(body);
    expect(await identity().clientRuntimeAccessToken()).toBe(token);
  }
});

test("storage and background tasks both delegate to the guarded identity helper", async () => {
  let resolutions = 0;
  const mocks = { "./clientGcpIdentity": { clientRuntimeAccessToken: async () => { resolutions++; return null; } } };
  const storage = loadReviewModule("src/lib/clientStorage.ts", mocks);
  expect(await storage.clientGcpAccessToken()).toBeNull();
  Object.assign(process.env, {
    GOOGLE_CLOUD_PROJECT: "test-project", CLIENT_RUNTIME_TASK_REGION: "test-region",
    CLIENT_RUNTIME_TASK_QUEUE: "test-queue", CLIENT_RUNTIME_BASE_URL: "https://test.example",
    CLIENT_RUNTIME_SERVICE_ACCOUNT: "test@example.invalid", CLIENT_TASK_INVOKER_SERVICE_ACCOUNT: "",
  });
  const tasks = loadReviewModule("src/lib/cloudTasks.ts", mocks);
  expect(await tasks.enqueueClientRuntimeTask({ jobId: "test-job", tenantSlug: "test-tenant" })).toMatchObject({ ok: false, error: "gcp_identity_unavailable" });
  expect(resolutions).toBe(2);
});
