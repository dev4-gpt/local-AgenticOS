-- Managed-credit readiness and reconciliation metadata.
-- Apply after supabase-v31-managed-credit-plans.sql. These fields contain
-- references and state only; provider secrets never belong in this schema.

alter table public.client_credit_purchase_plans
  add column if not exists stripe_mode text not null default 'test',
  add column if not exists stripe_payment_intent_id text;

alter table public.client_credit_transactions
  add column if not exists stripe_mode text not null default 'test',
  add column if not exists reconciliation_status text not null default 'pending';

alter table public.client_credit_budgets
  add column if not exists provider_route text not null default 'veloce-managed',
  add column if not exists provider_account_owner text,
  add column if not exists credential_reference text,
  add column if not exists managed_route_enabled boolean not null default false,
  add column if not exists funding_status text not null default 'wallet_funded',
  add column if not exists reconciliation_status text not null default 'pending',
  add column if not exists manifest_version text,
  add column if not exists health_status text not null default 'not_checked',
  add column if not exists last_health_check_at timestamptz,
  add column if not exists last_reconciled_at timestamptz;

alter table public.client_credit_purchase_plans
  drop constraint if exists client_credit_purchase_plans_stripe_mode_check;
alter table public.client_credit_purchase_plans
  add constraint client_credit_purchase_plans_stripe_mode_check check (stripe_mode in ('test', 'live'));

alter table public.client_credit_transactions
  drop constraint if exists client_credit_transactions_stripe_mode_check;
alter table public.client_credit_transactions
  add constraint client_credit_transactions_stripe_mode_check check (stripe_mode in ('test', 'live'));

alter table public.client_credit_budgets
  drop constraint if exists client_credit_budgets_funding_status_check;
alter table public.client_credit_budgets
  add constraint client_credit_budgets_funding_status_check check (funding_status in ('wallet_funded', 'awaiting_manifest_approval', 'credential_missing', 'provider_not_enabled', 'ready_for_execution', 'depleted', 'suspended'));

alter table public.client_credit_budgets
  drop constraint if exists client_credit_budgets_reconciliation_status_check;
alter table public.client_credit_budgets
  add constraint client_credit_budgets_reconciliation_status_check check (reconciliation_status in ('pending', 'matched', 'drift', 'failed'));

create or replace function public.client_credit_provider_readiness_snapshot(p_tenant_slug text)
returns table (
  catalog_id text,
  provider_key text,
  available_micros bigint,
  wallet_status text,
  provider_status text,
  provider_status_reason text,
  provider_route text,
  managed_route_enabled boolean,
  funding_status text,
  reconciliation_status text,
  health_status text
)
language sql
security definer
set search_path = public
as $$
  select
    b.catalog_id,
    b.provider_key,
    greatest(0, b.purchased_micros - b.reserved_micros - b.spent_micros) as available_micros,
    case when greatest(0, b.purchased_micros - b.reserved_micros - b.spent_micros) > 0 then 'wallet_funded' else 'depleted' end as wallet_status,
    case
      when b.status = 'suspended' or a.status = 'suspended' then 'suspended'
      when greatest(0, b.purchased_micros - b.reserved_micros - b.spent_micros) <= 0 or b.status = 'exhausted' then 'depleted'
      when not b.managed_route_enabled then 'provider_not_enabled'
      when b.credential_reference is null or b.credential_reference = '' then 'credential_missing'
      when b.health_status <> 'passed' then 'provider_not_enabled'
      else 'ready_for_execution'
    end as provider_status,
    case
      when b.status = 'suspended' or a.status = 'suspended' then 'The tenant or provider budget is suspended.'
      when greatest(0, b.purchased_micros - b.reserved_micros - b.spent_micros) <= 0 or b.status = 'exhausted' then 'No spendable provider allocation remains.'
      when not b.managed_route_enabled then 'The wallet is funded, but Veloce-managed execution is not enabled for this provider.'
      when b.credential_reference is null or b.credential_reference = '' then 'A validated tenant-scoped managed credential is required.'
      when b.health_status <> 'passed' then 'The provider health check has not passed for this route.'
      else 'Manifest, credential, health, and budget checks passed.'
    end as provider_status_reason,
    b.provider_route,
    b.managed_route_enabled,
    b.funding_status,
    b.reconciliation_status,
    b.health_status
  from public.client_credit_budgets b
  left join public.client_credit_accounts a on a.tenant_slug = b.tenant_slug
  where b.tenant_slug = p_tenant_slug
    and exists (select 1 from public.client_memberships m where m.tenant_slug = p_tenant_slug and m.user_id = auth.uid() and m.status = 'active')
  order by b.updated_at desc;
$$;

revoke execute on function public.client_credit_provider_readiness_snapshot(text) from anon, authenticated;
grant execute on function public.client_credit_provider_readiness_snapshot(text) to authenticated;

create index if not exists client_credit_budgets_readiness_idx
  on public.client_credit_budgets (tenant_slug, funding_status, reconciliation_status, updated_at desc);
