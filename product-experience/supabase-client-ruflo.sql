-- Apply after supabase-client-loop.sql.
-- Hosted Ruflo: an objective fanned out across a named agent roster. The local
-- Ruflo shells out to the `ruflo` CLI, which writes swarm state and results as
-- JSON under ~/.claude-flow. Cloud Run has no CLI and no home directory, so the
-- same swarm -> roster -> per-agent result shape lives in tenant rows.

create table if not exists public.client_ruflo_swarms (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id),
  objective text not null check (length(objective) between 1 and 4000),
  topology text not null default 'hierarchical' check (topology in ('hierarchical', 'mesh', 'star')),
  preset text not null default 'seo' check (length(preset) between 1 and 40),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  job_id uuid references public.client_runtime_jobs(id) on delete set null,
  provider text check (length(provider) <= 40),
  model text check (length(model) <= 120),
  agent_count integer not null default 0 check (agent_count between 0 and 16),
  completed_count integer not null default 0 check (completed_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  -- The coordinator's synthesis once every agent has reported.
  report text check (length(report) <= 40000),
  report_artifact_id uuid references public.client_runtime_artifacts(id) on delete set null,
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  error_code text check (length(error_code) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_ruflo_agents (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  swarm_id uuid not null references public.client_ruflo_swarms(id) on delete cascade,
  -- Mirrors the local roster: an agent type plus a specific role name.
  agent_type text not null check (length(agent_type) between 1 and 40),
  name text not null check (length(name) between 1 and 60),
  task text not null default '' check (length(task) <= 4000),
  position integer not null default 0 check (position between 0 and 16),
  status text not null default 'idle' check (status in ('idle', 'running', 'done', 'failed', 'skipped')),
  output text check (length(output) <= 20000),
  error_code text check (length(error_code) <= 120),
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_slug, swarm_id, name)
);

create index if not exists client_ruflo_swarms_tenant_idx
  on public.client_ruflo_swarms (tenant_slug, status, created_at desc);
create index if not exists client_ruflo_swarms_job_idx
  on public.client_ruflo_swarms (job_id) where job_id is not null;
create index if not exists client_ruflo_agents_swarm_idx
  on public.client_ruflo_agents (tenant_slug, swarm_id, position);

alter table public.client_ruflo_swarms enable row level security;
alter table public.client_ruflo_agents enable row level security;

do $$
declare
  ruflo_table text;
begin
  foreach ruflo_table in array array['client_ruflo_swarms', 'client_ruflo_agents']
  loop
    execute format('drop policy if exists %1$s_member_select on public.%1$s', ruflo_table);
    execute format(
      'create policy %1$s_member_select on public.%1$s for select to authenticated using (public.client_member(tenant_slug))',
      ruflo_table
    );
    execute format('drop policy if exists %1$s_member_insert on public.%1$s', ruflo_table);
    execute format(
      'create policy %1$s_member_insert on public.%1$s for insert to authenticated with check (public.client_member(tenant_slug))',
      ruflo_table
    );
    execute format('drop policy if exists %1$s_member_update on public.%1$s', ruflo_table);
    execute format(
      'create policy %1$s_member_update on public.%1$s for update to authenticated using (public.client_member(tenant_slug)) with check (public.client_member(tenant_slug))',
      ruflo_table
    );
    execute format('drop policy if exists %1$s_member_delete on public.%1$s', ruflo_table);
    execute format(
      'create policy %1$s_member_delete on public.%1$s for delete to authenticated using (public.client_member(tenant_slug))',
      ruflo_table
    );
  end loop;
end
$$;

grant select, insert, update, delete on public.client_ruflo_swarms to authenticated;
grant select, insert, update, delete on public.client_ruflo_agents to authenticated;

-- Worker-only: records one agent's result and advances the swarm counters.
drop function if exists public.settle_client_ruflo_agent_worker(text, text, uuid, text, text, text, text, bigint);

create or replace function public.settle_client_ruflo_agent_worker(
  p_tenant_slug text,
  p_worker_token text,
  p_job_id uuid,
  p_agent_name text,
  p_status text,
  p_output text,
  p_error_code text,
  p_cost_micros bigint
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target uuid;
begin
  if p_worker_token is null
     or length(p_worker_token) < 24
     or p_status not in ('idle', 'running', 'done', 'failed', 'skipped')
     or not exists (
       select 1 from public.client_tenants
       where slug = p_tenant_slug
         and status = 'active'
         and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     ) then
    return false;
  end if;

  select id into target from public.client_ruflo_swarms
  where tenant_slug = p_tenant_slug and job_id = p_job_id;
  if target is null then
    return false;
  end if;

  update public.client_ruflo_agents
    set status = p_status,
        output = coalesce(left(p_output, 20000), output),
        error_code = p_error_code,
        cost_micros = greatest(0, coalesce(p_cost_micros, cost_micros)),
        started_at = coalesce(started_at, now()),
        finished_at = case when p_status in ('done', 'failed', 'skipped') then now() else null end
  where tenant_slug = p_tenant_slug
    and swarm_id = target
    and name = p_agent_name;

  if not found then
    return false;
  end if;

  -- Counters are recomputed from the rows rather than incremented, so a retry
  -- of the same agent cannot double-count.
  update public.client_ruflo_swarms s
    set completed_count = (select count(*) from public.client_ruflo_agents a where a.swarm_id = s.id and a.status = 'done'),
        failed_count = (select count(*) from public.client_ruflo_agents a where a.swarm_id = s.id and a.status in ('failed', 'skipped')),
        cost_micros = (select coalesce(sum(a.cost_micros), 0) from public.client_ruflo_agents a where a.swarm_id = s.id),
        status = 'running',
        updated_at = now()
  where s.id = target;

  return true;
end;
$$;

revoke all on function public.settle_client_ruflo_agent_worker(text, text, uuid, text, text, text, text, bigint)
  from public, authenticated;
grant execute on function public.settle_client_ruflo_agent_worker(text, text, uuid, text, text, text, text, bigint)
  to anon;

-- Worker-only: settles the swarm and stores the coordinator's synthesis.
drop function if exists public.settle_client_ruflo_swarm_worker(text, text, uuid, text, text, uuid, text);

create or replace function public.settle_client_ruflo_swarm_worker(
  p_tenant_slug text,
  p_worker_token text,
  p_job_id uuid,
  p_status text,
  p_report text,
  p_report_artifact_id uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_worker_token is null
     or length(p_worker_token) < 24
     or p_status not in ('running', 'completed', 'failed', 'cancelled')
     or not exists (
       select 1 from public.client_tenants
       where slug = p_tenant_slug
         and status = 'active'
         and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     ) then
    return false;
  end if;

  update public.client_ruflo_swarms
    set status = p_status,
        report = coalesce(left(p_report, 40000), report),
        report_artifact_id = coalesce(p_report_artifact_id, report_artifact_id),
        -- A running swarm has no verdict yet, so its error is always cleared.
        -- 'completed' must be able to carry one: a swarm whose agents all
        -- reported but whose coordinator report failed validation is completed
        -- and defective at once, and nulling the code here made that state
        -- indistinguishable from a clean run.
        error_code = case when p_status = 'running' then null else p_error_code end,
        updated_at = now()
  where tenant_slug = p_tenant_slug
    and job_id = p_job_id;

  return found;
end;
$$;

revoke all on function public.settle_client_ruflo_swarm_worker(text, text, uuid, text, text, uuid, text)
  from public, authenticated;
grant execute on function public.settle_client_ruflo_swarm_worker(text, text, uuid, text, text, uuid, text)
  to anon;
