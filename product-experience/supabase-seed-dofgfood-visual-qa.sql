-- Seed the isolated owner-cloud Visual QA acceptance tenant.
-- Apply only after the control-plane, worker-control, hosted-capabilities, and
-- Visual-QA migrations are present and the Auth user already exists.
-- This file contains no password, provider key, or worker-token value.

insert into public.client_tenants (slug, name, retention_days, status)
values ('dofgfood', 'Veloce Dogfood Visual QA', 14, 'active')
on conflict (slug) do update
set name = excluded.name,
    retention_days = excluded.retention_days,
    status = 'active';

insert into public.client_memberships (tenant_slug, user_id, role, status)
select 'dofgfood', id, 'owner', 'active'
from auth.users
where lower(email) = lower('aryamandev777@gmail.com')
on conflict (tenant_slug, user_id) do update
set role = excluded.role,
    status = excluded.status;

select
  t.slug,
  t.status as tenant_status,
  m.status as membership_status,
  m.role,
  u.email
from public.client_tenants t
left join public.client_memberships m on m.tenant_slug = t.slug
left join auth.users u on u.id = m.user_id
where t.slug = 'dofgfood';
