-- Apply after supabase-client-boards.sql, supabase-client-loop.sql, and
-- supabase-client-retention-policy-28.sql.
-- Board and Loop evidence expires per item; child evidence cannot outlive its parent.

begin;

alter table public.client_board_tasks add column if not exists retention_expires_at timestamptz;
alter table public.client_board_comments add column if not exists retention_expires_at timestamptz;
alter table public.client_board_events add column if not exists retention_expires_at timestamptz;
alter table public.client_loop_runs add column if not exists retention_expires_at timestamptz;
alter table public.client_loop_rounds add column if not exists retention_expires_at timestamptz;

update public.client_board_tasks item set retention_expires_at = least(
  coalesce(item.retention_expires_at, item.created_at + make_interval(days => tenant.retention_days)),
  item.created_at + make_interval(days => tenant.retention_days), item.created_at + interval '28 days'
) from public.client_tenants tenant where tenant.slug = item.tenant_slug
  and (item.retention_expires_at is null or item.retention_expires_at <= item.created_at
    or item.retention_expires_at > item.created_at + make_interval(days => tenant.retention_days)
    or item.retention_expires_at > item.created_at + interval '28 days');
update public.client_loop_runs item set retention_expires_at = least(
  coalesce(item.retention_expires_at, item.created_at + make_interval(days => tenant.retention_days)),
  item.created_at + make_interval(days => tenant.retention_days), item.created_at + interval '28 days'
) from public.client_tenants tenant where tenant.slug = item.tenant_slug
  and (item.retention_expires_at is null or item.retention_expires_at <= item.created_at
    or item.retention_expires_at > item.created_at + make_interval(days => tenant.retention_days)
    or item.retention_expires_at > item.created_at + interval '28 days');
update public.client_board_comments child set retention_expires_at = greatest(child.created_at + interval '1 microsecond', least(
  coalesce(child.retention_expires_at, parent.retention_expires_at), parent.retention_expires_at,
  child.created_at + make_interval(days => tenant.retention_days), child.created_at + interval '28 days'))
from public.client_board_tasks parent, public.client_tenants tenant
where parent.id = child.task_id and parent.tenant_slug = child.tenant_slug and tenant.slug = child.tenant_slug
  and child.retention_expires_at is distinct from greatest(child.created_at + interval '1 microsecond', least(
    coalesce(child.retention_expires_at, parent.retention_expires_at), parent.retention_expires_at,
    child.created_at + make_interval(days => tenant.retention_days), child.created_at + interval '28 days'));
update public.client_board_events child set retention_expires_at = greatest(child.created_at + interval '1 microsecond', least(
  coalesce(child.retention_expires_at, parent.retention_expires_at), parent.retention_expires_at,
  child.created_at + make_interval(days => tenant.retention_days), child.created_at + interval '28 days'))
from public.client_board_tasks parent, public.client_tenants tenant
where parent.id = child.task_id and parent.tenant_slug = child.tenant_slug and tenant.slug = child.tenant_slug
  and child.retention_expires_at is distinct from greatest(child.created_at + interval '1 microsecond', least(
    coalesce(child.retention_expires_at, parent.retention_expires_at), parent.retention_expires_at,
    child.created_at + make_interval(days => tenant.retention_days), child.created_at + interval '28 days'));
update public.client_loop_rounds child set retention_expires_at = greatest(child.created_at + interval '1 microsecond', least(
  coalesce(child.retention_expires_at, parent.retention_expires_at), parent.retention_expires_at,
  child.created_at + make_interval(days => tenant.retention_days), child.created_at + interval '28 days'))
from public.client_loop_runs parent, public.client_tenants tenant
where parent.id = child.run_id and parent.tenant_slug = child.tenant_slug and tenant.slug = child.tenant_slug
  and child.retention_expires_at is distinct from greatest(child.created_at + interval '1 microsecond', least(
    coalesce(child.retention_expires_at, parent.retention_expires_at), parent.retention_expires_at,
    child.created_at + make_interval(days => tenant.retention_days), child.created_at + interval '28 days'));

alter table public.client_board_tasks alter column retention_expires_at set not null;
alter table public.client_board_comments alter column retention_expires_at set not null;
alter table public.client_board_events alter column retention_expires_at set not null;
alter table public.client_loop_runs alter column retention_expires_at set not null;
alter table public.client_loop_rounds alter column retention_expires_at set not null;

