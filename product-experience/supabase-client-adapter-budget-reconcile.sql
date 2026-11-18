-- Apply after supabase-client-adapter-tombstones.sql and BEFORE supabase-client-lifecycle-restore.sql.
-- Budget reconcile (Veloce phase 2 slice 3b, ADR-016): does what an adapter says a task cost agree with the host's ledger?
--
-- The adapter's final `task.state` event carries `spentMicros`. The host's puller records it here, once per task, as an
-- outbox event `budget.reported` (task id and a whole number; no text). The outbox already has the 28 + 7 day purge and
-- feeds the activity counts, so no new table needs retention, restore or export wiring. This file never changes the money
-- tables: it only READS client_adapter_budget_events to compare.
--
--   client_adapter_budget_record_report       service role: record one task's reported spend (idempotent by task)
--   client_adapter_budget_reconcile_counts    members: tasks per status per adapter, last 28 days
--   client_adapter_budget_reconcile_tasks     admins: the tasks behind those counts (ids and amounts only)
--
-- Status of a reported task, comparing with the host's reserve / settle / release rows (tolerance 1,000 micros = $0.001):
--   unreserved       the host never reserved anything for the task
--   over_reserved    the adapter spent more than the host reserved (a cap was breached)
--   matched          settled (or released, with nothing spent) and the amounts agree
--   settled_differs  settled (or released) and the amounts disagree
--   open             reserved, and neither settled nor released yet
-- This only flags. It does not settle, release, block or change anything.

-- The outbox's allowed event types are stated in every file that adds one; the list is the same in all of them.
alter table public.client_adapter_outbox drop constraint if exists client_adapter_outbox_event_type_check;
alter table public.client_adapter_outbox add constraint client_adapter_outbox_event_type_check
  check (event_type in ('memory.committed', 'memory.tombstoned', 'task.requested', 'approval.requested', 'approval.decided', 'approval.executed', 'promotion.decided', 'memory.proposed', 'memory.erased', 'budget.reported'));

create or replace function public.client_adapter_budget_record_report(p_tenant_slug text, p_adapter_id text, p_task_id text, p_reported_micros bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  ev uuid;
  inserted integer;
begin
  if p_tenant_slug is null or p_tenant_slug !~ '^[a-z][a-z0-9-]{2,40}$'
     or p_adapter_id is null or p_adapter_id !~ '^[a-z][a-z0-9-]{2,40}$'
     or p_task_id is null or length(p_task_id) not between 1 and 128
     or p_reported_micros is null or p_reported_micros < 0 or p_reported_micros > 1000000000000 then
    return 'invalid';
  end if;
  if not exists (
    select 1 from public.client_adapter_registry r join public.client_tenants t on t.slug = r.tenant_slug
    where r.tenant_slug = p_tenant_slug and r.adapter_id = p_adapter_id and r.state in ('preview', 'enabled') and t.status = 'active'
  ) then
    return 'adapter_not_active';
  end if;
  -- One event per task: the id is derived from the task, so a second report of the same task changes nothing.
  ev := md5(p_tenant_slug || '|' || p_adapter_id || '|' || p_task_id || '|budget.reported')::uuid;
  insert into public.client_adapter_outbox (tenant_slug, event_type, adapter_id, payload, event_id)
    values (p_tenant_slug, 'budget.reported', p_adapter_id, jsonb_build_object('task_id', p_task_id, 'reported_micros', p_reported_micros), ev)
    on conflict (event_id) do nothing;
  get diagnostics inserted = row_count;
  return case when inserted = 1 then 'recorded' else 'duplicate' end;
end;
$$;

-- One row per reported task in the last 28 days, with the host's own numbers beside it. Internal: callers check access.
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
  ), host as (
    select r.adapter_id, r.task_id, r.reported_micros,
           (select e.amount_micros from public.client_adapter_budget_events e
              where e.tenant_slug = p_tenant_slug and e.adapter_id = r.adapter_id and e.task_id = r.task_id and e.kind = 'reserve' limit 1) as reserved_micros,
           (select e.amount_micros from public.client_adapter_budget_events e
              where e.tenant_slug = p_tenant_slug and e.adapter_id = r.adapter_id and e.task_id = r.task_id and e.kind = 'settle' limit 1) as settled_micros,
           exists (select 1 from public.client_adapter_budget_events e
              where e.tenant_slug = p_tenant_slug and e.adapter_id = r.adapter_id and e.task_id = r.task_id and e.kind = 'release') as released
    from reported r
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

create or replace function public.client_adapter_budget_reconcile_counts(p_tenant_slug text)
returns table (adapter_id text, status text, task_count integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.client_member(p_tenant_slug) then
    return;
  end if;
  return query
    select r.adapter_id, r.status, count(*)::integer
    from public.client_adapter_budget_reconcile_rows(p_tenant_slug) r
    group by r.adapter_id, r.status;
end;
$$;

create or replace function public.client_adapter_budget_reconcile_tasks(p_tenant_slug text)
returns table (adapter_id text, task_id text, reported_micros bigint, reserved_micros bigint, settled_micros bigint, status text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.client_adapter_admin(p_tenant_slug) then
    return;
  end if;
  return query
    select r.adapter_id, r.task_id, r.reported_micros, r.reserved_micros, r.settled_micros, r.status
    from public.client_adapter_budget_reconcile_rows(p_tenant_slug) r
    where r.status <> 'matched'
    order by r.adapter_id, r.task_id
    limit 200;
end;
$$;

revoke all on function public.client_adapter_budget_record_report(text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.client_adapter_budget_record_report(text, text, text, bigint) to service_role;
revoke all on function public.client_adapter_budget_reconcile_counts(text) from public, anon;
grant execute on function public.client_adapter_budget_reconcile_counts(text) to authenticated;
revoke all on function public.client_adapter_budget_reconcile_tasks(text) from public, anon;
grant execute on function public.client_adapter_budget_reconcile_tasks(text) to authenticated;
