-- Apply after Room retention and runtime-job retention, before Room directive
-- review and the current lifecycle-restore migration. No clock is renewed.
begin;

drop trigger if exists guard_client_room_conversation_retention on public.client_room_conversations;
drop trigger if exists guard_client_room_message_retention on public.client_room_messages;
drop trigger if exists guard_client_room_round_retention on public.client_room_rounds;

alter table public.client_room_conversations add column if not exists retention_expires_at timestamptz;
alter table public.client_room_messages add column if not exists retention_expires_at timestamptz;
alter table public.client_room_rounds add column if not exists retention_expires_at timestamptz;

update public.client_room_conversations as row
set retention_expires_at = least(row.retention_expires_at, row.created_at + make_interval(days => tenant.retention_days))
from public.client_tenants as tenant where tenant.slug = row.tenant_slug and tenant.retention_days between 1 and 28;
update public.client_room_messages as row
set retention_expires_at = least(row.retention_expires_at, row.created_at + make_interval(days => tenant.retention_days), parent.retention_expires_at)
from public.client_tenants as tenant, public.client_room_conversations as parent
where tenant.slug = row.tenant_slug and parent.tenant_slug = row.tenant_slug and parent.id = row.conversation_id and tenant.retention_days between 1 and 28;
update public.client_room_rounds as row
set retention_expires_at = least(row.retention_expires_at, row.created_at + make_interval(days => tenant.retention_days), parent.retention_expires_at)
from public.client_tenants as tenant, public.client_room_conversations as parent
where tenant.slug = row.tenant_slug and parent.tenant_slug = row.tenant_slug and parent.id = row.conversation_id and tenant.retention_days between 1 and 28;

alter table public.client_room_conversations alter column retention_expires_at set not null;
alter table public.client_room_messages alter column retention_expires_at set not null;
alter table public.client_room_rounds alter column retention_expires_at set not null;
create unique index if not exists client_room_conversations_tenant_id_idx on public.client_room_conversations(tenant_slug,id);
do $constraints$
declare t text;
begin
  foreach t in array array['client_room_messages','client_room_rounds'] loop
    if not exists(select 1 from pg_constraint where conrelid=format('public.%I',t)::regclass and conname=t||'_tenant_parent_fk') then
      execute format('alter table public.%I add constraint %I foreign key(tenant_slug,conversation_id) references public.client_room_conversations(tenant_slug,id) on delete cascade',t,t||'_tenant_parent_fk');
    end if;
  end loop;
  foreach t in array array['client_room_conversations','client_room_messages','client_room_rounds'] loop
    if not exists(select 1 from pg_constraint where conrelid=format('public.%I',t)::regclass and conname=t||'_fixed_expiry') then
      execute format('alter table public.%I add constraint %I check(isfinite(retention_expires_at) and retention_expires_at <= created_at + interval ''28 days'')',t,t||'_fixed_expiry');
    end if;
    execute format('create index if not exists %I on public.%I(tenant_slug,retention_expires_at,id)',t||'_fixed_retention_idx',t);
  end loop;
end;
$constraints$;

