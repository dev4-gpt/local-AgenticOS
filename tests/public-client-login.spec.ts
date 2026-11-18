import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { loadReviewModule } from "./helpers/load-review-module";

const savedEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const publicRequestGuard = loadReviewModule("product-experience/src/lib/publicRequestGuard.ts", {});

test.afterEach(() => {
  process.env = { ...savedEnv };
  globalThis.fetch = originalFetch;
});

test("public menu uses the shared login entry, not a tenant URL", () => {
  const header = readFileSync("product-experience/src/components/editions/Header.tsx", "utf8");
  const loginForm = readFileSync("product-experience/src/app/login/ClientLoginForm.tsx", "utf8");
  expect(header).toContain('href="/login"');
  expect(header).not.toContain("NEXT_PUBLIC_CLIENT_RUNTIME_URL");
  expect(header).not.toContain("veloce-cloud-test");
  expect(loginForm).toContain("signal: AbortSignal.timeout(20_000)");
});

test("repeat login sends a one-time link only for one active onboarded account", async () => {
  process.env.CLIENT_LOGIN_ENABLED = "1";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  process.env.PUBLIC_APP_URL = "https://app.veloceos.cloud";
  let rows: Record<string, unknown>[] = [];
  let allowed = true;
  const sent: Array<{ url: string; init: RequestInit }> = [];
  const route = loadReviewModule("product-experience/src/app/api/client-login/request/route.ts", {
    "@/lib/publicLaunch": {
      publicEmail: (value: unknown) => typeof value === "string" && value.includes("@") ? value.toLowerCase() : null,
      publicLaunchConfig: () => ({ url: "https://db.invalid", serviceKey: "service-key" }),
      supabaseServiceSelect: async (table: string, filters: Record<string, string>) => {
        expect(table).toBe("client_onboarding_accounts");
        expect(filters).toMatchObject({ email: "eq.owner@example.com", status: "eq.active", limit: "2" });
        return { ok: true, rows };
      },
    },
    "@/lib/publicRequestGuard": { ...publicRequestGuard, allowPublicRequest: async (_request: Request, _bucket: string, requireDurable: boolean) => {
      expect(requireDurable).toBe(true);
      return allowed;
    } },
  });
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), init: init ?? {} });
    return Response.json({});
  };
  const request = (email = "OWNER@example.com") => new Request("https://app.veloceos.cloud/api/client-login/request", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
  });
  const streamedOversize = new Request("https://app.veloceos.cloud/api/client-login/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(`{"email":"${"x".repeat(100_001)}"}`)); controller.close(); } }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  expect((await route.POST(streamedOversize)).status).toBe(413);
  expect(sent).toHaveLength(0);
  expect((await route.POST(request())).status).toBe(202);
  expect(sent).toHaveLength(0);
  rows = [{ auth_user_id: "user-a", tenant_slug: "tenant-a" }];
  const response = await route.POST(request());
  expect(response.status).toBe(202);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(sent).toHaveLength(1);
  expect(sent[0].url).toBe("https://db.invalid/auth/v1/otp?redirect_to=https%3A%2F%2Fapp.veloceos.cloud%2Fauth%2Fcallback");
  expect(sent[0].init.headers).toMatchObject({ apikey: "anon-key", Authorization: "Bearer anon-key" });
  expect(JSON.parse(String(sent[0].init.body))).toEqual({ email: "owner@example.com", create_user: false });

  rows = [{ auth_user_id: "user-a", tenant_slug: "tenant-a" }, { auth_user_id: "user-b", tenant_slug: "tenant-b" }];
  expect((await route.POST(request())).status).toBe(202);
  expect(sent).toHaveLength(1);
  allowed = false;
  expect((await route.POST(request())).status).toBe(429);
  expect(sent).toHaveLength(1);
});

test("repeat login is off by default and rejects malformed requests", async () => {
  delete process.env.CLIENT_LOGIN_ENABLED;
  process.env.SUPABASE_ANON_KEY = "anon-key";
  process.env.PUBLIC_APP_URL = "https://app.veloceos.cloud";
  const route = loadReviewModule("product-experience/src/app/api/client-login/request/route.ts", {
    "@/lib/publicLaunch": {
      publicEmail: () => null,
      publicLaunchConfig: () => ({ url: "https://db.invalid", serviceKey: "service-key" }),
      supabaseServiceSelect: async () => { throw new Error("must not query"); },
    },
    "@/lib/publicRequestGuard": { ...publicRequestGuard, allowPublicRequest: async () => true },
  });
  const request = () => new Request("https://app.veloceos.cloud/api/client-login/request", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "bad" }),
  });
  expect((await route.POST(request())).status).toBe(503);
  process.env.CLIENT_LOGIN_ENABLED = "1";
  expect((await route.POST(request())).status).toBe(400);
});

test("login rate limit fails closed when durable storage is unavailable", async () => {
  process.env.SUPABASE_URL = "https://db.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  globalThis.fetch = async () => Response.json({ error: "unavailable" }, { status: 503 });
  const guard = loadReviewModule("product-experience/src/lib/publicRequestGuard.ts", {});
  const request = new Request("https://app.veloceos.cloud/api/client-login/request", { headers: { "x-forwarded-for": "192.0.2.10" } });
  expect(await guard.allowPublicRequest(request, "client-login", true)).toBe(false);
});

test("in-memory public rate limit expires old keys and caps unique-key growth", async () => {
  const priorUrl = process.env.SUPABASE_URL;
  const priorServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalNow = Date.now;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  let now = 1_800_000_000_000;
  Date.now = () => now;
  try {
    const guard = loadReviewModule("product-experience/src/lib/publicRequestGuard.ts", {});
    const requestFor = (index: number) => new Request("https://app.veloceos.cloud/api/support", {
      headers: { "x-forwarded-for": `198.51.${Math.floor(index / 256)}.${index % 256}` },
    });
    let accepted = 0;
    for (let index = 0; index < 10_000; index += 1) {
      accepted += Number(await guard.allowPublicRequest(requestFor(index), "memory-cap-test"));
    }
    expect(accepted).toBe(10_000);
    expect(await guard.allowPublicRequest(requestFor(10_000), "memory-cap-test")).toBe(false);
    now += 15 * 60 * 1000 + 1;
    expect(await guard.allowPublicRequest(requestFor(10_000), "memory-cap-test")).toBe(true);
  } finally {
    Date.now = originalNow;
    if (priorUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = priorUrl;
    if (priorServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = priorServiceKey;
  }
});
