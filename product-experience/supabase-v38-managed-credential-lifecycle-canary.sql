-- Phase 3d BYOK revoke verification.
--
-- revoke_client_provider_connection is security definer and gated on
-- auth.uid() plus an active client_memberships row -- direct table access
-- is fully revoked for authenticated/anon/public on client_provider_connections,
-- so the only way to prove the gate really works is to simulate a real
-- Supabase Auth session inside this SQL Editor session. The SQL Editor runs
-- as the table owner, which has full access to the auth schema, so this
-- inserts one disposable auth.users row and points request.jwt claims at it
-- with set_config (local to this transaction only). If this project's
-- auth.users schema requires different columns than assumed below, this
-- INSERT will fail cleanly with no side effects -- report the exact error
-- back rather than retrying blindly.
--
-- The "mark connected" (operator promotion) and "delete" operations are not
-- exercised here: both are plain service-role table writes (PATCH/DELETE)
-- added directly to scripts/promote-client-credential.mjs and the new
-- scripts/delete-client-credential.mjs, not new SQL functions -- a
-- service-role key bypasses RLS entirely, so there is no auth-gate logic in
-- SQL to verify for those two; their correctness is a plain REST-call
-- concern proven when those scripts are actually run.

begin;

do $$
begin
  if exists (select 1 from public.client_tenants where slug = 'byok-verify-20260906') then
    raise exception 'BYOK verification tenant already exists; run its exact cleanup before retrying';
  end if;
  if exists (select 1 from auth.users where id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'BYOK verification fixture auth user already exists; run its exact cleanup before retrying';
  end if;
end;
$$;

insert into public.client_tenants (slug, name, retention_days, status)
values ('byok-verify-20260906', 'BYOK Verification Fixture', 1, 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin
) values (
  '00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'byok-verify-20260906@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb, false
);

insert into public.client_memberships (tenant_slug, user_id, role, status)
values ('byok-verify-20260906', '11111111-1111-1111-1111-111111111111', 'owner', 'active');

-- Simulates a connection a tenant would already have from a real submission,
-- inserted directly since that half of the lifecycle is already proven and
-- this canary is scoped to revoke.
insert into public.client_provider_connections (
  tenant_slug, catalog_id, provider_key, credential_mode, status, secret_resource, updated_at
) values (
  'byok-verify-20260906', 'provider-byok-verify-fixture', 'BYOK_VERIFY_FIXTURE', 'byok', 'connected',
  'projects/veloce-agenticos-2026/secrets/veloce-byok-verify-20260906-fixture', now()
);

do $$
declare
  call_result boolean;
  row_status text;
  row_revoked_at timestamptz;
begin
  -- Test 1: no simulated session -- must be refused, connection untouched.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  call_result := public.revoke_client_provider_connection('byok-verify-20260906', 'BYOK_VERIFY_FIXTURE');
  assert call_result is false, 'expected revoke to be refused with no authenticated session';
  select status into row_status from public.client_provider_connections
    where tenant_slug = 'byok-verify-20260906' and provider_key = 'BYOK_VERIFY_FIXTURE';
  assert row_status = 'connected', 'connection must remain untouched after a refused revoke attempt';

  -- Test 2: the tenant's own active member revokes it successfully.
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  perform set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
  call_result := public.revoke_client_provider_connection('byok-verify-20260906', 'BYOK_VERIFY_FIXTURE');
  assert call_result is true, 'expected the tenant''s own active member to revoke successfully';
  select status, revoked_at into row_status, row_revoked_at from public.client_provider_connections
    where tenant_slug = 'byok-verify-20260906' and provider_key = 'BYOK_VERIFY_FIXTURE';
  assert row_status = 'revoked', 'expected status to become revoked';
  assert row_revoked_at is not null, 'expected revoked_at to be set';

  -- Test 3: revoking an already-revoked connection is a harmless no-op.
  call_result := public.revoke_client_provider_connection('byok-verify-20260906', 'BYOK_VERIFY_FIXTURE');
  assert call_result is true, 'expected a second revoke of an already-revoked connection to succeed idempotently';

  -- Test 4: revoking a provider with no connection at all is refused.
  call_result := public.revoke_client_provider_connection('byok-verify-20260906', 'NEVER_SUBMITTED_FIXTURE');
  assert call_result is false, 'expected revoke to fail for a provider with no connection record';

  raise notice 'BYOK revoke verification passed';
end;
$$;

commit;