create or replace function public.guard_client_room_retention()
returns trigger language plpgsql security definer set search_path=public as $$
declare days integer; parent_expiry timestamptz;
begin
  select retention_days into days from public.client_tenants where slug=new.tenant_slug;
  if days is null or days not between 1 and 28 then raise exception 'client_room_retention_tenant_not_configured'; end if;
  if tg_op='UPDATE' then
    if new.tenant_slug is distinct from old.tenant_slug or new.created_at is distinct from old.created_at
      or new.retention_expires_at is distinct from old.retention_expires_at
      or (tg_table_name<>'client_room_conversations' and to_jsonb(new)->'conversation_id' is distinct from to_jsonb(old)->'conversation_id') then
      raise exception 'client_room_retention_immutable';
    end if;
    if least(old.retention_expires_at,old.created_at+make_interval(days=>days))<=clock_timestamp() then
      if tg_table_name='client_room_rounds' and to_jsonb(new)->>'status' in ('failed','cancelled')
        and (to_jsonb(new)-'status'-'speaking_agent_id'-'completed_agents'-'cost_micros'-'error_code'-'updated_at')=(to_jsonb(old)-'status'-'speaking_agent_id'-'completed_agents'-'cost_micros'-'error_code'-'updated_at')
        and coalesce((to_jsonb(new)->>'cost_micros')::bigint,0)>=coalesce((to_jsonb(old)->>'cost_micros')::bigint,0) then
        return new;
      end if;
      -- Foreign-key cleanup may clear references, never rewrite expired content.
      if (to_jsonb(new)-'job_id'-'linked_record_id'-'updated_at') is distinct from (to_jsonb(old)-'job_id'-'linked_record_id'-'updated_at')
        or (to_jsonb(new)->>'job_id' is not null and to_jsonb(new)->'job_id' is distinct from to_jsonb(old)->'job_id')
        or (to_jsonb(new)->>'linked_record_id' is not null and to_jsonb(new)->'linked_record_id' is distinct from to_jsonb(old)->'linked_record_id') then
        raise exception 'client_room_item_expired';
      end if;
      return new;
    end if;
  else
    new.created_at:=now();
    new.retention_expires_at:=least(new.retention_expires_at,new.created_at+make_interval(days=>days));
  end if;
  if tg_table_name<>'client_room_conversations' then
    select least(retention_expires_at,created_at+make_interval(days=>days)) into parent_expiry
    from public.client_room_conversations
    where id=new.conversation_id and tenant_slug=new.tenant_slug and status='active' for update;
    if not found or parent_expiry<=clock_timestamp() then raise exception 'client_room_conversation_expired_or_foreign'; end if;
    if tg_op='INSERT' then new.retention_expires_at:=least(new.retention_expires_at,parent_expiry); end if;
  end if;
  if tg_op='INSERT' and new.retention_expires_at<=clock_timestamp() then raise exception 'client_room_item_expired'; end if;
  if tg_table_name<>'client_room_messages' then new.updated_at:=now(); end if;
  return new;
end;
$$;

create trigger guard_client_room_conversation_retention before insert or update on public.client_room_conversations for each row execute function public.guard_client_room_retention();
create trigger guard_client_room_message_retention before insert or update on public.client_room_messages for each row execute function public.guard_client_room_retention();
create trigger guard_client_room_round_retention before insert or update on public.client_room_rounds for each row execute function public.guard_client_room_retention();

do $policies$
declare t text; active text;
begin
  foreach t in array array['client_room_conversations','client_room_messages','client_room_rounds'] loop
    active:='retention_expires_at>clock_timestamp() and created_at>clock_timestamp()-make_interval(days=>public.client_tenant_retention_days(tenant_slug))';
    if t<>'client_room_conversations' then
      active:=active||format(' and exists(select 1 from public.client_room_conversations p where p.id=%I.conversation_id and p.tenant_slug=%I.tenant_slug and p.retention_expires_at>clock_timestamp() and p.created_at>clock_timestamp()-make_interval(days=>public.client_tenant_retention_days(p.tenant_slug)))',t,t);
    end if;
    execute format('drop policy if exists %I on public.%I',t||'_member_select',t);
    execute format('create policy %I on public.%I for select to authenticated using(public.client_member(tenant_slug) and (%s))',t||'_member_select',t,active);
    execute format('drop policy if exists %I on public.%I',t||'_member_update',t);
    execute format('create policy %I on public.%I for update to authenticated using(public.client_member(tenant_slug) and (%s)) with check(public.client_member(tenant_slug) and (%s))',t||'_member_update',t,active,active);
  end loop;
end;
$policies$;

