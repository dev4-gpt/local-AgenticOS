-- Apply after v39. No credentials or connection states are backfilled.
-- Existing tenants must have an operator-promoted 'connected' BYOK row;
-- an absent row, revoked row, or unavailable RPC denies new execution.
-- Running provider requests cannot be recalled by this admission gate.
create or replace function public.client_provider_execution_allowed(
  p_tenant_slug text,
  p_provider_key text,
  p_worker_token text default null
)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.client_tenants t
    join public.client_provider_connections c on c.tenant_slug = t.slug
    where t.slug = p_tenant_slug and t.status = 'active'
      and c.provider_key = p_provider_key
      and c.credential_mode = 'byok' and c.status = 'connected'
      and c.revoked_at is null
      and (
        (auth.uid() is not null and public.client_member(p_tenant_slug))
        or (length(p_worker_token) >= 24
          and t.worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex'))
      )
  );
$$;
revoke all on function public.client_provider_execution_allowed(text, text, text)
  from public, anon, authenticated;
-- Anonymous transport is required for the existing hashed worker-token protocol.
-- It cannot grant access without the exact active tenant's worker token.
grant execute on function public.client_provider_execution_allowed(text, text, text)
  to anon, authenticated;