do $$
declare item record;
begin
  for item in select * from (values
    ('client_board_tasks','client_board_tasks_retention_after_creation'),
    ('client_board_comments','client_board_comments_retention_after_creation'),
    ('client_board_events','client_board_events_retention_after_creation'),
    ('client_loop_runs','client_loop_runs_retention_after_creation'),
    ('client_loop_rounds','client_loop_rounds_retention_after_creation')
  ) as constraints(table_name,constraint_name) loop
    if not exists (select 1 from pg_constraint where conrelid = format('public.%s',item.table_name)::regclass and conname=item.constraint_name) then
      execute format('alter table public.%I add constraint %I check (retention_expires_at > created_at) not valid',item.table_name,item.constraint_name);
    end if;
    execute format('alter table public.%I validate constraint %I',item.table_name,item.constraint_name);
  end loop;
end;
$$;

create index if not exists client_board_tasks_retention_idx on public.client_board_tasks (tenant_slug, retention_expires_at, id);
create index if not exists client_board_comments_retention_idx on public.client_board_comments (tenant_slug, retention_expires_at, id);
create index if not exists client_board_events_retention_idx on public.client_board_events (tenant_slug, retention_expires_at, id);
create index if not exists client_loop_runs_retention_idx on public.client_loop_runs (tenant_slug, retention_expires_at, id);
create index if not exists client_loop_rounds_retention_idx on public.client_loop_rounds (tenant_slug, retention_expires_at, id);

create or replace function public.guard_client_board_loop_retention()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_retention_days integer;
  v_parent_expiry timestamptz;
  v_parent_id uuid;
  v_expiry timestamptz;
begin
  select retention_days into v_retention_days from public.client_tenants where slug = new.tenant_slug;
  if v_retention_days is null or v_retention_days < 1 or v_retention_days > 28 then
    raise exception 'client_board_loop_retention_tenant_not_configured';
  end if;

  if tg_table_name in ('client_board_tasks', 'client_loop_runs') then
    if tg_op = 'INSERT' then
      new.created_at := now();
      v_expiry := new.created_at + make_interval(days => v_retention_days);
    else
      if new.tenant_slug is distinct from old.tenant_slug or new.created_at is distinct from old.created_at
         or new.retention_expires_at is distinct from old.retention_expires_at then
        raise exception 'client_board_loop_retention_immutable';
      end if;
      if old.retention_expires_at <= now() then
        if tg_table_name = 'client_board_tasks' then
          if (to_jsonb(new) - 'build_artifact_id' - 'execution_job_id' - 'updated_at')
               is distinct from (to_jsonb(old) - 'build_artifact_id' - 'execution_job_id' - 'updated_at')
             or (new.build_artifact_id is not null and new.build_artifact_id is distinct from old.build_artifact_id)
             or (new.execution_job_id is not null and new.execution_job_id is distinct from old.execution_job_id) then
            raise exception 'client_board_item_expired';
          end if;
        else
          if (to_jsonb(new) - 'build_artifact_id' - 'job_id' - 'updated_at')
               is distinct from (to_jsonb(old) - 'build_artifact_id' - 'job_id' - 'updated_at')
             or (new.build_artifact_id is not null and new.build_artifact_id is distinct from old.build_artifact_id)
             or (new.job_id is not null and new.job_id is distinct from old.job_id) then
            raise exception 'client_loop_run_expired';
          end if;
        end if;
        if tg_table_name = 'client_board_tasks' then new.updated_at := old.updated_at; end if;
        return new;
      end if;
      if tg_table_name = 'client_board_tasks' then new.updated_at := now(); end if;
      return new;
    end if;
    new.retention_expires_at := least(coalesce(new.retention_expires_at, v_expiry), v_expiry,
      new.created_at + interval '28 days');
    if new.retention_expires_at <= new.created_at then raise exception 'client_board_loop_retention_expiry_invalid'; end if;
    if tg_table_name = 'client_board_tasks' then new.updated_at := now(); end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if tg_table_name = 'client_board_comments' or tg_table_name = 'client_board_events' then
      v_parent_id := new.task_id;
      select retention_expires_at into v_parent_expiry from public.client_board_tasks
        where id = v_parent_id and tenant_slug = new.tenant_slug for update;
    else
      v_parent_id := new.run_id;
      select retention_expires_at into v_parent_expiry from public.client_loop_runs
        where id = v_parent_id and tenant_slug = new.tenant_slug for update;
    end if;
    if v_parent_expiry is null or v_parent_expiry <= now() then
      raise exception 'client_board_loop_parent_expired_or_foreign';
    end if;
    new.created_at := now();
    new.retention_expires_at := least(coalesce(new.retention_expires_at, v_parent_expiry), v_parent_expiry,
      new.created_at + make_interval(days => v_retention_days), new.created_at + interval '28 days');
    return new;
  end if;

  if new.tenant_slug is distinct from old.tenant_slug or new.created_at is distinct from old.created_at
     or new.retention_expires_at is distinct from old.retention_expires_at then
    raise exception 'client_board_loop_retention_immutable';
  end if;
  if tg_table_name in ('client_board_comments', 'client_board_events') then
    if new.task_id is distinct from old.task_id then raise exception 'client_board_loop_retention_immutable'; end if;
  else
    if new.run_id is distinct from old.run_id then raise exception 'client_board_loop_retention_immutable'; end if;
  end if;
  if old.retention_expires_at <= now() then raise exception 'client_board_loop_child_expired'; end if;
  return new;
