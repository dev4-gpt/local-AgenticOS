-- Seed the approved internal cloud test tenant after the control-plane
-- migration has been applied and the Auth user already exists.
--
-- This file never contains a password, provider key, or service-role key.
-- Change the email and slug only when creating another approved test client.

insert into public.client_tenants (slug, name, retention_days)
values ('veloce-cloud-test', 'Veloce Cloud Test', 14)
on conflict (slug) do update
set name = excluded.name,
    retention_days = excluded.retention_days,
    status = 'active';

insert into public.client_memberships (tenant_slug, user_id, role)
select 'veloce-cloud-test', id, 'owner'
from auth.users
where lower(email) = lower('aryamandev777@gmail.com')
on conflict (tenant_slug, user_id) do update
set role = excluded.role,
    status = 'active';

-- A successful result contains one row with membership_status = active.
-- If membership_status is null, invite/create the Auth user first, then run
-- this file again.
select
  t.slug,
  t.status as tenant_status,
  m.status as membership_status,
  m.role,
  u.email
from public.client_tenants t
left join public.client_memberships m
  on m.tenant_slug = t.slug
left join auth.users u
  on u.id = m.user_id
where t.slug = 'veloce-cloud-test';
