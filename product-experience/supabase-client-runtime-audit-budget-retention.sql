-- Tenant-visible runtime audit and budget details follow the 28+7 policy.
-- Budget rows remain available to the budget RPCs through the full current
-- calendar month; a 35-day maximum safely covers every calendar month.

create index if not exists client_audit_tenant_retention_idx
  on public.client_runtime_audit_events (tenant_slug, created_at, id);
create index if not exists client_budget_tenant_retention_idx
  on public.client_runtime_budget_ledger (tenant_slug, created_at, id);

create or replace function public.guard_client_runtime_audit_retention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    return new;
  end if;
  if new.tenant_slug is distinct from old.tenant_slug
    or new.created_at is distinct from old.created_at then
    raise exception 'client_runtime_audit_retention_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_client_runtime_audit_retention on public.client_runtime_audit_events;
create trigger guard_client_runtime_audit_retention
  before insert or update on public.client_runtime_audit_events
  for each row execute function public.guard_client_runtime_audit_retention();

create or replace function public.guard_client_runtime_budget_retention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    return new;
  end if;
  if new.tenant_slug is distinct from old.tenant_slug
    or new.created_at is distinct from old.created_at then
    raise exception 'client_runtime_budget_retention_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_client_runtime_budget_retention on public.client_runtime_budget_ledger;
create trigger guard_client_runtime_budget_retention
  before insert or update on public.client_runtime_budget_ledger
  for each row execute function public.guard_client_runtime_budget_retention();

drop policy if exists client_audit_member_select on public.client_runtime_audit_events;
create policy client_audit_member_select on public.client_runtime_audit_events
  for select to authenticated
  using (public.client_member(tenant_slug)
    and created_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug)));

drop policy if exists client_budget_member_select on public.client_runtime_budget_ledger;
create policy client_budget_member_select on public.client_runtime_budget_ledger
  for select to authenticated
  using (public.client_member(tenant_slug)
    and created_at > now() - interval '28 days');

create or replace function public.purge_expired_client_runtime_audit_and_budget(
  p_tenant_slug text,
  p_apply boolean default false,
  p_batch_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
  v_audit_cutoff timestamptz;
  v_budget_cutoff timestamptz;
  v_audit_candidates integer;
  v_budget_candidates integer;
  v_audit_deleted integer := 0;
  v_budget_deleted integer := 0;
  v_audit_remaining integer;
  v_budget_remaining integer;
begin
  if p_tenant_slug is null or p_tenant_slug !~ '^[a-z][a-z0-9-]{2,40}$'
    or p_apply is null or p_batch_limit is null or p_batch_limit < 1 or p_batch_limit > 1000 then
    raise exception 'client_runtime_audit_budget_retention_invalid_input';
  end if;

  select retention_days into v_days
  from public.client_tenants
  where slug = p_tenant_slug
  for update;
  if not found then
    raise exception 'client_runtime_audit_budget_retention_tenant_not_found';
  end if;
  if v_days is null or v_days < 1 or v_days > 28 then
    raise exception 'client_runtime_audit_budget_retention_tenant_not_configured';
  end if;

  v_audit_cutoff := now() - make_interval(days => v_days + 7);
  v_budget_cutoff := now() - interval '35 days';

  select count(*) into v_audit_candidates from public.client_runtime_audit_events
    where tenant_slug = p_tenant_slug and created_at <= v_audit_cutoff;
  select count(*) into v_budget_candidates from public.client_runtime_budget_ledger
    where tenant_slug = p_tenant_slug and created_at <= v_budget_cutoff;

  if p_apply then
    with selected as (
      select id from public.client_runtime_audit_events
      where tenant_slug = p_tenant_slug and created_at <= v_audit_cutoff
      order by created_at, id limit p_batch_limit for update skip locked
    ), removed as (
      delete from public.client_runtime_audit_events as event
      using selected where event.id = selected.id and event.tenant_slug = p_tenant_slug
      returning event.id
    ) select count(*) into v_audit_deleted from removed;

    with selected as (
      select id from public.client_runtime_budget_ledger
      where tenant_slug = p_tenant_slug and created_at <= v_budget_cutoff
      order by created_at, id limit p_batch_limit for update skip locked
    ), removed as (
      delete from public.client_runtime_budget_ledger as entry
      using selected where entry.id = selected.id and entry.tenant_slug = p_tenant_slug
      returning entry.id
    ) select count(*) into v_budget_deleted from removed;

    if v_audit_deleted + v_budget_deleted > 0 then
      insert into public.client_runtime_audit_events (tenant_slug, event_type, metadata)
      values (p_tenant_slug, 'tenant.runtime_audit_budget.retention_purged',
        jsonb_build_object('auditDeleted', v_audit_deleted, 'budgetDeleted', v_budget_deleted,
          'auditCutoff', v_audit_cutoff, 'budgetCutoff', v_budget_cutoff,
          'retentionDays', v_days, 'recoveryDays', 7, 'budgetPurgeAfterDays', 35));
    end if;
  end if;

  select count(*) into v_audit_remaining from public.client_runtime_audit_events
    where tenant_slug = p_tenant_slug and created_at <= v_audit_cutoff;
  select count(*) into v_budget_remaining from public.client_runtime_budget_ledger
    where tenant_slug = p_tenant_slug and created_at <= v_budget_cutoff;

  return jsonb_build_object('tenant', p_tenant_slug, 'retentionDays', v_days,
    'recoveryDays', 7, 'auditPurgeAfterDays', v_days + 7, 'budgetPurgeAfterDays', 35,
    'auditCutoff', v_audit_cutoff, 'budgetCutoff', v_budget_cutoff,
    'auditCandidates', v_audit_candidates, 'auditDeleted', v_audit_deleted,
    'auditRemainingCandidates', v_audit_remaining,
    'budgetCandidates', v_budget_candidates, 'budgetDeleted', v_budget_deleted,
    'budgetRemainingCandidates', v_budget_remaining, 'applied', p_apply,
    'scope', 'client_runtime_audit_events,client_runtime_budget_ledger');
end;
$$;

revoke all on function public.purge_expired_client_runtime_audit_and_budget(text, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.purge_expired_client_runtime_audit_and_budget(text, boolean, integer)
  to service_role;
