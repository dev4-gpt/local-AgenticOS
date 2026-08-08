-- Apply after supabase-client-runtime-workflow-reconciliation.sql.
-- Hosted Paperclip domain tables. This is the tenant-owned replacement for the
-- local Paperclip service on :3100; it holds no provider credentials and no
-- local paths. Money is stored in micros to match the runtime budget ledger.

create table if not exists public.client_paperclip_companies (
  tenant_slug text primary key references public.client_tenants(slug) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  description text not null default '' check (length(description) <= 2000),
  issue_prefix text not null check (issue_prefix ~ '^[A-Z][A-Z0-9]{1,7}$'),
  issue_counter integer not null default 0 check (issue_counter >= 0),
  brand_color text not null default '#d4a574' check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  budget_monthly_micros bigint not null default 0 check (budget_monthly_micros >= 0),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_paperclip_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id),
  name text not null check (length(name) between 1 and 120),
  url_key text not null check (url_key ~ '^[a-z0-9][a-z0-9-]{0,48}$'),
  description text not null default '' check (length(description) <= 4000),
  color text not null default '#d4a574' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text not null default '' check (length(icon) <= 8),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_slug, url_key)
);

create table if not exists public.client_paperclip_agents (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id),
  name text not null check (length(name) between 1 and 120),
  role text not null default '' check (length(role) <= 80),
  title text not null default '' check (length(title) <= 120),
  icon text not null default '' check (length(icon) <= 8),
  status text not null default 'idle' check (status in ('idle', 'working', 'paused', 'terminated')),
  reports_to uuid references public.client_paperclip_agents(id) on delete set null,
  provider text check (length(provider) <= 40),
  model text check (length(model) <= 120),
  budget_monthly_micros bigint not null default 0 check (budget_monthly_micros >= 0),
  last_heartbeat_at timestamptz,
  url_key text not null check (url_key ~ '^[a-z0-9][a-z0-9-]{0,48}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_slug, url_key)
);

create table if not exists public.client_paperclip_issues (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id),
  issue_number integer not null check (issue_number > 0),
  identifier text not null check (identifier ~ '^[A-Z][A-Z0-9]{1,7}-[0-9]{1,9}$'),
  title text not null check (length(title) between 1 and 240),
  description text not null default '' check (length(description) <= 20000),
  status text not null default 'backlog' check (status in ('backlog', 'active', 'blocked', 'done', 'cancelled')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  project_id uuid references public.client_paperclip_projects(id) on delete set null,
  assignee_agent_id uuid references public.client_paperclip_agents(id) on delete set null,
  labels text[] not null default '{}'::text[] check (cardinality(labels) <= 12),
  execution_state text check (execution_state in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  execution_job_id uuid references public.client_runtime_jobs(id) on delete set null,
  build_artifact_id uuid references public.client_runtime_artifacts(id) on delete set null,
  build_preview_html text check (length(build_preview_html) <= 40000),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_slug, identifier)
);

create table if not exists public.client_paperclip_comments (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  issue_id uuid not null references public.client_paperclip_issues(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id),
  author_agent_id uuid references public.client_paperclip_agents(id) on delete set null,
  body text not null check (length(body) between 1 and 10000),
  created_at timestamptz not null default now()
);

