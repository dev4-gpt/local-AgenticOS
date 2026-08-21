-- Apply after supabase-client-runtime-controls.sql and supabase-client-notebooks.sql.
-- Durable tenant-scoped research records and citations. Provider credentials
-- remain in Secret Manager; this migration stores only normalized evidence.

create table if not exists public.client_research_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  notebook_id uuid references public.client_notebooks(id) on delete set null,
  job_id uuid references public.client_runtime_jobs(id) on delete set null,
  created_by uuid references auth.users(id),
  provider text not null check (length(provider) between 2 and 120),
  query text not null check (length(query) between 1 and 4000),
  status text not null default 'running' check (status in ('queued', 'running', 'complete', 'partial', 'failed')),
  idempotency_key text not null,
  result_count integer not null default 0 check (result_count between 0 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_slug, idempotency_key)
);

create table if not exists public.client_research_records (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  research_run_id uuid not null references public.client_research_runs(id) on delete cascade,
  notebook_id uuid references public.client_notebooks(id) on delete set null,
  source_url text not null check (length(source_url) between 12 and 2000),
  retrieved_at timestamptz not null,
  fields jsonb not null default '{}'::jsonb,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  status text not null check (status in ('complete', 'partial', 'failed')),
  failure_reason text,
  unique (tenant_slug, research_run_id, source_url)
);

create table if not exists public.client_research_citations (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  research_run_id uuid not null references public.client_research_runs(id) on delete cascade,
  research_record_id uuid not null references public.client_research_records(id) on delete cascade,
  url text not null check (length(url) between 12 and 2000),
  title text,
  retrieved_at timestamptz not null,
  evidence text not null check (length(evidence) between 1 and 4000),
  unique (tenant_slug, research_record_id, url)
);

create index if not exists client_research_runs_tenant_created_idx
  on public.client_research_runs (tenant_slug, created_at desc);
create index if not exists client_research_records_tenant_run_idx
  on public.client_research_records (tenant_slug, research_run_id);
create index if not exists client_research_citations_tenant_run_idx
  on public.client_research_citations (tenant_slug, research_run_id);

-- Keep persistence failures diagnosable without returning database details from
-- the worker RPC. This records only the SQLSTATE class and whether the failure
-- happened while starting an empty run or persisting provider records.
create table if not exists public.client_research_worker_failures (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  job_id uuid references public.client_runtime_jobs(id) on delete set null,
  idempotency_key text not null,
  phase text not null check (phase in ('initial', 'final')),
  sqlstate text not null check (length(sqlstate) between 5 and 5),
  record_count integer not null default 0 check (record_count between 0 and 20),
  created_at timestamptz not null default now()
);

create index if not exists client_research_worker_failures_tenant_created_idx
  on public.client_research_worker_failures (tenant_slug, created_at desc);

alter table public.client_research_runs enable row level security;
alter table public.client_research_records enable row level security;
alter table public.client_research_citations enable row level security;
alter table public.client_research_worker_failures enable row level security;

drop policy if exists client_research_runs_member_select on public.client_research_runs;
create policy client_research_runs_member_select on public.client_research_runs
  for select to authenticated using (public.client_member(tenant_slug));
drop policy if exists client_research_records_member_select on public.client_research_records;
create policy client_research_records_member_select on public.client_research_records
  for select to authenticated using (public.client_member(tenant_slug));
drop policy if exists client_research_citations_member_select on public.client_research_citations;
create policy client_research_citations_member_select on public.client_research_citations
  for select to authenticated using (public.client_member(tenant_slug));
drop policy if exists client_research_worker_failures_member_select on public.client_research_worker_failures;
create policy client_research_worker_failures_member_select on public.client_research_worker_failures
  for select to authenticated using (public.client_member(tenant_slug));

revoke all on public.client_research_runs, public.client_research_records, public.client_research_citations from anon;
grant select on public.client_research_runs, public.client_research_records, public.client_research_citations to authenticated;
revoke all on public.client_research_worker_failures from anon;
grant select on public.client_research_worker_failures to authenticated;