-- Pure helper: a Room job carries a server-derived copy of the source clock.
-- Invalid/missing legacy clocks fail closed, with no fresh recovery deadline.
create or replace function public.client_runtime_job_active_until(p_created timestamptz,p_days integer,p_capability text,p_input jsonb)
returns timestamptz language plpgsql immutable set search_path=public as $$
declare origin timestamptz; expiry timestamptz;
begin
  if p_days is null or p_days not between 1 and 28 or p_created is null or not isfinite(p_created) then return null; end if;
  if p_capability is distinct from 'room-round' then return p_created+make_interval(days=>p_days); end if;
  begin
    if jsonb_typeof(p_input->'roomCreatedAt') is distinct from 'string' or jsonb_typeof(p_input->'roomRetentionExpiresAt') is distinct from 'string' then return p_created; end if;
    origin:=(p_input->>'roomCreatedAt')::timestamptz; expiry:=(p_input->>'roomRetentionExpiresAt')::timestamptz;
    if not isfinite(origin) or not isfinite(expiry) or origin>p_created or expiry>origin+interval '28 days' then return p_created; end if;
    return least(p_created+make_interval(days=>p_days),origin+make_interval(days=>p_days),expiry);
  exception when others then return p_created;
  end;
end;
$$;

-- Backfill with source dates, never last activity or migration time. Missing
-- parents get a zero-active window anchored to original job creation.
drop trigger if exists guard_client_runtime_job_retention on public.client_runtime_jobs;
update public.client_runtime_jobs j set input_metadata=coalesce(j.input_metadata,'{}') || jsonb_build_object(
  'roomCreatedAt',coalesce(p.created_at,j.created_at),
  'roomRetentionExpiresAt',least(p.retention_expires_at,coalesce(p.created_at,j.created_at)+make_interval(days=>t.retention_days),j.created_at+make_interval(days=>t.retention_days),
    case when j.input_metadata ? 'roomRetentionExpiresAt' then public.client_runtime_job_active_until(j.created_at,t.retention_days,j.capability,j.input_metadata) end))
from public.client_tenants t left join public.client_room_conversations p on p.tenant_slug=t.slug
where j.tenant_slug=t.slug and j.capability='room-round' and p.id::text=j.input_metadata->>'conversationId';
update public.client_runtime_jobs j set input_metadata=coalesce(j.input_metadata,'{}') || jsonb_build_object('roomCreatedAt',coalesce(j.input_metadata->'roomCreatedAt',to_jsonb(j.created_at)),
  'roomRetentionExpiresAt',least(j.created_at,public.client_runtime_job_active_until(j.created_at,t.retention_days,j.capability,j.input_metadata)))
from public.client_tenants t where t.slug=j.tenant_slug and j.capability='room-round'
  and not exists(select 1 from public.client_room_conversations p where p.tenant_slug=j.tenant_slug and p.id::text=j.input_metadata->>'conversationId');

create or replace function public.guard_client_runtime_job_retention()
returns trigger language plpgsql security definer set search_path=public as $$
declare parent public.client_room_conversations%rowtype; days integer; context jsonb; original_created timestamptz;
begin
  if tg_op='INSERT' then
    new.created_at:=now();
    if new.capability='room-round' then
      select retention_days into days from public.client_tenants where slug=new.tenant_slug;
      if days is null or days not between 1 and 28 or jsonb_typeof(new.input_metadata)<>'object' then raise exception 'client_room_job_retention_invalid'; end if;
      if current_setting('role',true)='service_role' and coalesce(current_setting('app.client_lifecycle_restore',true),'')<>'' then
        context:=current_setting('app.client_lifecycle_restore')::jsonb;
        if context->>'table' is distinct from 'client_runtime_jobs' or context->>'tenant' is distinct from new.tenant_slug or context->>'id' is distinct from new.id::text then raise exception 'client_restore_clock_context_mismatch'; end if;
        original_created:=(context->'clocks'->>'created_at')::timestamptz;
        if coalesce(public.client_runtime_job_active_until(original_created,days,new.capability,new.input_metadata),'-infinity'::timestamptz)<=clock_timestamp() then raise exception 'client_room_job_expired'; end if;
      else
        select * into parent from public.client_room_conversations where tenant_slug=new.tenant_slug
          and id::text=new.input_metadata->>'conversationId' and status='active' for update;
        if not found or least(parent.retention_expires_at,parent.created_at+make_interval(days=>days))<=clock_timestamp() then raise exception 'client_room_job_expired'; end if;
        new.input_metadata:=new.input_metadata||jsonb_build_object('roomCreatedAt',parent.created_at,'roomRetentionExpiresAt',least(parent.retention_expires_at,parent.created_at+make_interval(days=>days)));
      end if;
    end if;
    return new;
  end if;
  if new.tenant_slug is distinct from old.tenant_slug or new.created_at is distinct from old.created_at then raise exception 'client_runtime_job_retention_immutable'; end if;
  if old.capability='room-round' or new.capability='room-round' then
    if new.capability is distinct from old.capability or new.input_metadata->'roomCreatedAt' is distinct from old.input_metadata->'roomCreatedAt'
      or new.input_metadata->'roomRetentionExpiresAt' is distinct from old.input_metadata->'roomRetentionExpiresAt'
      or new.input_metadata->'conversationId' is distinct from old.input_metadata->'conversationId' then raise exception 'client_room_job_retention_immutable'; end if;
    select retention_days into days from public.client_tenants where slug=new.tenant_slug;
    if new.status in ('running','succeeded') and coalesce(public.client_runtime_job_active_until(old.created_at,days,old.capability,old.input_metadata),'-infinity'::timestamptz)<=clock_timestamp() then raise exception 'client_room_job_expired'; end if;
  end if;
  return new;
