-- Exact cleanup and post-run verification for managed-openrouter-paid-20260831.
-- Run only after the control plane has disabled the fixture. This deletes the
-- disposable tenant and all tenant-scoped wallet, reservation, claim, event,
-- connection, and membership data through foreign-key cascades. It deliberately
-- retains the shared reviewed pricing snapshot.

begin;

delete from public.client_tenants
where slug = 'managed-openrouter-paid-20260831';

commit;

select
  not exists (
    select 1 from public.client_tenants where slug = 'managed-openrouter-paid-20260831'
  ) as fixture_removed,
  not exists (
    select 1 from public.client_credit_budgets where tenant_slug = 'managed-openrouter-paid-20260831'
  ) as budget_removed,
  not exists (
    select 1 from public.client_credit_accounts where tenant_slug = 'managed-openrouter-paid-20260831'
  ) as wallet_removed,
  not exists (
    select 1 from public.client_credit_reservations where tenant_slug = 'managed-openrouter-paid-20260831'
  ) as reservations_removed,
  not exists (
    select 1 from public.client_credit_execution_claims where tenant_slug = 'managed-openrouter-paid-20260831'
  ) as claims_removed,
  not exists (
    select 1 from public.client_provider_connections where tenant_slug = 'managed-openrouter-paid-20260831'
  ) as connection_removed,
  exists (
    select 1 from public.client_pricing_snapshots
    where id = 'openrouter-managed-2026-08-31-534b7b3423ad'
  ) as shared_pricing_snapshot_retained;
