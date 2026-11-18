-- Apply after supabase-client-paperclip.sql and the 28-day tenant policy.
-- Paperclip records expire per item; issue comments and runs cannot outlive issues.

begin;

alter table public.client_paperclip_companies add column if not exists retention_expires_at timestamptz;
alter table public.client_paperclip_projects add column if not exists retention_expires_at timestamptz;
alter table public.client_paperclip_agents add column if not exists retention_expires_at timestamptz;
alter table public.client_paperclip_issues add column if not exists retention_expires_at timestamptz;
alter table public.client_paperclip_comments add column if not exists retention_expires_at timestamptz;
alter table public.client_paperclip_runs add column if not exists retention_expires_at timestamptz;

update public.client_paperclip_companies item set retention_expires_at = greatest(item.created_at + interval '1 microsecond', least(
  coalesce(item.retention_expires_at,item.created_at + make_interval(days => tenant.retention_days)),
  item.created_at + make_interval(days => tenant.retention_days),item.created_at + interval '28 days'))
from public.client_tenants tenant where tenant.slug=item.tenant_slug
  and (item.retention_expires_at is null or item.retention_expires_at<=item.created_at
    or item.retention_expires_at>item.created_at+make_interval(days => tenant.retention_days)
    or item.retention_expires_at>item.created_at+interval '28 days');
update public.client_paperclip_projects item set retention_expires_at = greatest(item.created_at + interval '1 microsecond', least(
  coalesce(item.retention_expires_at,item.created_at + make_interval(days => tenant.retention_days)),
  item.created_at + make_interval(days => tenant.retention_days),item.created_at + interval '28 days'))
from public.client_tenants tenant where tenant.slug=item.tenant_slug
  and (item.retention_expires_at is null or item.retention_expires_at<=item.created_at
    or item.retention_expires_at>item.created_at+make_interval(days => tenant.retention_days)
    or item.retention_expires_at>item.created_at+interval '28 days');
update public.client_paperclip_agents item set retention_expires_at = greatest(item.created_at + interval '1 microsecond', least(
  coalesce(item.retention_expires_at,item.created_at + make_interval(days => tenant.retention_days)),
  item.created_at + make_interval(days => tenant.retention_days),item.created_at + interval '28 days'))
from public.client_tenants tenant where tenant.slug=item.tenant_slug
  and (item.retention_expires_at is null or item.retention_expires_at<=item.created_at
    or item.retention_expires_at>item.created_at+make_interval(days => tenant.retention_days)
    or item.retention_expires_at>item.created_at+interval '28 days');
update public.client_paperclip_issues item set retention_expires_at = greatest(item.created_at + interval '1 microsecond', least(
  coalesce(item.retention_expires_at,item.created_at + make_interval(days => tenant.retention_days)),
  item.created_at + make_interval(days => tenant.retention_days),item.created_at + interval '28 days'))
from public.client_tenants tenant where tenant.slug=item.tenant_slug
  and (item.retention_expires_at is null or item.retention_expires_at<=item.created_at
    or item.retention_expires_at>item.created_at+make_interval(days => tenant.retention_days)
    or item.retention_expires_at>item.created_at+interval '28 days');
update public.client_paperclip_runs item set retention_expires_at = greatest(item.created_at + interval '1 microsecond', least(
  coalesce(item.retention_expires_at,coalesce((select issue.retention_expires_at from public.client_paperclip_issues issue where issue.id=item.issue_id and issue.tenant_slug=item.tenant_slug),item.created_at + make_interval(days => tenant.retention_days))),
  coalesce((select issue.retention_expires_at from public.client_paperclip_issues issue where issue.id=item.issue_id and issue.tenant_slug=item.tenant_slug),item.created_at + make_interval(days => tenant.retention_days)),
  item.created_at + make_interval(days => tenant.retention_days),item.created_at + interval '28 days'))
from public.client_tenants tenant where tenant.slug=item.tenant_slug
  and item.retention_expires_at is distinct from greatest(item.created_at + interval '1 microsecond', least(
    coalesce(item.retention_expires_at,coalesce((select issue.retention_expires_at from public.client_paperclip_issues issue where issue.id=item.issue_id and issue.tenant_slug=item.tenant_slug),item.created_at + make_interval(days => tenant.retention_days))),
    coalesce((select issue.retention_expires_at from public.client_paperclip_issues issue where issue.id=item.issue_id and issue.tenant_slug=item.tenant_slug),item.created_at + make_interval(days => tenant.retention_days)),
    item.created_at + make_interval(days => tenant.retention_days),item.created_at + interval '28 days'));
