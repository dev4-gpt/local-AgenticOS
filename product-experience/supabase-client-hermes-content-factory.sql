-- Hosted Hermes Content Factory. Apply after the client runtime control-plane
-- and records migrations. One row is the durable workflow envelope; its JSONB
-- fields are intentionally bounded stage evidence, not an ungoverned blob.

create table if not exists public.client_hermes_content_factory_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id),
  workflow_id text not null check (workflow_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{1,99}$'),
  idempotency_key text not null check (length(idempotency_key) between 1 and 128),
  content_type text not null check (content_type in ('article', 'social', 'email', 'video', 'campaign')),
  brief text not null check (length(brief) between 12 and 4000),
  plan jsonb not null,
  stages jsonb not null default '[]'::jsonb,
  citations jsonb not null default '[]'::jsonb,
  quality_report jsonb,
  approval jsonb,
  delivery jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'awaiting_approval', 'approved', 'published', 'failed')),
  current_stage text not null default 'brief',
  job_id uuid references public.client_runtime_jobs(id) on delete set null,
  error_code text check (length(error_code) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_slug, workflow_id),
  unique (tenant_slug, idempotency_key)
);

create index if not exists client_hermes_factory_tenant_idx
  on public.client_hermes_content_factory_runs (tenant_slug, created_at desc);
create index if not exists client_hermes_factory_job_idx
  on public.client_hermes_content_factory_runs (tenant_slug, job_id)
  where job_id is not null;

-- The run envelope is convenient for polling. These child tables are the
-- durable records behind it, so evidence and decisions remain auditable.
create table if not exists public.client_hermes_content_factory_stage_outputs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.client_hermes_content_factory_runs(id) on delete cascade,
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  stage text not null check (stage in ('brief', 'research', 'plan', 'draft', 'assets', 'quality', 'approval', 'publish')),
  status text not null check (status in ('pending', 'running', 'complete', 'failed')),
  output_record_id text, artifact_id text, citation_record_id text, quality_report_id text,
  error_code text, output jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (run_id, stage)
);

create table if not exists public.client_hermes_content_factory_citations (
  id text not null,
  run_id uuid not null references public.client_hermes_content_factory_runs(id) on delete cascade,
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  url text not null, title text, retrieved_at timestamptz not null, evidence text not null,
  created_at timestamptz not null default now(), primary key (run_id, id)
);

create table if not exists public.client_hermes_content_factory_quality_reports (
  id text not null,
  run_id uuid not null references public.client_hermes_content_factory_runs(id) on delete cascade,
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  passed boolean not null, score numeric not null check (score between 0 and 100),
  citation_count integer not null check (citation_count >= 0), findings jsonb not null default '[]'::jsonb,
  checked_at timestamptz not null, created_at timestamptz not null default now(),
  primary key (run_id, id), unique (run_id)
);

create table if not exists public.client_hermes_content_factory_approvals (
  id text not null,
  run_id uuid not null references public.client_hermes_content_factory_runs(id) on delete cascade,
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  workflow_id text not null, approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null, created_at timestamptz not null default now(),
  primary key (run_id, id), unique (run_id)
);

create table if not exists public.client_hermes_content_factory_deliveries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.client_hermes_content_factory_runs(id) on delete cascade,
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  workflow_id text not null, destination text not null,
  status text not null check (status in ('blocked', 'queued', 'recorded')),
  approval_id text, artifact_id text, created_at timestamptz not null default now(), unique (run_id)
);

create index if not exists client_hermes_factory_stage_tenant_idx on public.client_hermes_content_factory_stage_outputs (tenant_slug, run_id);
create index if not exists client_hermes_factory_citation_tenant_idx on public.client_hermes_content_factory_citations (tenant_slug, run_id);
create index if not exists client_hermes_factory_quality_tenant_idx on public.client_hermes_content_factory_quality_reports (tenant_slug, run_id);
create index if not exists client_hermes_factory_approval_tenant_idx on public.client_hermes_content_factory_approvals (tenant_slug, run_id);
create index if not exists client_hermes_factory_delivery_tenant_idx on public.client_hermes_content_factory_deliveries (tenant_slug, run_id);

