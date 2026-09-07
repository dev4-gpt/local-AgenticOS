-- Veloce managed OpenRouter paid execution canary.
--
-- Run only after the zero-spend health canary has passed and only with an
-- explicit owner authorization for one disposable request. This fixture holds
-- exactly 10,000 micros ($0.01) and is intended for one gpt-4o-mini request.
-- It is not a customer tenant and must not be reused after cleanup.
--
-- Prerequisites:
--   1. v3.1 through v3.4 managed-credit migrations are applied.
--   2. The Vercel pricing configuration is the reviewed snapshot below.
--   3. The OpenRouter key has an independently enforced hard total cap.

begin;

do $$
begin
  if exists (
    select 1 from public.client_tenants where slug = 'managed-openrouter-paid-20260831'
  ) then
    raise exception 'paid OpenRouter canary tenant already exists; verify and run its exact cleanup before retrying';
  end if;
end;
$$;

-- This is the current reviewed OpenRouter snapshot. Never put the API key in
-- this table. A collision is safe only when it is the same immutable snapshot.
insert into public.client_pricing_snapshots (id, version, effective_at, prices)
values (
  'openrouter-managed-2026-08-31-534b7b3423ad',
  'openrouter-managed-v1',
  '2026-08-31T16:03:45.543Z'::timestamptz,
  '{"openai/gpt-4o-mini":{"inputMicrosPer1k":150,"outputMicrosPer1k":600}}'::jsonb
)
on conflict (id) do nothing;

insert into public.client_tenants (slug, name, retention_days, status)
values ('managed-openrouter-paid-20260831', 'Managed OpenRouter Paid Canary', 1, 'active');

insert into public.client_memberships (tenant_slug, user_id, role, status)
select 'managed-openrouter-paid-20260831', id, 'owner', 'active'
from auth.users
where lower(email) = lower('aryamandev777@gmail.com');

insert into public.client_credit_budgets (
  tenant_slug,
  catalog_id,
  provider_key,
  purchased_micros,
  reserved_micros,
  spent_micros,
  status,
  provider_route,
  provider_account_owner,
  credential_reference,
  managed_route_enabled,
  funding_status,
  reconciliation_status,
  manifest_version,
  health_status,
  updated_at
)
values (
  'managed-openrouter-paid-20260831',
  'provider-openrouter_api_key',
  'OPENROUTER_API_KEY',
  10000,
  0,
  0,
  'active',
  'veloce-managed',
  'Veloce managed OpenRouter paid canary',
  'projects/veloce-agenticos-2026/secrets/openrouter-managed-api-key/versions/latest',
  true,
  'wallet_funded',
  'matched',
  'managed-openrouter-paid-canary-v1',
  'not_checked',
  now()
);

insert into public.client_provider_connections (
  tenant_slug,
  catalog_id,
  provider_key,
  credential_mode,
  status,
  secret_resource,
  pricing_snapshot_id,
  manifest_version,
  validation_metadata,
  last_validated_at,
  updated_at
)
values (
  'managed-openrouter-paid-20260831',
  'provider-openrouter_api_key',
  'OPENROUTER_API_KEY',
  'veloce-managed',
  'validating',
  'projects/veloce-agenticos-2026/secrets/openrouter-managed-api-key/versions/latest',
  'openrouter-managed-2026-08-31-534b7b3423ad',
  'managed-openrouter-paid-canary-v1',
  jsonb_build_object('fixture', 'paid-execution-canary', 'max_micros', 10000, 'created_at', now()),
  null,
  now()
);

-- This creates a disposable Veloce wallet balance. It is not a Stripe event
-- and does not charge a card; the unique identifier merely preserves ledger
-- idempotency for this isolated acceptance fixture.
select public.credit_client_managed_wallet(
  'managed-openrouter-paid-20260831',
  10000,
  'managed-openrouter-paid-20260831-seed',
  jsonb_build_object('fixture', 'paid-execution-canary', 'max_micros', 10000, 'external_charge', false)
) as wallet_seeded;

commit;

-- All values must be true before the control-plane health check. The health
-- check turns the connection from validating to connected without provider
-- spend; only then may the separately authorized reserve/execute sequence run.
with fixture as (
  select
    b.managed_route_enabled,
    b.purchased_micros,
    b.reserved_micros,
    b.spent_micros,
    b.status as budget_status,
    b.funding_status,
    b.reconciliation_status,
    b.health_status,
    b.credential_reference,
    b.manifest_version as budget_manifest_version,
    c.credential_mode,
    c.status as connection_status,
    c.secret_resource,
    c.pricing_snapshot_id,
    c.manifest_version as connection_manifest_version,
    c.last_validated_at,
    a.balance_micros,
    a.reserved_micros as wallet_reserved_micros,
    exists (
      select 1
      from public.client_memberships m
      join auth.users u on u.id = m.user_id
      where m.tenant_slug = 'managed-openrouter-paid-20260831'
        and m.role = 'owner'
        and m.status = 'active'
        and lower(u.email) = lower('aryamandev777@gmail.com')
    ) as operator_owner_present
  from public.client_credit_budgets b
  join public.client_provider_connections c
    on c.tenant_slug = b.tenant_slug and c.provider_key = b.provider_key
  join public.client_credit_accounts a on a.tenant_slug = b.tenant_slug
  where b.tenant_slug = 'managed-openrouter-paid-20260831'
    and b.catalog_id = 'provider-openrouter_api_key'
    and b.provider_key = 'OPENROUTER_API_KEY'
)
select
  f.operator_owner_present,
  exists (
    select 1 from public.client_pricing_snapshots p
    where p.id = 'openrouter-managed-2026-08-31-534b7b3423ad'
      and p.version = 'openrouter-managed-v1'
      and p.effective_at >= now() - interval '168 hours'
      and p.prices = '{"openai/gpt-4o-mini":{"inputMicrosPer1k":150,"outputMicrosPer1k":600}}'::jsonb
  ) as pricing_snapshot_ready,
  f.managed_route_enabled
    and f.purchased_micros = 10000
    and f.reserved_micros = 0
    and f.spent_micros = 0
    and f.balance_micros = 10000
    and f.wallet_reserved_micros = 0
    and f.budget_status = 'active'
    and f.funding_status = 'wallet_funded'
    and f.reconciliation_status = 'matched'
    and f.health_status = 'not_checked'
    and f.credential_mode = 'veloce-managed'
    and f.connection_status = 'validating'
    and f.credential_reference = f.secret_resource
    and f.pricing_snapshot_id = 'openrouter-managed-2026-08-31-534b7b3423ad'
    and f.budget_manifest_version = f.connection_manifest_version
    and f.last_validated_at is null as paid_execution_preflight_ready,
  f.purchased_micros = 10000 and f.balance_micros = 10000 as max_spend_is_one_cent
from fixture f;
