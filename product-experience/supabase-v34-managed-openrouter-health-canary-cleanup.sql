-- Cleanup for the disposable zero-spend managed OpenRouter health canary.
-- Run only after its evidence has been recorded. This cascades only the
-- dedicated tenant's fixture rows; it never touches customer or dogfood data.

begin;

delete from public.client_tenants
where slug = 'managed-openrouter-hc-20260831';

commit;

select
  not exists (
    select 1 from public.client_tenants
    where slug = 'managed-openrouter-hc-20260831'
  ) as fixture_removed,
  not exists (
    select 1 from public.client_credit_budgets
    where tenant_slug = 'managed-openrouter-hc-20260831'
  ) as budget_removed,
  not exists (
    select 1 from public.client_provider_connections
    where tenant_slug = 'managed-openrouter-hc-20260831'
  ) as connection_removed;
