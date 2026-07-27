-- Apply after supabase-client-runtime-control-plane.sql.
-- Durable per-tenant runtime limits and server-side budget reservations.
-- Raw provider values never belong in these tables.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.client_runtime_rate_limits (
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  bucket text not null,
  key_hash text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  primary key (tenant_slug, bucket, key_hash)
);

alter table public.client_runtime_rate_limits enable row level security;
revoke all on table public.client_runtime_rate_limits from anon, authenticated;

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
     or p_limit < 1 or p_window_seconds < 1 then
    return false;
  end if;

  insert into public.client_runtime_rate_limits
    (tenant_slug, bucket, key_hash, window_started_at, request_count)
  values
    (left(p_tenant_slug, 64), left(p_bucket, 64), left(p_key_hash, 128), now(), 1)
  on conflict (tenant_slug, bucket, key_hash) do update
    set window_started_at = case
      when public.client_runtime_rate_limits.window_started_at
        + make_interval(secs => p_window_seconds) <= now() then now()
      else public.client_runtime_rate_limits.window_started_at
    end,
    request_count = case
      when public.client_runtime_rate_limits.window_started_at
        + make_interval(secs => p_window_seconds) <= now() then 1
      else public.client_runtime_rate_limits.request_count + 1
    end
  returning * into current_row;

  return current_row.request_count <= p_limit;
end;
$$;

revoke all on function public.consume_client_runtime_rate_limit(text, text, text, integer, integer)
  from public, anon;
grant execute on function public.consume_client_runtime_rate_limit(text, text, text, integer, integer)
  to authenticated;

create index if not exists client_runtime_rate_limits_window_idx
  on public.client_runtime_rate_limits (window_started_at);

alter table public.client_tenants
  add column if not exists worker_token_hash text;

alter table public.client_runtime_jobs
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.enqueue_client_runtime_job(
  p_tenant_slug text,
  p_capability text,
  p_provider text,
  p_model text,
  p_idempotency_key text,
  p_input_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  job_id uuid;
begin
  if not public.client_member(p_tenant_slug)
     or length(coalesce(p_capability, '')) = 0
     or length(coalesce(p_idempotency_key, '')) < 8
     or length(coalesce(p_idempotency_key, '')) > 180 then
    return null;
  end if;

  insert into public.client_runtime_jobs
    (tenant_slug, requested_by, capability, provider, model, idempotency_key, input_metadata, updated_at)
  values
    (p_tenant_slug, auth.uid(), left(p_capability, 120), left(p_provider, 120), left(p_model, 180), left(p_idempotency_key, 180), coalesce(p_input_metadata, '{}'::jsonb), now())
  on conflict (tenant_slug, idempotency_key) do update
    set updated_at = now()
  returning id into job_id;

  return job_id;
end;
$$;

revoke all on function public.enqueue_client_runtime_job(text, text, text, text, text, jsonb)
  from public, anon;
grant execute on function public.enqueue_client_runtime_job(text, text, text, text, text, jsonb)
  to authenticated;

create or replace function public.claim_client_runtime_job(
  p_tenant_slug text,
  p_job_id uuid,
  p_worker_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  job jsonb;
begin
  if p_worker_token is null or length(p_worker_token) < 24
     or not exists (
       select 1 from public.client_tenants
       where slug = p_tenant_slug
         and status = 'active'
         and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     ) then
    return null;
  end if;

  update public.client_runtime_jobs
    set status = 'running',
        attempt_count = attempt_count + 1,
        started_at = coalesce(started_at, now()),
        updated_at = now()
  where id = p_job_id
    and tenant_slug = p_tenant_slug
    and status = 'queued'
    and attempt_count < 10
  returning jsonb_build_object(
    'id', id,
    'tenant_slug', tenant_slug,
    'capability', capability,
    'provider', provider,
    'model', model,
    'idempotency_key', idempotency_key,
    'status', status,
    'attempt_count', attempt_count,
    'input_metadata', input_metadata
  ) into job;

  return job;
end;
$$;

create or replace function public.complete_client_runtime_job(
  p_tenant_slug text,
  p_job_id uuid,
  p_worker_token text,
  p_status text,
  p_output_metadata jsonb default '{}'::jsonb,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_worker_token is null or length(p_worker_token) < 24
     or p_status not in ('succeeded', 'failed', 'cancelled')
     or not exists (
       select 1 from public.client_tenants
       where slug = p_tenant_slug
         and status = 'active'
         and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     ) then
    return false;
  end if;

  update public.client_runtime_jobs
    set status = p_status,
        output_metadata = coalesce(p_output_metadata, '{}'::jsonb),
        error_code = left(p_error_code, 120),
        finished_at = now(),
        updated_at = now()
  where id = p_job_id
    and tenant_slug = p_tenant_slug
    and status = 'running';

  return found;
end;
$$;

revoke all on function public.claim_client_runtime_job(text, uuid, text),
  public.complete_client_runtime_job(text, uuid, text, text, jsonb, text)
  from public, authenticated;
grant execute on function public.claim_client_runtime_job(text, uuid, text),
  public.complete_client_runtime_job(text, uuid, text, text, jsonb, text)
  to anon;

create or replace function public.reserve_client_runtime_budget(
  p_tenant_slug text,
  p_provider text,
  p_model text,
  p_amount_micros bigint,
  p_monthly_cap_micros bigint,
  p_job_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  used_micros bigint;
begin
  if not public.client_member(p_tenant_slug)
     or length(coalesce(p_provider, '')) = 0
     or p_amount_micros < 0
     or p_monthly_cap_micros < 0
     or p_amount_micros > p_monthly_cap_micros then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtext(left(p_tenant_slug, 64)));

  select coalesce(sum(amount_micros), 0)
    into used_micros
  from public.client_runtime_budget_ledger
  where tenant_slug = p_tenant_slug
    and created_at >= date_trunc('month', now());

  if used_micros + p_amount_micros > p_monthly_cap_micros then
    return false;
  end if;

  insert into public.client_runtime_budget_ledger
    (tenant_slug, job_id, provider, model, amount_micros, usage_metadata)
  values
    (p_tenant_slug, p_job_id, left(p_provider, 120), left(p_model, 180), p_amount_micros, '{}'::jsonb);

  return true;
end;
$$;

revoke all on function public.reserve_client_runtime_budget(text, text, text, bigint, bigint, uuid)
  from public, anon;
grant execute on function public.reserve_client_runtime_budget(text, text, text, bigint, bigint, uuid)
  to authenticated;
