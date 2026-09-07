-- Veloce AgenticOS v3.4 managed-provider reconciliation gate.
-- Apply after supabase-v33-managed-credit-lifecycle.sql.
-- This changes readiness reporting only. It never enables a provider, moves
-- wallet funds, or stores a provider credential.

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
      when b.reconciliation_status <> 'matched' then 'reconciliation_pending'
      when b.health_status <> 'passed' then 'provider_not_enabled'
      else 'ready_for_execution'
    end as provider_status,
    case
      when b.status = 'suspended' or a.status = 'suspended' then 'The tenant or provider budget is suspended.'
      when greatest(0, b.purchased_micros - b.reserved_micros - b.spent_micros) <= 0 or b.status = 'exhausted' then 'No spendable provider allocation remains.'
      when not b.managed_route_enabled then 'The wallet is funded, but Veloce-managed execution is not enabled for this provider.'
      when b.credential_reference is null or b.credential_reference = '' then 'A validated tenant-scoped managed credential is required.'
      when b.reconciliation_status <> 'matched' then 'Provider allocation reconciliation must be matched before execution.'
      when b.health_status <> 'passed' then 'The provider health check has not passed for this route.'
      else 'Manifest, credential, reconciliation, health, and budget checks passed.'
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
