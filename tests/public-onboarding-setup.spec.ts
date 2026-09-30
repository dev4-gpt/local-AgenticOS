import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { loadReviewModule } from "./helpers/load-review-module";

test("setup token atomically binds the correct tenant owner and is single-use", async () => {
  const db = new PGlite();
  const hash = (digit: string) => digit.repeat(64);
  const account = "00000000-0000-4000-8000-000000000001";
  const user = "00000000-0000-4000-8000-000000000002";
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table client_onboarding_accounts (id uuid primary key, tenant_slug text, status text not null, auth_user_id uuid, updated_at timestamptz);
      create table client_onboarding_tokens (id uuid primary key, onboarding_id uuid not null references client_onboarding_accounts(id), token_hash text unique not null, purpose text not null, expires_at timestamptz not null, consumed_at timestamptz);
      create table client_memberships (tenant_slug text not null, user_id uuid not null, role text not null, status text not null, unique (tenant_slug, user_id));
      insert into client_onboarding_accounts (id, tenant_slug, status) values ('${account}', 'tenant-a', 'active');
      insert into client_onboarding_tokens (id, onboarding_id, token_hash, purpose, expires_at, consumed_at) values
        ('00000000-0000-4000-8000-000000000011', '${account}', '${hash("a")}', 'setup', now() + interval '1 hour', null),
        ('00000000-0000-4000-8000-000000000012', '${account}', '${hash("b")}', 'setup', now() - interval '1 hour', null),
        ('00000000-0000-4000-8000-000000000013', '${account}', '${hash("c")}', 'verify-email', now() + interval '1 hour', null),
        ('00000000-0000-4000-8000-000000000014', '${account}', '${hash("d")}', 'setup', now() + interval '1 hour', now());
    `);
    const migration = readFileSync("product-experience/supabase-v46-onboarding-setup-token.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);
    const privilege = async (role: string) => (await db.query<{ allowed: boolean }>(`select has_function_privilege('${role}', 'public.consume_client_onboarding_setup_token(text, uuid)', 'execute') as allowed`)).rows[0].allowed;
    expect(await privilege("anon")).toBe(false);
    expect(await privilege("authenticated")).toBe(false);
    expect(await privilege("service_role")).toBe(true);
    const consume = async (value: string, authUser = user) => (await db.query<{ result: Record<string, unknown> | null }>(`select consume_client_onboarding_setup_token('${value}', '${authUser}') as result`)).rows[0].result;
    expect(await consume(hash("b"))).toBeNull();
    expect(await consume(hash("c"))).toBeNull();
    expect(await consume(hash("d"))).toBeNull();
    expect(await consume("bad-hash")).toBeNull();
    await db.exec(`update client_onboarding_accounts set status='suspended' where id='${account}'`);
    expect(await consume(hash("a"))).toBeNull();
    await db.exec(`update client_onboarding_accounts set status='active', auth_user_id='00000000-0000-4000-8000-000000000099' where id='${account}'`);
    expect(await consume(hash("a"))).toBeNull();
    await db.exec(`update client_onboarding_accounts set auth_user_id=null where id='${account}'`);
    expect(await consume(hash("a"))).toMatchObject({ onboardingId: account, tenantSlug: "tenant-a", status: "ready" });
    expect(await consume(hash("a"))).toBeNull();
    const bound = await db.query<{ tenant_slug: string; user_id: string; role: string; status: string }>("select * from client_memberships");
    expect(bound.rows).toEqual([{ tenant_slug: "tenant-a", user_id: user, role: "owner", status: "active" }]);
    const state = await db.query<{ consumed: boolean; auth_user_id: string }>(`select t.consumed_at is not null as consumed, a.auth_user_id from client_onboarding_tokens t join client_onboarding_accounts a on a.id=t.onboarding_id where t.token_hash='${hash("a")}'`);
    expect(state.rows[0]).toEqual({ consumed: true, auth_user_id: user });
    await db.exec("set role authenticated");
    await expect(db.exec(`select consume_client_onboarding_setup_token('${hash("b")}', '${user}')`)).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  } finally { await db.close(); }
});

test("setup token rolls back consumption if owner binding fails", async () => {
  const db = new PGlite();
  const hash = "e".repeat(64);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table client_onboarding_accounts (id uuid primary key, tenant_slug text, status text not null, auth_user_id uuid, updated_at timestamptz);
      create table client_onboarding_tokens (id uuid primary key, onboarding_id uuid not null references client_onboarding_accounts(id), token_hash text unique not null, purpose text not null, expires_at timestamptz not null, consumed_at timestamptz);
      create table client_memberships (tenant_slug text not null, user_id uuid not null, role text not null, status text not null, unique (tenant_slug, user_id));
      insert into client_onboarding_accounts (id, tenant_slug, status) values ('00000000-0000-4000-8000-000000000001', 'tenant-a', 'active');
      insert into client_onboarding_tokens (id, onboarding_id, token_hash, purpose, expires_at) values ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', '${hash}', 'setup', now() + interval '1 hour');
      create function reject_owner() returns trigger language plpgsql as $$ begin raise exception 'simulated owner bind failure'; end $$;
      create trigger reject_owner_insert before insert on client_memberships for each row execute function reject_owner();
    `);
    await db.exec(readFileSync("product-experience/supabase-v46-onboarding-setup-token.sql", "utf8"));
    await expect(db.query(`select consume_client_onboarding_setup_token('${hash}', '00000000-0000-4000-8000-000000000002')`)).rejects.toThrow(/simulated owner bind failure/);
    const state = await db.query<{ consumed: boolean; auth_user_id: string | null }>("select t.consumed_at is not null as consumed, a.auth_user_id from client_onboarding_tokens t join client_onboarding_accounts a on a.id=t.onboarding_id");
    expect(state.rows[0]).toEqual({ consumed: false, auth_user_id: null });
  } finally { await db.close(); }
});

