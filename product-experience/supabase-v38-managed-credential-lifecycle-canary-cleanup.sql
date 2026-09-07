-- Exact cleanup for the Phase 3d BYOK revoke verification fixture.
-- Deleting the tenant row cascades to client_memberships and
-- client_provider_connections via their `references ... on delete cascade`
-- foreign keys. The fixture auth.users row is not referenced by the tenant
-- and is removed separately.

begin;
delete from public.client_tenants where slug = 'byok-verify-20260906';
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
commit;

select
  not exists (select 1 from public.client_tenants where slug = 'byok-verify-20260906') as fixture_removed,
  not exists (select 1 from public.client_provider_connections where tenant_slug = 'byok-verify-20260906') as connection_removed,
  not exists (select 1 from public.client_memberships where tenant_slug = 'byok-verify-20260906') as membership_removed,
  not exists (select 1 from auth.users where id = '11111111-1111-1111-1111-111111111111') as fixture_user_removed;
