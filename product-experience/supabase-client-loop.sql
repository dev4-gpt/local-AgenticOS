-- Apply after supabase-client-boards.sql.
-- Hosted Loop: a bounded builder/judge iteration. The local loop drives models
-- through Hermes OAuth, the Nous Portal, and a local Ollama judge; none of that
-- exists in Cloud Run, so the same builder -> judge -> revise cycle runs on the
-- approved provider lane with every round recorded as a tenant row.

create table if not exists public.client_loop_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id),
  -- The definition of done the judge grades against.
  goal text not null check (length(goal) between 1 and 10000),
  title text not null default 'Improvement loop' check (length(title) between 1 and 240),
  status text not null default 'queued' check (status in ('queued', 'running', 'passed', 'exhausted', 'failed', 'cancelled')),
  job_id uuid references public.client_runtime_jobs(id) on delete set null,
  builder_provider text check (length(builder_provider) <= 40),
  builder_model text check (length(builder_model) <= 120),
  judge_provider text check (length(judge_provider) <= 40),
  judge_model text check (length(judge_model) <= 120),
  -- Rounds are capped so a loop cannot spend without bound.
  max_rounds integer not null default 3 check (max_rounds between 1 and 5),
  rounds_completed integer not null default 0 check (rounds_completed >= 0),
  best_score integer check (best_score between 0 and 100),
  final_summary text check (length(final_summary) <= 4000),
  build_artifact_id uuid references public.client_runtime_artifacts(id) on delete set null,
  build_preview_html text check (length(build_preview_html) <= 40000),
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  error_code text check (length(error_code) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_loop_rounds (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  run_id uuid not null references public.client_loop_runs(id) on delete cascade,
  round integer not null check (round between 1 and 5),
  -- The judge's adversarial verdict for this round.
  passed boolean not null default false,
  score integer check (score between 0 and 100),
  issues text[] not null default '{}'::text[] check (cardinality(issues) <= 8),
  summary text not null default '' check (length(summary) <= 4000),
  artifact_chars integer not null default 0 check (artifact_chars >= 0),
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  error_code text check (length(error_code) <= 120),
  created_at timestamptz not null default now(),
  unique (tenant_slug, run_id, round)
);

create index if not exists client_loop_runs_tenant_idx
  on public.client_loop_runs (tenant_slug, status, created_at desc);
create index if not exists client_loop_runs_job_idx
  on public.client_loop_runs (job_id) where job_id is not null;
create index if not exists client_loop_rounds_run_idx
  on public.client_loop_rounds (tenant_slug, run_id, round);

alter table public.client_loop_runs enable row level security;
alter table public.client_loop_rounds enable row level security;

do $$
declare
  loop_table text;
begin
  foreach loop_table in array array['client_loop_runs', 'client_loop_rounds']
  loop
    execute format('drop policy if exists %1$s_member_select on public.%1$s', loop_table);
    execute format(
      'create policy %1$s_member_select on public.%1$s for select to authenticated using (public.client_member(tenant_slug))',
      loop_table
    );
    execute format('drop policy if exists %1$s_member_insert on public.%1$s', loop_table);
    execute format(
      'create policy %1$s_member_insert on public.%1$s for insert to authenticated with check (public.client_member(tenant_slug))',
      loop_table
    );
    execute format('drop policy if exists %1$s_member_update on public.%1$s', loop_table);
    execute format(
      'create policy %1$s_member_update on public.%1$s for update to authenticated using (public.client_member(tenant_slug)) with check (public.client_member(tenant_slug))',
      loop_table
    );
    execute format('drop policy if exists %1$s_member_delete on public.%1$s', loop_table);
    execute format(
      'create policy %1$s_member_delete on public.%1$s for delete to authenticated using (public.client_member(tenant_slug))',
      loop_table
    );
  end loop;
end
$$;

grant select, insert, update, delete on public.client_loop_runs to authenticated;
grant select, insert, update, delete on public.client_loop_rounds to authenticated;

-- Worker-only: records one completed round and advances the run.
drop function if exists public.append_client_loop_round_worker(text, text, uuid, integer, boolean, integer, text[], text, integer, bigint, text);

create or replace function public.append_client_loop_round_worker(
  p_tenant_slug text,
  p_worker_token text,
  p_job_id uuid,
  p_round integer,
  p_passed boolean,
  p_score integer,
  p_issues text[],
  p_summary text,
  p_artifact_chars integer,
  p_cost_micros bigint,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target uuid;
  -- Postgres cannot subscript a function result directly, so the issue list is
  -- bounded through a local variable rather than coalesce(...)[1:8].
  bounded_issues text[];
begin
  if p_worker_token is null
     or length(p_worker_token) < 24
     or p_round is null
     or p_round < 1
     or p_round > 5
     or not exists (
       select 1 from public.client_tenants
       where slug = p_tenant_slug
         and status = 'active'
         and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     ) then
    return false;
  end if;

  select id into target from public.client_loop_runs
  where tenant_slug = p_tenant_slug and job_id = p_job_id;
  if target is null then
    return false;
  end if;

  bounded_issues := coalesce(p_issues, '{}'::text[]);
  if coalesce(array_length(bounded_issues, 1), 0) > 8 then
    bounded_issues := bounded_issues[1:8];
  end if;

  insert into public.client_loop_rounds (
    tenant_slug, run_id, round, passed, score, issues, summary, artifact_chars, cost_micros, error_code
  )
  values (
    p_tenant_slug, target, p_round, coalesce(p_passed, false),
    greatest(0, least(100, coalesce(p_score, 0))),
    bounded_issues,
    left(coalesce(p_summary, ''), 4000),
    greatest(0, coalesce(p_artifact_chars, 0)),
    greatest(0, coalesce(p_cost_micros, 0)),
    p_error_code
  )
  on conflict (tenant_slug, run_id, round) do nothing;

  update public.client_loop_runs
    set rounds_completed = greatest(rounds_completed, p_round),
        best_score = greatest(coalesce(best_score, 0), greatest(0, least(100, coalesce(p_score, 0)))),
        cost_micros = cost_micros + greatest(0, coalesce(p_cost_micros, 0)),
        status = 'running',
        updated_at = now()
  where id = target;

  return true;
end;
$$;

revoke all on function public.append_client_loop_round_worker(text, text, uuid, integer, boolean, integer, text[], text, integer, bigint, text)
  from public, authenticated;
grant execute on function public.append_client_loop_round_worker(text, text, uuid, integer, boolean, integer, text[], text, integer, bigint, text)
  to anon;

-- Worker-only: settles the run once the loop stops.
drop function if exists public.settle_client_loop_run_worker(text, text, uuid, text, text, uuid, text, text);

create or replace function public.settle_client_loop_run_worker(
  p_tenant_slug text,
  p_worker_token text,
  p_job_id uuid,
  p_status text,
  p_final_summary text,
  p_build_artifact_id uuid,
  p_build_preview_html text,
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
     or p_status not in ('running', 'passed', 'exhausted', 'failed', 'cancelled')
     or not exists (
       select 1 from public.client_tenants
       where slug = p_tenant_slug
         and status = 'active'
         and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     ) then
    return false;
  end if;

  update public.client_loop_runs
    set status = p_status,
        final_summary = coalesce(left(p_final_summary, 4000), final_summary),
        build_artifact_id = coalesce(p_build_artifact_id, build_artifact_id),
        build_preview_html = coalesce(left(p_build_preview_html, 40000), build_preview_html),
        error_code = case when p_status in ('passed', 'running') then null else p_error_code end,
        updated_at = now()
  where tenant_slug = p_tenant_slug
    and job_id = p_job_id;

  return found;
end;
$$;

revoke all on function public.settle_client_loop_run_worker(text, text, uuid, text, text, uuid, text, text)
  from public, authenticated;
grant execute on function public.settle_client_loop_run_worker(text, text, uuid, text, text, uuid, text, text)
  to anon;
