-- Apply after supabase-client-hermes-content-factory.sql.
-- Active tenant content expires per item after at most 28 days, then remains
-- recovery-only for seven days before bounded child-first deletion.
begin;

alter table public.client_hermes_content_factory_runs add column if not exists retention_expires_at timestamptz;
alter table public.client_hermes_content_factory_stage_outputs add column if not exists retention_expires_at timestamptz;
alter table public.client_hermes_content_factory_citations add column if not exists retention_expires_at timestamptz;
alter table public.client_hermes_content_factory_quality_reports add column if not exists retention_expires_at timestamptz;
alter table public.client_hermes_content_factory_approvals add column if not exists retention_expires_at timestamptz;
alter table public.client_hermes_content_factory_deliveries add column if not exists retention_expires_at timestamptz;

update public.client_hermes_content_factory_runs item set retention_expires_at = greatest(item.created_at + interval '1 microsecond',least(
  coalesce(item.retention_expires_at,item.created_at + make_interval(days => greatest(1,least(tenant.retention_days,28)))),
  item.created_at + make_interval(days => greatest(1,least(tenant.retention_days,28))),item.created_at + interval '28 days'))
from public.client_tenants tenant where tenant.slug=item.tenant_slug
  and item.retention_expires_at is distinct from greatest(item.created_at + interval '1 microsecond',least(
    coalesce(item.retention_expires_at,item.created_at + make_interval(days => greatest(1,least(tenant.retention_days,28)))),
    item.created_at + make_interval(days => greatest(1,least(tenant.retention_days,28))),item.created_at + interval '28 days'));

update public.client_hermes_content_factory_stage_outputs item set retention_expires_at = greatest(item.created_at + interval '1 microsecond',least(
  coalesce(item.retention_expires_at,run.retention_expires_at),run.retention_expires_at,
  item.created_at + make_interval(days => greatest(1,least(tenant.retention_days,28))),item.created_at + interval '28 days'))
from public.client_hermes_content_factory_runs run,public.client_tenants tenant
where run.id=item.run_id and run.tenant_slug=item.tenant_slug and tenant.slug=item.tenant_slug
  and item.retention_expires_at is distinct from greatest(item.created_at + interval '1 microsecond',least(
    coalesce(item.retention_expires_at,run.retention_expires_at),run.retention_expires_at,
    item.created_at + make_interval(days => greatest(1,least(tenant.retention_days,28))),item.created_at + interval '28 days'));

update public.client_hermes_content_factory_citations item set retention_expires_at = greatest(item.created_at + interval '1 microsecond',least(
  coalesce(item.retention_expires_at,run.retention_expires_at),run.retention_expires_at,
  item.created_at + make_interval(days => greatest(1,least(tenant.retention_days,28))),item.created_at + interval '28 days'))
from public.client_hermes_content_factory_runs run,public.client_tenants tenant
where run.id=item.run_id and run.tenant_slug=item.tenant_slug and tenant.slug=item.tenant_slug
  and item.retention_expires_at is distinct from greatest(item.created_at + interval '1 microsecond',least(
    coalesce(item.retention_expires_at,run.retention_expires_at),run.retention_expires_at,
    item.created_at + make_interval(days => greatest(1,least(tenant.retention_days,28))),item.created_at + interval '28 days'));

update public.client_hermes_content_factory_quality_reports item set retention_expires_at = greatest(item.created_at + interval '1 microsecond',least(
  coalesce(item.retention_expires_at,run.retention_expires_at),run.retention_expires_at,
  item.created_at + make_interval(days => greatest(1,least(tenant.retention_days,28))),item.created_at + interval '28 days'))
