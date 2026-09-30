-- Complete one setup link, owner membership, and account binding atomically.
-- Deploy before the setup API that calls this function.
create or replace function public.consume_client_onboarding_setup_token(p_token_hash text, p_auth_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token_id uuid;
  v_onboarding_id uuid;
  v_tenant_slug text;
  v_now timestamptz;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' or p_auth_user_id is null then
    return null;
  end if;

  select t.id, a.id, a.tenant_slug
    into v_token_id, v_onboarding_id, v_tenant_slug
    from public.client_onboarding_tokens t
    join public.client_onboarding_accounts a on a.id = t.onboarding_id
    where t.token_hash = p_token_hash
      and t.purpose = 'setup'
      and t.consumed_at is null
      and t.expires_at > pg_catalog.clock_timestamp()
      and a.status = 'active'
      and a.tenant_slug is not null
      and (a.auth_user_id is null or a.auth_user_id = p_auth_user_id)
    for update of t, a;

  if not found then
    return null;
  end if;

  v_now := pg_catalog.clock_timestamp();
  insert into public.client_memberships (tenant_slug, user_id, role, status)
    values (v_tenant_slug, p_auth_user_id, 'owner', 'active')
    on conflict (tenant_slug, user_id) do update
      set role = 'owner', status = 'active';
  update public.client_onboarding_accounts
    set auth_user_id = p_auth_user_id, updated_at = v_now
    where id = v_onboarding_id;
  update public.client_onboarding_tokens
    set consumed_at = v_now
    where id = v_token_id;

  return pg_catalog.jsonb_build_object('onboardingId', v_onboarding_id, 'tenantSlug', v_tenant_slug, 'status', 'ready');
end;
$$;

revoke all on function public.consume_client_onboarding_setup_token(text, uuid) from public, anon, authenticated;
grant execute on function public.consume_client_onboarding_setup_token(text, uuid) to service_role;
