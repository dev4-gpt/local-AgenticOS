-- Public Veloce launch control plane.
-- Apply after the existing deployment-request and client-runtime migrations.
-- No provider values, passwords, or access tokens belong in these tables.

alter table public.deployment_requests
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists email_verified_at timestamptz,
  add column if not exists billing_status text not null default 'not_started',
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists idempotency_key text;

create unique index if not exists deployment_requests_idempotency_idx
  on public.deployment_requests (idempotency_key)
  where idempotency_key is not null;

create table if not exists public.client_onboarding_accounts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.deployment_requests(id) on delete cascade,
  email text not null,
  auth_user_id uuid references auth.users(id) on delete set null,
  tenant_slug text unique,
  status text not null default 'requested' check (status in (
    'requested', 'email_verified', 'payment_pending', 'payment_succeeded',
    'manifest_review', 'provisioning', 'smoke_testing', 'active',
    'provision_failed', 'rollback_required', 'suspended', 'offboarding', 'offboarded'
  )),
  setup_link_sent_at timestamptz,
  activated_at timestamptz,
  suspended_at timestamptz,
  offboarded_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  setup_payment_id text,
  runtime_url text,
  manifest_version text,
  manifest_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_onboarding_status_idx
  on public.client_onboarding_accounts (status, created_at desc);

create table if not exists public.client_onboarding_tokens (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.client_onboarding_accounts(id) on delete cascade,
  token_hash text not null unique,
  purpose text not null check (purpose in ('verify-email', 'setup')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.client_provisioning_runs (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.client_onboarding_accounts(id) on delete cascade,
  request_id uuid not null references public.deployment_requests(id) on delete cascade,
  idempotency_key text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'rolled_back')),
  current_step text,
  completed_steps jsonb not null default '[]'::jsonb,
  resource_manifest jsonb not null default '{}'::jsonb,
  evidence_bundle jsonb not null default '{}'::jsonb,
  image_digest text,
  cloud_run_revision text,
  rollback_target text,
  error_code text,
  error_message text,
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (onboarding_id, idempotency_key)
);

create table if not exists public.client_provider_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  catalog_id text not null,
  provider_key text not null,
  credential_mode text not null check (credential_mode in ('byok', 'veloce-managed')),
  status text not null default 'submitted' check (status in ('submitted', 'validating', 'connected', 'rejected', 'revoked', 'rotating')),
  secret_resource text,
  pricing_snapshot_id text,
  manifest_version text,
  validation_metadata jsonb not null default '{}'::jsonb,
  last_validated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_slug, provider_key)
);

create table if not exists public.client_credit_accounts (
  tenant_slug text primary key references public.client_tenants(slug) on delete cascade,
  currency text not null default 'usd',
  balance_micros bigint not null default 0 check (balance_micros >= 0),
  reserved_micros bigint not null default 0 check (reserved_micros >= 0),
  warning_threshold_micros bigint not null default 1000000 check (warning_threshold_micros >= 0),
  status text not null default 'active' check (status in ('active', 'exhausted', 'suspended', 'closed')),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  idempotency_key text not null,
  kind text not null check (kind in ('purchase', 'reservation', 'settlement', 'refund', 'adjustment', 'expiration')),
  amount_micros bigint not null,
  balance_after_micros bigint not null check (balance_after_micros >= 0),
  provider text,
  pricing_snapshot_id text,
  stripe_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_slug, idempotency_key)
);

