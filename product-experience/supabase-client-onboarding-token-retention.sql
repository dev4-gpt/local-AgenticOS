-- Apply after supabase-public-launch-control-plane.sql.
-- One-time tokens stop working at expires_at; retain only a short recovery
-- window, then let the service-role cleanup permanently remove their hashes.

create index if not exists client_onboarding_tokens_expiry_idx
  on public.client_onboarding_tokens (expires_at, id);

create or replace function public.purge_expired_client_onboarding_tokens(
  p_apply boolean default false,
  p_batch_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - interval '7 days';
  v_candidates integer;
  v_deleted integer := 0;
  v_remaining integer;
begin
  if p_apply is null or p_batch_limit is null or p_batch_limit < 1 or p_batch_limit > 1000 then
    raise exception 'onboarding_token_retention_invalid_input';
  end if;

  select count(*) into v_candidates
  from public.client_onboarding_tokens
  where expires_at <= v_cutoff;

  if p_apply then
    with selected as (
      select id
      from public.client_onboarding_tokens
      where expires_at <= v_cutoff
      order by expires_at, id
      limit p_batch_limit
      for update skip locked
    ), removed as (
      delete from public.client_onboarding_tokens as token
      using selected
      where token.id = selected.id
      returning token.id
    )
    select count(*) into v_deleted from removed;
  end if;

  select count(*) into v_remaining
  from public.client_onboarding_tokens
  where expires_at <= v_cutoff;

  return jsonb_build_object(
    'candidates', v_candidates,
    'deleted', v_deleted,
    'remainingCandidates', v_remaining,
    'recoveryDays', 7,
    'applied', p_apply
  );
end;
$$;

revoke all on function public.purge_expired_client_onboarding_tokens(boolean, integer)
  from public, anon, authenticated;
grant execute on function public.purge_expired_client_onboarding_tokens(boolean, integer)
  to service_role;