from public.client_hermes_content_factory_runs run,public.client_tenants tenant
where run.id=item.run_id and run.tenant_slug=item.tenant_slug and tenant.slug=item.tenant_slug
  and item.retention_expires_at is distinct from greatest(item.created_at + interval '1 microsecond',least(
    coalesce(item.retention_expires_at,run.retention_expires_at),run.retention_expires_at,
    item.created_at + make_interval(days => greatest(1,least(tenant.retention_days,28))),item.created_at + interval '28 days'));

update public.client_hermes_content_factory_approvals item set retention_expires_at = greatest(item.created_at + interval '1 microsecond',least(
  coalesce(item.retention_expires_at,run.retention_expires_at),run.retention_expires_at,
  item.created_at + make_interval(days => greatest(1,least(tenant.retention_days,28))),item.created_at + interval '28 days'))
from public.client_hermes_content_factory_runs run,public.client_tenants tenant
where run.id=item.run_id and run.tenant_slug=item.tenant_slug and tenant.slug=item.tenant_slug
  and item.retention_expires_at is distinct from greatest(item.created_at + interval '1 microsecond',least(
    coalesce(item.retention_expires_at,run.retention_expires_at),run.retention_expires_at,
    item.created_at + make_interval(days => greatest(1,least(tenant.retention_days,28))),item.created_at + interval '28 days'));

update public.client_hermes_content_factory_deliveries item set retention_expires_at = greatest(item.created_at + interval '1 microsecond',least(
  coalesce(item.retention_expires_at,run.retention_expires_at),run.retention_expires_at,
  item.created_at + make_interval(days => greatest(1,least(tenant.retention_days,28))),item.created_at + interval '28 days'))
from public.client_hermes_content_factory_runs run,public.client_tenants tenant
where run.id=item.run_id and run.tenant_slug=item.tenant_slug and tenant.slug=item.tenant_slug
  and item.retention_expires_at is distinct from greatest(item.created_at + interval '1 microsecond',least(
    coalesce(item.retention_expires_at,run.retention_expires_at),run.retention_expires_at,
    item.created_at + make_interval(days => greatest(1,least(tenant.retention_days,28))),item.created_at + interval '28 days'));

alter table public.client_hermes_content_factory_runs alter column retention_expires_at set not null;
alter table public.client_hermes_content_factory_stage_outputs alter column retention_expires_at set not null;
alter table public.client_hermes_content_factory_citations alter column retention_expires_at set not null;
alter table public.client_hermes_content_factory_quality_reports alter column retention_expires_at set not null;
alter table public.client_hermes_content_factory_approvals alter column retention_expires_at set not null;
alter table public.client_hermes_content_factory_deliveries alter column retention_expires_at set not null;

do $$
declare item record;
  constraint_name text;
begin
  for item in select * from (values
    ('client_hermes_content_factory_runs'),('client_hermes_content_factory_stage_outputs'),
    ('client_hermes_content_factory_citations'),('client_hermes_content_factory_quality_reports'),
    ('client_hermes_content_factory_approvals'),('client_hermes_content_factory_deliveries')
  ) as tables(table_name) loop
    constraint_name:='hermes_ret_'||substr(md5(item.table_name),1,16);
    if not exists(select 1 from pg_constraint where conrelid=format('public.%s',item.table_name)::regclass and conname=constraint_name) then
      execute format('alter table public.%I add constraint %I check (retention_expires_at > created_at) not valid',item.table_name,constraint_name);
    end if;
    execute format('alter table public.%I validate constraint %I',item.table_name,constraint_name);
    execute format('create index if not exists %I on public.%I(tenant_slug,retention_expires_at,id)',item.table_name||'_retention_idx',item.table_name);
    execute format('drop trigger if exists %I on public.%I',item.table_name||'_retention_guard',item.table_name);
  end loop;
end;
$$;

create or replace function public.guard_client_hermes_content_factory_retention()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_days integer;
  v_parent_expiry timestamptz;
  v_created timestamptz;
  v_expiry timestamptz;
  v_row jsonb;
