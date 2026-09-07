-- Exact cleanup for the Phase 3c hard-cap verification fixture.
-- Deleting the tenant row cascades to client_credit_accounts,
-- client_credit_budgets, client_credit_reservations, and
-- client_credit_transactions via their `references ... on delete cascade`
-- foreign keys.

begin;
delete from public.client_tenants where slug = 'hardcap-verify-20260906';
commit;

select
  not exists (select 1 from public.client_tenants where slug = 'hardcap-verify-20260906') as fixture_removed,
  not exists (select 1 from public.client_credit_accounts where tenant_slug = 'hardcap-verify-20260906') as wallet_removed,
  not exists (select 1 from public.client_credit_budgets where tenant_slug = 'hardcap-verify-20260906') as budget_removed,
  not exists (select 1 from public.client_credit_reservations where tenant_slug = 'hardcap-verify-20260906') as reservations_removed;
