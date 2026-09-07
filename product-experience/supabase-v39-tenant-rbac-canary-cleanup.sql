begin;
delete from public.client_tenants where slug = 'rbac-verify-20260907';
delete from auth.users where id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
commit;

select
  not exists (select 1 from public.client_tenants where slug = 'rbac-verify-20260907') as fixture_removed,
  not exists (select 1 from public.client_provider_connections where tenant_slug = 'rbac-verify-20260907') as connection_removed,
  not exists (select 1 from public.client_memberships where tenant_slug = 'rbac-verify-20260907') as membership_removed,
  not exists (select 1 from auth.users where id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333')) as fixture_users_removed;
