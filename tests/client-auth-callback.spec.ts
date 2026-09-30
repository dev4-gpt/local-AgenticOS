import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadReviewModule } from "./helpers/load-review-module";

const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;

test.afterEach(() => {
  process.env = { ...savedEnv };
  globalThis.fetch = realFetch;
});

test("callback removes implicit-flow credentials from browser history before posting same-origin", () => {
  const page = readFileSync(resolve(process.cwd(), "src/app/auth/callback/page.tsx"), "utf8");
  expect(page).toContain('window.history.replaceState(null, "", "/auth/callback")');
  expect(page).toContain('fetch("/api/client-auth/magic-link"');
  expect(page).toContain('credentials: "same-origin"');
  expect(page).not.toContain("window.location.href");
});

test("callback bypasses the client workspace shell gate", () => {
  const shell = readFileSync(resolve(process.cwd(), "src/components/Shell.tsx"), "utf8");
  expect(shell).toContain('pathname === "/auth/callback"');
});

test("public callback strips credentials before resolving one active runtime", () => {
  const page = readFileSync(resolve(process.cwd(), "product-experience/src/app/auth/callback/page.tsx"), "utf8");
  expect(page).toContain('window.history.replaceState(null, "", "/auth/callback")');
  expect(page).toContain('fetch("/api/onboarding/runtime-destination"');
  expect(page).toContain("const runtime = new URL(body.runtimeUrl)");
  expect(page).toContain('new URL("/auth/callback", runtime.origin)');
  expect(page).toContain("target.hash = new URLSearchParams");
});

