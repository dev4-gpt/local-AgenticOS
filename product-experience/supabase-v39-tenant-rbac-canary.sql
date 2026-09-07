-- Phase 3f RBAC verification: a 'viewer' member must be refused for both
-- BYOK mutating functions; an 'owner' member must succeed.

begin;

do $$
begin
  if exists (select 1 from public.client_tenants where slug = 'rbac-verify-20260907') then
    raise exception 'RBAC verification tenant already exists; run its exact cleanup before retrying';
  end if;
  if exists (select 1 from auth.users where id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333')) then
    raise exception 'RBAC verification fixture auth users already exist; run its exact cleanup before retrying';
  end if;
end;
$$;

insert into public.client_tenants (slug, name, retention_days, status)
values ('rbac-verify-20260907', 'RBAC Verification Fixture', 1, 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin
) values
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'rbac-verify-owner@example.invalid', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb, false),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'rbac-verify-viewer@example.invalid', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb, false);

insert into public.client_memberships (tenant_slug, user_id, role, status) values
  ('rbac-verify-20260907', '22222222-2222-2222-2222-222222222222', 'owner', 'active'),
  ('rbac-verify-20260907', '33333333-3333-3333-3333-333333333333', 'viewer', 'active');

do $$
declare
  submit_ok boolean;
  revoke_ok boolean;
begin
  -- Viewer attempts to submit a credential -- must be refused.
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  perform set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);
  submit_ok := public.record_client_provider_connection('rbac-verify-20260907', 'provider-rbac-verify-fixture', 'RBAC_VERIFY_FIXTURE', 'byok', 'projects/veloce-agenticos-2026/secrets/veloce-rbac-verify-20260907-inbox');
  assert submit_ok is false, 'expected a viewer to be refused when submitting a credential';
  assert not exists (select 1 from public.client_provider_connections where tenant_slug = 'rbac-verify-20260907'), 'no connection row should exist after a refused submission';

  -- Owner attempts the same -- must succeed.
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  perform set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
  submit_ok := public.record_client_provider_connection('rbac-verify-20260907', 'provider-rbac-verify-fixture', 'RBAC_VERIFY_FIXTURE', 'byok', 'projects/veloce-agenticos-2026/secrets/veloce-rbac-verify-20260907-inbox');
  assert submit_ok is true, 'expected an owner to succeed when submitting a credential';

  -- Viewer attempts to revoke it -- must be refused.
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  perform set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);
  revoke_ok := public.revoke_client_provider_connection('rbac-verify-20260907', 'RBAC_VERIFY_FIXTURE');
  assert revoke_ok is false, 'expected a viewer to be refused when revoking a credential';

  -- Owner attempts the same -- must succeed.
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  perform set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
  revoke_ok := public.revoke_client_provider_connection('rbac-verify-20260907', 'RBAC_VERIFY_FIXTURE');
  assert revoke_ok is true, 'expected an owner to succeed when revoking a credential';

  raise notice 'tenant RBAC verification passed';
end;
$$;

commit;