end;
$$;

drop trigger if exists guard_client_board_task_retention on public.client_board_tasks;
create trigger guard_client_board_task_retention before insert or update on public.client_board_tasks
  for each row execute function public.guard_client_board_loop_retention();
drop trigger if exists guard_client_board_comment_retention on public.client_board_comments;
create trigger guard_client_board_comment_retention before insert or update on public.client_board_comments
  for each row execute function public.guard_client_board_loop_retention();
drop trigger if exists guard_client_board_event_retention on public.client_board_events;
create trigger guard_client_board_event_retention before insert or update on public.client_board_events
  for each row execute function public.guard_client_board_loop_retention();
drop trigger if exists guard_client_loop_run_retention on public.client_loop_runs;
create trigger guard_client_loop_run_retention before insert or update on public.client_loop_runs
  for each row execute function public.guard_client_board_loop_retention();
drop trigger if exists guard_client_loop_round_retention on public.client_loop_rounds;
create trigger guard_client_loop_round_retention before insert or update on public.client_loop_rounds
  for each row execute function public.guard_client_board_loop_retention();

do $$
declare t text; insert_check text;
begin
  foreach t in array array['client_board_tasks','client_board_comments','client_board_events','client_loop_runs','client_loop_rounds'] loop
    insert_check := case when t in ('client_board_tasks','client_loop_runs')
      then 'created_by = auth.uid()' else 'true' end;
    execute format('drop policy if exists %1$s_member_select on public.%1$s', t);
    execute format('create policy %1$s_member_select on public.%1$s for select to authenticated using (public.client_member(tenant_slug) and retention_expires_at > now())', t);
    execute format('drop policy if exists %1$s_member_insert on public.%1$s', t);
    execute format('create policy %1$s_member_insert on public.%1$s for insert to authenticated with check (public.client_member(tenant_slug) and retention_expires_at > now() and %2$s)', t, insert_check);
    execute format('drop policy if exists %1$s_member_update on public.%1$s', t);
    execute format('create policy %1$s_member_update on public.%1$s for update to authenticated using (public.client_member(tenant_slug) and retention_expires_at > now()) with check (public.client_member(tenant_slug) and retention_expires_at > now())', t);
    execute format('drop policy if exists %1$s_member_delete on public.%1$s', t);
    execute format('create policy %1$s_member_delete on public.%1$s for delete to authenticated using (public.client_member(tenant_slug) and retention_expires_at > now())', t);
  end loop;
end;
$$;

