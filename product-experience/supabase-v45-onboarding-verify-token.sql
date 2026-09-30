-- Consume a verification link and advance the public request in one transaction.
-- Deploy before the verification API that calls this function.
create or replace function public.consume_client_onboarding_verify_token(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token_id uuid;
  v_onboarding_id uuid;
  v_request_id uuid;
  v_email text;
  v_verified_at timestamptz;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    return null;
  end if;

  select t.id, a.id, a.request_id, a.email
    into v_token_id, v_onboarding_id, v_request_id, v_email
    from public.client_onboarding_tokens t
    join public.client_onboarding_accounts a on a.id = t.onboarding_id
    where t.token_hash = p_token_hash
      and t.purpose = 'verify-email'
      and t.consumed_at is null
      and t.expires_at > pg_catalog.clock_timestamp()
      and a.status = 'requested'
    for update of t, a;

  if not found then
    return null;
  end if;

  v_verified_at := pg_catalog.clock_timestamp();
  update public.client_onboarding_tokens
    set consumed_at = v_verified_at
    where id = v_token_id;
  update public.client_onboarding_accounts
    set status = 'email_verified', updated_at = v_verified_at
    where id = v_onboarding_id;
  update public.deployment_requests
    set email_verified_at = v_verified_at
    where id = v_request_id;
  if not found then
    raise exception 'verification request missing for onboarding %', v_onboarding_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'onboardingId', v_onboarding_id,
    'requestId', v_request_id,
    'email', v_email,
    'status', 'email_verified'
  );
end;
$$;

revoke all on function public.consume_client_onboarding_verify_token(text) from public, anon, authenticated;
grant execute on function public.consume_client_onboarding_verify_token(text) to service_role;
