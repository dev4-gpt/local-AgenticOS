import { expect, test } from "@playwright/test";
import { loadReviewModule } from "./helpers/load-review-module";

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