create or replace function public.purge_expired_client_board_loop_records(
  p_tenant_slug text, p_apply boolean default false, p_batch_limit integer default 100
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_days integer;
  v_cutoff timestamptz := now() - interval '7 days';
  v_deleted jsonb;
  v_candidates jsonb;
  v_counts integer[] := array[0,0,0,0,0];
  v_tables text[] := array['client_board_comments','client_board_events','client_loop_rounds','client_board_tasks','client_loop_runs'];
  i integer;
  v_count integer;
  v_total integer := 0;
begin
  if p_tenant_slug is null or p_tenant_slug !~ '^[a-z][a-z0-9-]{2,40}$' or p_apply is null
     or p_batch_limit is null or p_batch_limit < 1 or p_batch_limit > 500 then
    raise exception 'client_board_loop_retention_invalid_input';
  end if;
  select retention_days into v_days from public.client_tenants where slug = p_tenant_slug for update;
  if not found then raise exception 'client_board_loop_retention_tenant_not_found'; end if;
  if v_days is null or v_days < 1 or v_days > 28 then raise exception 'client_board_loop_retention_tenant_not_configured'; end if;

  select jsonb_build_object(
    'boardComments', (select count(*) from public.client_board_comments where tenant_slug=p_tenant_slug and retention_expires_at <= v_cutoff),
    'boardEvents', (select count(*) from public.client_board_events where tenant_slug=p_tenant_slug and retention_expires_at <= v_cutoff),
    'loopRounds', (select count(*) from public.client_loop_rounds where tenant_slug=p_tenant_slug and retention_expires_at <= v_cutoff),
    'boardTasks', (select count(*) from public.client_board_tasks where tenant_slug=p_tenant_slug and retention_expires_at <= v_cutoff),
    'loopRuns', (select count(*) from public.client_loop_runs where tenant_slug=p_tenant_slug and retention_expires_at <= v_cutoff)
  ) into v_candidates;
  if p_apply then
    for i in 1..array_length(v_tables,1) loop
      execute format('with chosen as (select ctid from public.%I where tenant_slug=$1 and retention_expires_at <= $2 order by retention_expires_at limit $3 for update skip locked), removed as (delete from public.%I t using chosen where t.ctid=chosen.ctid returning 1) select count(*) from removed', v_tables[i], v_tables[i])
        into v_count using p_tenant_slug, v_cutoff, p_batch_limit;
      v_counts[i] := v_count;
      v_total := v_total + v_count;
    end loop;
  end if;
  v_deleted := v_candidates;
  if p_apply then
    v_deleted := jsonb_build_object(
      'boardComments', (select count(*) from public.client_board_comments where tenant_slug=p_tenant_slug and retention_expires_at <= v_cutoff),
      'boardEvents', (select count(*) from public.client_board_events where tenant_slug=p_tenant_slug and retention_expires_at <= v_cutoff),
      'loopRounds', (select count(*) from public.client_loop_rounds where tenant_slug=p_tenant_slug and retention_expires_at <= v_cutoff),
      'boardTasks', (select count(*) from public.client_board_tasks where tenant_slug=p_tenant_slug and retention_expires_at <= v_cutoff),
      'loopRuns', (select count(*) from public.client_loop_runs where tenant_slug=p_tenant_slug and retention_expires_at <= v_cutoff)
    );
  end if;
  if v_total > 0 then
    insert into public.client_runtime_audit_events(tenant_slug,event_type,metadata)
    values (p_tenant_slug,'tenant.board_loop.retention_purged',jsonb_build_object(
      'deleted',jsonb_build_object('boardComments',v_counts[1],'boardEvents',v_counts[2],'loopRounds',v_counts[3],'boardTasks',v_counts[4],'loopRuns',v_counts[5]),
      'retentionDays',v_days,'recoveryDays',7,'purgeAfterDays',v_days+7));
  end if;
  return jsonb_build_object('tenant',p_tenant_slug,'expiredOrPurgeDue',v_deleted,'deleted',jsonb_build_object(
    'boardComments',v_counts[1],'boardEvents',v_counts[2],'loopRounds',v_counts[3],'boardTasks',v_counts[4],'loopRuns',v_counts[5]),
    'retentionDays',v_days,'recoveryDays',7,'purgeAfterDays',v_days+7,'applied',p_apply,
    'batchLimitPerTable',p_batch_limit,'scope',to_jsonb(v_tables));
end;
$$;
revoke all on function public.purge_expired_client_board_loop_records(text,boolean,integer) from public, anon, authenticated;
grant execute on function public.purge_expired_client_board_loop_records(text,boolean,integer) to service_role;

create or replace function public.update_client_board_task_worker(text,text,uuid,jsonb)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
  p_tenant_slug alias for $1; p_worker_token alias for $2; p_job_id alias for $3; p_patch alias for $4;
  next_status text; next_execution text; target uuid;
begin
  if p_worker_token is null or length(p_worker_token)<24 or p_patch is null or jsonb_typeof(p_patch)<>'object'
     or pg_column_size(p_patch)>262144 or not exists(select 1 from public.client_tenants where slug=p_tenant_slug and status='active' and worker_token_hash=encode(digest(p_worker_token,'sha256'),'hex')) then return false; end if;
  next_status:=p_patch->>'status'; next_execution:=p_patch->>'execution_state';
  if next_status is not null and next_status not in ('triage','todo','ready','running','blocked','done','archived','queued','building','reviewing','rejected') then return false; end if;
  if next_execution is not null and next_execution not in ('queued','running','succeeded','failed','cancelled') then return false; end if;
  update public.client_board_tasks set status=coalesce(next_status,status),execution_state=coalesce(next_execution,execution_state),
    execution_error=case when next_execution in ('succeeded','running') then null else coalesce(left(p_patch->>'execution_error',120),execution_error) end,
    build_artifact_id=coalesce((p_patch->>'build_artifact_id')::uuid,build_artifact_id),
    build_preview_html=coalesce(left(p_patch->>'build_preview_html',40000),build_preview_html),result=coalesce(left(p_patch->>'result',20000),result),
    started_at=coalesce(started_at,now()),completed_at=case when next_execution in ('succeeded','failed','cancelled') then now() else completed_at end,updated_at=now()
  where tenant_slug=p_tenant_slug and execution_job_id=p_job_id and retention_expires_at>now() returning id into target;
  if target is null then return false; end if;
  insert into public.client_board_events(tenant_slug,task_id,kind,detail) values(p_tenant_slug,target,coalesce(next_execution,'updated'),left(coalesce(p_patch->>'execution_error',''),2000));
  return true;
end; $$;

create or replace function public.append_client_loop_round_worker(text,text,uuid,integer,boolean,integer,text[],text,integer,bigint,text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
  p_tenant_slug alias for $1; p_worker_token alias for $2; p_job_id alias for $3; p_round alias for $4;
  p_passed alias for $5; p_score alias for $6; p_issues alias for $7; p_summary alias for $8;
  p_artifact_chars alias for $9; p_cost_micros alias for $10; p_error_code alias for $11;
  target uuid; bounded_issues text[];
begin
  if p_worker_token is null or length(p_worker_token)<24 or p_round is null or p_round<1 or p_round>5
     or not exists(select 1 from public.client_tenants where slug=p_tenant_slug and status='active' and worker_token_hash=encode(digest(p_worker_token,'sha256'),'hex')) then return false; end if;
  select id into target from public.client_loop_runs where tenant_slug=p_tenant_slug and job_id=p_job_id and retention_expires_at>now();
  if target is null then return false; end if;
  bounded_issues:=coalesce(p_issues,'{}'::text[]);
  if coalesce(array_length(bounded_issues,1),0)>8 then bounded_issues:=bounded_issues[1:8]; end if;
  insert into public.client_loop_rounds(tenant_slug,run_id,round,passed,score,issues,summary,artifact_chars,cost_micros,error_code)
    values(p_tenant_slug,target,p_round,coalesce(p_passed,false),greatest(0,least(100,coalesce(p_score,0))),bounded_issues,left(coalesce(p_summary,''),4000),greatest(0,coalesce(p_artifact_chars,0)),greatest(0,coalesce(p_cost_micros,0)),p_error_code)
    on conflict(tenant_slug,run_id,round) do nothing;
  update public.client_loop_runs set rounds_completed=greatest(rounds_completed,p_round),best_score=greatest(coalesce(best_score,0),greatest(0,least(100,coalesce(p_score,0)))),cost_micros=cost_micros+greatest(0,coalesce(p_cost_micros,0)),status='running',updated_at=now()
    where id=target and retention_expires_at>now();
  return found;
end; $$;

create or replace function public.settle_client_loop_run_worker(text,text,uuid,text,text,uuid,text,text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
  p_tenant_slug alias for $1; p_worker_token alias for $2; p_job_id alias for $3; p_status alias for $4;
  p_final_summary alias for $5; p_build_artifact_id alias for $6; p_build_preview_html alias for $7; p_error_code alias for $8;
begin
  if p_worker_token is null or length(p_worker_token)<24 or p_status not in ('running','passed','exhausted','failed','cancelled')
     or not exists(select 1 from public.client_tenants where slug=p_tenant_slug and status='active' and worker_token_hash=encode(digest(p_worker_token,'sha256'),'hex')) then return false; end if;
  update public.client_loop_runs set status=p_status,final_summary=coalesce(left(p_final_summary,4000),final_summary),
    build_artifact_id=coalesce(p_build_artifact_id,build_artifact_id),build_preview_html=coalesce(left(p_build_preview_html,40000),build_preview_html),
    error_code=case when p_status in ('passed','running') then null else p_error_code end,updated_at=now()
  where tenant_slug=p_tenant_slug and job_id=p_job_id and retention_expires_at>now();
  return found;
end; $$;

revoke all on function public.update_client_board_task_worker(text,text,uuid,jsonb) from public,authenticated;
grant execute on function public.update_client_board_task_worker(text,text,uuid,jsonb) to anon;
revoke all on function public.append_client_loop_round_worker(text,text,uuid,integer,boolean,integer,text[],text,integer,bigint,text) from public,authenticated;
grant execute on function public.append_client_loop_round_worker(text,text,uuid,integer,boolean,integer,text[],text,integer,bigint,text) to anon;
revoke all on function public.settle_client_loop_run_worker(text,text,uuid,text,text,uuid,text,text) from public,authenticated;
grant execute on function public.settle_client_loop_run_worker(text,text,uuid,text,text,uuid,text,text) to anon;

commit;
