-- Phase 2 Slice 1: durable, resumable CI deploy-job tracking.
--
-- Deliberately NOT an extension of client_provisioning_runs: that table's
-- onboarding_id/request_id are both `not null references ... on delete
-- cascade`, and its callback route unconditionally dereferences
-- onboarding_id for tenant-lifecycle side effects a platform CI deploy must
-- never trigger. This table copies its proven column shape without the
-- tenant relationship.

create table if not exists public.platform_deploy_runs (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('staging', 'production')),
  workflow text not null check (workflow in ('control-plane-image-deploy', 'product-experience-deploy')),
  git_commit text not null check (git_commit ~ '^[0-9a-f]{40}$'),
  triggered_by text not null check (triggered_by in ('ci-auto', 'ci-manual-promotion')),
  idempotency_key text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'rolled_back')),
  current_step text,
  completed_steps jsonb not null default '[]'::jsonb,
  target_manifest jsonb not null default '{}'::jsonb,
  evidence_bundle jsonb not null default '{}'::jsonb,
  image_digest text,
  vercel_deployment_id text,
  cloud_run_revision text,
  rollback_target text,
  promoted_from_run_id uuid references public.platform_deploy_runs(id),
  error_code text,
  error_message text,
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (environment, workflow, idempotency_key)
);

alter table public.platform_deploy_runs enable row level security;
revoke all on public.platform_deploy_runs from public, anon, authenticated;
-- service_role only, exactly like client_provisioning_runs: environment
-- identity is established by which operator secret authenticated the
-- caller (see product-experience/src/app/api/internal/platform-deploy/route.ts),
-- never by a client-supplied field, so no RLS policy is needed here.

create index if not exists platform_deploy_runs_status_idx on public.platform_deploy_runs (environment, workflow, created_at desc);
create index if not exists platform_deploy_runs_commit_idx on public.platform_deploy_runs (git_commit, environment);
