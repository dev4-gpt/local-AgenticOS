-- Phase 3f: tenant-level RBAC enforcement.
--
-- client_memberships.role already distinguishes 'owner'/'admin'/'member'/
-- 'viewer', but nothing has ever checked it -- client_member() and every
-- security-definer function gated on it (record_client_provider_connection,
-- revoke_client_provider_connection) only checked status = 'active',
-- treating a 'viewer' identically to an 'owner'. This closes that gap for
-- the two mutating BYOK functions: submitting or revoking a credential now
-- requires 'owner' or 'admin'. Read-only listing (list_client_provider_connections)
-- is intentionally left open to every active role.

create or replace function public.record_client_provider_connection(
  p_tenant_slug text,
  p_catalog_id text,
  p_provider_key text,
  p_credential_mode text,
  p_secret_resource text,
  p_validation_metadata jsonb default '{}'::jsonb
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
      and role in ('owner', 'admin')
  ) then
    return false;
  end if;
  insert into public.client_provider_connections
    (tenant_slug, catalog_id, provider_key, credential_mode, status, secret_resource, validation_metadata, updated_at)
  values
    (p_tenant_slug, p_catalog_id, p_provider_key, p_credential_mode, 'submitted', p_secret_resource, coalesce(p_validation_metadata, '{}'::jsonb), now())
  on conflict (tenant_slug, provider_key) do update set
    catalog_id = excluded.catalog_id,
    credential_mode = excluded.credential_mode,
    status = 'submitted',
    secret_resource = excluded.secret_resource,
    validation_metadata = excluded.validation_metadata,
    revoked_at = null,
    updated_at = now();
  return true;
end;
$$;

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
      and role in ('owner', 'admin')
  ) then
    return false;
  end if;

  update public.client_provider_connections
  set status = 'revoked', revoked_at = coalesce(revoked_at, now()), updated_at = now()
  where tenant_slug = p_tenant_slug and provider_key = p_provider_key;

  return found;
end;
$$;

-- Grants are unchanged (both already granted to authenticated only, revoked
-- from public/anon); create or replace preserves them, but restate for
-- clarity and to survive any drift.
revoke execute on function public.record_client_provider_connection(text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_client_provider_connection(text, text, text, text, text, jsonb) to authenticated;
revoke execute on function public.revoke_client_provider_connection(text, text)
  from public, anon, authenticated;
grant execute on function public.revoke_client_provider_connection(text, text) to authenticated;
