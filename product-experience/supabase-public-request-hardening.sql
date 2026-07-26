-- Apply after supabase-deployment-requests.sql in the project's SQL editor.
-- The service-role Vercel routes call this function; browsers have no access.

create table if not exists public.public_request_rate_limits (
  bucket text not null,
  key_hash text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  primary key (bucket, key_hash)
);

alter table public.public_request_rate_limits enable row level security;
revoke all on table public.public_request_rate_limits from anon, authenticated;

create or replace function public.consume_public_request_rate_limit(
  p_bucket text,
  p_key text,
  p_limit integer default 5,
  p_window_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.public_request_rate_limits;
begin
  if length(coalesce(p_bucket, '')) = 0 or length(coalesce(p_key, '')) = 0
     or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit arguments';
  end if;

  insert into public.public_request_rate_limits (bucket, key_hash, window_started_at, request_count)
  values (left(p_bucket, 64), left(p_key, 128), now(), 1)
  on conflict (bucket, key_hash) do update
    set window_started_at = case
      when public.public_request_rate_limits.window_started_at
        + make_interval(secs => p_window_seconds) <= now() then now()
      else public.public_request_rate_limits.window_started_at
    end,
    request_count = case
      when public.public_request_rate_limits.window_started_at
        + make_interval(secs => p_window_seconds) <= now() then 1
      else public.public_request_rate_limits.request_count + 1
    end
  returning * into current_row;

  if current_row.window_started_at + make_interval(secs => p_window_seconds) <= now() then
    return true;
  end if;
  return current_row.request_count <= p_limit;
end;
$$;

revoke all on function public.consume_public_request_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_public_request_rate_limit(text, text, integer, integer)
  to service_role;

create index if not exists public_request_rate_limits_window_idx
  on public.public_request_rate_limits (window_started_at);

-- Run periodically from an operator-approved SQL job, or during low traffic:
-- delete from public.public_request_rate_limits
-- where window_started_at < now() - interval '2 days';
