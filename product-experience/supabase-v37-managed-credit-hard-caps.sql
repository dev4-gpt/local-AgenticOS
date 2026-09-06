-- Veloce AgenticOS v3.7 managed-credit hard caps + spend alerts (Phase 3c).
--
-- Apply after supabase-v35-reserve-client-credit-fix.sql and
-- supabase-v34-managed-credit-execution-claims.sql.
--
-- Adds an OPTIONAL tenant-wide monthly spend ceiling (monthly_cap_micros,
-- null = unenforced) independent of the per-provider purchased/funded
-- allocation in client_credit_budgets. Reuses the already-existing but
-- previously-unused warning_threshold_micros column for spend alerting
-- instead of adding a second column for the same purpose.
--
-- Enforcement lives entirely at RESERVE time, mirroring the existing
-- per-provider budget check. reserve_client_credit's signature and return
-- type (uuid) are unchanged -- a refusal still returns null, exactly like
-- the existing insufficient-budget/insufficient-balance case -- so its one
-- real caller (managedProviderRuntime.ts) needs no changes. A reservation
-- that was already approved is always allowed to settle even if actual
-- spend differs slightly; this migration does NOT touch settle_client_credit
-- or refund_client_credit.
--
-- Alerting is computed at SETTLE time (real spend, not a mere reservation)
-- via a separate, additive, read-only function. It does not run inside
-- settle_client_credit itself; the calling application invokes it once,
-- after settle_client_credit returns true.

alter table public.client_credit_accounts
  add column if not exists monthly_cap_micros bigint;

alter table public.client_credit_accounts
  drop constraint if exists client_credit_accounts_monthly_cap_micros_check;
alter table public.client_credit_accounts
  add constraint client_credit_accounts_monthly_cap_micros_check
  check (monthly_cap_micros is null or monthly_cap_micros >= 0);

-- Net month-to-date real spend for a tenant, derived from
-- client_credit_transactions. 'settlement' rows are real spend recorded by
-- settle_client_credit. 'refund' rows carry the same amount_micros that was
-- actually refunded: refund_client_credit inserts amount_micros = 0 when
-- refunding a reservation that was never settled (nothing to net out), and
-- amount_micros = the previously-settled actual amount when refunding a
-- settled reservation. Netting settlement-minus-refund therefore yields real
-- spend without needing to inspect metadata. Reused by both the hard-cap
-- check below and the spend-alert check the application calls after settle.
create or replace function public.client_credit_month_to_date_spend_micros(
  p_tenant_slug text
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
    case
      when t.kind = 'settlement' then t.amount_micros
      when t.kind = 'refund' then -t.amount_micros
      else 0
    end
  ), 0)
  from public.client_credit_transactions t
  where t.tenant_slug = p_tenant_slug
    and t.kind in ('settlement', 'refund')
    and t.created_at >= date_trunc('month', now());
$$;

