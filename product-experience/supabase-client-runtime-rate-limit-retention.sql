-- Apply after supabase-client-runtime-controls.sql.
-- Preserve the actual limiter window and remove its hashed key only after the
-- window expires plus seven recovery days. Legacy rows conservatively inherit
-- the longest window currently supported by the runtime (one hour).

alter table public.client_runtime_rate_limits
  add column if not exists window_seconds integer not null default 3600;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.client_runtime_rate_limits'::regclass
      and conname = 'client_runtime_rate_limits_window_seconds_bounds'
  ) then
    alter table public.client_runtime_rate_limits
      add constraint client_runtime_rate_limits_window_seconds_bounds
      check (window_seconds between 1 and 3600) not valid;
  end if;
end;
$$;

alter table public.client_runtime_rate_limits
  validate constraint client_runtime_rate_limits_window_seconds_bounds;

create or replace function public.consume_client_runtime_rate_limit(
  p_tenant_slug text,
  p_bucket text,
  p_key_hash text,
  p_limit integer default 20,
  p_window_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.client_runtime_rate_limits;
begin
  if not public.client_member(p_tenant_slug)
     or length(coalesce(p_bucket, '')) = 0
     or length(coalesce(p_key_hash, '')) = 0
     or p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 3600 then
    return false;
  end if;

  insert into public.client_runtime_rate_limits
    (tenant_slug, bucket, key_hash, window_started_at, request_count, window_seconds)
  values
    (left(p_tenant_slug, 64), left(p_bucket, 64), left(p_key_hash, 128), now(), 1, p_window_seconds)
  on conflict (tenant_slug, bucket, key_hash) do update
    set window_started_at = case
      when public.client_runtime_rate_limits.window_started_at
        + make_interval(secs => public.client_runtime_rate_limits.window_seconds) <= now() then now()
      else public.client_runtime_rate_limits.window_started_at
    end,
    request_count = case
      when public.client_runtime_rate_limits.window_started_at
        + make_interval(secs => public.client_runtime_rate_limits.window_seconds) <= now() then 1
      else public.client_runtime_rate_limits.request_count + 1
    end,
    window_seconds = case
      when public.client_runtime_rate_limits.window_started_at
        + make_interval(secs => public.client_runtime_rate_limits.window_seconds) <= now() then p_window_seconds
      else greatest(public.client_runtime_rate_limits.window_seconds, p_window_seconds)
    end
  returning * into current_row;

  return current_row.request_count <= p_limit;
end;
$$;

revoke all on function public.consume_client_runtime_rate_limit(text, text, text, integer, integer)
  from public, anon;
grant execute on function public.consume_client_runtime_rate_limit(text, text, text, integer, integer)
  to authenticated;

create or replace function public.refund_client_runtime_rate_limit(
  p_tenant_slug text,
  p_bucket text,
  p_window_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  expected_key_hash text;
begin
  if not public.client_member(p_tenant_slug)
     or auth.uid() is null
     or length(coalesce(p_bucket, '')) = 0
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 3600 then
    return false;
  end if;

  expected_key_hash := encode(digest(
    left(p_tenant_slug, 64) || ':' || left(p_bucket, 64) || ':' || auth.uid()::text,
    'sha256'
  ), 'hex');

  update public.client_runtime_rate_limits
     set request_count = greatest(request_count - 1, 0)
   where tenant_slug = left(p_tenant_slug, 64)
     and bucket = left(p_bucket, 64)
     and key_hash = expected_key_hash
     and window_started_at + make_interval(secs => window_seconds) > now()
     and request_count > 0;

  return found;
end;
$$;

revoke all on function public.refund_client_runtime_rate_limit(text, text, integer)
  from public, anon;
grant execute on function public.refund_client_runtime_rate_limit(text, text, integer)
  to authenticated;

create or replace function public.purge_expired_client_runtime_rate_limits(
  p_apply boolean default false,
  p_batch_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidates integer;
  v_deleted integer := 0;
  v_remaining integer;
begin
  if p_apply is null or p_batch_limit is null or p_batch_limit < 1 or p_batch_limit > 1000 then
    raise exception 'runtime_rate_limit_retention_invalid_input';
  end if;

  select count(*) into v_candidates
  from public.client_runtime_rate_limits
  where window_started_at + make_interval(secs => window_seconds) + interval '7 days' <= now();

  if p_apply then
    with selected as (
      select tenant_slug, bucket, key_hash
      from public.client_runtime_rate_limits
      where window_started_at + make_interval(secs => window_seconds) + interval '7 days' <= now()
      order by window_started_at, tenant_slug, bucket, key_hash
      limit p_batch_limit
      for update skip locked
    ), removed as (
      delete from public.client_runtime_rate_limits as rate_limit
      using selected
      where rate_limit.tenant_slug = selected.tenant_slug
        and rate_limit.bucket = selected.bucket
        and rate_limit.key_hash = selected.key_hash
      returning rate_limit.tenant_slug
    )
    select count(*) into v_deleted from removed;
  end if;

  select count(*) into v_remaining
  from public.client_runtime_rate_limits
  where window_started_at + make_interval(secs => window_seconds) + interval '7 days' <= now();

  return jsonb_build_object(
    'candidates', v_candidates,
    'deleted', v_deleted,
    'remainingCandidates', v_remaining,
    'recoveryDays', 7,
    'applied', p_apply
  );
end;
$$;

revoke all on function public.purge_expired_client_runtime_rate_limits(boolean, integer)
  from public, anon, authenticated;
grant execute on function public.purge_expired_client_runtime_rate_limits(boolean, integer)
  to service_role;
