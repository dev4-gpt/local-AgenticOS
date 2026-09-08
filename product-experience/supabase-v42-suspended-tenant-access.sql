-- Apply after the client control plane. Membership alone must not keep a
-- suspended/offboarding tenant's data and authenticated routes accessible.
create or replace function public.client_member(p_tenant_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.client_memberships m
    join public.client_tenants t on t.slug = m.tenant_slug
    where m.tenant_slug = p_tenant_slug and m.user_id = auth.uid()
      and m.status = 'active' and t.status = 'active'
  );
$$;
revoke execute on function public.client_member(text) from public, anon, authenticated;
grant execute on function public.client_member(text) to authenticated;