-- Re-declaration of reserve_client_credit (same signature as the
-- supabase-v35-reserve-client-credit-fix.sql version) that adds the hard-cap
-- refusal. All other behavior, including the reservation-event/transaction
-- inserts and the existing wallet/per-provider-budget checks, is unchanged.
create or replace function public.reserve_client_credit(
  p_tenant_slug text,
  p_catalog_id text,
  p_provider_key text,
  p_idempotency_key text,
  p_quoted_amount_micros bigint,
  p_expires_at timestamptz default null,
  p_pricing_snapshot_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
  new_reservation_id uuid;
  account_balance bigint;
  account_reserved bigint;
  account_cap bigint;
  mtd_spend bigint;
  budget_available bigint;
  expires_at_value timestamptz := coalesce(p_expires_at, now() + interval '15 minutes');
begin
  if coalesce(p_tenant_slug, '') = ''
     or coalesce(p_catalog_id, '') = ''
     or coalesce(p_provider_key, '') = ''
     or coalesce(p_idempotency_key, '') = ''
     or p_quoted_amount_micros is null
     or p_quoted_amount_micros <= 0
     or expires_at_value <= now()
     or p_metadata is null
     or jsonb_typeof(p_metadata) <> 'object'
     or pg_column_size(p_metadata) > 8192 then
    return null;
  end if;

  select id into existing_id
  from public.client_credit_reservations
  where tenant_slug = p_tenant_slug and idempotency_key = p_idempotency_key;
  if existing_id is not null then return existing_id; end if;

  perform pg_advisory_xact_lock(hashtext(left(p_tenant_slug, 64)));

  select id into existing_id
  from public.client_credit_reservations
  where tenant_slug = p_tenant_slug and idempotency_key = p_idempotency_key;
  if existing_id is not null then return existing_id; end if;

  insert into public.client_credit_accounts (tenant_slug)
  values (p_tenant_slug)
  on conflict (tenant_slug) do nothing;

  select a.balance_micros, a.reserved_micros, a.monthly_cap_micros
    into account_balance, account_reserved, account_cap
  from public.client_credit_accounts a
  where a.tenant_slug = p_tenant_slug
  for update;

  -- Hard cap: a null cap means "no cap enforced" for this tenant. When set,
  -- month-to-date real spend + everything currently reserved (tenant-wide,
  -- across all providers) + this new quote must not exceed it.
  if account_cap is not null then
    mtd_spend := public.client_credit_month_to_date_spend_micros(p_tenant_slug);
    if mtd_spend + account_reserved + p_quoted_amount_micros > account_cap then
      return null;
    end if;
  end if;

  select greatest(0, b.purchased_micros - b.reserved_micros - b.spent_micros)
    into budget_available
  from public.client_credit_budgets b
  where b.tenant_slug = p_tenant_slug
    and b.catalog_id = p_catalog_id
    and b.provider_key = p_provider_key
    and b.managed_route_enabled = true
    and b.status = 'active'
  for update;

  if budget_available is null
     or budget_available < p_quoted_amount_micros
     or greatest(0, account_balance - account_reserved) < p_quoted_amount_micros then
    return null;
  end if;

  insert into public.client_credit_reservations (
    tenant_slug, catalog_id, provider_key, idempotency_key,
    quoted_amount_micros, reserved_amount_micros, pricing_snapshot_id,
    expires_at, reconciliation_metadata, audit_metadata
  ) values (
    p_tenant_slug, p_catalog_id, p_provider_key, p_idempotency_key,
    p_quoted_amount_micros, p_quoted_amount_micros, nullif(p_pricing_snapshot_id, ''),
    expires_at_value, jsonb_build_object('state', 'reserved') || p_metadata,
    jsonb_build_object('operation', 'reserve', 'idempotency_key', p_idempotency_key)
  ) returning id into new_reservation_id;

  update public.client_credit_accounts
  set reserved_micros = reserved_micros + p_quoted_amount_micros, updated_at = now()
  where tenant_slug = p_tenant_slug;

  update public.client_credit_budgets
  set reserved_micros = reserved_micros + p_quoted_amount_micros, updated_at = now()
  where tenant_slug = p_tenant_slug and catalog_id = p_catalog_id;

  insert into public.client_credit_transactions (
    tenant_slug, idempotency_key, kind, amount_micros, balance_after_micros,
    provider, pricing_snapshot_id, metadata
  ) values (
    p_tenant_slug, 'reservation:' || new_reservation_id, 'reservation',
    p_quoted_amount_micros, account_balance, p_provider_key,
    nullif(p_pricing_snapshot_id, ''), jsonb_build_object(
      'reservation_id', new_reservation_id, 'direction', 'reserved',
      'expires_at', expires_at_value
    ) || p_metadata
  ) on conflict (tenant_slug, idempotency_key) do nothing;

  insert into public.client_credit_reservation_events (
    reservation_id, tenant_slug, event_type, idempotency_key, amount_micros, metadata
  ) values (
    new_reservation_id, p_tenant_slug, 'reserved', 'reserve:' || p_idempotency_key,
    p_quoted_amount_micros, p_metadata
  ) on conflict (reservation_id, idempotency_key) do nothing;

  return new_reservation_id;
end;
$$;

-- Spend-alert crossing check. Called once by application code immediately
-- after settle_client_credit returns true. p_settled_amount_micros is the
-- amount that was JUST settled (already reflected in current_spend_micros);
-- subtracting it recovers the pre-settle spend so the caller can detect an
-- edge (crossed this call) rather than a level (already over threshold),
-- avoiding a repeat email on every subsequent settle in the same month.
create or replace function public.client_credit_spend_alert_check(
  p_tenant_slug text,
  p_settled_amount_micros bigint
)
returns table (
  crossed_threshold boolean,
  current_spend_micros bigint,
  threshold_micros bigint,
  cap_micros bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    computed.threshold_micros > 0
      and computed.current_spend_micros >= computed.threshold_micros
      and (computed.current_spend_micros - greatest(0, coalesce(p_settled_amount_micros, 0))) < computed.threshold_micros
      as crossed_threshold,
    computed.current_spend_micros,
    computed.threshold_micros,
    computed.cap_micros
  from (
    select
      public.client_credit_month_to_date_spend_micros(p_tenant_slug) as current_spend_micros,
      coalesce(a.warning_threshold_micros, 0) as threshold_micros,
      a.monthly_cap_micros as cap_micros
    from public.client_credit_accounts a
    where a.tenant_slug = p_tenant_slug
  ) computed;
$$;

revoke all on function public.client_credit_month_to_date_spend_micros(text)
  from public, anon, authenticated;
revoke all on function public.reserve_client_credit(text, text, text, text, bigint, timestamptz, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.client_credit_spend_alert_check(text, bigint)
  from public, anon, authenticated;

grant execute on function public.client_credit_month_to_date_spend_micros(text) to service_role;
grant execute on function public.reserve_client_credit(text, text, text, text, bigint, timestamptz, text, jsonb) to service_role;
grant execute on function public.client_credit_spend_alert_check(text, bigint) to service_role;
