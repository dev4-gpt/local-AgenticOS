-- Commercial scope assessment and approved entitlement input.
-- Apply after supabase-public-launch-control-plane.sql.
-- These fields contain business requirements and non-secret pricing scope only.

alter table public.deployment_requests
  add column if not exists scope_inputs jsonb not null default '{}'::jsonb;

alter table public.client_onboarding_accounts
  add column if not exists commercial_scope_status text not null default 'approved'
    check (commercial_scope_status in ('recommended', 'approved', 'rejected', 'superseded')),
  add column if not exists commercial_scope_inputs jsonb not null default '{}'::jsonb,
  add column if not exists commercial_scope_recommendation jsonb not null default '{}'::jsonb,
  add column if not exists commercial_scope_quote jsonb not null default '{}'::jsonb,
  add column if not exists commercial_scope_approved_by text,
  add column if not exists commercial_scope_approved_at timestamptz;

create index if not exists client_onboarding_commercial_scope_idx
  on public.client_onboarding_accounts (commercial_scope_status, created_at desc);

comment on column public.client_onboarding_accounts.commercial_scope_inputs is
  'Structured non-secret intake inputs used for deterministic scope recommendation.';
comment on column public.client_onboarding_accounts.commercial_scope_recommendation is
  'Deterministic quote guidance; never an activation or billing grant.';
comment on column public.client_onboarding_accounts.commercial_scope_quote is
  'Operator-approved commercial quote, separate from approved_manifest.';

alter table public.client_onboarding_accounts enable row level security;
revoke all on public.client_onboarding_accounts from public, anon, authenticated;