test("setup API never returns a generated link unless token completion succeeds", async () => {
  const previousFetch = globalThis.fetch;
  const previousAppUrl = process.env.PUBLIC_APP_URL;
  let result: { ok: boolean; value: unknown } = { ok: true, value: null };
  const validLink = "https://db.invalid/auth/v1/verify?token=fake-magic-token&type=magiclink&redirect_to=https%3A%2F%2Fapp.veloceos.cloud%2Fauth%2Fcallback";
  let actionLink = validLink;
  let rpcCalls = 0;
  try {
    delete process.env.PUBLIC_APP_URL;
    globalThis.fetch = async () => Response.json({ action_link: actionLink, id: "00000000-0000-4000-8000-000000000002" });
    const route = loadReviewModule("product-experience/src/app/api/onboarding/setup/route.ts", {
      "@/lib/publicLaunch": {
        hashSetupToken: () => "f".repeat(64),
        publicLaunchConfig: () => ({ url: "https://db.invalid", serviceKey: "service-key" }),
        supabaseServiceSelect: async (table: string) => ({ ok: true, rows: table === "client_onboarding_tokens"
          ? [{ id: "token-a", onboarding_id: "onboarding-a", expires_at: new Date(Date.now() + 60_000).toISOString() }]
          : [{ email: "owner@example.com", tenant_slug: "tenant-a", status: "active" }] }),
        supabaseServiceRpc: async () => { rpcCalls++; return result; },
      },
    });
    const request = () => new Request("https://control.invalid/api/onboarding/setup", { method: "POST", body: JSON.stringify({ token: "setup-link-token" }) });
    expect((await route.POST(request())).status).toBe(400);
    result = { ok: false, value: null };
    expect((await route.POST(request())).status).toBe(502);
    result = { ok: true, value: { status: "ready" } };
    const success = await route.POST(request());
    expect(success.status).toBe(200);
    expect(success.headers.get("cache-control")).toBe("no-store");
    expect(await success.json()).toMatchObject({ actionLink: validLink });
    const callsBeforeInvalidLink = rpcCalls;
    for (const invalidLink of [
      validLink.replace("https://db.invalid", "https://evil.invalid"),
      validLink.replace("app.veloceos.cloud", "evil.invalid"),
      validLink.replace("/auth/v1/verify", "/other"),
      validLink.replace("type=magiclink", "type=signup"),
      validLink.replace("token=fake-magic-token", "token="),
      validLink.replace("https://db.invalid", "https://user@db.invalid"),
    ]) {
      actionLink = invalidLink;
      const rejected = await route.POST(request());
      expect(rejected.status).toBe(502);
      expect(await rejected.json()).toMatchObject({ error: "auth_link_invalid" });
      expect(rpcCalls).toBe(callsBeforeInvalidLink);
    }
    actionLink = validLink;
    process.env.PUBLIC_APP_URL = "not a URL";
    expect((await route.POST(request())).status).toBe(503);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousAppUrl === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = previousAppUrl;
  }
});
