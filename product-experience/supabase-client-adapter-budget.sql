-- Apply after supabase-client-adapter-host.sql and the runtime control-plane/controls migrations.
-- Per-adapter budget caps on top of the existing central ledger (client_runtime_budget_ledger).
--   client_adapter_budget_reserve  reserve money before a task starts (adapter cap, then tenant monthly cap)
--   client_adapter_budget_settle   record the real cost, never above what was reserved
--   client_adapter_budget_release  give a reservation back when a task is cancelled
-- Money is whole-number micros (millionths of a US dollar). No new tables: each charge is one central ledger row
-- (job_id null, tagged with adapter and task in usage_metadata) plus one append-only client_adapter_budget_events row.
-- All three run as the host worker (publishable key plus tenant worker token) and take the same per-tenant lock as
-- reserve_client_runtime_budget_worker, so adapter and non-adapter spending cannot overspend together.
-- Any problem returns a refusal; nothing is allowed by default.

create or replace function public.client_adapter_worker_ok(p_tenant_slug text, p_worker_token text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select p_worker_token is not null
    and length(p_worker_token) >= 24
    and exists (
      select 1 from public.client_tenants
      where slug = p_tenant_slug
        and status = 'active'
        and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
    );
$$;

revoke all on function public.client_adapter_worker_ok(text, text) from public, anon, authenticated;

create or replace function public.client_adapter_budget_reserve(
  p_tenant_slug text,
  p_worker_token text,
  p_adapter_id text,
  p_task_id text,
  p_idempotency_key text,
  p_amount_micros bigint,
  p_provider text,
  p_model text,
  p_tenant_monthly_cap_micros bigint
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  adapter public.client_adapter_registry%rowtype;
  prior public.client_adapter_budget_events%rowtype;
  period_start timestamptz;
  adapter_spent bigint;
  tenant_spent bigint;
  ledger_id bigint;
begin
  if not public.client_adapter_worker_ok(p_tenant_slug, p_worker_token)
     or p_adapter_id is null or p_adapter_id !~ '^[a-z][a-z0-9-]{2,40}$'
     or p_task_id is null or length(p_task_id) not between 1 and 128
     or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 180
     or p_amount_micros is null or p_amount_micros < 0
     or p_provider is null or length(p_provider) not between 1 and 120
     or (p_model is not null and length(p_model) not between 1 and 180)
     or p_tenant_monthly_cap_micros is null or p_tenant_monthly_cap_micros < 0 then
    return 'refused';
  end if;

  perform pg_advisory_xact_lock(hashtext(left(p_tenant_slug, 64)));

  select * into adapter from public.client_adapter_registry
    where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id;
  if not found or adapter.state not in ('preview', 'enabled') then
    return 'adapter_not_ready';
  end if;

  -- A repeated call with the same key is answered from the first result and charges nothing more.
  select * into prior from public.client_adapter_budget_events
    where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id and idempotency_key = p_idempotency_key;
  if found then
    if prior.kind = 'reserve' and prior.task_id = p_task_id and prior.amount_micros = p_amount_micros and prior.provider = p_provider then
      return 'already_reserved';
    end if;
    return 'key_conflict';
  end if;
  if exists (
    select 1 from public.client_adapter_budget_events
    where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id and task_id = p_task_id and kind = 'reserve'
  ) then
    return 'task_already_reserved';
  end if;

  if adapter.budget_cap_micros is not null then
    period_start := case adapter.budget_period
      when 'day' then date_trunc('day', now() at time zone 'utc') at time zone 'utc'
      when 'month' then date_trunc('month', now() at time zone 'utc') at time zone 'utc'
      else null
    end;
    select coalesce(sum(amount_micros), 0) into adapter_spent
      from public.client_runtime_budget_ledger
      where tenant_slug = p_tenant_slug
        and usage_metadata ->> 'adapter_id' = p_adapter_id
        and (period_start is null or created_at >= period_start);
    if adapter_spent + p_amount_micros > adapter.budget_cap_micros then
      return 'adapter_cap_exceeded';
    end if;
  end if;

  select coalesce(sum(amount_micros), 0) into tenant_spent
    from public.client_runtime_budget_ledger
    where tenant_slug = p_tenant_slug and created_at >= date_trunc('month', now());
  if tenant_spent + p_amount_micros > p_tenant_monthly_cap_micros then
    return 'tenant_cap_exceeded';
  end if;

  insert into public.client_runtime_budget_ledger (tenant_slug, job_id, provider, model, amount_micros, usage_metadata)
  values (p_tenant_slug, null, p_provider, p_model, p_amount_micros,
          jsonb_build_object('reserved_by', 'adapter-budget', 'adapter_id', p_adapter_id, 'task_id', p_task_id))
  returning id into ledger_id;

  insert into public.client_adapter_budget_events
    (tenant_slug, adapter_id, task_id, kind, amount_micros, provider, model, runtime_budget_ref, idempotency_key)
  values (p_tenant_slug, p_adapter_id, p_task_id, 'reserve', p_amount_micros, p_provider, p_model, ledger_id::text, p_idempotency_key);

  return 'reserved';
end;
$$;

create or replace function public.client_adapter_budget_settle(
  p_tenant_slug text,
  p_worker_token text,
  p_adapter_id text,
  p_task_id text,
  p_idempotency_key text,
  p_actual_amount_micros bigint
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  reserved public.client_adapter_budget_events%rowtype;
  prior public.client_adapter_budget_events%rowtype;
  ledger_amount bigint;
begin
  if not public.client_adapter_worker_ok(p_tenant_slug, p_worker_token)
     or p_adapter_id is null or p_adapter_id !~ '^[a-z][a-z0-9-]{2,40}$'
     or p_task_id is null or length(p_task_id) not between 1 and 128
     or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 180
     or p_actual_amount_micros is null or p_actual_amount_micros < 0 then
    return 'refused';
  end if;

  perform pg_advisory_xact_lock(hashtext(left(p_tenant_slug, 64)));

  select * into prior from public.client_adapter_budget_events
    where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id and idempotency_key = p_idempotency_key;
  if found then
    if prior.kind = 'settle' and prior.task_id = p_task_id and prior.amount_micros = p_actual_amount_micros then
      return 'already_applied';
    end if;
    return 'key_conflict';
  end if;

  select * into reserved from public.client_adapter_budget_events
    where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id and task_id = p_task_id and kind = 'reserve';
  if not found then
    return 'not_found';
  end if;
  if exists (
    select 1 from public.client_adapter_budget_events
    where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id and task_id = p_task_id and kind in ('settle', 'release')
  ) then
    return 'already_closed';
  end if;

  select amount_micros into ledger_amount from public.client_runtime_budget_ledger
    where id = reserved.runtime_budget_ref::bigint and tenant_slug = p_tenant_slug
    for update;
  if ledger_amount is null then
    return 'not_found';
  end if;
  if p_actual_amount_micros > ledger_amount then
    return 'over_reserved';
  end if;

  update public.client_runtime_budget_ledger
    set amount_micros = p_actual_amount_micros,
        usage_metadata = usage_metadata || jsonb_build_object('settled', true)
    where id = reserved.runtime_budget_ref::bigint and tenant_slug = p_tenant_slug;

  insert into public.client_adapter_budget_events
    (tenant_slug, adapter_id, task_id, kind, amount_micros, provider, model, runtime_budget_ref, idempotency_key)
  values (p_tenant_slug, p_adapter_id, p_task_id, 'settle', p_actual_amount_micros, reserved.provider, reserved.model,
          reserved.runtime_budget_ref, p_idempotency_key);

  return 'settled';
end;
$$;

create or replace function public.client_adapter_budget_release(
  p_tenant_slug text,
  p_worker_token text,
  p_adapter_id text,
  p_task_id text,
  p_idempotency_key text
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  reserved public.client_adapter_budget_events%rowtype;
  prior public.client_adapter_budget_events%rowtype;
begin
  if not public.client_adapter_worker_ok(p_tenant_slug, p_worker_token)
     or p_adapter_id is null or p_adapter_id !~ '^[a-z][a-z0-9-]{2,40}$'
     or p_task_id is null or length(p_task_id) not between 1 and 128
     or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 180 then
    return 'refused';
  end if;

  perform pg_advisory_xact_lock(hashtext(left(p_tenant_slug, 64)));

  select * into prior from public.client_adapter_budget_events
    where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id and idempotency_key = p_idempotency_key;
  if found then
    if prior.kind = 'release' and prior.task_id = p_task_id then
      return 'already_applied';
    end if;
    return 'key_conflict';
  end if;

  select * into reserved from public.client_adapter_budget_events
    where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id and task_id = p_task_id and kind = 'reserve';
  if not found then
    return 'not_found';
  end if;
  if exists (
    select 1 from public.client_adapter_budget_events
    where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id and task_id = p_task_id and kind in ('settle', 'release')
  ) then
    return 'already_closed';
  end if;

  update public.client_runtime_budget_ledger
    set amount_micros = 0,
        usage_metadata = usage_metadata || jsonb_build_object('released', true)
    where id = reserved.runtime_budget_ref::bigint and tenant_slug = p_tenant_slug;
  if not found then
    return 'not_found';
  end if;

  insert into public.client_adapter_budget_events
    (tenant_slug, adapter_id, task_id, kind, amount_micros, provider, model, runtime_budget_ref, idempotency_key)
  values (p_tenant_slug, p_adapter_id, p_task_id, 'release', reserved.amount_micros, reserved.provider, reserved.model,
          reserved.runtime_budget_ref, p_idempotency_key);

  return 'released';
end;
$$;

revoke all on function public.client_adapter_budget_reserve(text, text, text, text, text, bigint, text, text, bigint) from public, authenticated;
grant execute on function public.client_adapter_budget_reserve(text, text, text, text, text, bigint, text, text, bigint) to anon;
revoke all on function public.client_adapter_budget_settle(text, text, text, text, text, bigint) from public, authenticated;
grant execute on function public.client_adapter_budget_settle(text, text, text, text, text, bigint) to anon;
revoke all on function public.client_adapter_budget_release(text, text, text, text, text) from public, authenticated;
grant execute on function public.client_adapter_budget_release(text, text, text, text, text) to anon;
