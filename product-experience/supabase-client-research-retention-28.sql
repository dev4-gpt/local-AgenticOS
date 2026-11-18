-- Apply after supabase-client-structured-research.sql and
-- supabase-client-retention-policy-28.sql. Research payloads remain readable
-- only through each tenant's configured retention window (capped at 28 days).
-- Cleanup never relies on parent cascades for bounded child deletion.
-- Physical purge waits an additional seven recovery days after active expiry.

begin;

alter table public.client_research_records
  add column if not exists created_at timestamptz;
update public.client_research_records
set created_at = least(retrieved_at, now())
where created_at is null;
alter table public.client_research_records
  alter column created_at set default now(),
  alter column created_at set not null;

alter table public.client_research_citations
  add column if not exists created_at timestamptz;
update public.client_research_citations
set created_at = least(retrieved_at, now())
where created_at is null;
alter table public.client_research_citations
  alter column created_at set default now(),
  alter column created_at set not null;

create index if not exists client_research_records_tenant_created_idx
  on public.client_research_records (tenant_slug, created_at, id);
create index if not exists client_research_citations_tenant_created_idx
  on public.client_research_citations (tenant_slug, created_at, id);

drop policy if exists client_research_runs_member_select on public.client_research_runs;
create policy client_research_runs_member_select on public.client_research_runs
  for select to authenticated
  using (
    public.client_member(tenant_slug)
    and created_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug))
  );

drop policy if exists client_research_records_member_select on public.client_research_records;
create policy client_research_records_member_select on public.client_research_records
  for select to authenticated
  using (
    public.client_member(tenant_slug)
    and created_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug))
  );

drop policy if exists client_research_citations_member_select on public.client_research_citations;
create policy client_research_citations_member_select on public.client_research_citations
  for select to authenticated
  using (
    public.client_member(tenant_slug)
    and created_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug))
  );

drop policy if exists client_research_worker_failures_member_select on public.client_research_worker_failures;
create policy client_research_worker_failures_member_select on public.client_research_worker_failures
  for select to authenticated
  using (
    public.client_member(tenant_slug)
    and created_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug))
  );

