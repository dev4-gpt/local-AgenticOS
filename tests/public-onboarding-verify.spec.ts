import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { loadReviewModule } from "./helpers/load-review-module";

test("verification link is single-use, expires, and rolls back on a downstream write failure", async () => {
  const db = new PGlite();
  const hash = (digit: string) => digit.repeat(64);
  const requestId = "00000000-0000-4000-8000-000000000001";
  const accountId = "00000000-0000-4000-8000-000000000002";
  const failedRequestId = "00000000-0000-4000-8000-000000000003";
  const failedAccountId = "00000000-0000-4000-8000-000000000004";
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table deployment_requests (id uuid primary key, email_verified_at timestamptz);
      create table client_onboarding_accounts (id uuid primary key, request_id uuid not null references deployment_requests(id), email text not null, status text not null, updated_at timestamptz);
      create table client_onboarding_tokens (id uuid primary key, onboarding_id uuid not null references client_onboarding_accounts(id), token_hash text unique not null, purpose text not null, expires_at timestamptz not null, consumed_at timestamptz);
      insert into deployment_requests(id) values ('${requestId}'), ('${failedRequestId}');
      insert into client_onboarding_accounts(id, request_id, email, status) values
        ('${accountId}', '${requestId}', 'buyer@example.test', 'requested'),
        ('${failedAccountId}', '${failedRequestId}', 'failure@example.test', 'requested');
      insert into client_onboarding_tokens(id, onboarding_id, token_hash, purpose, expires_at) values
        ('00000000-0000-4000-8000-000000000011', '${accountId}', '${hash("a")}', 'verify-email', now() + interval '1 hour'),
        ('00000000-0000-4000-8000-000000000012', '${accountId}', '${hash("b")}', 'verify-email', now() - interval '1 hour'),
        ('00000000-0000-4000-8000-000000000013', '${accountId}', '${hash("c")}', 'setup', now() + interval '1 hour'),
        ('00000000-0000-4000-8000-000000000014', '${failedAccountId}', '${hash("d")}', 'verify-email', now() + interval '1 hour');
    `);
    const migration = readFileSync("product-experience/supabase-v45-onboarding-verify-token.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);
    const privilege = async (role: string) => (await db.query<{ allowed: boolean }>(`select has_function_privilege('${role}', 'public.consume_client_onboarding_verify_token(text)', 'execute') as allowed`)).rows[0].allowed;
    expect(await privilege("anon")).toBe(false);
    expect(await privilege("authenticated")).toBe(false);
    expect(await privilege("service_role")).toBe(true);
    await db.exec("set role authenticated");
    await expect(db.exec(`select consume_client_onboarding_verify_token('${hash("a")}')`)).rejects.toThrow(/permission denied/);
    await db.exec("reset role");

    const consume = async (value: string) => (await db.query<{ result: Record<string, unknown> | null }>(`select consume_client_onboarding_verify_token('${value}') as result`)).rows[0].result;
    expect(await consume(hash("b"))).toBeNull();
    expect(await consume(hash("c"))).toBeNull();
    expect(await consume("bad-hash")).toBeNull();
    expect(await consume(hash("a"))).toMatchObject({ onboardingId: accountId, requestId, email: "buyer@example.test", status: "email_verified" });
    expect(await consume(hash("a"))).toBeNull();
    const state = await db.query<{ status: string; consumed: boolean; verified: boolean }>(`
      select a.status, t.consumed_at is not null as consumed, r.email_verified_at is not null as verified
        from client_onboarding_accounts a join client_onboarding_tokens t on t.onboarding_id = a.id
        join deployment_requests r on r.id = a.request_id where t.token_hash = '${hash("a")}'
    `);
    expect(state.rows[0]).toEqual({ status: "email_verified", consumed: true, verified: true });

    await db.exec(`
      create function reject_verification_update() returns trigger language plpgsql as $$ begin
        if new.id = '${failedRequestId}' then raise exception 'simulated downstream failure'; end if;
        return new;
      end $$;
      create trigger reject_verification before update on deployment_requests for each row execute function reject_verification_update();
    `);
    await expect(consume(hash("d"))).rejects.toThrow(/simulated downstream failure/);
    const rolledBack = await db.query<{ status: string; consumed: boolean; verified: boolean }>(`
      select a.status, t.consumed_at is not null as consumed, r.email_verified_at is not null as verified
        from client_onboarding_accounts a join client_onboarding_tokens t on t.onboarding_id = a.id
        join deployment_requests r on r.id = a.request_id where t.token_hash = '${hash("d")}'
    `);
    expect(rolledBack.rows[0]).toEqual({ status: "requested", consumed: false, verified: false });
  } finally { await db.close(); }
});

test("verification API only advances on a valid transactional RPC result", async () => {
  const calls: Array<{ name: string; body: Record<string, unknown> }> = [];
  let result: { ok: boolean; value: unknown } = { ok: true, value: { onboardingId: "onboarding-1", requestId: "request-1", email: "buyer@example.test", status: "email_verified" } };
  const route = loadReviewModule("product-experience/src/app/api/onboarding/verify/route.ts", {
    "@/lib/publicLaunch": {
      hashSetupToken: () => "hashed-token",
      supabaseServiceRpc: async (name: string, body: Record<string, unknown>) => { calls.push({ name, body }); return result; },
    },
  });
  const request = () => new Request("http://localhost/api/onboarding/verify", { method: "POST", body: JSON.stringify({ token: "a-valid-looking-token-with-length" }) });
  const success = await route.POST(request());
  expect(success.status).toBe(200);
  expect(await success.json()).toMatchObject({ ok: true, requestId: "request-1", next: "payment" });
  expect(calls).toEqual([{ name: "consume_client_onboarding_verify_token", body: { p_token_hash: "hashed-token" } }]);
  result = { ok: true, value: null };
  const replay = await route.POST(request());
  expect(replay.status).toBe(400);
  expect(await replay.json()).toMatchObject({ error: "token_invalid_or_expired" });
  result = { ok: false, value: null };
  const unavailable = await route.POST(request());
  expect(unavailable.status).toBe(502);
  expect(await unavailable.json()).toMatchObject({ error: "verification_store_failed" });
  result = { ok: true, value: undefined };
  const malformed = await route.POST(request());
  expect(malformed.status).toBe(502);
  expect(await malformed.json()).toMatchObject({ error: "verification_store_failed" });
});