create or replace function public.credit_client_managed_wallet(
  p_tenant_slug text,
  p_amount_micros bigint,
  p_stripe_event_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
  new_balance bigint;
begin
  if p_tenant_slug is null or p_tenant_slug = '' or p_amount_micros is null or p_amount_micros <= 0 or p_stripe_event_id is null or p_stripe_event_id = '' then
    return false;
  end if;
  select id into existing_id from public.client_credit_transactions where tenant_slug = p_tenant_slug and idempotency_key = 'stripe:' || p_stripe_event_id;
  if existing_id is not null then return true; end if;
  insert into public.client_credit_accounts (tenant_slug) values (p_tenant_slug) on conflict (tenant_slug) do nothing;
  update public.client_credit_accounts set balance_micros = balance_micros + p_amount_micros, updated_at = now() where tenant_slug = p_tenant_slug returning balance_micros into new_balance;
  insert into public.client_credit_transactions (tenant_slug, idempotency_key, kind, amount_micros, balance_after_micros, stripe_event_id, metadata)
  values (p_tenant_slug, 'stripe:' || p_stripe_event_id, 'purchase', p_amount_micros, new_balance, p_stripe_event_id, coalesce(p_metadata, '{}'::jsonb));
  return true;
end;
$$;

create table if not exists public.client_pricing_snapshots (
  id text primary key,
  version text not null,
  effective_at timestamptz not null,
  prices jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now(),
  payload_hash text not null,
  status text not null default 'processed' check (status in ('processed', 'ignored', 'failed')),
  error_code text
);

create table if not exists public.client_support_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text references public.client_tenants(slug) on delete set null,
  email text not null,
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'in_progress', 'resolved', 'closed')),
  request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.record_client_provider_connection(
  p_tenant_slug text,
  p_catalog_id text,
  p_provider_key text,
  p_credential_mode text,
  p_secret_resource text,
  p_validation_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.client_memberships
    where tenant_slug = p_tenant_slug and user_id = auth.uid() and status = 'active'
  ) then
    return false;
  end if;
  insert into public.client_provider_connections
    (tenant_slug, catalog_id, provider_key, credential_mode, status, secret_resource, validation_metadata, updated_at)
  values
    (p_tenant_slug, p_catalog_id, p_provider_key, p_credential_mode, 'submitted', p_secret_resource, coalesce(p_validation_metadata, '{}'::jsonb), now())
  on conflict (tenant_slug, provider_key) do update set
    catalog_id = excluded.catalog_id,
    credential_mode = excluded.credential_mode,
    status = 'submitted',
    secret_resource = excluded.secret_resource,
    validation_metadata = excluded.validation_metadata,
    revoked_at = null,
    updated_at = now();
  return true;
end;
$$;

create or replace function public.list_client_provider_connections(p_tenant_slug text)
returns table (catalog_id text, provider_key text, credential_mode text, status text, pricing_snapshot_id text, last_validated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select c.catalog_id, c.provider_key, c.credential_mode, c.status, c.pricing_snapshot_id, c.last_validated_at
  from public.client_provider_connections c
  where c.tenant_slug = p_tenant_slug
    and exists (select 1 from public.client_memberships m where m.tenant_slug = p_tenant_slug and m.user_id = auth.uid() and m.status = 'active');
$$;

create or replace function public.client_credit_account_snapshot(p_tenant_slug text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'tenantSlug', p_tenant_slug,
    'balanceMicros', coalesce(a.balance_micros, 0),
    'reservedMicros', coalesce(a.reserved_micros, 0),
    'warningThresholdMicros', coalesce(a.warning_threshold_micros, 1000000),
    'status', coalesce(a.status, 'not_configured')
  )
  from (select 1) seed
  left join public.client_credit_accounts a on a.tenant_slug = p_tenant_slug
  where exists (select 1 from public.client_memberships m where m.tenant_slug = p_tenant_slug and m.user_id = auth.uid() and m.status = 'active');
$$;

alter table public.client_onboarding_accounts enable row level security;
alter table public.client_onboarding_tokens enable row level security;
alter table public.client_provisioning_runs enable row level security;
alter table public.client_provider_connections enable row level security;
alter table public.client_credit_accounts enable row level security;
alter table public.client_credit_transactions enable row level security;
alter table public.client_pricing_snapshots enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.client_support_requests enable row level security;

-- Public browser clients cannot read or write the control plane directly.
revoke all on public.client_onboarding_accounts, public.client_provisioning_runs,
  public.client_provider_connections, public.client_credit_accounts,
  public.client_credit_transactions, public.client_pricing_snapshots,
  public.stripe_webhook_events, public.client_onboarding_tokens from anon, authenticated;

-- The authenticated runtime receives only tenant-scoped views through server routes.
revoke all on public.client_support_requests from anon;
grant insert on public.client_support_requests to authenticated;
grant execute on function public.record_client_provider_connection(text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.list_client_provider_connections(text) to authenticated;
grant execute on function public.client_credit_account_snapshot(text) to authenticated;
revoke execute on function public.credit_client_managed_wallet(text, bigint, text, jsonb) from anon, authenticated;
grant execute on function public.credit_client_managed_wallet(text, bigint, text, jsonb) to service_role;

create index if not exists client_provider_connections_tenant_idx
  on public.client_provider_connections (tenant_slug, status);
create index if not exists client_credit_transactions_tenant_idx
  on public.client_credit_transactions (tenant_slug, created_at desc);
create index if not exists support_requests_status_idx
  on public.client_support_requests (status, created_at desc);