alter table public.client_hermes_content_factory_runs enable row level security;
alter table public.client_hermes_content_factory_stage_outputs enable row level security;
alter table public.client_hermes_content_factory_citations enable row level security;
alter table public.client_hermes_content_factory_quality_reports enable row level security;
alter table public.client_hermes_content_factory_approvals enable row level security;
alter table public.client_hermes_content_factory_deliveries enable row level security;
drop policy if exists client_hermes_factory_member_select on public.client_hermes_content_factory_runs;
create policy client_hermes_factory_member_select on public.client_hermes_content_factory_runs
  for select to authenticated using (public.client_member(tenant_slug));
drop policy if exists client_hermes_factory_member_insert on public.client_hermes_content_factory_runs;
create policy client_hermes_factory_member_insert on public.client_hermes_content_factory_runs
  for insert to authenticated with check (public.client_member(tenant_slug) and created_by = auth.uid());
drop policy if exists client_hermes_factory_member_update on public.client_hermes_content_factory_runs;
create policy client_hermes_factory_member_update on public.client_hermes_content_factory_runs
  for update to authenticated using (public.client_member(tenant_slug)) with check (public.client_member(tenant_slug));
drop policy if exists client_hermes_factory_member_delete on public.client_hermes_content_factory_runs;
create policy client_hermes_factory_member_delete on public.client_hermes_content_factory_runs
  for delete to authenticated using (public.client_member(tenant_slug));
grant select, insert, update, delete on public.client_hermes_content_factory_runs to authenticated;

drop policy if exists client_hermes_factory_stage_member_select on public.client_hermes_content_factory_stage_outputs;
create policy client_hermes_factory_stage_member_select on public.client_hermes_content_factory_stage_outputs for select to authenticated using (public.client_member(tenant_slug));
drop policy if exists client_hermes_factory_stage_member_insert on public.client_hermes_content_factory_stage_outputs;
create policy client_hermes_factory_stage_member_insert on public.client_hermes_content_factory_stage_outputs for insert to authenticated with check (public.client_member(tenant_slug));
drop policy if exists client_hermes_factory_stage_member_update on public.client_hermes_content_factory_stage_outputs;
create policy client_hermes_factory_stage_member_update on public.client_hermes_content_factory_stage_outputs for update to authenticated using (public.client_member(tenant_slug)) with check (public.client_member(tenant_slug));
grant select, insert, update on public.client_hermes_content_factory_stage_outputs to authenticated;

drop policy if exists client_hermes_factory_citation_member_select on public.client_hermes_content_factory_citations;
create policy client_hermes_factory_citation_member_select on public.client_hermes_content_factory_citations for select to authenticated using (public.client_member(tenant_slug));
drop policy if exists client_hermes_factory_citation_member_insert on public.client_hermes_content_factory_citations;
create policy client_hermes_factory_citation_member_insert on public.client_hermes_content_factory_citations for insert to authenticated with check (public.client_member(tenant_slug));
grant select, insert on public.client_hermes_content_factory_citations to authenticated;

drop policy if exists client_hermes_factory_quality_member_select on public.client_hermes_content_factory_quality_reports;
create policy client_hermes_factory_quality_member_select on public.client_hermes_content_factory_quality_reports for select to authenticated using (public.client_member(tenant_slug));
drop policy if exists client_hermes_factory_quality_member_insert on public.client_hermes_content_factory_quality_reports;
create policy client_hermes_factory_quality_member_insert on public.client_hermes_content_factory_quality_reports for insert to authenticated with check (public.client_member(tenant_slug));
grant select, insert on public.client_hermes_content_factory_quality_reports to authenticated;

drop policy if exists client_hermes_factory_approval_member_select on public.client_hermes_content_factory_approvals;
create policy client_hermes_factory_approval_member_select on public.client_hermes_content_factory_approvals for select to authenticated using (public.client_member(tenant_slug));
grant select on public.client_hermes_content_factory_approvals to authenticated;

drop policy if exists client_hermes_factory_delivery_member_select on public.client_hermes_content_factory_deliveries;
create policy client_hermes_factory_delivery_member_select on public.client_hermes_content_factory_deliveries for select to authenticated using (public.client_member(tenant_slug));
grant select on public.client_hermes_content_factory_deliveries to authenticated;