update public.client_paperclip_comments item set retention_expires_at = greatest(item.created_at + interval '1 microsecond', least(
  coalesce(item.retention_expires_at,issue.retention_expires_at),issue.retention_expires_at,
  item.created_at + make_interval(days => tenant.retention_days),item.created_at + interval '28 days'))
from public.client_paperclip_issues issue,public.client_tenants tenant
where issue.id=item.issue_id and issue.tenant_slug=item.tenant_slug and tenant.slug=item.tenant_slug
  and item.retention_expires_at is distinct from greatest(item.created_at + interval '1 microsecond', least(
    coalesce(item.retention_expires_at,issue.retention_expires_at),issue.retention_expires_at,
    item.created_at + make_interval(days => tenant.retention_days),item.created_at + interval '28 days'));

alter table public.client_paperclip_projects alter column retention_expires_at set not null;
alter table public.client_paperclip_agents alter column retention_expires_at set not null;
alter table public.client_paperclip_issues alter column retention_expires_at set not null;
alter table public.client_paperclip_comments alter column retention_expires_at set not null;
alter table public.client_paperclip_runs alter column retention_expires_at set not null;
alter table public.client_paperclip_companies alter column retention_expires_at set not null;

do $$
declare item record;
begin
  for item in select * from (values
    ('client_paperclip_companies','client_paperclip_companies_retention_after_creation'),
    ('client_paperclip_projects','client_paperclip_projects_retention_after_creation'),
    ('client_paperclip_agents','client_paperclip_agents_retention_after_creation'),
    ('client_paperclip_issues','client_paperclip_issues_retention_after_creation'),
    ('client_paperclip_comments','client_paperclip_comments_retention_after_creation'),
    ('client_paperclip_runs','client_paperclip_runs_retention_after_creation')
  ) as constraints(table_name,constraint_name) loop
    if not exists(select 1 from pg_constraint where conrelid=format('public.%s',item.table_name)::regclass and conname=item.constraint_name) then
      execute format('alter table public.%I add constraint %I check (retention_expires_at > created_at) not valid',item.table_name,item.constraint_name);
    end if;
    execute format('alter table public.%I validate constraint %I',item.table_name,item.constraint_name);
  end loop;
end;
$$;

create index if not exists client_paperclip_projects_retention_idx on public.client_paperclip_projects(tenant_slug,retention_expires_at,id);
create index if not exists client_paperclip_companies_retention_idx on public.client_paperclip_companies(tenant_slug,retention_expires_at);
create index if not exists client_paperclip_agents_retention_idx on public.client_paperclip_agents(tenant_slug,retention_expires_at,id);
create index if not exists client_paperclip_issues_retention_idx on public.client_paperclip_issues(tenant_slug,retention_expires_at,id);
create index if not exists client_paperclip_comments_retention_idx on public.client_paperclip_comments(tenant_slug,retention_expires_at,id);
create index if not exists client_paperclip_runs_retention_idx on public.client_paperclip_runs(tenant_slug,retention_expires_at,id);

create or replace function public.guard_client_paperclip_retention()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_days integer;
  v_parent_expiry timestamptz;
  v_expiry timestamptz;
