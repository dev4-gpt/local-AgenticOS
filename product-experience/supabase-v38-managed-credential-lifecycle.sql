-- Phase 3d: BYOK credential lifecycle -- revoke.
--
-- Scope, confirmed against the live schema and code before writing this:
--   - client_provider_connections.status already allows 'connected' /
--     'revoked' / 'rotating' / 'rejected', but no function ever sets
--     anything besides 'submitted' (record_client_provider_connection).
--   - Rotation already exists as a real operator CLI
--     (scripts/promote-client-credential.mjs) that writes a new Secret
--     Manager version; it is extended (application code, not SQL) to also
--     PATCH this table's row directly with the service-role key, exactly
--     like scripts/approve-client-delivery.mjs already does for a
--     different table. Service-role writes bypass RLS, so no new function
--     is needed for that step.
--   - Deletion (destroy the secret + remove the row) is likewise done via
--     a direct service-role DELETE from a new operator script
--     (scripts/delete-client-credential.mjs), for the same reason.
--   - Revoke is the one operation that must be usable by the tenant's own
--     authenticated member (self-service disconnect), which this table's
--     RLS explicitly blocks for direct access
--     (`revoke all ... from public, anon, authenticated` in
--     supabase-public-launch-control-plane.sql). That requires a
--     security-definer function, mirroring record_client_provider_connection
--     and list_client_provider_connections exactly.

create or replace function public.revoke_client_provider_connection(
  p_tenant_slug text,
  p_provider_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.client_memberships
    where tenant_slug = p_tenant_slug and user_id = auth.uid() and status = 'active'
  ) then
    return false;
  end if;

  update public.client_provider_connections
  set status = 'revoked', revoked_at = coalesce(revoked_at, now()), updated_at = now()
  where tenant_slug = p_tenant_slug and provider_key = p_provider_key;

  return found;
end;
$$;

revoke execute on function public.revoke_client_provider_connection(text, text)
  from public, anon, authenticated;
grant execute on function public.revoke_client_provider_connection(text, text) to authenticated;
