create table if not exists public.deployment_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'pending_approval',
  source text not null default 'product-start',
  name text not null,
  email text not null,
  company text not null,
  role text,
  website text,
  workflow text not null,
  current_tools text,
  data_sources text,
  required_integrations text,
  credential_model text not null default 'client_owned',
  monthly_budget_cap text,
  approval_rule text not null default 'approve_external_actions',
  preferred_subdomain text,
  timeline text,
  notes text,
  meta jsonb not null default '{}'::jsonb
);

alter table public.deployment_requests enable row level security;

-- No public browser reads. Inserts for this app are performed by the
-- server-side Vercel route with SUPABASE_SERVICE_ROLE_KEY.
drop policy if exists "deployment_requests_no_browser_select" on public.deployment_requests;

create index if not exists deployment_requests_status_created_idx
  on public.deployment_requests (status, created_at desc);