begin
  select retention_days into v_days from public.client_tenants where slug=new.tenant_slug;
  if v_days is null or v_days<1 or v_days>28 then raise exception 'paperclip_retention_tenant_not_configured'; end if;
  if tg_op='INSERT' then
    new.created_at:=now();
    v_expiry:=new.created_at+make_interval(days => v_days);
    if tg_table_name='client_paperclip_comments' then
      select retention_expires_at into v_parent_expiry from public.client_paperclip_issues
        where id=new.issue_id and tenant_slug=new.tenant_slug for update;
      if v_parent_expiry is null or v_parent_expiry<=now() then raise exception 'paperclip_issue_expired_or_foreign'; end if;
      v_expiry:=least(v_expiry,v_parent_expiry);
    elsif tg_table_name='client_paperclip_runs' and (to_jsonb(new)->>'issue_id') is not null then
      select retention_expires_at into v_parent_expiry from public.client_paperclip_issues
        where id=(to_jsonb(new)->>'issue_id')::uuid and tenant_slug=new.tenant_slug for update;
      if v_parent_expiry is null or v_parent_expiry<=now() then raise exception 'paperclip_issue_expired_or_foreign'; end if;
      v_expiry:=least(v_expiry,v_parent_expiry);
    end if;
    new.retention_expires_at:=least(coalesce(new.retention_expires_at,v_expiry),v_expiry,new.created_at+interval '28 days');
    if new.retention_expires_at<=new.created_at then raise exception 'paperclip_retention_expiry_invalid'; end if;
    if tg_table_name<>'client_paperclip_comments' then new.updated_at:=now(); end if;
    return new;
  end if;

  if new.tenant_slug is distinct from old.tenant_slug or new.created_at is distinct from old.created_at
     or new.retention_expires_at is distinct from old.retention_expires_at then
    raise exception 'paperclip_retention_immutable';
  end if;
  if tg_table_name='client_paperclip_comments' then
    if new.issue_id is distinct from old.issue_id then raise exception 'paperclip_retention_immutable'; end if;
    if old.retention_expires_at<=now() then raise exception 'paperclip_comment_expired'; end if;
    return new;
  end if;
  if old.retention_expires_at<=now() then
    if tg_table_name='client_paperclip_issues' then
      if (to_jsonb(new)-'project_id'-'assignee_agent_id'-'build_artifact_id'-'execution_job_id'-'updated_at')
           is distinct from (to_jsonb(old)-'project_id'-'assignee_agent_id'-'build_artifact_id'-'execution_job_id'-'updated_at')
         or (new.project_id is not null and new.project_id is distinct from old.project_id)
         or (new.assignee_agent_id is not null and new.assignee_agent_id is distinct from old.assignee_agent_id)
         or (new.build_artifact_id is not null and new.build_artifact_id is distinct from old.build_artifact_id)
         or (new.execution_job_id is not null and new.execution_job_id is distinct from old.execution_job_id) then
        raise exception 'paperclip_issue_expired';
      end if;
    elsif tg_table_name='client_paperclip_agents' then
      if (to_jsonb(new)-'reports_to'-'updated_at') is distinct from (to_jsonb(old)-'reports_to'-'updated_at')
         or (new.reports_to is not null and new.reports_to is distinct from old.reports_to) then raise exception 'paperclip_agent_expired'; end if;
    elsif tg_table_name='client_paperclip_runs' then
      if (to_jsonb(new)-'agent_id'-'job_id'-'updated_at') is distinct from (to_jsonb(old)-'agent_id'-'job_id'-'updated_at')
         or (new.agent_id is not null and new.agent_id is distinct from old.agent_id)
         or (new.job_id is not null and new.job_id is distinct from old.job_id) then raise exception 'paperclip_run_expired'; end if;
    elsif tg_table_name='client_paperclip_companies' then
      if (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then
        raise exception 'paperclip_company_expired';
      end if;
    elsif (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then
      raise exception 'paperclip_project_expired';
    end if;
    if tg_table_name<>'client_paperclip_comments' then new.updated_at:=old.updated_at; end if;
    return new;
  end if;
  if tg_table_name<>'client_paperclip_comments' then new.updated_at:=now(); end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['client_paperclip_projects','client_paperclip_agents','client_paperclip_issues','client_paperclip_comments','client_paperclip_runs'] loop
    execute format('drop trigger if exists guard_%1$s_retention on public.%1$s',t);
    execute format('create trigger guard_%1$s_retention before insert or update on public.%1$s for each row execute function public.guard_client_paperclip_retention()',t);
    execute format('drop policy if exists %1$s_member_select on public.%1$s',t);
    execute format('create policy %1$s_member_select on public.%1$s for select to authenticated using (public.client_member(tenant_slug) and retention_expires_at>now())',t);
    execute format('drop policy if exists %1$s_member_insert on public.%1$s',t);
    execute format('create policy %1$s_member_insert on public.%1$s for insert to authenticated with check (public.client_member(tenant_slug) and created_by=auth.uid() and retention_expires_at>now())',t);
    execute format('drop policy if exists %1$s_member_update on public.%1$s',t);
    execute format('create policy %1$s_member_update on public.%1$s for update to authenticated using (public.client_member(tenant_slug) and retention_expires_at>now()) with check (public.client_member(tenant_slug) and retention_expires_at>now())',t);
    execute format('drop policy if exists %1$s_member_delete on public.%1$s',t);
    execute format('create policy %1$s_member_delete on public.%1$s for delete to authenticated using (public.client_member(tenant_slug) and retention_expires_at>now())',t);
  end loop;
  drop trigger if exists guard_client_paperclip_companies_retention on public.client_paperclip_companies;
  create trigger guard_client_paperclip_companies_retention before insert or update on public.client_paperclip_companies
    for each row execute function public.guard_client_paperclip_retention();
  drop policy if exists client_paperclip_companies_member_select on public.client_paperclip_companies;
  create policy client_paperclip_companies_member_select on public.client_paperclip_companies
    for select to authenticated using (public.client_member(tenant_slug) and retention_expires_at>now());
  drop policy if exists client_paperclip_companies_member_insert on public.client_paperclip_companies;
  create policy client_paperclip_companies_member_insert on public.client_paperclip_companies
    for insert to authenticated with check (public.client_member(tenant_slug) and retention_expires_at>now());
  drop policy if exists client_paperclip_companies_member_update on public.client_paperclip_companies;
  create policy client_paperclip_companies_member_update on public.client_paperclip_companies
    for update to authenticated using (public.client_member(tenant_slug) and retention_expires_at>now())
      with check (public.client_member(tenant_slug) and retention_expires_at>now());
end;
$$;

create or replace function public.purge_expired_client_paperclip_records(p_tenant_slug text,p_apply boolean default false,p_batch_limit integer default 100)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_days integer;
  v_cutoff timestamptz:=now()-interval '7 days';
  v_tables text[]:=array['client_paperclip_comments','client_paperclip_runs','client_paperclip_issues','client_paperclip_projects','client_paperclip_agents','client_paperclip_companies'];
  v_counts integer[]:=array[0,0,0,0,0,0];
  v_candidates jsonb;
  v_deleted jsonb;
  i integer;
  n integer;
  total integer:=0;
  parent_guard text;
begin
  if p_tenant_slug is null or p_tenant_slug !~ '^[a-z][a-z0-9-]{2,40}$' or p_apply is null or p_batch_limit is null or p_batch_limit<1 or p_batch_limit>500 then
    raise exception 'paperclip_retention_invalid_input';
  end if;
  select retention_days into v_days from public.client_tenants where slug=p_tenant_slug for update;
  if not found then raise exception 'paperclip_retention_tenant_not_found'; end if;
  if v_days is null or v_days<1 or v_days>28 then raise exception 'paperclip_retention_tenant_not_configured'; end if;

  select jsonb_build_object(
    'comments',(select count(*) from public.client_paperclip_comments where tenant_slug=p_tenant_slug and retention_expires_at<=v_cutoff),
    'runs',(select count(*) from public.client_paperclip_runs where tenant_slug=p_tenant_slug and retention_expires_at<=v_cutoff),
    'issues',(select count(*) from public.client_paperclip_issues where tenant_slug=p_tenant_slug and retention_expires_at<=v_cutoff),
    'projects',(select count(*) from public.client_paperclip_projects where tenant_slug=p_tenant_slug and retention_expires_at<=v_cutoff),
    'agents',(select count(*) from public.client_paperclip_agents where tenant_slug=p_tenant_slug and retention_expires_at<=v_cutoff),
    'companies',(select count(*) from public.client_paperclip_companies where tenant_slug=p_tenant_slug and retention_expires_at<=v_cutoff)
  ) into v_candidates;
  if p_apply then
    for i in 1..array_length(v_tables,1) loop
      if v_tables[i]='client_paperclip_companies' then
        execute 'with chosen as (select ctid from public.client_paperclip_companies where tenant_slug=$1 and retention_expires_at<=$2 order by retention_expires_at,tenant_slug limit $3 for update skip locked), removed as (delete from public.client_paperclip_companies t using chosen where t.ctid=chosen.ctid returning 1) select count(*) from removed'
          into n using p_tenant_slug,v_cutoff,p_batch_limit;
      else
        -- Do not let an issue cascade bypass either bounded child batch,
        -- including remaining legacy references outside the requested tenant.
        parent_guard:=case when v_tables[i]='client_paperclip_issues' then
          'and not exists(select 1 from public.client_paperclip_comments child where child.issue_id=candidate.id) and not exists(select 1 from public.client_paperclip_runs child where child.issue_id=candidate.id)'
          else '' end;
        execute format('with chosen as (select ctid from public.%I candidate where tenant_slug=$1 and retention_expires_at<=$2 %s order by retention_expires_at,id limit $3 for update skip locked), removed as (delete from public.%I t using chosen where t.ctid=chosen.ctid returning 1) select count(*) from removed',v_tables[i],parent_guard,v_tables[i])
          into n using p_tenant_slug,v_cutoff,p_batch_limit;
      end if;
      v_counts[i]:=n; total:=total+n;
    end loop;
  end if;
  v_deleted:=case when p_apply then jsonb_build_object('comments',v_counts[1],'runs',v_counts[2],'issues',v_counts[3],'projects',v_counts[4],'agents',v_counts[5],'companies',v_counts[6]) else v_candidates end;
  if total>0 then
    insert into public.client_runtime_audit_events(tenant_slug,event_type,metadata)
    values(p_tenant_slug,'tenant.paperclip.retention_purged',jsonb_build_object('deleted',v_deleted,'retentionDays',v_days,'recoveryDays',7,'purgeAfterDays',v_days+7));
  end if;
  return jsonb_build_object('tenant',p_tenant_slug,'expiredOrPurgeDue',v_candidates,'deleted',jsonb_build_object('comments',v_counts[1],'runs',v_counts[2],'issues',v_counts[3],'projects',v_counts[4],'agents',v_counts[5],'companies',v_counts[6]),'retentionDays',v_days,'recoveryDays',7,'purgeAfterDays',v_days+7,'applied',p_apply,'batchLimitPerTable',p_batch_limit,'scope',to_jsonb(v_tables));
end;
$$;
revoke all on function public.purge_expired_client_paperclip_records(text,boolean,integer) from public,anon,authenticated;
grant execute on function public.purge_expired_client_paperclip_records(text,boolean,integer) to service_role;

create or replace function public.complete_client_paperclip_run_worker(
  p_tenant_slug text, p_worker_token text, p_job_id uuid, p_status text,
  p_summary text, p_error_code text, p_cost_micros bigint,
  p_build_artifact_id uuid, p_build_preview_html text
)
returns boolean language plpgsql security definer set search_path=public,extensions as $$
declare
  target_issue uuid; target_agent uuid;
begin
  if p_worker_token is null or length(p_worker_token)<24 or p_status is null or p_status not in ('running','succeeded','failed','cancelled')
    or not exists(select 1 from public.client_tenants where slug=p_tenant_slug and status='active' and worker_token_hash=encode(digest(p_worker_token,'sha256'),'hex')) then return false; end if;
  update public.client_paperclip_runs set status=p_status,summary=left(coalesce(nullif(btrim(p_summary),''),summary),4000),error_code=p_error_code,
    cost_micros=greatest(0,coalesce(p_cost_micros,cost_micros)),started_at=coalesce(started_at,now()),finished_at=case when p_status='running' then null else now() end,updated_at=now()
  where tenant_slug=p_tenant_slug and job_id=p_job_id and retention_expires_at>now() returning issue_id,agent_id into target_issue,target_agent;
  if not found then return false; end if;
  if target_issue is not null then
    update public.client_paperclip_issues set execution_state=p_status,status=case when p_status='succeeded' then 'done' when p_status='failed' then 'blocked' when p_status='running' then 'active' else status end,
      build_artifact_id=coalesce(p_build_artifact_id,build_artifact_id),build_preview_html=coalesce(left(p_build_preview_html,40000),build_preview_html),started_at=coalesce(started_at,now()),
      completed_at=case when p_status in ('succeeded','failed','cancelled') then now() else completed_at end,updated_at=now()
    where tenant_slug=p_tenant_slug and id=target_issue and retention_expires_at>now();
    if not found then return false; end if;
  end if;
  if target_agent is not null then
    update public.client_paperclip_agents set status=case when p_status='running' then 'working' else 'idle' end,last_heartbeat_at=now(),updated_at=now()
    where tenant_slug=p_tenant_slug and id=target_agent and retention_expires_at>now();
  end if;
  return true;
end;
$$;
revoke all on function public.complete_client_paperclip_run_worker(text,text,uuid,text,text,text,bigint,uuid,text) from public,authenticated;
grant execute on function public.complete_client_paperclip_run_worker(text,text,uuid,text,text,text,bigint,uuid,text) to anon;

commit;