end;
$$;

create trigger guard_client_runtime_job_retention before insert or update on public.client_runtime_jobs
for each row execute function public.guard_client_runtime_job_retention();

drop policy if exists client_jobs_member_select on public.client_runtime_jobs;
create policy client_jobs_member_select on public.client_runtime_jobs for select to authenticated
using(public.client_member(tenant_slug) and public.client_runtime_job_active_until(created_at,public.client_tenant_retention_days(tenant_slug),capability,input_metadata)>clock_timestamp());

-- Postcondition for the service-role restore after all parent rows are present.
create or replace function public.validate_client_room_restore_graph(p_tenant text)
returns boolean language sql volatile security definer set search_path=public as $$
select not exists(
  select 1 from public.client_runtime_jobs j left join public.client_room_conversations p
    on p.tenant_slug=j.tenant_slug and p.id::text=j.input_metadata->>'conversationId'
  join public.client_tenants t on t.slug=j.tenant_slug
  where j.tenant_slug=p_tenant and j.capability='room-round'
    and (p.id is null or (j.input_metadata->>'roomCreatedAt')::timestamptz is distinct from p.created_at
      or public.client_runtime_job_active_until(j.created_at,t.retention_days,j.capability,j.input_metadata)>least(p.retention_expires_at,p.created_at+make_interval(days=>t.retention_days))
      or public.client_runtime_job_active_until(j.created_at,t.retention_days,j.capability,j.input_metadata)<=clock_timestamp()))
and not exists(
  select 1 from (select tenant_slug,conversation_id,retention_expires_at from public.client_room_messages union all select tenant_slug,conversation_id,retention_expires_at from public.client_room_rounds) child
  join public.client_room_conversations p on p.tenant_slug=child.tenant_slug and p.id=child.conversation_id
  where child.tenant_slug=p_tenant and child.retention_expires_at>p.retention_expires_at)
$$;

revoke all on function public.client_runtime_job_active_until(timestamptz,integer,text,jsonb) from public,anon;
grant execute on function public.client_runtime_job_active_until(timestamptz,integer,text,jsonb) to authenticated,service_role;
revoke all on function public.validate_client_room_restore_graph(text) from public,anon,authenticated;
grant execute on function public.validate_client_room_restore_graph(text) to service_role;