create or replace function public.purge_expired_client_research(
  p_tenant_slug text,
  p_apply boolean default false,
  p_batch_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_retention_days integer;
  v_cutoff timestamptz;
  v_candidate_runs integer;
  v_candidate_records integer;
  v_candidate_citations integer;
  v_candidate_failures integer;
  v_deleted_runs integer := 0;
  v_deleted_records integer := 0;
  v_deleted_citations integer := 0;
  v_deleted_failures integer := 0;
  v_remaining_runs integer;
  v_remaining_records integer;
  v_remaining_citations integer;
  v_remaining_failures integer;
begin
  if p_tenant_slug is null or p_tenant_slug !~ '^[a-z][a-z0-9-]{2,40}$'
     or p_apply is null or p_batch_limit is null
     or p_batch_limit < 1 or p_batch_limit > 1000 then
    raise exception 'client_research_retention_invalid_input';
  end if;

  select retention_days into v_retention_days
  from public.client_tenants
  where slug = p_tenant_slug
  for update;
  if not found then
    raise exception 'client_research_retention_tenant_not_found';
  end if;
  if v_retention_days is null or v_retention_days < 1 or v_retention_days > 28 then
    raise exception 'client_research_retention_tenant_not_configured';
  end if;
  v_cutoff := now() - make_interval(days => v_retention_days + 7);

  select count(*) into v_candidate_runs from public.client_research_runs
   where tenant_slug = p_tenant_slug and created_at <= v_cutoff;
  select count(*) into v_candidate_records from public.client_research_records
   where tenant_slug = p_tenant_slug and created_at <= v_cutoff;
  select count(*) into v_candidate_citations from public.client_research_citations
   where tenant_slug = p_tenant_slug and created_at <= v_cutoff;
  select count(*) into v_candidate_failures from public.client_research_worker_failures
   where tenant_slug = p_tenant_slug and created_at <= v_cutoff;

  if p_apply then
    with selected as (
      select id from public.client_research_citations
       where tenant_slug = p_tenant_slug and created_at <= v_cutoff
       order by created_at, id limit p_batch_limit for update skip locked
    ), removed as (
      delete from public.client_research_citations as citation
       using selected where citation.id = selected.id
        and citation.tenant_slug = p_tenant_slug returning citation.id
    ) select count(*) into v_deleted_citations from removed;

    with selected as (
      select record.id from public.client_research_records as record
       where record.tenant_slug = p_tenant_slug and record.created_at <= v_cutoff
         and not exists (
           select 1 from public.client_research_citations as citation
           where citation.tenant_slug = record.tenant_slug
             and citation.research_record_id = record.id
         )
       order by record.created_at, record.id limit p_batch_limit for update of record skip locked
    ), removed as (
      delete from public.client_research_records as record
       using selected where record.id = selected.id
        and record.tenant_slug = p_tenant_slug returning record.id
    ) select count(*) into v_deleted_records from removed;

    with selected as (
      select run.id from public.client_research_runs as run
       where run.tenant_slug = p_tenant_slug and run.created_at <= v_cutoff
         and not exists (
           select 1 from public.client_research_records as record
           where record.tenant_slug = run.tenant_slug
             and record.research_run_id = run.id
         )
       order by run.created_at, run.id limit p_batch_limit for update of run skip locked
    ), removed as (
      delete from public.client_research_runs as run
       using selected where run.id = selected.id
        and run.tenant_slug = p_tenant_slug returning run.id
    ) select count(*) into v_deleted_runs from removed;

    with selected as (
      select id from public.client_research_worker_failures
       where tenant_slug = p_tenant_slug and created_at <= v_cutoff
       order by created_at, id limit p_batch_limit for update skip locked
    ), removed as (
      delete from public.client_research_worker_failures as failure
       using selected where failure.id = selected.id
        and failure.tenant_slug = p_tenant_slug returning failure.id
    ) select count(*) into v_deleted_failures from removed;

    if v_deleted_runs + v_deleted_records + v_deleted_citations + v_deleted_failures > 0 then
      insert into public.client_runtime_audit_events (tenant_slug, event_type, metadata)
      values (p_tenant_slug, 'tenant.research.retention_purged', jsonb_build_object(
        'runs', v_deleted_runs, 'records', v_deleted_records,
        'citations', v_deleted_citations, 'workerFailures', v_deleted_failures,
        'cutoff', v_cutoff, 'retentionDays', v_retention_days,
        'recoveryDays', 7, 'purgeAfterDays', v_retention_days + 7
      ));
    end if;
  end if;

  select count(*) into v_remaining_runs from public.client_research_runs
   where tenant_slug = p_tenant_slug and created_at <= v_cutoff;
  select count(*) into v_remaining_records from public.client_research_records
   where tenant_slug = p_tenant_slug and created_at <= v_cutoff;
  select count(*) into v_remaining_citations from public.client_research_citations
   where tenant_slug = p_tenant_slug and created_at <= v_cutoff;
  select count(*) into v_remaining_failures from public.client_research_worker_failures
   where tenant_slug = p_tenant_slug and created_at <= v_cutoff;

  return jsonb_build_object(
    'tenant', p_tenant_slug, 'cutoff', v_cutoff, 'retentionDays', v_retention_days,
    'recoveryDays', 7, 'purgeAfterDays', v_retention_days + 7,
    'candidates', jsonb_build_object('runs', v_candidate_runs, 'records', v_candidate_records,
      'citations', v_candidate_citations, 'workerFailures', v_candidate_failures),
    'deleted', jsonb_build_object('runs', v_deleted_runs, 'records', v_deleted_records,
      'citations', v_deleted_citations, 'workerFailures', v_deleted_failures),
    'remaining', jsonb_build_object('runs', v_remaining_runs, 'records', v_remaining_records,
      'citations', v_remaining_citations, 'workerFailures', v_remaining_failures),
    'applied', p_apply, 'scope', 'client_research_*'
  );
end;
$$;

revoke all on function public.purge_expired_client_research(text, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.purge_expired_client_research(text, boolean, integer)
  to service_role;

commit;
