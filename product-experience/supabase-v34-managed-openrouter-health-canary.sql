-- Veloce managed OpenRouter zero-spend health canary.
--
-- Run as the database owner in the Supabase SQL Editor only after:
--   1. supabase-public-launch-control-plane.sql
--   2. supabase-v31-managed-credit-plans.sql
--   3. supabase-v32-managed-credit-readiness.sql
--   4. supabase-v33-managed-credit-lifecycle.sql
--   5. supabase-v34-managed-credit-execution-claims.sql
--   6. supabase-v34-managed-provider-reconciliation-gate.sql
--
-- This creates or refreshes one disposable, isolated health-check fixture.
-- It has zero credit, disabled execution, and pending reconciliation. It cannot
-- reserve credit or invoke a billable generation request. The follow-up HTTP
-- call must use only operation "healthCheck"; that call reads /models and
-- persists health state without enabling the provider route.

begin;

-- Keep the fixture distinct from every customer and existing dogfood tenant.
insert into public.client_tenants (slug, name, retention_days, status)
values ('managed-openrouter-hc-20260831', 'Managed OpenRouter Health Canary', 7, 'active')
on conflict (slug) do update
set name = excluded.name,
    retention_days = excluded.retention_days,
    status = 'active',
    updated_at = now();

-- The fixture is owned only by the existing operator account. If this account
-- is not present in Supabase Auth, the final verification will show no owner
-- row and the canary must not continue.
insert into public.client_memberships (tenant_slug, user_id, role, status)
select 'managed-openrouter-hc-20260831', id, 'owner', 'active'
from auth.users
where lower(email) = lower('aryamandev777@gmail.com')
on conflict (tenant_slug, user_id) do update
set role = 'owner',
    status = 'active';

-- Deliberately no purchased credit and no enabled managed route. Do not change
-- these to make a health check pass: a later paid execution has its own gate.
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
  last_health_check_at,
  last_reconciled_at,
  updated_at
)
values (
  'managed-openrouter-hc-20260831',
  'provider-openrouter_api_key',
  'OPENROUTER_API_KEY',
  0,
  0,
  0,
  'active',
  'veloce-managed',
  'Veloce managed OpenRouter health canary',
  'projects/veloce-agenticos-2026/secrets/openrouter-managed-api-key/versions/latest',
  false,
  'provider_not_enabled',
  'pending',
  'managed-openrouter-health-canary-v1',
  'not_checked',
  null,
  null,
  now()
)
on conflict (tenant_slug, catalog_id) do update
set provider_key = excluded.provider_key,
    purchased_micros = 0,
    reserved_micros = 0,
    spent_micros = 0,
    status = 'active',
    provider_route = 'veloce-managed',
    provider_account_owner = excluded.provider_account_owner,
    credential_reference = excluded.credential_reference,
    managed_route_enabled = false,
    funding_status = 'provider_not_enabled',
    reconciliation_status = 'pending',
    manifest_version = excluded.manifest_version,
    health_status = 'not_checked',
    last_health_check_at = null,
    last_reconciled_at = null,
    updated_at = now();

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
  revoked_at,
  updated_at
)
values (
  'managed-openrouter-hc-20260831',
  'provider-openrouter_api_key',
  'OPENROUTER_API_KEY',
  'veloce-managed',
  'validating',
  'projects/veloce-agenticos-2026/secrets/openrouter-managed-api-key/versions/latest',
  null,
  'managed-openrouter-health-canary-v1',
  jsonb_build_object('fixture', 'zero-spend-health-check', 'created_at', now()),
  null,
  null,
  now()
)
on conflict (tenant_slug, provider_key) do update
set catalog_id = excluded.catalog_id,
    credential_mode = 'veloce-managed',
    status = 'validating',
    secret_resource = excluded.secret_resource,
    pricing_snapshot_id = null,
    manifest_version = excluded.manifest_version,
    validation_metadata = jsonb_build_object('fixture', 'zero-spend-health-check', 'refreshed_at', now()),
    last_validated_at = null,
    revoked_at = null,
    updated_at = now();

commit;

-- One compact result. All checks must be true before issuing the HTTP health
-- request. `execution_blocked` proves this fixture cannot make a paid call.
with expected_tables(table_name) as (
  values
    ('client_credit_purchase_plan_allocations'),
    ('client_credit_reservation_events'),
    ('client_credit_reservations'),
    ('client_credit_execution_claims')
), expected_routines(routine_name) as (
  values
    ('reserve_client_credit'),
    ('settle_client_credit'),
    ('refund_client_credit'),
    ('expire_client_credit_reservations'),
    ('record_client_credit_purchase_lifecycle_event'),
    ('claim_client_credit_reservation')
), fixture as (
  select
    b.managed_route_enabled,
    b.purchased_micros,
    b.reserved_micros,
    b.spent_micros,
    b.reconciliation_status,
    b.credential_reference,
    b.manifest_version as budget_manifest_version,
    c.credential_mode,
    c.status as connection_status,
    c.secret_resource,
    c.manifest_version as connection_manifest_version,
    exists (
      select 1
      from public.client_memberships m
      join auth.users u on u.id = m.user_id
      where m.tenant_slug = 'managed-openrouter-hc-20260831'
        and m.role = 'owner'
        and m.status = 'active'
        and lower(u.email) = lower('aryamandev777@gmail.com')
    ) as operator_owner_present
  from public.client_credit_budgets b
  join public.client_provider_connections c
    on c.tenant_slug = b.tenant_slug
   and c.provider_key = b.provider_key
  where b.tenant_slug = 'managed-openrouter-hc-20260831'
    and b.catalog_id = 'provider-openrouter_api_key'
    and b.provider_key = 'OPENROUTER_API_KEY'
), migration_gate as (
  select exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'client_credit_provider_readiness_snapshot'
      and position('reconciliation_status <> ''matched''' in pg_get_functiondef(p.oid)) > 0
  ) as reconciliation_gate_present
)
select
  not exists (
    select 1 from expected_tables e
    where not exists (
      select 1 from information_schema.tables t
      where t.table_schema = 'public' and t.table_name = e.table_name
    )
  ) as v34_tables_present,
  not exists (
    select 1 from expected_routines e
    where not exists (
      select 1 from information_schema.routines r
      where r.routine_schema = 'public' and r.routine_name = e.routine_name
    )
  ) as v34_routines_present,
  (select reconciliation_gate_present from migration_gate) as reconciliation_gate_present,
  f.operator_owner_present,
  f.credential_mode = 'veloce-managed'
    and f.connection_status = 'validating'
    and f.credential_reference = f.secret_resource
    and f.budget_manifest_version = f.connection_manifest_version as health_connection_ready,
  (not f.managed_route_enabled)
    and f.purchased_micros = 0
    and f.reserved_micros = 0
    and f.spent_micros = 0
    and f.reconciliation_status = 'pending' as execution_blocked
from fixture f;
