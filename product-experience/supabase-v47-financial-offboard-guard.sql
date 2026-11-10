-- V47: tenant deletion must not cascade away unsettled or historical managed-credit records.
-- Apply after the public-launch control plane and V31/V33/V34 credit migrations.
-- This guard is deliberately separate from the operator's preflight so it also
-- protects against a financial row arriving between preflight and deletion.

create or replace function public.reject_client_tenant_delete_with_credit_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'Truncating client tenants is not an approved offboarding operation';
  end if;
  if exists (select 1 from public.client_credit_transactions where tenant_slug = old.slug)
    or exists (select 1 from public.client_credit_purchase_plans where tenant_slug = old.slug)
    or exists (select 1 from public.client_credit_purchase_plan_allocations where tenant_slug = old.slug)
    or exists (select 1 from public.client_credit_reservations where tenant_slug = old.slug)
    or exists (select 1 from public.client_credit_reservation_events where tenant_slug = old.slug)
    or exists (select 1 from public.client_credit_execution_claims where tenant_slug = old.slug)
    or exists (
      select 1 from public.client_credit_accounts
      where tenant_slug = old.slug
        and (balance_micros is distinct from 0 or reserved_micros is distinct from 0)
    )
    or exists (
      select 1 from public.client_credit_budgets
      where tenant_slug = old.slug
        and (purchased_micros is distinct from 0 or reserved_micros is distinct from 0 or spent_micros is distinct from 0)
    ) then
    raise exception 'Tenant has managed-credit history or balance requiring reviewed retention and reconciliation';
  end if;
  return old;
end;
$$;

revoke all on function public.reject_client_tenant_delete_with_credit_history() from public, anon, authenticated;

drop trigger if exists client_tenants_financial_delete_guard on public.client_tenants;
create trigger client_tenants_financial_delete_guard
  before delete on public.client_tenants
  for each row execute function public.reject_client_tenant_delete_with_credit_history();

drop trigger if exists client_tenants_no_truncate on public.client_tenants;
create trigger client_tenants_no_truncate
  before truncate on public.client_tenants
  for each statement execute function public.reject_client_tenant_delete_with_credit_history();
