import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

test("real PostgreSQL: role, worker-token, revocation and cross-month cap regressions", async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const migration = async (name: string) => db.exec(readFileSync(`product-experience/${name}.sql`, "utf8"));
  const scalar = async (sql: string) => (await db.query<{ value: unknown }>(`select ${sql} as value`)).rows[0].value;
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema extensions; create extension pgcrypto with schema extensions;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table client_tenants (slug text primary key, status text, worker_token_hash text);
      create table client_memberships (tenant_slug text, user_id uuid, status text, role text);
      create function client_member(p_tenant_slug text) returns boolean language sql as $$ select exists(select 1 from client_memberships where tenant_slug=p_tenant_slug and user_id=auth.uid() and status='active') $$;
      create table client_provider_connections (tenant_slug text, catalog_id text, provider_key text, credential_mode text, status text, secret_resource text, validation_metadata jsonb, revoked_at timestamptz, updated_at timestamptz, unique(tenant_slug,provider_key));
      create table client_credit_accounts (tenant_slug text primary key, balance_micros bigint default 0, reserved_micros bigint default 0, warning_threshold_micros bigint, updated_at timestamptz);
      create table client_credit_transactions (tenant_slug text, idempotency_key text, kind text, amount_micros bigint, balance_after_micros bigint, provider text, pricing_snapshot_id text, metadata jsonb, created_at timestamptz default now(), unique(tenant_slug,idempotency_key));
      create table client_credit_budgets (tenant_slug text, catalog_id text, provider_key text, purchased_micros bigint, reserved_micros bigint, spent_micros bigint, managed_route_enabled boolean, status text, updated_at timestamptz);
      create table client_credit_reservations (id uuid primary key default gen_random_uuid(),tenant_slug text,catalog_id text,provider_key text,idempotency_key text,quoted_amount_micros bigint,reserved_amount_micros bigint,pricing_snapshot_id text,expires_at timestamptz,reconciliation_metadata jsonb,audit_metadata jsonb,status text default 'reserved',actual_amount_micros bigint,settled_at timestamptz);
      create table client_credit_reservation_events (reservation_id uuid,tenant_slug text,event_type text,idempotency_key text,amount_micros bigint,metadata jsonb,unique(reservation_id,idempotency_key));
      insert into client_tenants values ('tenant-a','active',encode(extensions.digest('worker-token-a-at-least-24','sha256'),'hex')),('tenant-b','active',encode(extensions.digest('worker-token-b-at-least-24','sha256'),'hex'));
      insert into client_memberships values ('tenant-a','00000000-0000-4000-8000-000000000001','active','owner');
      select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
    `);
    await migration('supabase-v39-tenant-rbac'); await migration('supabase-v40-credential-execution-gate');
    for (const role of ['viewer','member','owner','admin']) {
      await db.exec(`update client_memberships set role='${role}'`);
      expect(await scalar("record_client_provider_connection('tenant-a','catalog','OPENAI_API_KEY','byok','projects/test/secrets/a')")).toBe(['owner','admin'].includes(role));
    }
    await db.exec("update client_provider_connections set status='connected'");
    expect(await scalar("client_provider_execution_allowed('tenant-a','OPENAI_API_KEY')")).toBe(true);
    expect(await scalar("client_provider_execution_allowed('tenant-b','OPENAI_API_KEY')")).toBe(false);
    expect(await scalar("revoke_client_provider_connection('tenant-a','OPENAI_API_KEY')")).toBe(true);
    expect(await scalar("client_provider_execution_allowed('tenant-a','OPENAI_API_KEY')")).toBe(false);
    expect(await scalar("client_member('tenant-a')")).toBe(true);
    await db.exec("update client_tenants set status='suspended' where slug='tenant-a'");
    // Old membership-only helper still admitted a suspended tenant.
    expect(await scalar("client_member('tenant-a')")).toBe(true);
    await migration('supabase-v42-suspended-tenant-access');
    expect(await scalar("client_member('tenant-a')")).toBe(false);
    await db.exec("update client_tenants set status='active' where slug='tenant-a'");
    expect(await scalar("client_member('tenant-a')")).toBe(true);
    await db.exec("select set_config('request.jwt.claim.sub','',false); update client_provider_connections set status='connected',revoked_at=null");
    expect(await scalar("client_provider_execution_allowed('tenant-a','OPENAI_API_KEY','worker-token-a-at-least-24')")).toBe(true);
    expect(await scalar("client_provider_execution_allowed('tenant-a','OPENAI_API_KEY','worker-token-b-at-least-24')")).toBe(false);
    expect(await scalar("client_provider_execution_allowed('tenant-a','OPENAI_API_KEY')")).toBe(false);
    await db.exec("update client_tenants set status='suspended' where slug='tenant-a'");
    expect(await scalar("client_provider_execution_allowed('tenant-a','OPENAI_API_KEY','worker-token-a-at-least-24')")).toBe(false);
    await db.exec("update client_tenants set status='active' where slug='tenant-a'; delete from client_provider_connections");
    expect(await scalar("client_provider_execution_allowed('tenant-a','OPENAI_API_KEY','worker-token-a-at-least-24')")).toBe(false);
    expect(await scalar("has_function_privilege('anon','public.client_provider_execution_allowed(text,text,text)','execute')")).toBe(true);
    expect(await scalar("has_function_privilege('anon','public.record_client_provider_connection(text,text,text,text,text,jsonb)','execute')")).toBe(false);
    await migration('supabase-v37-managed-credit-hard-caps');
    await db.exec(`
      insert into client_credit_accounts values ('tenant-a',10000000,0,600000,now(),1000000);
      insert into client_credit_budgets values ('tenant-a','catalog','OPENAI_API_KEY',10000000,0,0,true,'active',now());
      insert into client_credit_transactions (tenant_slug,kind,amount_micros,created_at) values ('tenant-a','settlement',2000000,date_trunc('month',now())-interval '1 day'),('tenant-a','refund',2000000,now());
      insert into client_credit_reservations (tenant_slug,status,actual_amount_micros,settled_at) values ('tenant-a','refunded',2000000,date_trunc('month',now())-interval '1 day');
    `);
    // Reproduce old code accepting $2 against a $1 cap after a prior-month refund.
    expect(Number(await scalar("client_credit_month_to_date_spend_micros('tenant-a')"))).toBe(-2000000);
    expect(await scalar("reserve_client_credit('tenant-a','catalog','OPENAI_API_KEY','baseline',2000000)")).not.toBeNull();
    await db.exec("delete from client_credit_reservations where idempotency_key='baseline'; update client_credit_accounts set reserved_micros=0; update client_credit_budgets set reserved_micros=0");
    await migration('supabase-v41-monthly-credit-refunds');
    expect(Number(await scalar("client_credit_month_to_date_spend_micros('tenant-a')"))).toBe(0);
    expect(await scalar("reserve_client_credit('tenant-a','catalog','OPENAI_API_KEY','fixed-over-cap',2000000)")).toBeNull();
    expect(await scalar("reserve_client_credit('tenant-a','catalog','OPENAI_API_KEY','at-cap',1000000)")).not.toBeNull();
    expect(await scalar("reserve_client_credit('tenant-a','catalog','OPENAI_API_KEY','above-reserved-cap',1)")).toBeNull();
    await db.exec("insert into client_credit_reservations (tenant_slug,status,actual_amount_micros,settled_at) values ('tenant-a','settled',700000,now()),('tenant-b','settled',900000,now())");
    expect(Number(await scalar("client_credit_month_to_date_spend_micros('tenant-a')"))).toBe(700000);
    await db.exec("update client_credit_reservations set status='refunded' where tenant_slug='tenant-a' and status='settled'");
    expect(Number(await scalar("client_credit_month_to_date_spend_micros('tenant-a')"))).toBe(0);
  } finally { await db.close(); }
});
