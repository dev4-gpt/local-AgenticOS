-- Apply after supabase-client-runtime-controls.sql.
-- Explicit provider-thread deletion. Canonical transcript rows stay in
-- Supabase until the account owner asks to remove them.

create or replace function public.delete_client_runtime_provider_history(
  p_tenant_slug text,
  p_provider text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.client_member(p_tenant_slug)
     or auth.uid() is null
     or length(coalesce(p_provider, '')) = 0 then
    return false;
  end if;

  delete from public.client_runtime_jobs
  where tenant_slug = left(p_tenant_slug, 64)
    and requested_by = auth.uid()
    and capability = 'text-agents'
    and provider = left(p_provider, 120);

  return true;
end;
$$;

revoke all on function public.delete_client_runtime_provider_history(text, text)
  from public, anon;
grant execute on function public.delete_client_runtime_provider_history(text, text)
  to authenticated;
