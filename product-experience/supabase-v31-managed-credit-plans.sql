-- Managed-credit purchase plans.
-- Apply after supabase-public-launch-control-plane.sql. This stores the
-- customer's per-provider allocation before Stripe Checkout and settles it
-- idempotently after checkout.session.completed.

create table if not exists public.client_credit_purchase_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  allocations jsonb not null,
  total_micros bigint not null check (total_micros > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'cancelled')),
  stripe_checkout_session_id text,
  stripe_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_credit_budgets (
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  catalog_id text not null,
  provider_key text not null,
  purchased_micros bigint not null default 0 check (purchased_micros >= 0),
  reserved_micros bigint not null default 0 check (reserved_micros >= 0),
  spent_micros bigint not null default 0 check (spent_micros >= 0),
  status text not null default 'active' check (status in ('active', 'exhausted', 'suspended', 'closed')),
  updated_at timestamptz not null default now(),
  primary key (tenant_slug, catalog_id)
);

create or replace function public.create_client_credit_purchase_plan(
  p_tenant_slug text,
  p_allocations jsonb,
  p_total_micros bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_id uuid;
  calculated_total bigint;
begin
  if auth.uid() is null
    or p_tenant_slug is null or p_tenant_slug = ''
    or not exists (select 1 from public.client_memberships m where m.tenant_slug = p_tenant_slug and m.user_id = auth.uid() and m.status = 'active')
    or jsonb_typeof(p_allocations) <> 'array'
    or jsonb_array_length(p_allocations) < 1
    or jsonb_array_length(p_allocations) > 100
    or p_total_micros is null or p_total_micros <= 0 then
    return null;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_allocations) item
    where jsonb_typeof(item->'catalog_id') <> 'string'
      or jsonb_typeof(item->'provider_key') <> 'string'
      or jsonb_typeof(item->'amount_micros') <> 'number'
      or (item->>'amount_micros')::numeric < 1000000
  ) then
    return null;
  end if;

  calculated_total := coalesce((select sum((item->>'amount_micros')::bigint) from jsonb_array_elements(p_allocations) item), 0);
  if calculated_total <> p_total_micros then return null; end if;

  insert into public.client_credit_purchase_plans (tenant_slug, requested_by, allocations, total_micros)
  values (p_tenant_slug, auth.uid(), p_allocations, p_total_micros)
  returning id into plan_id;
  return plan_id;
end;
$$;

create or replace function public.settle_client_credit_purchase_plan(
  p_plan_id uuid,
  p_amount_micros bigint,
  p_stripe_event_id text,
  p_stripe_checkout_session_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_row public.client_credit_purchase_plans%rowtype;
  allocation jsonb;
  budget_balance bigint;
  new_wallet_balance bigint;
begin
  if p_plan_id is null or p_amount_micros is null or p_amount_micros <= 0 or p_stripe_event_id is null or p_stripe_event_id = '' then return false; end if;
  select * into plan_row from public.client_credit_purchase_plans where id = p_plan_id for update;
  if not found then return false; end if;
  if plan_row.status = 'paid' then return true; end if;
  if plan_row.status <> 'pending' or plan_row.total_micros <> p_amount_micros then return false; end if;

  insert into public.client_credit_accounts (tenant_slug) values (plan_row.tenant_slug) on conflict (tenant_slug) do nothing;
  update public.client_credit_accounts
  set balance_micros = balance_micros + p_amount_micros, updated_at = now()
  where tenant_slug = plan_row.tenant_slug
  returning balance_micros into new_wallet_balance;

  for allocation in select * from jsonb_array_elements(plan_row.allocations) loop
    insert into public.client_credit_budgets (tenant_slug, catalog_id, provider_key, purchased_micros, updated_at)
    values (plan_row.tenant_slug, allocation->>'catalog_id', allocation->>'provider_key', (allocation->>'amount_micros')::bigint, now())
    on conflict (tenant_slug, catalog_id) do update
      set purchased_micros = public.client_credit_budgets.purchased_micros + excluded.purchased_micros,
          updated_at = now();

    select purchased_micros - reserved_micros - spent_micros into budget_balance
    from public.client_credit_budgets
    where tenant_slug = plan_row.tenant_slug and catalog_id = allocation->>'catalog_id';

    insert into public.client_credit_transactions (tenant_slug, idempotency_key, kind, amount_micros, balance_after_micros, provider, pricing_snapshot_id, stripe_event_id, metadata)
    values (
      plan_row.tenant_slug,
      'stripe:' || p_stripe_event_id || ':' || (allocation->>'catalog_id'),
      'purchase',
      (allocation->>'amount_micros')::bigint,
      greatest(0, budget_balance),
      allocation->>'provider_key',
      nullif(allocation->>'pricing_snapshot_id', ''),
      p_stripe_event_id,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('plan_id', p_plan_id, 'allocation', allocation)
    ) on conflict (tenant_slug, idempotency_key) do nothing;
  end loop;

  update public.client_credit_purchase_plans
  set status = 'paid', stripe_event_id = p_stripe_event_id, stripe_checkout_session_id = p_stripe_checkout_session_id, metadata = coalesce(p_metadata, '{}'::jsonb), updated_at = now()
  where id = p_plan_id;
  return new_wallet_balance is not null;
end;
$$;

create or replace function public.client_credit_budget_snapshot(p_tenant_slug text)
returns table (catalog_id text, provider_key text, purchased_micros bigint, reserved_micros bigint, spent_micros bigint, available_micros bigint, status text)
language sql
security definer
set search_path = public
as $$
  select b.catalog_id, b.provider_key, b.purchased_micros, b.reserved_micros, b.spent_micros,
    greatest(0, b.purchased_micros - b.reserved_micros - b.spent_micros) as available_micros, b.status
  from public.client_credit_budgets b
  where b.tenant_slug = p_tenant_slug
    and exists (select 1 from public.client_memberships m where m.tenant_slug = p_tenant_slug and m.user_id = auth.uid() and m.status = 'active')
  order by b.updated_at desc;
$$;

alter table public.client_credit_purchase_plans enable row level security;
alter table public.client_credit_budgets enable row level security;
revoke all on public.client_credit_purchase_plans, public.client_credit_budgets from anon, authenticated;
revoke execute on function public.create_client_credit_purchase_plan(text, jsonb, bigint) from anon, authenticated;
revoke execute on function public.settle_client_credit_purchase_plan(uuid, bigint, text, text, jsonb) from anon, authenticated;
revoke execute on function public.client_credit_budget_snapshot(text) from anon, authenticated;
grant execute on function public.create_client_credit_purchase_plan(text, jsonb, bigint) to authenticated;
grant execute on function public.client_credit_budget_snapshot(text) to authenticated;
grant execute on function public.settle_client_credit_purchase_plan(uuid, bigint, text, text, jsonb) to service_role;
create index if not exists client_credit_purchase_plans_tenant_idx on public.client_credit_purchase_plans (tenant_slug, created_at desc);
