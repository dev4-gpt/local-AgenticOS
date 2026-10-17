-- Apply after the client runtime control plane, v48 learning-reference guard,
-- and 28-day tenant policy.
-- Job payloads stop being member-readable at active expiry and are purged
-- after the seven-day recovery window by a bounded service-role operation.

begin;

do $$
begin
  if to_regclass('public.client_learning_items') is not null then
    if to_regprocedure('public.client_learning_retention_references_ready()') is null then
      raise exception 'client_runtime_job_retention_learning_reference_guard_missing';
    end if;
    if not public.client_learning_retention_references_ready() then
      raise exception 'client_runtime_job_retention_learning_reference_guard_invalid';
    end if;
  end if;
end;
$$;

create index if not exists client_runtime_jobs_tenant_retention_idx
  on public.client_runtime_jobs (tenant_slug, created_at, id);

create or replace function public.guard_client_runtime_job_retention()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    return new;
  end if;
  if new.tenant_slug is distinct from old.tenant_slug
     or new.created_at is distinct from old.created_at then
    raise exception 'client_runtime_job_retention_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_client_runtime_job_retention on public.client_runtime_jobs;
create trigger guard_client_runtime_job_retention
  before insert or update on public.client_runtime_jobs
  for each row execute function public.guard_client_runtime_job_retention();

drop policy if exists client_jobs_member_select on public.client_runtime_jobs;
create policy client_jobs_member_select on public.client_runtime_jobs
  for select to authenticated
  using (
    public.client_member(tenant_slug)
    and created_at > now() - make_interval(
      days => public.client_tenant_retention_days(tenant_slug)
    )
  );

create or replace function public.purge_expired_client_runtime_jobs(
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
  v_candidates integer;
  v_deleted integer := 0;
  v_remaining integer;
begin
  if p_tenant_slug is null or p_tenant_slug !~ '^[a-z][a-z0-9-]{2,40}$'
     or p_apply is null or p_batch_limit is null
     or p_batch_limit < 1 or p_batch_limit > 1000 then
    raise exception 'client_runtime_job_retention_invalid_input';
  end if;

  select retention_days into v_retention_days
  from public.client_tenants
  where slug = p_tenant_slug
  for update;
  if not found then
    raise exception 'client_runtime_job_retention_tenant_not_found';
  end if;
  if v_retention_days is null or v_retention_days < 1 or v_retention_days > 28 then
    raise exception 'client_runtime_job_retention_tenant_not_configured';
  end if;
  v_cutoff := now() - make_interval(days => v_retention_days + 7);

  select count(*) into v_candidates
  from public.client_runtime_jobs
  where tenant_slug = p_tenant_slug and created_at <= v_cutoff;

  if p_apply then
    with selected as (
      select id
      from public.client_runtime_jobs
      where tenant_slug = p_tenant_slug and created_at <= v_cutoff
      order by created_at, id
      limit p_batch_limit
      for update skip locked
    ), removed as (
      delete from public.client_runtime_jobs as job
      using selected
      where job.id = selected.id and job.tenant_slug = p_tenant_slug
      returning job.id
    )
    select count(*) into v_deleted from removed;

    if v_deleted > 0 then
      insert into public.client_runtime_audit_events (tenant_slug, event_type, metadata)
      values (p_tenant_slug, 'tenant.runtime_jobs.retention_purged',
        jsonb_build_object('deleted', v_deleted, 'retentionDays', v_retention_days,
          'recoveryDays', 7, 'purgeAfterDays', v_retention_days + 7));
    end if;
  end if;

  select count(*) into v_remaining
  from public.client_runtime_jobs
  where tenant_slug = p_tenant_slug and created_at <= v_cutoff;

  return jsonb_build_object(
    'tenant', p_tenant_slug, 'cutoff', v_cutoff,
    'retentionDays', v_retention_days, 'recoveryDays', 7,
    'purgeAfterDays', v_retention_days + 7, 'candidates', v_candidates,
    'deleted', v_deleted, 'remainingCandidates', v_remaining,
    'applied', p_apply, 'scope', 'client_runtime_jobs'
  );
end;
$$;

revoke all on function public.guard_client_runtime_job_retention() from public, anon, authenticated;
revoke all on function public.purge_expired_client_runtime_jobs(text, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.purge_expired_client_runtime_jobs(text, boolean, integer)
  to service_role;

commit;
