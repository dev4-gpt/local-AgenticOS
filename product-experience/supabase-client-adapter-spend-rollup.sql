-- Apply after supabase-client-adapter-model-grants.sql (and so after supabase-client-adapter-budget-reconcile.sql).
-- An adapter's own spend (ADR-020, ADR-016). Some adapters pay for things of their own besides model calls: ProofMint pays for a
-- sandbox and a round fee. The host now sets the task's budget aside under its OWN key for the task (the task.run idempotency key)
-- before it starts the task, using the existing client_adapter_budget_reserve. This file adds the two things that were missing:
--
--   client_adapter_own_spend_settle     service role (the sync job): when the task's final state arrives, settle that reservation
--                                        at what the adapter reported, never above the reservation; with no usable report, settle
--                                        the full reservation (unknown spend is never taken as zero). The rest goes back to the
--                                        client's budget.
--   client_adapter_budget_reconcile_rows the spend check now finds the reservation from the adapter's OWN task id, through the
--                                        task's model grant (which records both ids). Model calls (<key>/m<n>) are left out of the
--                                        comparison: the host settles each of those itself at the provider's real cost, and the
--                                        adapter's report covers only its own spend.
-- No new table, so retention, restore and export are unchanged.

create or replace function public.client_adapter_own_spend_settle(p_tenant_slug text, p_adapter_id text, p_adapter_task_id text, p_reported_micros bigint)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  host_key text;
  reserved public.client_adapter_budget_events%rowtype;
  ledger_amount bigint;
  amount bigint;
begin
  if p_tenant_slug is null or p_tenant_slug !~ '^[a-z][a-z0-9-]{2,40}$'
     or p_adapter_id is null or p_adapter_id !~ '^[a-z][a-z0-9-]{2,40}$'
     or p_adapter_task_id is null or length(p_adapter_task_id) not between 1 and 128
     or p_reported_micros < 0 or p_reported_micros > 1000000000000 then
    return 'invalid';
  end if;

  select g.task_id into host_key from public.client_adapter_model_grants g
    where g.tenant_slug = p_tenant_slug and g.adapter_id = p_adapter_id and g.adapter_task_id = p_adapter_task_id
    limit 1;
  if host_key is null then
    return 'not_reserved';
  end if;

  perform pg_advisory_xact_lock(hashtext(left(p_tenant_slug, 64)));

  select * into reserved from public.client_adapter_budget_events
    where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id and task_id = host_key and kind = 'reserve';
  if not found then
    return 'not_reserved';
  end if;
  if exists (
    select 1 from public.client_adapter_budget_events
    where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id and task_id = host_key and kind in ('settle', 'release')
  ) then
    return 'already_closed';
  end if;

  select amount_micros into ledger_amount from public.client_runtime_budget_ledger
    where id = reserved.runtime_budget_ref::bigint and tenant_slug = p_tenant_slug
    for update;
  if ledger_amount is null then
    return 'not_found';
  end if;

  amount := case when p_reported_micros is null then ledger_amount else least(p_reported_micros, ledger_amount) end;
  update public.client_runtime_budget_ledger
    set amount_micros = amount,
        usage_metadata = usage_metadata || jsonb_build_object('settled', true, 'own_spend', true)
    where id = reserved.runtime_budget_ref::bigint and tenant_slug = p_tenant_slug;
  insert into public.client_adapter_budget_events
    (tenant_slug, adapter_id, task_id, kind, amount_micros, provider, model, runtime_budget_ref, idempotency_key)
  values (p_tenant_slug, p_adapter_id, host_key, 'settle', amount, reserved.provider, reserved.model, reserved.runtime_budget_ref,
          'own-settle-' || md5(p_tenant_slug || '|' || p_adapter_id || '|' || host_key));
  return case when p_reported_micros is null then 'settled_full' else 'settled' end;
end;
$$;

revoke all on function public.client_adapter_own_spend_settle(text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.client_adapter_own_spend_settle(text, text, text, bigint) to service_role;

-- Same columns and statuses as supabase-client-adapter-budget-reconcile.sql; only the ledger task id is looked up through the grant.
create or replace function public.client_adapter_budget_reconcile_rows(p_tenant_slug text)
returns table (adapter_id text, task_id text, reported_micros bigint, reserved_micros bigint, settled_micros bigint, status text)
language sql
stable
security definer
set search_path = public
as $$
  with reported as (
    select o.adapter_id, o.payload ->> 'task_id' as task_id, (o.payload ->> 'reported_micros')::bigint as reported_micros
    from public.client_adapter_outbox o
    where o.tenant_slug = p_tenant_slug and o.event_type = 'budget.reported' and o.created_at >= now() - interval '28 days'
  ), keyed as (
    select r.*, coalesce(
             (select g.task_id from public.client_adapter_model_grants g
                where g.tenant_slug = p_tenant_slug and g.adapter_id = r.adapter_id and g.adapter_task_id = r.task_id limit 1),
             r.task_id) as ledger_task
    from reported r
  ), host as (
    select k.adapter_id, k.task_id, k.reported_micros,
           (select e.amount_micros from public.client_adapter_budget_events e
              where e.tenant_slug = p_tenant_slug and e.adapter_id = k.adapter_id and e.task_id = k.ledger_task and e.kind = 'reserve' limit 1) as reserved_micros,
           (select e.amount_micros from public.client_adapter_budget_events e
              where e.tenant_slug = p_tenant_slug and e.adapter_id = k.adapter_id and e.task_id = k.ledger_task and e.kind = 'settle' limit 1) as settled_micros,
           exists (select 1 from public.client_adapter_budget_events e
              where e.tenant_slug = p_tenant_slug and e.adapter_id = k.adapter_id and e.task_id = k.ledger_task and e.kind = 'release') as released
    from keyed k
  )
  select h.adapter_id, h.task_id, h.reported_micros, h.reserved_micros, h.settled_micros,
         case
           when h.reserved_micros is null then 'unreserved'
           when h.reported_micros > h.reserved_micros + 1000 then 'over_reserved'
           when h.settled_micros is not null then case when abs(h.settled_micros - h.reported_micros) <= 1000 then 'matched' else 'settled_differs' end
           when h.released then case when h.reported_micros <= 1000 then 'matched' else 'settled_differs' end
           else 'open'
         end
  from host h;
$$;
revoke all on function public.client_adapter_budget_reconcile_rows(text) from public, anon, authenticated;