-- Private projection shared by previews and bounded cleanup. No tenant member
-- can use it to bypass RLS or enumerate another tenant's recovery-only rows.
create or replace function public.client_room_purge_candidates(p_tenant text,p_days integer)
returns table(kind text,id uuid,active_until timestamptz)
language sql stable security definer set search_path=public as $$
  select 'messages',m.id,least(m.retention_expires_at,m.created_at+make_interval(days=>p_days),p.retention_expires_at,p.created_at+make_interval(days=>p_days))
  from public.client_room_messages m left join public.client_room_conversations p on p.id=m.conversation_id and p.tenant_slug=m.tenant_slug
  where m.tenant_slug=p_tenant
  union all
  select 'rounds',r.id,least(r.retention_expires_at,r.created_at+make_interval(days=>p_days),p.retention_expires_at,p.created_at+make_interval(days=>p_days))
  from public.client_room_rounds r left join public.client_room_conversations p on p.id=r.conversation_id and p.tenant_slug=r.tenant_slug
  where r.tenant_slug=p_tenant
  union all
  select 'conversations',c.id,least(c.retention_expires_at,c.created_at+make_interval(days=>p_days)) from public.client_room_conversations c where c.tenant_slug=p_tenant
$$;
revoke all on function public.client_room_purge_candidates(text,integer) from public,anon,authenticated,service_role;

create or replace function public.purge_expired_client_room_records(p_tenant_slug text,p_apply boolean default false,p_batch_limit integer default 500)
returns jsonb language plpgsql security definer set search_path=public as $$
declare days integer; candidates jsonb; remaining jsonb; messages integer:=0; rounds integer:=0; conversations integer:=0; deleted jsonb;
begin
  if p_tenant_slug is null or p_tenant_slug !~ '^[a-z][a-z0-9-]{2,40}$' or p_apply is null or p_batch_limit is null or p_batch_limit not between 1 and 1000 then raise exception 'client_room_retention_invalid_input'; end if;
  select retention_days into days from public.client_tenants where slug=p_tenant_slug for update;
  if not found then raise exception 'client_room_retention_tenant_not_found'; end if;
  if days is null or days not between 1 and 28 then raise exception 'client_room_retention_tenant_not_configured'; end if;
  select jsonb_build_object('messages',count(*)filter(where kind='messages'),'rounds',count(*)filter(where kind='rounds'),'conversations',count(*)filter(where kind='conversations')) into candidates
  from public.client_room_purge_candidates(p_tenant_slug,days) where active_until<=clock_timestamp()-interval '7 days';
  if p_apply then
    with selected as (
      select m.id from public.client_room_messages m join public.client_room_purge_candidates(p_tenant_slug,days) c on c.kind='messages' and c.id=m.id
      where m.tenant_slug=p_tenant_slug and c.active_until<=clock_timestamp()-interval '7 days'
      order by c.active_until,m.id limit p_batch_limit for update of m skip locked
    ), removed as (delete from public.client_room_messages m using selected where m.id=selected.id and m.tenant_slug=p_tenant_slug returning m.id)
    select count(*) into messages from removed;
    with selected as (
      select r.id from public.client_room_rounds r join public.client_room_purge_candidates(p_tenant_slug,days) c on c.kind='rounds' and c.id=r.id
      where r.tenant_slug=p_tenant_slug and c.active_until<=clock_timestamp()-interval '7 days'
      order by c.active_until,r.id limit p_batch_limit for update of r skip locked
    ), removed as (delete from public.client_room_rounds r using selected where r.id=selected.id and r.tenant_slug=p_tenant_slug returning r.id)
    select count(*) into rounds from removed;
    with selected as (
      select p.id from public.client_room_conversations p join public.client_room_purge_candidates(p_tenant_slug,days) c on c.kind='conversations' and c.id=p.id
      where p.tenant_slug=p_tenant_slug and c.active_until<=clock_timestamp()-interval '7 days'
        and not exists(select 1 from public.client_room_messages m where m.conversation_id=p.id)
        and not exists(select 1 from public.client_room_rounds r where r.conversation_id=p.id)
      order by c.active_until,p.id limit p_batch_limit for update of p skip locked
    ), removed as (delete from public.client_room_conversations p using selected where p.id=selected.id and p.tenant_slug=p_tenant_slug returning p.id)
    select count(*) into conversations from removed;
  end if;
  deleted:=jsonb_build_object('messages',messages,'rounds',rounds,'conversations',conversations);
  if messages+rounds+conversations>0 then
    insert into public.client_runtime_audit_events(tenant_slug,event_type,metadata) values(p_tenant_slug,'tenant.room.retention_purged',jsonb_build_object('deleted',deleted,'retentionDays',days,'recoveryDays',7,'purgeAfterDays',days+7,'clock','fixed-original-deadline'));
  end if;
  select jsonb_build_object('messages',count(*)filter(where kind='messages'),'rounds',count(*)filter(where kind='rounds'),'conversations',count(*)filter(where kind='conversations')) into remaining
  from public.client_room_purge_candidates(p_tenant_slug,days) where active_until<=clock_timestamp()-interval '7 days';
  return jsonb_build_object('tenant',p_tenant_slug,'retentionDays',days,'recoveryDays',7,'purgeAfterDays',days+7,'candidates',candidates,'deleted',deleted,'remainingCandidates',remaining,'applied',p_apply,
    'scope',jsonb_build_array('client_room_conversations','client_room_messages','client_room_rounds'),'clock','fixed-original-deadline');
