-- Phase 3c hard-cap + spend-alert synthetic verification.
-- Disposable, self-contained: proves the cap refusal and the alert-crossing
-- detection without flipping managed_route_enabled for any real tenant, and
-- without a pricing snapshot, execution claim, or the HTTP route/OpenRouter
-- credential -- settle_client_credit has no dependency on either.

begin;

do $$
begin
  if exists (select 1 from public.client_tenants where slug = 'hardcap-verify-20260906') then
    raise exception 'hard-cap verification tenant already exists; run its exact cleanup before retrying';
  end if;
end;
$$;

insert into public.client_tenants (slug, name, retention_days, status)
values ('hardcap-verify-20260906', 'Hard-Cap Verification Fixture', 1, 'active');

insert into public.client_credit_budgets (
  tenant_slug, catalog_id, provider_key, purchased_micros, reserved_micros, spent_micros,
  status, managed_route_enabled, funding_status, reconciliation_status, updated_at
) values (
  'hardcap-verify-20260906', 'provider-hardcap-verify-fixture', 'HARDCAP_VERIFY_FIXTURE',
  10000000, 0, 0, 'active', true, 'wallet_funded', 'matched', now()
);

-- Disposable wallet balance. Not a Stripe event; the identifier only
-- preserves ledger idempotency for this isolated fixture.
select public.credit_client_managed_wallet(
  'hardcap-verify-20260906', 10000000, 'hardcap-verify-20260906-seed',
  jsonb_build_object('fixture', 'hardcap-verify', 'external_charge', false)
);

-- Cap = $1.00, warning threshold = $0.60.
update public.client_credit_accounts
set monthly_cap_micros = 1000000, warning_threshold_micros = 600000, updated_at = now()
where tenant_slug = 'hardcap-verify-20260906';

do $$
declare
  reservation_1 uuid;
  reservation_2 uuid;
  reservation_3 uuid;
  reservation_4 uuid;
  alert_crossed boolean;
  alert_spend bigint;
begin
  -- Test 1: reserve+settle $0.50 -- under both the $0.60 alert threshold and
  -- the $1.00 cap. Must succeed and must NOT cross the alert threshold.
  reservation_1 := public.reserve_client_credit('hardcap-verify-20260906', 'provider-hardcap-verify-fixture', 'HARDCAP_VERIFY_FIXTURE', 'hardcap-verify-reserve-1', 500000);
  assert reservation_1 is not null, 'expected reservation 1 to succeed under cap and budget';
  assert public.settle_client_credit(reservation_1, 500000), 'expected settlement 1 to succeed';
  select crossed_threshold, current_spend_micros into alert_crossed, alert_spend
    from public.client_credit_spend_alert_check('hardcap-verify-20260906', 500000);
  assert alert_crossed is false, 'must not cross alert threshold at $0.50 of $0.60';
  assert alert_spend = 500000, 'month-to-date spend must equal settled amount after first settle';

  -- Test 2: reserve+settle $0.30 more. Cumulative spend becomes $0.80,
  -- crossing the $0.60 alert threshold on THIS settle, not before it.
  reservation_2 := public.reserve_client_credit('hardcap-verify-20260906', 'provider-hardcap-verify-fixture', 'HARDCAP_VERIFY_FIXTURE', 'hardcap-verify-reserve-2', 300000);
  assert reservation_2 is not null, 'expected reservation 2 to succeed ($0.80 total is under the $1.00 cap)';
  assert public.settle_client_credit(reservation_2, 300000), 'expected settlement 2 to succeed';
  select crossed_threshold, current_spend_micros into alert_crossed, alert_spend
    from public.client_credit_spend_alert_check('hardcap-verify-20260906', 300000);
  assert alert_crossed is true, 'must cross the $0.60 alert threshold exactly on this settle ($0.50 -> $0.80)';
  assert alert_spend = 800000, 'month-to-date spend must be $0.80 after second settle';

  -- Test 3: reserving $0.30 more would bring total exposure to $1.10 ($0.80
  -- spent + $0.30 quoted), exceeding the $1.00 cap. Must be refused -- proves
  -- the NEW hard cap, not just the per-provider budget, blocks this request
  -- (the per-provider budget here has $9.2M+ micros of headroom left).
  reservation_3 := public.reserve_client_credit('hardcap-verify-20260906', 'provider-hardcap-verify-fixture', 'HARDCAP_VERIFY_FIXTURE', 'hardcap-verify-reserve-3-over-cap', 300000);
  assert reservation_3 is null, 'expected reservation 3 to be refused for exceeding the $1.00 monthly cap';

  -- Test 4: reserving exactly the remaining $0.20 of headroom ($0.80 spent +
  -- $0.20 quoted = $1.00, the cap boundary) must still succeed: the cap
  -- blocks amounts that EXCEED it, not the boundary value itself.
  reservation_4 := public.reserve_client_credit('hardcap-verify-20260906', 'provider-hardcap-verify-fixture', 'HARDCAP_VERIFY_FIXTURE', 'hardcap-verify-reserve-4-at-cap', 200000);
  assert reservation_4 is not null, 'expected reservation 4 to succeed exactly at the $1.00 cap boundary';

  raise notice 'hard-cap + spend-alert verification passed';
end;
$$;

commit;
