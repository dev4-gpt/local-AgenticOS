import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, test } from "@playwright/test";

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table client_onboarding_accounts (id uuid primary key);
    create table client_onboarding_tokens (
      id uuid primary key,
      onboarding_id uuid not null references client_onboarding_accounts(id) on delete cascade,
      token_hash text not null unique,
      purpose text not null,
      expires_at timestamptz not null,
      consumed_at timestamptz,
      created_at timestamptz not null default now()
    );
    insert into client_onboarding_accounts values
      ('00000000-0000-4000-8000-000000000001'),
      ('00000000-0000-4000-8000-000000000002'),
      ('00000000-0000-4000-8000-000000000003');
    insert into client_onboarding_tokens(id, onboarding_id, token_hash, purpose, expires_at) values
      ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'old-hash', 'setup', now() - interval '8 days'),
      ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000002', 'recovery-hash', 'verify-email', now() - interval '6 days'),
      ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000003', 'current-hash', 'setup', now() + interval '1 hour');
  `);
  const migration = readFileSync("product-experience/supabase-client-onboarding-token-retention.sql", "utf8");
  await db.exec(migration);
  await db.exec(migration);
  return db;
}

const purge = "select public.purge_expired_client_onboarding_tokens($1, $2) as result";

test("expired onboarding token hashes have a seven-day recovery window", async () => {
  const db = await database();
  try {
    const preview = await db.query<{ result: Record<string, unknown> }>(purge, [false, 1]);
    expect(preview.rows[0].result).toMatchObject({
      candidates: 1, deleted: 0, remainingCandidates: 1, recoveryDays: 7, applied: false,
    });
    expect((await db.query("select id from client_onboarding_tokens order by id")).rows).toHaveLength(3);

    const first = await db.query<{ result: Record<string, unknown> }>(purge, [true, 1]);
    expect(first.rows[0].result).toMatchObject({ candidates: 1, deleted: 1, remainingCandidates: 0, applied: true });
    expect((await db.query("select token_hash from client_onboarding_tokens order by id")).rows).toEqual([
      { token_hash: "recovery-hash" },
      { token_hash: "current-hash" },
    ]);
  } finally {
    await db.close();
  }
});

test("onboarding token purge is bounded and service-role only", async () => {
  const db = await database();
  try {
    const privileges = await db.query<{ anon: boolean; authenticated: boolean; operator: boolean }>(`
      select has_function_privilege('anon', 'public.purge_expired_client_onboarding_tokens(boolean,integer)', 'EXECUTE') as anon,
        has_function_privilege('authenticated', 'public.purge_expired_client_onboarding_tokens(boolean,integer)', 'EXECUTE') as authenticated,
        has_function_privilege('service_role', 'public.purge_expired_client_onboarding_tokens(boolean,integer)', 'EXECUTE') as operator
    `);
    expect(privileges.rows[0]).toEqual({ anon: false, authenticated: false, operator: true });
    await expect(db.query(purge, [true, 1001])).rejects.toThrow(/onboarding_token_retention_invalid_input/);
    await expect(db.query(purge, [null, 1])).rejects.toThrow(/onboarding_token_retention_invalid_input/);
  } finally {
    await db.close();
  }
});
