-- Apply after supabase-client-adapter-host.sql and supabase-client-adapter-budget.sql (ADR-020).
-- Model grants: when the host starts an adapter task it opens one grant for it. The adapter's model calls go through the
-- host (`model.call`), and every call is counted here before the host reserves money for it: the grant must be open, not
-- expired and under its call and token limits, the provider and model must be on the grant's list, and the adapter and
-- the client must be under their per-minute call limits. Rows hold counts only, never a prompt or an answer.
-- The host worker (publishable key plus tenant worker token) opens grants and counts calls; the sync job (service role)
-- closes a grant when the task's final state arrives. Members cannot read or write rows.

create table if not exists public.client_adapter_model_grants (
  grant_id uuid primary key,
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  adapter_id text not null check (adapter_id ~ '^[a-z][a-z0-9-]{2,40}$'),
  -- The host's key for the task (the task.run idempotency key), known before the adapter starts it.
  task_id text not null check (task_id ~ '^[A-Za-z0-9._:-]{1,120}$'),
  -- The adapter's own id for the task, recorded once task.run answers; the sync job closes the grant by it.
  adapter_task_id text check (adapter_task_id is null or adapter_task_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  allowed text[] not null check (cardinality(allowed) between 1 and 20),
  max_calls integer not null check (max_calls between 1 and 100),
  calls_used integer not null default 0 check (calls_used >= 0),
  max_tokens integer not null check (max_tokens between 1 and 1000000),
  tokens_used bigint not null default 0 check (tokens_used >= 0),
  expires_at timestamptz not null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_slug, adapter_id, task_id)
);

create table if not exists public.client_adapter_model_calls (
  grant_id uuid not null references public.client_adapter_model_grants(grant_id) on delete cascade,
  seq integer not null check (seq between 1 and 100),
  tenant_slug text not null,
  adapter_id text not null,
  reserved_tokens integer not null check (reserved_tokens between 1 and 1000000),
  actual_tokens integer check (actual_tokens is null or actual_tokens >= 0),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (grant_id, seq)
);

create index if not exists client_adapter_model_calls_recent_idx on public.client_adapter_model_calls (tenant_slug, created_at);
create index if not exists client_adapter_model_grants_created_idx on public.client_adapter_model_grants (created_at);

alter table public.client_adapter_model_grants enable row level security;
alter table public.client_adapter_model_calls enable row level security;
revoke all on public.client_adapter_model_grants, public.client_adapter_model_calls from public, anon, authenticated;
grant select, delete on public.client_adapter_model_grants, public.client_adapter_model_calls to service_role;