drop function if exists public.update_client_hermes_content_factory_worker(text, text, uuid, jsonb);
create or replace function public.update_client_hermes_content_factory_worker(
  p_tenant_slug text,
  p_worker_token text,
  p_job_id uuid,
  p_patch jsonb
) returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
declare v_run_id uuid;
begin
  if p_worker_token is null or length(p_worker_token) < 24 or p_patch is null
     or jsonb_typeof(p_patch) <> 'object'
     or not exists (
       select 1 from public.client_tenants
       where slug = p_tenant_slug and status = 'active'
         and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     ) then return false; end if;

  select id into v_run_id from public.client_hermes_content_factory_runs
    where tenant_slug = p_tenant_slug and job_id = p_job_id for update;
  if v_run_id is null then return false; end if;

  update public.client_hermes_content_factory_runs
     set status = coalesce(nullif(p_patch->>'status', ''), status),
         current_stage = coalesce(nullif(p_patch->>'current_stage', ''), current_stage),
         stages = coalesce(p_patch->'stages', stages),
         citations = coalesce(p_patch->'citations', citations),
         quality_report = coalesce(p_patch->'quality_report', quality_report),
         approval = coalesce(p_patch->'approval', approval),
         delivery = coalesce(p_patch->'delivery', delivery),
         error_code = case when p_patch ? 'error_code' then left(p_patch->>'error_code', 120) else error_code end,
         updated_at = now()
   where id = v_run_id;

  if p_patch ? 'stages' and jsonb_typeof(p_patch->'stages') = 'array' then
    insert into public.client_hermes_content_factory_stage_outputs
      (run_id, tenant_slug, stage, status, output_record_id, artifact_id, citation_record_id, quality_report_id, error_code, output)
    select v_run_id, p_tenant_slug, item->>'stage', item->>'status', item->>'outputRecordId', item->>'artifactId', item->>'citationRecordId', item->>'qualityReportId', item->>'errorCode', item->'output'
      from jsonb_array_elements(p_patch->'stages') item where item ? 'stage'
    on conflict (run_id, stage) do update set
      status = excluded.status, output_record_id = excluded.output_record_id, artifact_id = excluded.artifact_id,
      citation_record_id = excluded.citation_record_id, quality_report_id = excluded.quality_report_id,
      error_code = excluded.error_code, output = excluded.output, updated_at = now();
  end if;

  if p_patch ? 'citations' and jsonb_typeof(p_patch->'citations') = 'array' then
    insert into public.client_hermes_content_factory_citations (id, run_id, tenant_slug, url, title, retrieved_at, evidence)
    select item->>'id', v_run_id, p_tenant_slug, item->>'url', nullif(item->>'title', ''), (item->>'retrievedAt')::timestamptz, left(item->>'evidence', 20000)
      from jsonb_array_elements(p_patch->'citations') item where item->>'id' is not null and item->>'url' is not null
    on conflict (run_id, id) do update set url = excluded.url, title = excluded.title, retrieved_at = excluded.retrieved_at, evidence = excluded.evidence;
  end if;

  if p_patch ? 'quality_report' and jsonb_typeof(p_patch->'quality_report') = 'object' then
    insert into public.client_hermes_content_factory_quality_reports (id, run_id, tenant_slug, passed, score, citation_count, findings, checked_at)
    values (p_patch->'quality_report'->>'id', v_run_id, p_tenant_slug, coalesce((p_patch->'quality_report'->>'passed')::boolean, false), coalesce((p_patch->'quality_report'->>'score')::numeric, 0), coalesce((p_patch->'quality_report'->>'citationCount')::integer, 0), coalesce(p_patch->'quality_report'->'findings', '[]'::jsonb), (p_patch->'quality_report'->>'checkedAt')::timestamptz)
    on conflict (run_id) do update set id = excluded.id, passed = excluded.passed, score = excluded.score, citation_count = excluded.citation_count, findings = excluded.findings, checked_at = excluded.checked_at;
  end if;
  return found;