test("runtime destination accepts exactly one active account for the authenticated user", async () => {
  process.env.SUPABASE_URL = "https://db.invalid";
  const lookups: Array<Record<string, string>> = [];
  let rows: Record<string, unknown>[] = [{ runtime_url: "https://tenant-a.run.app" }];
  const mod = loadReviewModule("product-experience/src/app/api/onboarding/runtime-destination/route.ts", {
    "@/lib/publicLaunch": {
      publicLaunchConfig: () => ({ url: "https://db.invalid", serviceKey: "service-key" }),
      supabaseServiceSelect: async (_table: string, filters: Record<string, string>) => { lookups.push(filters); return { ok: true, rows }; },
    },
  });
  globalThis.fetch = async (url, init) => {
    expect(String(url)).toBe("https://db.invalid/auth/v1/user");
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${"a".repeat(24)}` });
    return Response.json({ id: "user-a" });
  };
  const request = () => new Request("https://app.invalid/api/onboarding/runtime-destination", { method: "POST", headers: { authorization: `Bearer ${"a".repeat(24)}` } });
  const success = await mod.POST(request());
  expect(success.status).toBe(200);
  expect(success.headers.get("cache-control")).toBe("no-store");
  expect(await success.json()).toEqual({ ok: true, runtimeUrl: "https://tenant-a.run.app" });
  expect(lookups).toEqual([{ auth_user_id: "eq.user-a", status: "eq.active", select: "runtime_url", limit: "2" }]);
  rows = [{ runtime_url: "https://tenant-a.run.app" }, { runtime_url: "https://tenant-b.run.app" }];
  expect((await mod.POST(request())).status).toBe(403);
  rows = [{ runtime_url: "https://tenant-a.run.app.evil.example" }];
  expect((await mod.POST(request())).status).toBe(403);
  for (const runtimeUrl of [
    "https://evil.example?.run.app",
    "https://evil.example#.run.app",
    "https://user@tenant-a.run.app",
    "https://tenant-a.run.app:444",
    "https://tenant-a.run.app/redirect",
    "https://tenant-a.run.app?next=evil.example",
  ]) {
    rows = [{ runtime_url: runtimeUrl }];
    expect((await mod.POST(request())).status, runtimeUrl).toBe(403);
  }
  rows = [];
  expect((await mod.POST(request())).status).toBe(403);
});

test("magic-link route accepts Supabase's 12-character refresh token for an allowlisted tenant member", async () => {
  process.env.SUPABASE_URL = "https://db.invalid";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  process.env.CLIENT_SLUG = "tenant-a";
  process.env.VELOCE_CLIENT_EDITION = "1";
  const cookieWrites: Array<[string, string, Record<string, unknown>]> = [];
  const mod = loadMagicLinkRoute(cookieWrites);
  const requests: string[] = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    if (String(url).includes("grant_type=refresh_token")) {
      return Response.json({
        access_token: "access-token",
        refresh_token: "rotated-refresh-token",
        expires_in: 1800,
        user: { id: "user-a", email: "approved@example.com" },
      });
    }
    return Response.json(true);
  };

  const response = await mod.POST(new Request("https://runtime.invalid/api/client-auth/magic-link", {
    method: "POST",
    body: JSON.stringify({ accessToken: "browser-token", refreshToken: "a".repeat(12) }),
  }));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(requests).toEqual([
    "https://db.invalid/auth/v1/token?grant_type=refresh_token",
    "https://db.invalid/rest/v1/rpc/client_member",
  ]);
  expect(cookieWrites).toEqual([
    ["veloce_access_token", "access-token", expect.objectContaining({ httpOnly: true, sameSite: "lax", maxAge: 1800 })],
    ["veloce_refresh_token", "rotated-refresh-token", expect.objectContaining({ httpOnly: true, sameSite: "lax", maxAge: 2_592_000 })],
  ]);
});

test("magic-link route rejects an unapproved email before the membership lookup", async () => {
  process.env.SUPABASE_URL = "https://db.invalid";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  process.env.CLIENT_SLUG = "tenant-a";
  process.env.VELOCE_CLIENT_EDITION = "1";
  const mod = loadMagicLinkRoute([]);
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({
      access_token: "access-token",
      refresh_token: "rotated-refresh-token",
      user: { id: "user-b", email: "not-approved@example.com" },
    });
  };

  const response = await mod.POST(new Request("https://runtime.invalid/api/client-auth/magic-link", {
    method: "POST",
    body: JSON.stringify({ refreshToken: "b".repeat(24) }),
  }));

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ ok: false, error: "session_rejected" });
  expect(calls).toBe(1);
});

test("magic-link route rejects a user with no active tenant membership", async () => {
  process.env.SUPABASE_URL = "https://db.invalid";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  process.env.CLIENT_SLUG = "tenant-a";
  process.env.VELOCE_CLIENT_EDITION = "1";
  const mod = loadMagicLinkRoute([]);
  globalThis.fetch = async (url) => String(url).includes("grant_type=refresh_token")
    ? Response.json({ access_token: "access-token", refresh_token: "rotated-refresh-token", user: { id: "user-a", email: "approved@example.com" } })
    : Response.json(false);

  const response = await mod.POST(new Request("https://runtime.invalid/api/client-auth/magic-link", {
    method: "POST",
    body: JSON.stringify({ refreshToken: "c".repeat(24) }),
  }));

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ ok: false, error: "tenant_membership_required" });
});

function loadMagicLinkRoute(cookieWrites: Array<[string, string, Record<string, unknown>]>) {
  return loadReviewModule("src/app/api/client-auth/magic-link/route.ts", {
    "next/server": {
      NextResponse: {
        json: (body: unknown, init?: ResponseInit) => Object.assign(new Response(JSON.stringify(body), init), {
          cookies: { set: (name: string, value: string, options: Record<string, unknown>) => cookieWrites.push([name, value, options]) },
        }),
      },
    },
    "@/lib/clientAuth": {
      authCookieNames: () => ({ access: "veloce_access_token", refresh: "veloce_refresh_token" }),
      clientUserEmailAllowed: (email: string | undefined) => email === "approved@example.com",
      supabaseAuthConfig: () => ({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY }),
    },
  });
}