-- Opens the grant for one task. Repeating the same grant id is harmless; a second grant for the same task is refused.
create or replace function public.client_adapter_model_grant_open(
  p_tenant_slug text,
  p_worker_token text,
  p_adapter_id text,
  p_task_id text,
  p_grant_id uuid,
  p_allowed text[],
  p_max_calls integer,
  p_max_tokens integer,
  p_expires_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  prior public.client_adapter_model_grants%rowtype;
begin
  if not public.client_adapter_worker_ok(p_tenant_slug, p_worker_token) then
    return 'refused';
  end if;
  if p_adapter_id is null or p_adapter_id !~ '^[a-z][a-z0-9-]{2,40}$'
     or p_task_id is null or p_task_id !~ '^[A-Za-z0-9._:-]{1,120}$'
     or p_grant_id is null
     or p_allowed is null or cardinality(p_allowed) not between 1 and 20
     or exists (select 1 from unnest(p_allowed) a where a is null or a !~ '^[a-z][a-z0-9-]{1,40}:[A-Za-z0-9._:/-]{1,180}$')
     or p_max_calls is null or p_max_calls not between 1 and 100
     or p_max_tokens is null or p_max_tokens not between 1 and 1000000
     or p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '16 minutes' then
    return 'invalid';
  end if;
  if not exists (
    select 1 from public.client_adapter_registry
    where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id and state in ('preview', 'enabled')
  ) then
    return 'adapter_not_ready';
  end if;
  select * into prior from public.client_adapter_model_grants
   where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id and task_id = p_task_id;
  if found then
    return case when prior.grant_id = p_grant_id then 'already_open' else 'task_has_grant' end;
  end if;
  insert into public.client_adapter_model_grants
    (grant_id, tenant_slug, adapter_id, task_id, allowed, max_calls, max_tokens, expires_at)
  values (p_grant_id, p_tenant_slug, p_adapter_id, p_task_id, p_allowed, p_max_calls, p_max_tokens, p_expires_at)
  on conflict do nothing;
  if not found then
    return 'task_has_grant'; -- the same grant id was used for another task
  end if;
  return 'opened';
end;
$$;

-- Counts one call before the host reserves money for it. Returns {"status": ..., "seq": n}; seq is set only for "ok".
-- p_tokens is the most the call may use (prompt estimate plus maximum output); it is held against the grant until
-- client_adapter_model_call_finish replaces it with the real number.
create or replace function public.client_adapter_model_call_begin(
  p_tenant_slug text,
  p_worker_token text,
  p_adapter_id text,
  p_task_id text,
  p_grant_id uuid,
  p_provider text,
  p_model text,
  p_tokens integer,
  p_adapter_per_minute integer,
  p_tenant_per_minute integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  g public.client_adapter_model_grants%rowtype;
  recent integer;
  next_seq integer;
begin
  if not public.client_adapter_worker_ok(p_tenant_slug, p_worker_token) then
    return jsonb_build_object('status', 'refused');
  end if;
  if p_grant_id is null or p_provider is null or p_model is null
     or p_tokens is null or p_tokens not between 1 and 1000000
     or p_adapter_per_minute is null or p_adapter_per_minute not between 1 and 600
     or p_tenant_per_minute is null or p_tenant_per_minute not between 1 and 600 then
    return jsonb_build_object('status', 'invalid');
  end if;
  -- One grant at a time: calls for the same task are counted one after another.
  select * into g from public.client_adapter_model_grants where grant_id = p_grant_id for update;
  if not found or g.tenant_slug <> p_tenant_slug or g.adapter_id is distinct from p_adapter_id or g.task_id is distinct from p_task_id then
    return jsonb_build_object('status', 'grant_not_found');
  end if;
  if g.closed_at is not null then return jsonb_build_object('status', 'grant_closed'); end if;
  if g.expires_at <= now() then return jsonb_build_object('status', 'grant_expired'); end if;
  if not exists (
    select 1 from public.client_adapter_registry
    where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id and state in ('preview', 'enabled')
  ) then
    return jsonb_build_object('status', 'adapter_not_ready');
  end if;
  if not (p_provider || ':' || p_model = any (g.allowed)) then
    return jsonb_build_object('status', 'model_not_allowed');
  end if;
  if g.calls_used >= g.max_calls then return jsonb_build_object('status', 'call_limit'); end if;
  if g.tokens_used + p_tokens > g.max_tokens then return jsonb_build_object('status', 'token_limit'); end if;
  select count(*) into recent from public.client_adapter_model_calls
   where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id and created_at > now() - interval '1 minute';
  if recent >= p_adapter_per_minute then return jsonb_build_object('status', 'adapter_rate_limited'); end if;
  select count(*) into recent from public.client_adapter_model_calls
   where tenant_slug = p_tenant_slug and created_at > now() - interval '1 minute';
  if recent >= p_tenant_per_minute then return jsonb_build_object('status', 'tenant_rate_limited'); end if;

  next_seq := g.calls_used + 1;
  update public.client_adapter_model_grants
     set calls_used = next_seq, tokens_used = tokens_used + p_tokens
   where grant_id = p_grant_id;
  insert into public.client_adapter_model_calls (grant_id, seq, tenant_slug, adapter_id, reserved_tokens)
  values (p_grant_id, next_seq, p_tenant_slug, p_adapter_id, p_tokens);
  return jsonb_build_object('status', 'ok', 'seq', next_seq);
end;
$$;

-- Replaces a call's held tokens with what it really used (0 for a call that failed before the provider answered).
-- Once per call; a repeat with the same number is harmless.
create or replace function public.client_adapter_model_call_finish(
  p_tenant_slug text,
  p_worker_token text,
  p_grant_id uuid,
  p_seq integer,
  p_actual_tokens integer
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c public.client_adapter_model_calls%rowtype;
begin
  if not public.client_adapter_worker_ok(p_tenant_slug, p_worker_token) then
    return 'refused';
  end if;
  if p_grant_id is null or p_seq is null or p_actual_tokens is null or p_actual_tokens not between 0 and 1000000 then
    return 'invalid';
  end if;
  perform 1 from public.client_adapter_model_grants where grant_id = p_grant_id and tenant_slug = p_tenant_slug for update;
  if not found then return 'not_found'; end if;
  select * into c from public.client_adapter_model_calls where grant_id = p_grant_id and seq = p_seq for update;
  if not found then return 'not_found'; end if;
  if c.finished_at is not null then
    return case when c.actual_tokens = p_actual_tokens then 'already_finished' else 'conflict' end;
  end if;
  update public.client_adapter_model_calls
     set actual_tokens = p_actual_tokens, finished_at = now()
   where grant_id = p_grant_id and seq = p_seq;
  update public.client_adapter_model_grants
     set tokens_used = greatest(0, tokens_used - c.reserved_tokens + p_actual_tokens)
   where grant_id = p_grant_id;
  return 'finished';
end;
$$;

-- Records the adapter's own task id on the grant once task.run has answered. Set once; the same id again is harmless.
create or replace function public.client_adapter_model_grant_bind(
  p_tenant_slug text,
  p_worker_token text,
  p_grant_id uuid,
  p_adapter_task_id text
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  g public.client_adapter_model_grants%rowtype;
begin
  if not public.client_adapter_worker_ok(p_tenant_slug, p_worker_token) then
    return 'refused';
  end if;
  if p_grant_id is null or p_adapter_task_id is null or p_adapter_task_id !~ '^[A-Za-z0-9._:-]{1,128}$' then
    return 'invalid';
  end if;
  select * into g from public.client_adapter_model_grants where grant_id = p_grant_id and tenant_slug = p_tenant_slug for update;
  if not found then return 'not_found'; end if;
  if g.adapter_task_id is not null then
    return case when g.adapter_task_id = p_adapter_task_id then 'already_bound' else 'conflict' end;
  end if;
  if exists (
    select 1 from public.client_adapter_model_grants
    where tenant_slug = p_tenant_slug and adapter_id = g.adapter_id and adapter_task_id = p_adapter_task_id
  ) then
    return 'conflict';
  end if;
  update public.client_adapter_model_grants set adapter_task_id = p_adapter_task_id where grant_id = p_grant_id;
  return 'bound';
end;
$$;

-- Closes the grant for a task that has ended. Called by the sync job with the adapter's task id when the task's final
-- state arrives. A grant that was never bound is not found here and ends when it expires.
create or replace function public.client_adapter_model_grant_close(p_tenant_slug text, p_adapter_id text, p_task_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.client_adapter_model_grants%rowtype;
begin
  if p_tenant_slug is null or p_adapter_id is null or p_task_id is null then
    return 'invalid';
  end if;
  select * into g from public.client_adapter_model_grants
   where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id and adapter_task_id = p_task_id for update;
  if not found then return 'not_found'; end if;
  if g.closed_at is not null then return 'already_closed'; end if;
  update public.client_adapter_model_grants set closed_at = now() where grant_id = g.grant_id;
  return 'closed';
end;
$$;

-- Grants and their call counts are removed 28 + 7 days after they were opened. Bounded and safe to repeat.
create or replace function public.client_adapter_purge_model_grants(p_limit integer default 1000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  with doomed as (
    select grant_id from public.client_adapter_model_grants
    where created_at < now() - interval '35 days'
    order by created_at
    limit least(greatest(coalesce(p_limit, 1000), 1), 5000)
  )
  delete from public.client_adapter_model_grants g using doomed d where g.grant_id = d.grant_id;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.client_adapter_model_grant_open(text, text, text, text, uuid, text[], integer, integer, timestamptz) from public, authenticated;
grant execute on function public.client_adapter_model_grant_open(text, text, text, text, uuid, text[], integer, integer, timestamptz) to anon;
revoke all on function public.client_adapter_model_call_begin(text, text, text, text, uuid, text, text, integer, integer, integer) from public, authenticated;
grant execute on function public.client_adapter_model_call_begin(text, text, text, text, uuid, text, text, integer, integer, integer) to anon;
revoke all on function public.client_adapter_model_call_finish(text, text, uuid, integer, integer) from public, authenticated;
grant execute on function public.client_adapter_model_call_finish(text, text, uuid, integer, integer) to anon;
revoke all on function public.client_adapter_model_grant_bind(text, text, uuid, text) from public, authenticated;
grant execute on function public.client_adapter_model_grant_bind(text, text, uuid, text) to anon;
revoke all on function public.client_adapter_model_grant_close(text, text, text) from public, anon, authenticated;
grant execute on function public.client_adapter_model_grant_close(text, text, text) to service_role;
revoke all on function public.client_adapter_purge_model_grants(integer) from public, anon, authenticated;
grant execute on function public.client_adapter_purge_model_grants(integer) to service_role;