end;
$$;
revoke all on function public.update_client_hermes_content_factory_worker(text, text, uuid, jsonb) from public, authenticated;
grant execute on function public.update_client_hermes_content_factory_worker(text, text, uuid, jsonb) to anon;

drop function if exists public.record_client_hermes_content_factory_approval(text, uuid, text, text, timestamptz);
create or replace function public.record_client_hermes_content_factory_approval(
  p_tenant_slug text, p_run_id uuid, p_workflow_id text, p_approved_by text, p_approved_at timestamptz
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_run public.client_hermes_content_factory_runs%rowtype; v_approval_id text;
begin
  if not public.client_member(p_tenant_slug) or p_approved_by <> auth.uid()::text then return null; end if;
  select * into v_run from public.client_hermes_content_factory_runs where id = p_run_id and tenant_slug = p_tenant_slug for update;
  if not found or v_run.workflow_id <> p_workflow_id or v_run.status <> 'awaiting_approval' then return null; end if;
  v_approval_id := 'approval-' || p_run_id::text;
  insert into public.client_hermes_content_factory_approvals (id, run_id, tenant_slug, workflow_id, approved_by, approved_at)
  values (v_approval_id, p_run_id, p_tenant_slug, p_workflow_id, auth.uid(), p_approved_at)
  on conflict (run_id) do update set approved_by = excluded.approved_by, approved_at = excluded.approved_at;
  update public.client_hermes_content_factory_runs set approval = jsonb_build_object('id', v_approval_id, 'workflowId', p_workflow_id, 'tenantSlug', p_tenant_slug, 'approvedBy', p_approved_by, 'approvedAt', p_approved_at), status = 'approved', current_stage = 'publish', updated_at = now() where id = p_run_id;
  return jsonb_build_object('id', v_approval_id, 'workflowId', p_workflow_id, 'tenantSlug', p_tenant_slug, 'approvedBy', p_approved_by, 'approvedAt', p_approved_at);
end; $$;
grant execute on function public.record_client_hermes_content_factory_approval(text, uuid, text, text, timestamptz) to authenticated;

drop function if exists public.record_client_hermes_content_factory_delivery(text, uuid, text);
create or replace function public.record_client_hermes_content_factory_delivery(
  p_tenant_slug text, p_run_id uuid, p_destination text
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_run public.client_hermes_content_factory_runs%rowtype; v_delivery public.client_hermes_content_factory_deliveries%rowtype;
begin
  if not public.client_member(p_tenant_slug) then return null; end if;
  select * into v_run from public.client_hermes_content_factory_runs where id = p_run_id and tenant_slug = p_tenant_slug for update;
  if not found then return null; end if;
  if v_run.status = 'published' and v_run.delivery is not null then return v_run.delivery; end if;
  if v_run.status <> 'approved' or v_run.approval is null or v_run.approval->>'tenantSlug' <> p_tenant_slug or v_run.approval->>'workflowId' <> v_run.workflow_id then return null; end if;
  insert into public.client_hermes_content_factory_deliveries (run_id, tenant_slug, workflow_id, destination, status, approval_id)
  values (p_run_id, p_tenant_slug, v_run.workflow_id, p_destination, 'recorded', v_run.approval->>'id')
  on conflict (run_id) do update set destination = excluded.destination;
  select * into v_delivery from public.client_hermes_content_factory_deliveries where run_id = p_run_id;
  update public.client_hermes_content_factory_runs set delivery = jsonb_build_object('id', v_delivery.id, 'workflowId', v_run.workflow_id, 'tenantSlug', p_tenant_slug, 'destination', v_delivery.destination, 'status', v_delivery.status, 'approvalId', v_delivery.approval_id), status = 'published', current_stage = 'publish', updated_at = now() where id = p_run_id;
  return jsonb_build_object('id', v_delivery.id, 'workflowId', v_run.workflow_id, 'tenantSlug', p_tenant_slug, 'destination', v_delivery.destination, 'status', v_delivery.status, 'approvalId', v_delivery.approval_id);
end; $$;
grant execute on function public.record_client_hermes_content_factory_delivery(text, uuid, text) to authenticated;
