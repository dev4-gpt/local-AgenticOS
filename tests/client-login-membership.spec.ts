import { expect, test } from "@playwright/test";
import { loadReviewModule } from "./helpers/load-review-module";

const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;
const user = { id: "synthetic-user", email: "approved@example.invalid" };
const session = { access_token: "synthetic-access", refresh_token: "synthetic-refresh", user, expires_in: 1800 };

test.beforeEach(() => {
  Object.assign(process.env, { VELOCE_CLIENT_EDITION: "1", SUPABASE_URL: "https://db.invalid", SUPABASE_ANON_KEY: "synthetic-anon", CLIENT_SLUG: "tenant-a" });
});
test.afterEach(() => { process.env = { ...savedEnv }; globalThis.fetch = realFetch; });

function membershipModule() {
  return loadReviewModule("src/lib/clientAuth.ts", { "next/headers": { cookies: async () => ({ get: () => undefined }) } });
}

test("membership uses only the configured tenant and authenticated token", async () => {
  globalThis.fetch = async (url, init) => {
    expect(String(url)).toBe("https://db.invalid/rest/v1/rpc/client_member");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer synthetic-access");
    expect(JSON.parse(String(init?.body))).toEqual({ p_tenant_slug: "tenant-a" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    return Response.json(true);
  };
  expect(await membershipModule().clientMembershipForToken("synthetic-access")).toEqual({ ok: true, member: true });
});

test("only a successful boolean false response proves non-membership", async () => {
  const mod = membershipModule();
  globalThis.fetch = async () => Response.json(false);
  expect(await mod.clientMembershipForToken("synthetic-access")).toEqual({ ok: true, member: false });
  for (const response of [Response.json({ error: "synthetic-failure" }, { status: 503 }), Response.json("true"), Response.json(null), new Response("malformed")]) {
    globalThis.fetch = async () => response;
    expect(await mod.clientMembershipForToken("synthetic-access")).toEqual({ ok: false, error: "tenant_membership_unavailable" });
  }
  globalThis.fetch = async () => { throw new Error("network unavailable"); };
  expect(await mod.clientMembershipForToken("synthetic-access")).toEqual({ ok: false, error: "tenant_membership_unavailable" });
});

test("missing tenant configuration or token never sends a membership request", async () => {
  globalThis.fetch = async () => { throw new Error("must not fetch"); };
  const mod = membershipModule();
  expect(await mod.clientMembershipForToken(null)).toEqual({ ok: false, error: "tenant_membership_unavailable" });
  delete process.env.CLIENT_SLUG;
  expect(await mod.clientMembershipForToken("synthetic-access")).toEqual({ ok: false, error: "tenant_not_configured" });
});

for (const outcome of [
  { membership: { ok: true, member: false }, status: 403, error: "tenant_membership_required" },
  { membership: { ok: false, error: "tenant_membership_unavailable" }, status: 503, error: "tenant_membership_unavailable" },
  { membership: { ok: false, error: "tenant_not_configured" }, status: 503, error: "tenant_not_configured" },
  { membership: { ok: true, member: true }, status: 200, error: undefined },
]) {
  test(`password login checks membership before issuing cookies: ${outcome.error || "allowed"}`, async () => {
    let checks = 0;
    const route = loadReviewModule("src/app/api/client-auth/login/route.ts", {
      "@/lib/clientAuth": {
        supabaseAuthConfig: () => ({ url: "https://db.invalid", key: "synthetic-anon" }),
        clientUserEmailAllowed: () => true,
        authCookieNames: () => ({ access: "veloce_access_token", refresh: "veloce_refresh_token" }),
        clientMembershipForToken: async (token: string) => { expect(token).toBe(session.access_token); checks++; return outcome.membership; },
      },
    });
    globalThis.fetch = async () => Response.json(session);
    const response: Response = await route.POST(new Request("https://runtime.invalid/api/client-auth/login", { method: "POST", body: JSON.stringify({ email: user.email, password: "synthetic-password" }) }));
    expect(response.status).toBe(outcome.status);
    expect(checks).toBe(1);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.error).toBe(outcome.error);
    expect(JSON.stringify(body)).not.toContain("synthetic-access");
    expect(JSON.stringify(body)).not.toContain("synthetic-refresh");
    if (outcome.status !== 200) expect(response.headers.get("set-cookie")).toBeNull();
    else {
      expect(response.headers.get("set-cookie")).toContain("veloce_access_token=");
      expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    }
  });
}

for (const [membership, authorized, error] of [
  [{ ok: true, member: true }, true, null],
  [{ ok: true, member: false }, false, "tenant_membership_required"],
  [{ ok: false, error: "tenant_membership_unavailable" }, false, "tenant_membership_unavailable"],
] as const) {
  test(`session distinguishes authentication from workspace authorization: ${error || "allowed"}`, async () => {
    const route = loadReviewModule("src/app/api/client-auth/session/route.ts", {
      "@/lib/clientAuth": {
        currentClientUser: async () => user,
        currentClientAccessToken: async () => session.access_token,
        clientMembershipForToken: async () => membership,
      },
    });
    const response: Response = await route.GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, authenticated: true, workspaceAuthorized: authorized, accessError: error, user });
  });
}

test("unauthenticated session does not query or reveal tenant membership", async () => {
  const route = loadReviewModule("src/app/api/client-auth/session/route.ts", {
    "@/lib/clientAuth": {
      currentClientUser: async () => null,
      clientMembershipForToken: async () => { throw new Error("must not check membership"); },
    },
  });
  expect(await (await route.GET()).json()).toEqual({ ok: true, authenticated: false, workspaceAuthorized: false, accessError: null, user: null });
});

test("operator session does not acquire a new client-tenant requirement", async () => {
  process.env.VELOCE_CLIENT_EDITION = "0";
  const route = loadReviewModule("src/app/api/client-auth/session/route.ts", {
    "@/lib/clientAuth": {
      currentClientUser: async () => user,
      clientMembershipForToken: async () => { throw new Error("must not check client membership"); },
    },
  });
  expect(await (await route.GET()).json()).toMatchObject({ authenticated: true, workspaceAuthorized: true, accessError: null });
});