end;
$$;

create or replace function public.purge_expired_client_runtime_jobs(p_tenant_slug text,p_apply boolean default false,p_batch_limit integer default 500)
returns jsonb language plpgsql security definer set search_path=public as $$
declare days integer; candidates integer; deleted integer:=0; remaining integer;
begin
  if p_tenant_slug is null or p_tenant_slug !~ '^[a-z][a-z0-9-]{2,40}$' or p_apply is null or p_batch_limit is null or p_batch_limit not between 1 and 1000 then raise exception 'client_runtime_job_retention_invalid_input'; end if;
  select retention_days into days from public.client_tenants where slug=p_tenant_slug for update;
  if not found then raise exception 'client_runtime_job_retention_tenant_not_found'; end if;
  if days is null or days not between 1 and 28 then raise exception 'client_runtime_job_retention_tenant_not_configured'; end if;
  select count(*) into candidates from public.client_runtime_jobs j where tenant_slug=p_tenant_slug and public.client_runtime_job_active_until(j.created_at,days,j.capability,j.input_metadata)<=clock_timestamp()-interval '7 days';
  if p_apply then
    with selected as (
      select j.id from public.client_runtime_jobs j where tenant_slug=p_tenant_slug
        and public.client_runtime_job_active_until(j.created_at,days,j.capability,j.input_metadata)<=clock_timestamp()-interval '7 days'
      order by public.client_runtime_job_active_until(j.created_at,days,j.capability,j.input_metadata),j.id limit p_batch_limit for update skip locked
    ), removed as (delete from public.client_runtime_jobs j using selected where j.id=selected.id and j.tenant_slug=p_tenant_slug returning j.id)
    select count(*) into deleted from removed;
    if deleted>0 then insert into public.client_runtime_audit_events(tenant_slug,event_type,metadata)
      values(p_tenant_slug,'tenant.runtime_jobs.retention_purged',jsonb_build_object('deleted',deleted,'retentionDays',days,'recoveryDays',7,'purgeAfterDays',days+7)); end if;
  end if;
  select count(*) into remaining from public.client_runtime_jobs j where tenant_slug=p_tenant_slug and public.client_runtime_job_active_until(j.created_at,days,j.capability,j.input_metadata)<=clock_timestamp()-interval '7 days';
  return jsonb_build_object('tenant',p_tenant_slug,'retentionDays',days,'recoveryDays',7,'purgeAfterDays',days+7,'candidates',candidates,'deleted',deleted,'remainingCandidates',remaining,'applied',p_apply,'scope','client_runtime_jobs','roomClock','fixed-original-deadline');
end;
$$;
revoke all on function public.purge_expired_client_room_records(text,boolean,integer),public.purge_expired_client_runtime_jobs(text,boolean,integer) from public,anon,authenticated;
grant execute on function public.purge_expired_client_room_records(text,boolean,integer),public.purge_expired_client_runtime_jobs(text,boolean,integer) to service_role;

commit;