create table if not exists public.client_paperclip_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id),
  issue_id uuid references public.client_paperclip_issues(id) on delete cascade,
  agent_id uuid references public.client_paperclip_agents(id) on delete set null,
  job_id uuid references public.client_runtime_jobs(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  provider text check (length(provider) <= 40),
  model text check (length(model) <= 120),
  summary text not null default '' check (length(summary) <= 4000),
  error_code text check (length(error_code) <= 120),
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_paperclip_projects_tenant_idx
  on public.client_paperclip_projects (tenant_slug, status, created_at desc);
create index if not exists client_paperclip_agents_tenant_idx
  on public.client_paperclip_agents (tenant_slug, status, created_at desc);
create index if not exists client_paperclip_issues_tenant_idx
  on public.client_paperclip_issues (tenant_slug, status, created_at desc);
create index if not exists client_paperclip_issues_build_idx
  on public.client_paperclip_issues (tenant_slug, build_artifact_id) where build_artifact_id is not null;
create index if not exists client_paperclip_comments_issue_idx
  on public.client_paperclip_comments (tenant_slug, issue_id, created_at desc);
create index if not exists client_paperclip_runs_tenant_idx
  on public.client_paperclip_runs (tenant_slug, created_at desc);
create index if not exists client_paperclip_runs_job_idx
  on public.client_paperclip_runs (job_id) where job_id is not null;

alter table public.client_paperclip_companies enable row level security;
alter table public.client_paperclip_projects enable row level security;
alter table public.client_paperclip_agents enable row level security;
alter table public.client_paperclip_issues enable row level security;
alter table public.client_paperclip_comments enable row level security;
alter table public.client_paperclip_runs enable row level security;

-- Company settings are shared board state: every active member may read and
-- adjust them. The counter itself only moves through the allocation function.
drop policy if exists client_paperclip_companies_member_select on public.client_paperclip_companies;
create policy client_paperclip_companies_member_select on public.client_paperclip_companies
  for select to authenticated using (public.client_member(tenant_slug));

drop policy if exists client_paperclip_companies_member_insert on public.client_paperclip_companies;
create policy client_paperclip_companies_member_insert on public.client_paperclip_companies
  for insert to authenticated with check (public.client_member(tenant_slug));

drop policy if exists client_paperclip_companies_member_update on public.client_paperclip_companies;
create policy client_paperclip_companies_member_update on public.client_paperclip_companies
  for update to authenticated
  using (public.client_member(tenant_slug))
  with check (public.client_member(tenant_slug));

-- Projects, agents, issues, comments, and runs are shared tenant board state.
-- Any active member may read and edit them; membership is the tenant boundary.
do $$
declare
  board_table text;
begin
  foreach board_table in array array[
    'client_paperclip_projects',
    'client_paperclip_agents',
    'client_paperclip_issues',
    'client_paperclip_comments',
    'client_paperclip_runs'
  ]
  loop
    execute format('drop policy if exists %1$s_member_select on public.%1$s', board_table);
    execute format(
      'create policy %1$s_member_select on public.%1$s for select to authenticated using (public.client_member(tenant_slug))',
      board_table
    );
    execute format('drop policy if exists %1$s_member_insert on public.%1$s', board_table);
    execute format(
      'create policy %1$s_member_insert on public.%1$s for insert to authenticated with check (public.client_member(tenant_slug) and created_by = auth.uid())',
      board_table
    );
    execute format('drop policy if exists %1$s_member_update on public.%1$s', board_table);
    execute format(
      'create policy %1$s_member_update on public.%1$s for update to authenticated using (public.client_member(tenant_slug)) with check (public.client_member(tenant_slug))',
      board_table
    );
    execute format('drop policy if exists %1$s_member_delete on public.%1$s', board_table);
    execute format(
      'create policy %1$s_member_delete on public.%1$s for delete to authenticated using (public.client_member(tenant_slug))',
      board_table
    );
  end loop;
end
$$;

grant select, insert, update on public.client_paperclip_companies to authenticated;
grant select, insert, update, delete on public.client_paperclip_projects to authenticated;
grant select, insert, update, delete on public.client_paperclip_agents to authenticated;
grant select, insert, update, delete on public.client_paperclip_issues to authenticated;
grant select, insert, update, delete on public.client_paperclip_comments to authenticated;
grant select, insert, update, delete on public.client_paperclip_runs to authenticated;

-- Idempotent company bootstrap. The first authenticated member visit creates
-- the tenant board instead of shipping a seeded company in the image.
create or replace function public.ensure_client_paperclip_company(
  p_tenant_slug text,
  p_name text,
  p_issue_prefix text
)
returns public.client_paperclip_companies
language plpgsql
security invoker
set search_path = public
as $$
declare
  company public.client_paperclip_companies;
begin
  select * into company from public.client_paperclip_companies where tenant_slug = p_tenant_slug;
  if found then
    return company;
  end if;

  insert into public.client_paperclip_companies (tenant_slug, name, issue_prefix)
  values (p_tenant_slug, coalesce(nullif(btrim(p_name), ''), 'Hosted Company'), upper(p_issue_prefix))
  on conflict (tenant_slug) do nothing;

  select * into company from public.client_paperclip_companies where tenant_slug = p_tenant_slug;
  return company;
end;
$$;

grant execute on function public.ensure_client_paperclip_company(text, text, text) to authenticated;

-- Atomic identifier allocation. Two concurrent members must never receive the
-- same PREFIX-N, so the counter bump and the insert share one transaction and
-- one row lock.
create or replace function public.allocate_client_paperclip_issue(
  p_tenant_slug text,
  p_title text,
  p_description text,
  p_priority text,
  p_project_id uuid,
  p_assignee_agent_id uuid,
  p_labels text[]
)
returns public.client_paperclip_issues
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_number integer;
  prefix text;
  issue public.client_paperclip_issues;
begin
  if p_priority is not null and p_priority not in ('low', 'medium', 'high', 'critical') then
    raise exception 'paperclip_priority_invalid';
  end if;

  update public.client_paperclip_companies
    set issue_counter = issue_counter + 1,
        updated_at = now()
  where tenant_slug = p_tenant_slug
  returning issue_counter, issue_prefix into next_number, prefix;

  if next_number is null then
    raise exception 'paperclip_company_missing';
  end if;

  insert into public.client_paperclip_issues (
    tenant_slug, issue_number, identifier, title, description,
    priority, project_id, assignee_agent_id, labels
  )
  values (
    p_tenant_slug,
    next_number,
    format('%s-%s', prefix, next_number),
    p_title,
    coalesce(p_description, ''),
    coalesce(p_priority, 'medium'),
    p_project_id,
    p_assignee_agent_id,
    coalesce(p_labels, '{}'::text[])
  )
  returning * into issue;

  return issue;
end;
$$;

grant execute on function public.allocate_client_paperclip_issue(text, text, text, text, uuid, uuid, text[]) to authenticated;

-- Worker-only reconciliation. The Cloud Run job never holds a member session,
-- so it settles the run row and its issue through a token-verified function.
drop function if exists public.complete_client_paperclip_run_worker(text, text, uuid, text, text, text, bigint, uuid, text);

create or replace function public.complete_client_paperclip_run_worker(
  p_tenant_slug text,
  p_worker_token text,
  p_job_id uuid,
  p_status text,
  p_summary text,
  p_error_code text,
  p_cost_micros bigint,
  p_build_artifact_id uuid,
  p_build_preview_html text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_issue uuid;
begin
  if p_worker_token is null
     or length(p_worker_token) < 24
     or p_status is null
     or p_status not in ('running', 'succeeded', 'failed', 'cancelled')
     or not exists (
       select 1 from public.client_tenants
       where slug = p_tenant_slug
         and status = 'active'
         and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     ) then
    return false;
  end if;

  update public.client_paperclip_runs
    set status = p_status,
        summary = left(coalesce(nullif(btrim(p_summary), ''), summary), 4000),
        error_code = p_error_code,
        cost_micros = greatest(0, coalesce(p_cost_micros, cost_micros)),
        started_at = coalesce(started_at, now()),
        finished_at = case when p_status = 'running' then null else now() end,
        updated_at = now()
  where tenant_slug = p_tenant_slug
    and job_id = p_job_id
  returning issue_id into target_issue;

  if target_issue is null then
    return false;
  end if;

  update public.client_paperclip_issues
    set execution_state = p_status,
        status = case
          when p_status = 'succeeded' then 'done'
          when p_status = 'failed' then 'blocked'
          when p_status = 'running' then 'active'
          else status
        end,
        build_artifact_id = coalesce(p_build_artifact_id, build_artifact_id),
        build_preview_html = coalesce(left(p_build_preview_html, 40000), build_preview_html),
        started_at = coalesce(started_at, now()),
        completed_at = case when p_status in ('succeeded', 'failed', 'cancelled') then now() else completed_at end,
        updated_at = now()
  where tenant_slug = p_tenant_slug
    and id = target_issue;

  -- The assigned agent's heartbeat is the observable "this agent is alive"
  -- signal the local org view depends on.
  update public.client_paperclip_agents
    set status = case when p_status = 'running' then 'working' else 'idle' end,
        last_heartbeat_at = now(),
        updated_at = now()
  where tenant_slug = p_tenant_slug
    and id = (select agent_id from public.client_paperclip_runs where tenant_slug = p_tenant_slug and job_id = p_job_id);

  return true;
end;
$$;

revoke all on function public.complete_client_paperclip_run_worker(text, text, uuid, text, text, text, bigint, uuid, text)
  from public, authenticated;
grant execute on function public.complete_client_paperclip_run_worker(text, text, uuid, text, text, text, bigint, uuid, text)
  to anon;
