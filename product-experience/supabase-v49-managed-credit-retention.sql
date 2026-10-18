-- V49: managed-credit retention, replay protection, and late-refund review.
-- Apply after the V31-V34 credit schema, V44 Stripe dispositions, V47
-- offboarding guard, V48, and supabase-client-retention-policy-28.sql.
-- No hosted migration or cleanup is authorized by this file.

begin;

-- Keep only an opaque replay digest after the source row expires. These rows
-- contain neither a tenant slug nor the original idempotency key.
create table if not exists public.credit_replay_key_tombstones (
  key_type text not null check (key_type in ('transaction', 'reservation')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  retired_at timestamptz not null default now(),
  primary key (key_type, key_hash)
);

alter table public.credit_replay_key_tombstones enable row level security;
revoke all on public.credit_replay_key_tombstones from public, anon, authenticated, service_role;

create or replace function public.client_credit_replay_key_hash(
  p_key_type text,
  p_tenant_slug text,
  p_idempotency_key text
)
returns text
language sql
immutable
strict
set search_path = public, extensions
as $$
  select encode(extensions.digest(convert_to(
    p_key_type || ':' || octet_length(convert_to(p_tenant_slug, 'UTF8'))::text || ':' || p_tenant_slug || ':' ||
    octet_length(convert_to(p_idempotency_key, 'UTF8'))::text || ':' || p_idempotency_key,
    'UTF8'
  ), 'sha256'), 'hex');
$$;

create or replace function public.guard_client_credit_replay_key()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_key_type text := case when tg_table_name = 'client_credit_transactions' then 'transaction' else 'reservation' end;
  v_tenant_slug text;
  v_idempotency_key text;
  v_key_hash text;
begin
  if tg_op = 'DELETE' then
    v_tenant_slug := old.tenant_slug;
    v_idempotency_key := old.idempotency_key;
    v_key_hash := public.client_credit_replay_key_hash(v_key_type, v_tenant_slug, v_idempotency_key);
    insert into public.credit_replay_key_tombstones (key_type, key_hash)
    values (v_key_type, v_key_hash)
    on conflict do nothing;
    return old;
  end if;

  v_tenant_slug := new.tenant_slug;
  v_idempotency_key := new.idempotency_key;
  v_key_hash := public.client_credit_replay_key_hash(v_key_type, v_tenant_slug, v_idempotency_key);
  if exists (
    select 1 from public.credit_replay_key_tombstones
    where key_type = v_key_type and key_hash = v_key_hash
  ) then
    raise exception 'client_credit_replay_key_retired';
  end if;
  return new;
end;
$$;

drop trigger if exists client_credit_transaction_replay_guard on public.client_credit_transactions;
create trigger client_credit_transaction_replay_guard
  before insert on public.client_credit_transactions
  for each row execute function public.guard_client_credit_replay_key();
drop trigger if exists client_credit_transaction_replay_tombstone on public.client_credit_transactions;
create trigger client_credit_transaction_replay_tombstone
  after delete on public.client_credit_transactions
  for each row execute function public.guard_client_credit_replay_key();

drop trigger if exists client_credit_reservation_replay_guard on public.client_credit_reservations;
create trigger client_credit_reservation_replay_guard
  before insert on public.client_credit_reservations
  for each row execute function public.guard_client_credit_replay_key();
drop trigger if exists client_credit_reservation_replay_tombstone on public.client_credit_reservations;
create trigger client_credit_reservation_replay_tombstone
  after delete on public.client_credit_reservations
  for each row execute function public.guard_client_credit_replay_key();

revoke all on function public.client_credit_replay_key_hash(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.guard_client_credit_replay_key() from public, anon, authenticated, service_role;

-- Track only when a provider allocation's spendable or reserved balance
-- changes. Provider health/configuration updates must not extend ledger life.
alter table public.client_credit_budgets
  add column if not exists financial_activity_at timestamptz;

update public.client_credit_budgets as budget
set financial_activity_at = coalesce(budget.updated_at, now())
where financial_activity_at is null;

create or replace function public.track_client_credit_budget_activity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.financial_activity_at := now();
    return new;
  end if;

  if new.purchased_micros is distinct from old.purchased_micros
     or new.reserved_micros is distinct from old.reserved_micros
     or new.spent_micros is distinct from old.spent_micros then
    if new.purchased_micros = 0 and new.reserved_micros = 0 and new.spent_micros = 0 then
      new.financial_activity_at := null;
    else
      new.financial_activity_at := now();
    end if;
  else
    new.financial_activity_at := old.financial_activity_at;
  end if;
  return new;
end;
$$;

drop trigger if exists client_credit_budget_activity on public.client_credit_budgets;
create trigger client_credit_budget_activity
  before insert or update of purchased_micros, reserved_micros, spent_micros
  on public.client_credit_budgets
  for each row execute function public.track_client_credit_budget_activity();
revoke all on function public.track_client_credit_budget_activity() from public, anon, authenticated;

create or replace function public.guard_client_credit_record_timestamp()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_column text := tg_argv[0];
begin
  if tg_op = 'INSERT' then
    new := jsonb_populate_record(new, jsonb_build_object(v_column, now()));
    return new;
  end if;
  if to_jsonb(new)->v_column is distinct from to_jsonb(old)->v_column then
    raise exception 'client_credit_record_timestamp_immutable';
  end if;
  return new;
end;
$$;

do $$
declare
  v_table text;
  v_timestamp_column text;
begin
  for v_table, v_timestamp_column in
    select * from (values
      ('client_credit_transactions', 'created_at'),
      ('client_credit_purchase_plans', 'created_at'),
      ('client_credit_purchase_plan_allocations', 'created_at'),
      ('client_credit_reservations', 'created_at'),
      ('client_credit_reservation_events', 'created_at'),
      ('client_credit_execution_claims', 'claimed_at')
    ) as retained(table_name, timestamp_column)
  loop
    execute format('drop trigger if exists %I on public.%I', v_table || '_retention_timestamp', v_table);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.guard_client_credit_record_timestamp(%L)',
      v_table || '_retention_timestamp', v_table, v_timestamp_column
    );
  end loop;
end;
$$;
revoke all on function public.guard_client_credit_record_timestamp() from public, anon, authenticated;

-- Members may continue to see the live provider balance. After its active
-- retention window, this snapshot masks historical purchased/spent totals and
-- reports only the available plus reserved balance basis.
create or replace function public.client_credit_budget_snapshot(p_tenant_slug text)
returns table (
  catalog_id text,
  provider_key text,
  purchased_micros bigint,
  reserved_micros bigint,
  spent_micros bigint,
  available_micros bigint,
  status text
)
language sql
security definer
set search_path = public
as $$
  select
    budget.catalog_id,
    budget.provider_key,
    case
      when budget.financial_activity_at > now() - make_interval(days => public.client_tenant_retention_days(p_tenant_slug))
        then budget.purchased_micros
      else greatest(0, budget.purchased_micros - budget.reserved_micros - budget.spent_micros) + budget.reserved_micros
    end as purchased_micros,
    budget.reserved_micros,
    case
      when budget.financial_activity_at > now() - make_interval(days => public.client_tenant_retention_days(p_tenant_slug))
        then budget.spent_micros
      else 0::bigint
    end as spent_micros,
    greatest(0, budget.purchased_micros - budget.reserved_micros - budget.spent_micros) as available_micros,
    budget.status
  from public.client_credit_budgets as budget
  where budget.tenant_slug = p_tenant_slug
    and public.client_tenant_retention_days(p_tenant_slug) is not null
    and exists (
      select 1 from public.client_memberships as membership
      where membership.tenant_slug = p_tenant_slug
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    )
  order by budget.updated_at desc;
$$;

revoke all on function public.client_credit_budget_snapshot(text) from public, anon;
grant execute on function public.client_credit_budget_snapshot(text) to authenticated;

create or replace function public.purge_expired_client_credit_records(
  p_tenant_slug text,
  p_apply boolean default false,
  p_batch_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_retention_days integer;
  v_cutoff timestamptz;
  v_candidates jsonb;
  v_deleted jsonb := '{}'::jsonb;
  v_count integer := 0;
  v_released integer := 0;
  v_reservation_id uuid;
  v_remaining jsonb;
begin
  if p_tenant_slug is null or p_tenant_slug !~ '^[a-z][a-z0-9-]{2,40}$'
     or p_apply is null or p_batch_limit is null
     or p_batch_limit < 1 or p_batch_limit > 1000 then
    raise exception 'client_credit_retention_invalid_input';
  end if;

  select retention_days into v_retention_days
  from public.client_tenants where slug = p_tenant_slug for update;
  if not found then raise exception 'client_credit_retention_tenant_not_found'; end if;
  if v_retention_days is null or v_retention_days < 1 or v_retention_days > 28 then
    raise exception 'client_credit_retention_tenant_not_configured';
  end if;
  v_cutoff := now() - interval '35 days';

  select jsonb_build_object(
    'transactions', (select count(*) from public.client_credit_transactions where tenant_slug = p_tenant_slug and created_at <= v_cutoff),
    'reservationEvents', (select count(*) from public.client_credit_reservation_events where tenant_slug = p_tenant_slug and created_at <= v_cutoff),
    'executionClaims', (select count(*) from public.client_credit_execution_claims where tenant_slug = p_tenant_slug and claimed_at <= v_cutoff),
    'reservations', (select count(*) from public.client_credit_reservations where tenant_slug = p_tenant_slug and created_at <= v_cutoff and status <> 'reserved'),
    'purchasePlanAllocations', (select count(*) from public.client_credit_purchase_plan_allocations where tenant_slug = p_tenant_slug and created_at <= v_cutoff),
    'purchasePlans', (select count(*) from public.client_credit_purchase_plans where tenant_slug = p_tenant_slug and created_at <= v_cutoff),
    'zeroBalanceBudgets', (select count(*) from public.client_credit_budgets where tenant_slug = p_tenant_slug and financial_activity_at <= v_cutoff and reserved_micros = 0 and greatest(0, purchased_micros - reserved_micros - spent_micros) = 0)
  ) into v_candidates;

  if p_apply then
    -- A hold still open at the final day-35 boundary is reconciled through the
    -- ordinary refund path before its detail can be removed.
    for v_reservation_id in
      select id
      from public.client_credit_reservations
      where tenant_slug = p_tenant_slug
        and created_at <= v_cutoff
        and status = 'reserved'
      order by created_at, id
      limit p_batch_limit
      for update skip locked
    loop
      if public.refund_client_credit(
        v_reservation_id,
        'retention_expired_reservation',
        'retention-expiry:' || v_reservation_id::text,
        jsonb_build_object('source', 'retention')
      ) then
        v_released := v_released + 1;
      end if;
    end loop;

    with selected as (
      select id from public.client_credit_transactions
      where tenant_slug = p_tenant_slug and created_at <= v_cutoff
      order by created_at, id limit p_batch_limit for update skip locked
    ), removed as (
      delete from public.client_credit_transactions as row using selected
      where row.id = selected.id and row.tenant_slug = p_tenant_slug returning row.id
    ) select count(*) into v_count from removed;
    v_deleted := v_deleted || jsonb_build_object('transactions', v_count);

    with selected as (
      select id from public.client_credit_reservation_events
      where tenant_slug = p_tenant_slug and created_at <= v_cutoff
      order by created_at, id limit p_batch_limit for update skip locked
    ), removed as (
      delete from public.client_credit_reservation_events as row using selected
      where row.id = selected.id and row.tenant_slug = p_tenant_slug returning row.id
    ) select count(*) into v_count from removed;
    v_deleted := v_deleted || jsonb_build_object('reservationEvents', v_count);

    with selected as (
      select claim.reservation_id
      from public.client_credit_execution_claims as claim
      where claim.tenant_slug = p_tenant_slug and claim.claimed_at <= v_cutoff
      order by claim.claimed_at, claim.reservation_id limit p_batch_limit for update of claim skip locked
    ), removed as (
      delete from public.client_credit_execution_claims as claim using selected
      where claim.reservation_id = selected.reservation_id and claim.tenant_slug = p_tenant_slug
      returning claim.reservation_id
    ) select count(*) into v_count from removed;
    v_deleted := v_deleted || jsonb_build_object('executionClaims', v_count);

    -- Drain children explicitly so cascading deletes cannot exceed their batch
    -- limits or disappear from the per-table deletion receipt.
    with selected as (
      select reservation.id
      from public.client_credit_reservations as reservation
      where reservation.tenant_slug = p_tenant_slug
        and reservation.created_at <= v_cutoff
        and reservation.status <> 'reserved'
        and not exists (
          select 1 from public.client_credit_reservation_events as event
          where event.reservation_id = reservation.id
        )
        and not exists (
          select 1 from public.client_credit_execution_claims as claim
          where claim.reservation_id = reservation.id
        )
      order by reservation.created_at, reservation.id limit p_batch_limit for update of reservation skip locked
    ), removed as (
      delete from public.client_credit_reservations as reservation using selected
      where reservation.id = selected.id and reservation.tenant_slug = p_tenant_slug returning reservation.id
    ) select count(*) into v_count from removed;
    v_deleted := v_deleted || jsonb_build_object('reservations', v_count);

    with selected as (
      select allocation.id
      from public.client_credit_purchase_plan_allocations as allocation
      join public.client_credit_purchase_plans as plan on plan.id = allocation.plan_id
      where allocation.tenant_slug = p_tenant_slug
        and allocation.created_at <= v_cutoff
        and plan.created_at <= v_cutoff
      order by allocation.created_at, allocation.id limit p_batch_limit for update of allocation skip locked
    ), removed as (
      delete from public.client_credit_purchase_plan_allocations as allocation using selected
      where allocation.id = selected.id and allocation.tenant_slug = p_tenant_slug returning allocation.id
    ) select count(*) into v_count from removed;
    v_deleted := v_deleted || jsonb_build_object('purchasePlanAllocations', v_count);

    with selected as (
      select plan.id
      from public.client_credit_purchase_plans as plan
      where plan.tenant_slug = p_tenant_slug
        and plan.created_at <= v_cutoff
        and not exists (select 1 from public.client_credit_purchase_plan_allocations as allocation where allocation.plan_id = plan.id)
      order by plan.created_at, plan.id limit p_batch_limit for update of plan skip locked
    ), removed as (
      delete from public.client_credit_purchase_plans as plan using selected
      where plan.id = selected.id and plan.tenant_slug = p_tenant_slug returning plan.id
    ) select count(*) into v_count from removed;
    v_deleted := v_deleted || jsonb_build_object('purchasePlans', v_count);

    with selected as (
      select ctid from public.client_credit_budgets
      where tenant_slug = p_tenant_slug
        and financial_activity_at <= v_cutoff
        and reserved_micros = 0
        and greatest(0, purchased_micros - reserved_micros - spent_micros) = 0
      order by financial_activity_at, catalog_id limit p_batch_limit for update skip locked
    ), updated as (
      update public.client_credit_budgets as budget
      set purchased_micros = 0,
          spent_micros = 0,
          financial_activity_at = null,
          last_reconciled_at = null,
          updated_at = now()
      from selected
      where budget.ctid = selected.ctid and budget.tenant_slug = p_tenant_slug
      returning budget.catalog_id
    ) select count(*) into v_count from updated;
    v_deleted := v_deleted || jsonb_build_object('zeroBalanceBudgetsScrubbed', v_count);

    if coalesce(v_released, 0) > 0 or exists (
      select 1 from jsonb_each_text(v_deleted) as item(key, value) where item.value::integer > 0
    ) then
      insert into public.client_runtime_audit_events (tenant_slug, event_type, metadata)
      values (p_tenant_slug, 'tenant.credit.retention_purged', jsonb_build_object(
        'releasedExpiredReservations', v_released,
        'deleted', v_deleted,
        'retentionDays', 28,
        'recoveryDays', 7,
        'purgeAfterDays', 35,
        'nonzeroBalancesPreserved', true
      ));
    end if;
  end if;

  select jsonb_build_object(
    'transactions', (select count(*) from public.client_credit_transactions where tenant_slug = p_tenant_slug and created_at <= v_cutoff),
    'reservationEvents', (select count(*) from public.client_credit_reservation_events where tenant_slug = p_tenant_slug and created_at <= v_cutoff),
    'executionClaims', (select count(*) from public.client_credit_execution_claims where tenant_slug = p_tenant_slug and claimed_at <= v_cutoff),
    'reservations', (select count(*) from public.client_credit_reservations where tenant_slug = p_tenant_slug and created_at <= v_cutoff and status <> 'reserved'),
    'purchasePlanAllocations', (select count(*) from public.client_credit_purchase_plan_allocations where tenant_slug = p_tenant_slug and created_at <= v_cutoff),
    'purchasePlans', (select count(*) from public.client_credit_purchase_plans where tenant_slug = p_tenant_slug and created_at <= v_cutoff),
    'zeroBalanceBudgets', (select count(*) from public.client_credit_budgets where tenant_slug = p_tenant_slug and financial_activity_at <= v_cutoff and reserved_micros = 0 and greatest(0, purchased_micros - reserved_micros - spent_micros) = 0)
  ) into v_remaining;

  return jsonb_build_object(
    'tenant', p_tenant_slug,
    'cutoff', v_cutoff,
    'retentionDays', 28,
    'recoveryDays', 7,
    'purgeAfterDays', 35,
    'candidates', v_candidates,
    'deleted', v_deleted,
    'releasedExpiredReservations', v_released,
    'remainingCandidates', v_remaining,
    'preservedNonzeroWalletBalances', (select count(*) from public.client_credit_accounts where tenant_slug = p_tenant_slug and (balance_micros > 0 or reserved_micros > 0)),
    'preservedNonzeroProviderBalances', (select count(*) from public.client_credit_budgets where tenant_slug = p_tenant_slug and (reserved_micros > 0 or greatest(0, purchased_micros - reserved_micros - spent_micros) > 0)),
    'applied', p_apply,
    'scope', jsonb_build_array('client_credit_transactions', 'client_credit_purchase_plans', 'client_credit_purchase_plan_allocations', 'client_credit_reservations', 'client_credit_reservation_events', 'client_credit_execution_claims', 'client_credit_budgets')
  );
end;
$$;

revoke all on function public.purge_expired_client_credit_records(text, boolean, integer) from public, anon, authenticated;
grant execute on function public.purge_expired_client_credit_records(text, boolean, integer) to service_role;

-- Late lifecycle events have no tenant mapping after day 35. Keep only the
-- event fingerprint in the global operator queue; never guess a wallet.
alter table public.stripe_financial_event_dispositions
  drop constraint if exists stripe_financial_event_dispositions_financial_scope_check;
alter table public.stripe_financial_event_dispositions
  add constraint stripe_financial_event_dispositions_financial_scope_check
  check (financial_scope in ('public_launch', 'managed_credit'));

alter table public.stripe_financial_event_dispositions
  drop constraint if exists stripe_financial_event_dispositions_disposition_check;
alter table public.stripe_financial_event_dispositions
  add constraint stripe_financial_event_dispositions_disposition_check
  check (disposition in ('review_required', 'public_launch_refund_reviewed', 'managed_credit_lifecycle_reviewed'));

comment on table public.credit_replay_key_tombstones is
  'Global one-way idempotency digests retained after tenant financial details expire; contains no tenant slug or raw key.';
comment on function public.purge_expired_client_credit_records(text, boolean, integer) is
  'Tenant-scoped bounded 28+7 managed-credit detail purge. Current nonzero wallet/provider balances remain until spent or refunded; late Stripe refunds after purge require manual review.';

commit;