begin
  select retention_days into v_days from public.client_tenants where slug=new.tenant_slug;
  if v_days is null or v_days<1 or v_days>28 then raise exception 'hermes_retention_tenant_not_configured'; end if;
  v_row:=to_jsonb(new);
  if tg_op='INSERT' then
    v_created:=now();
    v_expiry:=v_created+make_interval(days => v_days);
    if tg_table_name<>'client_hermes_content_factory_runs' then
      select retention_expires_at into v_parent_expiry from public.client_hermes_content_factory_runs
        where id=(v_row->>'run_id')::uuid and tenant_slug=new.tenant_slug for update;
      if v_parent_expiry is null or v_parent_expiry<=now() then raise exception 'hermes_run_expired_or_foreign'; end if;
      v_expiry:=least(v_expiry,v_parent_expiry);
    end if;
    v_row:=jsonb_set(v_row,'{created_at}',to_jsonb(v_created));
    v_row:=jsonb_set(v_row,'{retention_expires_at}',to_jsonb(least(coalesce((v_row->>'retention_expires_at')::timestamptz,v_expiry),v_expiry,v_created+interval '28 days')));
    if v_row ? 'updated_at' then v_row:=jsonb_set(v_row,'{updated_at}',to_jsonb(v_created)); end if;
    if (v_row->>'retention_expires_at')::timestamptz<=v_created then raise exception 'hermes_retention_expiry_invalid'; end if;
    new:=jsonb_populate_record(new,v_row);
    return new;
  end if;

  if new.tenant_slug is distinct from old.tenant_slug or new.created_at is distinct from old.created_at
    or new.retention_expires_at is distinct from old.retention_expires_at
    or (tg_table_name<>'client_hermes_content_factory_runs' and (v_row->>'run_id') is distinct from (to_jsonb(old)->>'run_id')) then
    raise exception 'hermes_retention_immutable';
  end if;
  if old.retention_expires_at<=now() then
    if tg_table_name<>'client_hermes_content_factory_runs'
       or (v_row-'job_id'-'updated_at') is distinct from (to_jsonb(old)-'job_id'-'updated_at')
       or (v_row->>'job_id') is not null then raise exception 'hermes_content_expired'; end if;
    if v_row ? 'updated_at' then v_row:=jsonb_set(v_row,'{updated_at}',to_jsonb(old.updated_at)); new:=jsonb_populate_record(new,v_row); end if;
    return new;
  end if;
  if v_row ? 'updated_at' then v_row:=jsonb_set(v_row,'{updated_at}',to_jsonb(now())); new:=jsonb_populate_record(new,v_row); end if;
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['client_hermes_content_factory_runs','client_hermes_content_factory_stage_outputs',
    'client_hermes_content_factory_citations','client_hermes_content_factory_quality_reports',
    'client_hermes_content_factory_approvals','client_hermes_content_factory_deliveries'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.guard_client_hermes_content_factory_retention()',table_name||'_retention_guard',table_name);
  end loop;
end;
$$;

do $$
begin
  drop policy if exists client_hermes_factory_member_select on public.client_hermes_content_factory_runs;
  create policy client_hermes_factory_member_select on public.client_hermes_content_factory_runs for select to authenticated using (public.client_member(tenant_slug) and retention_expires_at>now());
  drop policy if exists client_hermes_factory_member_insert on public.client_hermes_content_factory_runs;
  create policy client_hermes_factory_member_insert on public.client_hermes_content_factory_runs for insert to authenticated with check (public.client_member(tenant_slug) and created_by=auth.uid() and retention_expires_at>now());
  drop policy if exists client_hermes_factory_member_update on public.client_hermes_content_factory_runs;
  create policy client_hermes_factory_member_update on public.client_hermes_content_factory_runs for update to authenticated using (public.client_member(tenant_slug) and retention_expires_at>now()) with check (public.client_member(tenant_slug) and retention_expires_at>now());
  drop policy if exists client_hermes_factory_member_delete on public.client_hermes_content_factory_runs;
  create policy client_hermes_factory_member_delete on public.client_hermes_content_factory_runs for delete to authenticated using (public.client_member(tenant_slug) and retention_expires_at>now());
  drop policy if exists client_hermes_factory_stage_member_select on public.client_hermes_content_factory_stage_outputs;
  create policy client_hermes_factory_stage_member_select on public.client_hermes_content_factory_stage_outputs for select to authenticated using (public.client_member(tenant_slug) and retention_expires_at>now());
  drop policy if exists client_hermes_factory_stage_member_insert on public.client_hermes_content_factory_stage_outputs;
  create policy client_hermes_factory_stage_member_insert on public.client_hermes_content_factory_stage_outputs for insert to authenticated with check (public.client_member(tenant_slug) and retention_expires_at>now());
  drop policy if exists client_hermes_factory_stage_member_update on public.client_hermes_content_factory_stage_outputs;
  create policy client_hermes_factory_stage_member_update on public.client_hermes_content_factory_stage_outputs for update to authenticated using (public.client_member(tenant_slug) and retention_expires_at>now()) with check (public.client_member(tenant_slug) and retention_expires_at>now());
  drop policy if exists client_hermes_factory_citation_member_select on public.client_hermes_content_factory_citations;
  create policy client_hermes_factory_citation_member_select on public.client_hermes_content_factory_citations for select to authenticated using (public.client_member(tenant_slug) and retention_expires_at>now());
  drop policy if exists client_hermes_factory_citation_member_insert on public.client_hermes_content_factory_citations;
  create policy client_hermes_factory_citation_member_insert on public.client_hermes_content_factory_citations for insert to authenticated with check (public.client_member(tenant_slug) and retention_expires_at>now());
  drop policy if exists client_hermes_factory_quality_member_select on public.client_hermes_content_factory_quality_reports;
  create policy client_hermes_factory_quality_member_select on public.client_hermes_content_factory_quality_reports for select to authenticated using (public.client_member(tenant_slug) and retention_expires_at>now());
  drop policy if exists client_hermes_factory_quality_member_insert on public.client_hermes_content_factory_quality_reports;
  create policy client_hermes_factory_quality_member_insert on public.client_hermes_content_factory_quality_reports for insert to authenticated with check (public.client_member(tenant_slug) and retention_expires_at>now());
  drop policy if exists client_hermes_factory_approval_member_select on public.client_hermes_content_factory_approvals;
  create policy client_hermes_factory_approval_member_select on public.client_hermes_content_factory_approvals for select to authenticated using (public.client_member(tenant_slug) and retention_expires_at>now());
  drop policy if exists client_hermes_factory_delivery_member_select on public.client_hermes_content_factory_deliveries;
  create policy client_hermes_factory_delivery_member_select on public.client_hermes_content_factory_deliveries for select to authenticated using (public.client_member(tenant_slug) and retention_expires_at>now());
end;
$$;

create or replace function public.purge_expired_client_hermes_content_factory_records(p_tenant_slug text,p_apply boolean default false,p_batch_limit integer default 100)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_days integer;
  v_cutoff timestamptz:=now()-interval '7 days';
  v_tables text[]:=array['client_hermes_content_factory_stage_outputs','client_hermes_content_factory_citations','client_hermes_content_factory_quality_reports','client_hermes_content_factory_approvals','client_hermes_content_factory_deliveries','client_hermes_content_factory_runs'];
  v_labels text[]:=array['stageOutputs','citations','qualityReports','approvals','deliveries','runs'];
  v_counts integer[]:=array[0,0,0,0,0,0];
  v_candidates jsonb;
  v_deleted jsonb;
  i integer;
  n integer;
  total integer:=0;
  predicate text;
begin
  if p_tenant_slug is null or p_tenant_slug !~ '^[a-z][a-z0-9-]{2,40}$' or p_apply is null or p_batch_limit is null or p_batch_limit<1 or p_batch_limit>500 then raise exception 'hermes_retention_invalid_input'; end if;
  select retention_days into v_days from public.client_tenants where slug=p_tenant_slug for update;
  if not found then raise exception 'hermes_retention_tenant_not_found'; end if;
  if v_days is null or v_days<1 or v_days>28 then raise exception 'hermes_retention_tenant_not_configured'; end if;
  select jsonb_build_object(
    'stageOutputs',(select count(*) from public.client_hermes_content_factory_stage_outputs where tenant_slug=p_tenant_slug and retention_expires_at<=v_cutoff),
    'citations',(select count(*) from public.client_hermes_content_factory_citations where tenant_slug=p_tenant_slug and retention_expires_at<=v_cutoff),
    'qualityReports',(select count(*) from public.client_hermes_content_factory_quality_reports where tenant_slug=p_tenant_slug and retention_expires_at<=v_cutoff),
    'approvals',(select count(*) from public.client_hermes_content_factory_approvals where tenant_slug=p_tenant_slug and retention_expires_at<=v_cutoff),
    'deliveries',(select count(*) from public.client_hermes_content_factory_deliveries where tenant_slug=p_tenant_slug and retention_expires_at<=v_cutoff),
    'runs',(select count(*) from public.client_hermes_content_factory_runs where tenant_slug=p_tenant_slug and retention_expires_at<=v_cutoff)
  ) into v_candidates;
  if p_apply then
    for i in 1..array_length(v_tables,1) loop
      predicate:='';
      if v_tables[i]='client_hermes_content_factory_runs' then
        predicate:=' and not exists(select 1 from public.client_hermes_content_factory_stage_outputs c where c.run_id=t.id) and not exists(select 1 from public.client_hermes_content_factory_citations c where c.run_id=t.id) and not exists(select 1 from public.client_hermes_content_factory_quality_reports c where c.run_id=t.id) and not exists(select 1 from public.client_hermes_content_factory_approvals c where c.run_id=t.id) and not exists(select 1 from public.client_hermes_content_factory_deliveries c where c.run_id=t.id)';
      end if;
      execute format('with chosen as (select t.ctid from public.%I t where t.tenant_slug=$1 and t.retention_expires_at<=$2%s order by t.retention_expires_at,t.id limit $3 for update skip locked), removed as (delete from public.%I t using chosen where t.ctid=chosen.ctid returning 1) select count(*) from removed',v_tables[i],predicate,v_tables[i]) into n using p_tenant_slug,v_cutoff,p_batch_limit;
      v_counts[i]:=n; total:=total+n;
    end loop;
  end if;
  v_deleted:=jsonb_build_object('stageOutputs',v_counts[1],'citations',v_counts[2],'qualityReports',v_counts[3],'approvals',v_counts[4],'deliveries',v_counts[5],'runs',v_counts[6]);
  if total>0 then
    insert into public.client_runtime_audit_events(tenant_slug,event_type,metadata) values(p_tenant_slug,'tenant.hermes_content_factory.retention_purged',jsonb_build_object('deleted',v_deleted,'retentionDays',v_days,'recoveryDays',7,'purgeAfterDays',v_days+7));
  end if;
  return jsonb_build_object('tenant',p_tenant_slug,'expiredOrPurgeDue',v_candidates,'deleted',v_deleted,'retentionDays',v_days,'recoveryDays',7,'purgeAfterDays',v_days+7,'applied',p_apply,'batchLimitPerTable',p_batch_limit,'scope',to_jsonb(v_tables));
end;
$$;
revoke all on function public.purge_expired_client_hermes_content_factory_records(text,boolean,integer) from public,anon,authenticated;
grant execute on function public.purge_expired_client_hermes_content_factory_records(text,boolean,integer) to service_role;

create or replace function public.update_client_hermes_content_factory_worker(p_tenant_slug text,p_worker_token text,p_job_id uuid,p_patch jsonb)
returns boolean language plpgsql security definer set search_path=public,extensions as $$
declare v_run_id uuid;
begin
  if p_worker_token is null or length(p_worker_token)<24 or p_patch is null or jsonb_typeof(p_patch)<>'object'
     or not exists(select 1 from public.client_tenants where slug=p_tenant_slug and status='active' and worker_token_hash=encode(digest(p_worker_token,'sha256'),'hex')) then return false; end if;
  select id into v_run_id from public.client_hermes_content_factory_runs where tenant_slug=p_tenant_slug and job_id=p_job_id and retention_expires_at>now() for update;
  if v_run_id is null then return false; end if;
  update public.client_hermes_content_factory_runs set status=coalesce(nullif(p_patch->>'status',''),status),current_stage=coalesce(nullif(p_patch->>'current_stage',''),current_stage),
    stages=coalesce(p_patch->'stages',stages),citations=coalesce(p_patch->'citations',citations),quality_report=coalesce(p_patch->'quality_report',quality_report),
    approval=coalesce(p_patch->'approval',approval),delivery=coalesce(p_patch->'delivery',delivery),
    error_code=case when p_patch?'error_code' then left(p_patch->>'error_code',120) else error_code end,updated_at=now()
    where id=v_run_id and retention_expires_at>now();
  if not found then return false; end if;
  if p_patch?'stages' and jsonb_typeof(p_patch->'stages')='array' then
    insert into public.client_hermes_content_factory_stage_outputs(run_id,tenant_slug,stage,status,output_record_id,artifact_id,citation_record_id,quality_report_id,error_code,output)
    select v_run_id,p_tenant_slug,item->>'stage',item->>'status',item->>'outputRecordId',item->>'artifactId',item->>'citationRecordId',item->>'qualityReportId',item->>'errorCode',item->'output'
      from jsonb_array_elements(p_patch->'stages') item where item?'stage'
    on conflict(run_id,stage) do update set status=excluded.status,output_record_id=excluded.output_record_id,artifact_id=excluded.artifact_id,citation_record_id=excluded.citation_record_id,
      quality_report_id=excluded.quality_report_id,error_code=excluded.error_code,output=excluded.output,updated_at=now();
  end if;
  if p_patch?'citations' and jsonb_typeof(p_patch->'citations')='array' then
    insert into public.client_hermes_content_factory_citations(id,run_id,tenant_slug,url,title,retrieved_at,evidence)
    select item->>'id',v_run_id,p_tenant_slug,item->>'url',nullif(item->>'title',''),(item->>'retrievedAt')::timestamptz,left(item->>'evidence',20000)
      from jsonb_array_elements(p_patch->'citations') item where item->>'id' is not null and item->>'url' is not null
    on conflict(run_id,id) do update set url=excluded.url,title=excluded.title,retrieved_at=excluded.retrieved_at,evidence=excluded.evidence;
  end if;
  if p_patch?'quality_report' and jsonb_typeof(p_patch->'quality_report')='object' then
    insert into public.client_hermes_content_factory_quality_reports(id,run_id,tenant_slug,passed,score,citation_count,findings,checked_at)
    values(p_patch->'quality_report'->>'id',v_run_id,p_tenant_slug,coalesce((p_patch->'quality_report'->>'passed')::boolean,false),coalesce((p_patch->'quality_report'->>'score')::numeric,0),coalesce((p_patch->'quality_report'->>'citationCount')::integer,0),coalesce(p_patch->'quality_report'->'findings','[]'::jsonb),(p_patch->'quality_report'->>'checkedAt')::timestamptz)
    on conflict(run_id) do update set id=excluded.id,passed=excluded.passed,score=excluded.score,citation_count=excluded.citation_count,findings=excluded.findings,checked_at=excluded.checked_at;
  end if;
  return true;
end;
$$;
revoke all on function public.update_client_hermes_content_factory_worker(text,text,uuid,jsonb) from public,authenticated;
grant execute on function public.update_client_hermes_content_factory_worker(text,text,uuid,jsonb) to anon;

create or replace function public.record_client_hermes_content_factory_approval(p_tenant_slug text,p_run_id uuid,p_workflow_id text,p_approved_by text,p_approved_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_run public.client_hermes_content_factory_runs%rowtype; v_id text;
begin
  if not public.client_member(p_tenant_slug) or p_approved_by<>auth.uid()::text then return null; end if;
  select * into v_run from public.client_hermes_content_factory_runs where id=p_run_id and tenant_slug=p_tenant_slug and retention_expires_at>now() for update;
  if not found or v_run.workflow_id<>p_workflow_id or v_run.status<>'awaiting_approval' then return null; end if;
  v_id:='approval-'||p_run_id::text;
  insert into public.client_hermes_content_factory_approvals(id,run_id,tenant_slug,workflow_id,approved_by,approved_at) values(v_id,p_run_id,p_tenant_slug,p_workflow_id,auth.uid(),p_approved_at)
    on conflict(run_id) do update set approved_by=excluded.approved_by,approved_at=excluded.approved_at;
  update public.client_hermes_content_factory_runs set approval=jsonb_build_object('id',v_id,'workflowId',p_workflow_id,'tenantSlug',p_tenant_slug,'approvedBy',p_approved_by,'approvedAt',p_approved_at),status='approved',current_stage='publish',updated_at=now()
    where id=p_run_id and retention_expires_at>now();
  if not found then return null; end if;
  return jsonb_build_object('id',v_id,'workflowId',p_workflow_id,'tenantSlug',p_tenant_slug,'approvedBy',p_approved_by,'approvedAt',p_approved_at);
end;
$$;

create or replace function public.record_client_hermes_content_factory_delivery(p_tenant_slug text,p_run_id uuid,p_destination text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_run public.client_hermes_content_factory_runs%rowtype; v_delivery public.client_hermes_content_factory_deliveries%rowtype;
begin
  if not public.client_member(p_tenant_slug) then return null; end if;
  select * into v_run from public.client_hermes_content_factory_runs where id=p_run_id and tenant_slug=p_tenant_slug and retention_expires_at>now() for update;
  if not found then return null; end if;
  if v_run.status='published' and v_run.delivery is not null then return v_run.delivery; end if;
  if v_run.status<>'approved' or v_run.approval is null or v_run.approval->>'tenantSlug'<>p_tenant_slug or v_run.approval->>'workflowId'<>v_run.workflow_id then return null; end if;
  insert into public.client_hermes_content_factory_deliveries(run_id,tenant_slug,workflow_id,destination,status,approval_id)
    values(p_run_id,p_tenant_slug,v_run.workflow_id,p_destination,'recorded',v_run.approval->>'id') on conflict(run_id) do update set destination=excluded.destination;
  select * into v_delivery from public.client_hermes_content_factory_deliveries where run_id=p_run_id and tenant_slug=p_tenant_slug and retention_expires_at>now();
  if not found then return null; end if;
  update public.client_hermes_content_factory_runs set delivery=jsonb_build_object('id',v_delivery.id,'workflowId',v_run.workflow_id,'tenantSlug',p_tenant_slug,'destination',v_delivery.destination,'status',v_delivery.status,'approvalId',v_delivery.approval_id),status='published',current_stage='publish',updated_at=now()
    where id=p_run_id and retention_expires_at>now();
  if not found then return null; end if;
  return jsonb_build_object('id',v_delivery.id,'workflowId',v_run.workflow_id,'tenantSlug',p_tenant_slug,'destination',v_delivery.destination,'status',v_delivery.status,'approvalId',v_delivery.approval_id);
end;
$$;

commit;