create or replace function public.record_client_research_result_worker(
  p_tenant_slug text,
  p_job_id uuid,
  p_worker_token text,
  p_idempotency_key text,
  p_provider text,
  p_query text,
  p_notebook_id uuid,
  p_records jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_research_run_id uuid;
  v_research_record_id uuid;
  item jsonb;
  citation jsonb;
  safe_status text;
begin
  if p_worker_token is null or length(p_worker_token) < 24
     or not exists (
       select 1 from public.client_tenants
       where slug = p_tenant_slug
         and status = 'active'
         and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     )
     or p_job_id is null
     or length(coalesce(p_idempotency_key, '')) < 8
     or length(coalesce(p_provider, '')) < 2
     or length(coalesce(p_query, '')) < 1
     or jsonb_typeof(p_records) <> 'array'
     or jsonb_array_length(p_records) > 20 then
    return null;
  end if;

  if p_notebook_id is not null and not exists (
    select 1 from public.client_notebooks
    where id = p_notebook_id and tenant_slug = p_tenant_slug
  ) then
    return null;
  end if;

  insert into public.client_research_runs
    (tenant_slug, notebook_id, job_id, provider, query, status, idempotency_key, result_count, updated_at)
  values
    (p_tenant_slug, p_notebook_id, p_job_id, left(p_provider, 120), left(p_query, 4000), 'running', left(p_idempotency_key, 180), jsonb_array_length(p_records), now())
  on conflict (tenant_slug, idempotency_key) do update
    set notebook_id = excluded.notebook_id,
        job_id = excluded.job_id,
        provider = excluded.provider,
        query = excluded.query,
        result_count = excluded.result_count,
        updated_at = now()
  returning id into v_research_run_id;

  for item in select value from jsonb_array_elements(p_records)
  loop
    if jsonb_typeof(item) <> 'object'
       or length(coalesce(item->>'sourceUrl', '')) < 12
       or item->>'retrievedAt' is null
       or item->>'status' not in ('complete', 'partial', 'failed') then
      return null;
    end if;

    safe_status := item->>'status';
    insert into public.client_research_records
      (tenant_slug, research_run_id, notebook_id, source_url, retrieved_at, fields, confidence, status, failure_reason)
    values
      (p_tenant_slug, v_research_run_id, p_notebook_id, left(item->>'sourceUrl', 2000), (item->>'retrievedAt')::timestamptz, coalesce(item->'fields', '{}'::jsonb), greatest(0, least(1, coalesce((item->>'confidence')::numeric, 0))), safe_status, nullif(left(item->>'failureReason', 500), ''))
    on conflict (tenant_slug, research_run_id, source_url) do update
      set fields = excluded.fields,
          confidence = excluded.confidence,
          status = excluded.status,
          failure_reason = excluded.failure_reason
    returning id into v_research_record_id;

    for citation in select value from jsonb_array_elements(coalesce(item->'citations', '[]'::jsonb))
    loop
      if jsonb_typeof(citation) <> 'object'
         or length(coalesce(citation->>'url', '')) < 12
         or length(coalesce(citation->>'evidence', '')) < 1
         or citation->>'retrievedAt' is null then
        return null;
      end if;
      insert into public.client_research_citations
        (tenant_slug, research_run_id, research_record_id, url, title, retrieved_at, evidence)
      values
        (p_tenant_slug, v_research_run_id, v_research_record_id, left(citation->>'url', 2000), nullif(left(citation->>'title', 240), ''), (citation->>'retrievedAt')::timestamptz, left(citation->>'evidence', 4000))
      on conflict (tenant_slug, research_record_id, url) do update
        set title = excluded.title, retrieved_at = excluded.retrieved_at, evidence = excluded.evidence;
    end loop;
  end loop;

  update public.client_research_runs
   set status = case when jsonb_array_length(p_records) > 0 then 'complete' else 'running' end,
         updated_at = now()
   where id = v_research_run_id and tenant_slug = p_tenant_slug;
  return v_research_run_id;
exception when others then
  begin
    insert into public.client_research_worker_failures
      (tenant_slug, job_id, idempotency_key, phase, sqlstate, record_count)
    values
      (p_tenant_slug, p_job_id, left(coalesce(p_idempotency_key, ''), 180),
       case when jsonb_array_length(coalesce(p_records, '[]'::jsonb)) = 0 then 'initial' else 'final' end,
       sqlstate, least(20, greatest(0, jsonb_array_length(coalesce(p_records, '[]'::jsonb)))));
  exception when others then
    null;
  end;
  return null;
end;
$$;

revoke all on function public.record_client_research_result_worker(text, uuid, text, text, text, text, uuid, jsonb) from public, authenticated;
grant execute on function public.record_client_research_result_worker(text, uuid, text, text, text, text, uuid, jsonb) to anon;

-- The worker creates the durable run before contacting Firecrawl, then moves
-- it to a terminal state on every provider/persistence branch. This prevents
-- an accepted job from disappearing from the member's research history when
-- the provider fails or returns an invalid payload.
create or replace function public.update_client_research_run_worker(
  p_tenant_slug text,
  p_job_id uuid,
  p_worker_token text,
  p_idempotency_key text,
  p_status text,
  p_error_code text,
  p_result_count integer,
  p_notebook_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_worker_token is null or length(p_worker_token) < 24
     or not exists (
       select 1 from public.client_tenants
       where slug = p_tenant_slug
         and status = 'active'
         and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     )
     or p_job_id is null
     or length(coalesce(p_idempotency_key, '')) < 8
     or p_status not in ('queued', 'running', 'complete', 'partial', 'failed')
     or (p_result_count is not null and (p_result_count < 0 or p_result_count > 20))
     or (p_notebook_id is not null and not exists (
       select 1 from public.client_notebooks
       where id = p_notebook_id and tenant_slug = p_tenant_slug
     )) then
    return false;
  end if;

  update public.client_research_runs
     set status = p_status,
         notebook_id = coalesce(p_notebook_id, notebook_id),
         result_count = coalesce(p_result_count, result_count),
         updated_at = now()
   where tenant_slug = p_tenant_slug
     and job_id = p_job_id
     and idempotency_key = left(p_idempotency_key, 180);
  return found;
exception when others then
  return false;
end;
$$;

revoke all on function public.update_client_research_run_worker(text, uuid, text, text, text, text, integer, uuid) from public, authenticated;
grant execute on function public.update_client_research_run_worker(text, uuid, text, text, text, text, integer, uuid) to anon;

-- Authenticated tenant members may delete one research run and its derived
-- records/citations. The foreign-key cascades remove the derived lineage;
-- the runtime job remains as the minimal audit/idempotency record.
create or replace function public.delete_client_research_run(
  p_tenant_slug text,
  p_research_run_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_tenant_slug is null
     or p_research_run_id is null
     or not public.client_member(p_tenant_slug) then
    return false;
  end if;

  delete from public.client_research_runs
   where id = p_research_run_id
     and tenant_slug = p_tenant_slug;
  return found;
exception when others then
  return false;
end;
$$;

revoke all on function public.delete_client_research_run(text, uuid) from public, anon;
grant execute on function public.delete_client_research_run(text, uuid) to authenticated;
