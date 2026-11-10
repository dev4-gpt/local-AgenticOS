-- Apply after visual-QA, runtime-artifact, and 28-day tenant-retention SQL.
-- Findings inherit the report's age because findings do not store timestamps.

begin;

create index if not exists client_visual_qa_reports_retention_idx
  on public.client_visual_qa_reports (tenant_slug, created_at, id);
create index if not exists client_visual_qa_findings_retention_idx
  on public.client_visual_qa_findings (tenant_slug, report_id, id);

create or replace function public.guard_client_visual_qa_retention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_retention_days integer;
  v_parent_created_at timestamptz;
  v_artifact_created_at timestamptz;
  v_artifact_expires_at timestamptz;
begin
  select retention_days into v_retention_days
  from public.client_tenants where slug = new.tenant_slug;
  if v_retention_days is null or v_retention_days < 1 or v_retention_days > 28 then
    raise exception 'client_visual_qa_retention_tenant_not_configured';
  end if;

  if tg_table_name = 'client_visual_qa_reports' then
    if tg_op = 'INSERT' then
      select created_at, retention_expires_at
      into v_artifact_created_at, v_artifact_expires_at
      from public.client_runtime_artifacts
      where id = new.artifact_id and tenant_slug = new.tenant_slug;
      if not found then
        raise exception 'client_visual_qa_artifact_expired_or_foreign';
      end if;
      v_artifact_expires_at := least(
        coalesce(v_artifact_expires_at,
          v_artifact_created_at + make_interval(days => v_retention_days)),
        v_artifact_created_at + make_interval(days => v_retention_days)
      );
      if v_artifact_expires_at <= now() then
        raise exception 'client_visual_qa_artifact_expired_or_foreign';
      end if;
      new.created_at := now();
    else
      if new.tenant_slug is distinct from old.tenant_slug
         or new.artifact_id is distinct from old.artifact_id
         or new.job_id is distinct from old.job_id
         or new.created_at is distinct from old.created_at then
        raise exception 'client_visual_qa_retention_immutable';
      end if;
      if old.created_at <= now() - make_interval(days => v_retention_days) then
        raise exception 'client_visual_qa_report_expired';
      end if;
    end if;
    return new;
  end if;

  select created_at into v_parent_created_at
  from public.client_visual_qa_reports
  where id = new.report_id and tenant_slug = new.tenant_slug;
  if not found or v_parent_created_at <= now() - make_interval(days => v_retention_days) then
    raise exception 'client_visual_qa_report_expired_or_foreign';
  end if;
  if tg_op = 'UPDATE' and (new.tenant_slug is distinct from old.tenant_slug
      or new.report_id is distinct from old.report_id) then
    raise exception 'client_visual_qa_retention_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_client_visual_qa_report_retention on public.client_visual_qa_reports;
create trigger guard_client_visual_qa_report_retention
  before insert or update on public.client_visual_qa_reports
  for each row execute function public.guard_client_visual_qa_retention();
drop trigger if exists guard_client_visual_qa_finding_retention on public.client_visual_qa_findings;
create trigger guard_client_visual_qa_finding_retention
  before insert or update on public.client_visual_qa_findings
  for each row execute function public.guard_client_visual_qa_retention();

drop policy if exists client_visual_qa_reports_member_select on public.client_visual_qa_reports;
create policy client_visual_qa_reports_member_select on public.client_visual_qa_reports
  for select to authenticated using (
    public.client_member(tenant_slug)
    and created_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug))
  );
drop policy if exists client_visual_qa_findings_member_select on public.client_visual_qa_findings;
create policy client_visual_qa_findings_member_select on public.client_visual_qa_findings
  for select to authenticated using (
    public.client_member(tenant_slug)
    and exists (
      select 1 from public.client_visual_qa_reports as report
      where report.id = client_visual_qa_findings.report_id
        and report.tenant_slug = client_visual_qa_findings.tenant_slug
        and report.created_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug))
    )
  );

