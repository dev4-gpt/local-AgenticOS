-- Veloce AgenticOS v3.5 reserve-client-credit repair.
--
-- Apply after supabase-v33-managed-credit-lifecycle.sql and before another
-- managed-provider reservation. This fixes a PL/pgSQL variable/column name
-- collision in the reservation-event insert. It changes no balances by itself.

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

  select a.balance_micros, a.reserved_micros into account_balance, account_reserved
  from public.client_credit_accounts a
  where a.tenant_slug = p_tenant_slug
  for update;

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

revoke all on function public.reserve_client_credit(text, text, text, text, bigint, timestamptz, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.reserve_client_credit(text, text, text, text, bigint, timestamptz, text, jsonb)
  to service_role;
