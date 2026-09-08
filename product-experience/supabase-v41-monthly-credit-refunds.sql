-- Apply after v37. A refund for a prior month's settlement must not create
-- negative spend/headroom in the current month. Reservations are the canonical
-- settled/refunded state, so retries do not count spend twice either.
create or replace function public.client_credit_month_to_date_spend_micros(
  p_tenant_slug text
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(r.actual_amount_micros), 0)
  from public.client_credit_reservations r
  where r.tenant_slug = p_tenant_slug
    and r.status = 'settled'
    and r.settled_at >= date_trunc('month', now());
$$;
revoke all on function public.client_credit_month_to_date_spend_micros(text)
  from public, anon, authenticated;
grant execute on function public.client_credit_month_to_date_spend_micros(text) to service_role;