create or replace function public.purge_expired_client_visual_qa(
  p_tenant_slug text,
  p_apply boolean default false,
  p_batch_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_retention_days integer;
  v_cutoff timestamptz;
  v_candidates jsonb;
  v_deleted jsonb := jsonb_build_object('findings', 0, 'reports', 0);
  v_remaining jsonb;
  v_deleted_findings integer := 0;
  v_deleted_reports integer := 0;
begin
  if p_tenant_slug is null or p_tenant_slug !~ '^[a-z][a-z0-9-]{2,40}$'
     or p_apply is null or p_batch_limit is null
     or p_batch_limit < 1 or p_batch_limit > 500 then
    raise exception 'client_visual_qa_retention_invalid_input';
  end if;

  select retention_days into v_retention_days
  from public.client_tenants where slug = p_tenant_slug for update;
  if not found then
    raise exception 'client_visual_qa_retention_tenant_not_found';
  end if;
  if v_retention_days is null or v_retention_days < 1 or v_retention_days > 28 then
    raise exception 'client_visual_qa_retention_tenant_not_configured';
  end if;
  v_cutoff := now() - make_interval(days => v_retention_days + 7);

  select jsonb_build_object(
    'reports', (select count(*) from public.client_visual_qa_reports where tenant_slug = p_tenant_slug and created_at <= v_cutoff),
    'findings', (select count(*) from public.client_visual_qa_findings as finding
      join public.client_visual_qa_reports as report on report.id = finding.report_id and report.tenant_slug = finding.tenant_slug
      where finding.tenant_slug = p_tenant_slug and report.created_at <= v_cutoff)
  ) into v_candidates;

  if p_apply then
    with selected as (
      select finding.id
      from public.client_visual_qa_findings as finding
      join public.client_visual_qa_reports as report on report.id = finding.report_id and report.tenant_slug = finding.tenant_slug
      where finding.tenant_slug = p_tenant_slug and report.created_at <= v_cutoff
      order by report.created_at, finding.id limit p_batch_limit for update of finding skip locked
    ), removed as (
      delete from public.client_visual_qa_findings as finding using selected
      where finding.id = selected.id and finding.tenant_slug = p_tenant_slug returning finding.id
    ) select count(*) into v_deleted_findings from removed;

    with selected as (
      select report.id from public.client_visual_qa_reports as report
      where report.tenant_slug = p_tenant_slug and report.created_at <= v_cutoff
        and not exists (select 1 from public.client_visual_qa_findings as finding
          where finding.tenant_slug = p_tenant_slug and finding.report_id = report.id)
      order by report.created_at, report.id limit p_batch_limit for update of report skip locked
    ), removed as (
      delete from public.client_visual_qa_reports as report using selected
      where report.id = selected.id and report.tenant_slug = p_tenant_slug returning report.id
    ) select count(*) into v_deleted_reports from removed;

    v_deleted := jsonb_build_object('findings', v_deleted_findings, 'reports', v_deleted_reports);
    if v_deleted_findings + v_deleted_reports > 0 then
      insert into public.client_runtime_audit_events (tenant_slug, event_type, metadata)
      values (p_tenant_slug, 'tenant.visual_qa.retention_purged', jsonb_build_object(
        'deleted', v_deleted, 'retentionDays', v_retention_days,
        'recoveryDays', 7, 'purgeAfterDays', v_retention_days + 7));
    end if;
  end if;

  select jsonb_build_object(
    'reports', (select count(*) from public.client_visual_qa_reports where tenant_slug = p_tenant_slug and created_at <= v_cutoff),
    'findings', (select count(*) from public.client_visual_qa_findings as finding
      join public.client_visual_qa_reports as report on report.id = finding.report_id and report.tenant_slug = finding.tenant_slug
      where finding.tenant_slug = p_tenant_slug and report.created_at <= v_cutoff)
  ) into v_remaining;

  return jsonb_build_object('tenant', p_tenant_slug, 'cutoff', v_cutoff,
    'retentionDays', v_retention_days, 'recoveryDays', 7, 'purgeAfterDays', v_retention_days + 7,
    'candidates', v_candidates, 'deleted', v_deleted, 'remainingCandidates', v_remaining,
    'applied', p_apply, 'scope', jsonb_build_array('client_visual_qa_reports', 'client_visual_qa_findings'));
end;
$$;

revoke all on function public.guard_client_visual_qa_retention() from public, anon, authenticated;
revoke all on function public.purge_expired_client_visual_qa(text, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.purge_expired_client_visual_qa(text, boolean, integer)
  to service_role;

commit;
