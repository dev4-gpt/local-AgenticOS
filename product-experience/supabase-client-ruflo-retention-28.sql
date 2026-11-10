-- Apply after supabase-client-ruflo.sql and supabase-client-retention-policy-28.sql.
-- Swarm and agent content expires per item and is purged after seven recovery days.
begin;

alter table public.client_ruflo_swarms add column if not exists retention_expires_at timestamptz;
alter table public.client_ruflo_agents add column if not exists retention_expires_at timestamptz;

update public.client_ruflo_swarms s
set retention_expires_at = greatest(s.created_at + interval '1 microsecond', least(
  coalesce(s.retention_expires_at, s.created_at + make_interval(days => greatest(1, least(t.retention_days, 28)))),
  s.created_at + make_interval(days => greatest(1, least(t.retention_days, 28))), s.created_at + interval '28 days'))
from public.client_tenants t
where t.slug = s.tenant_slug and s.retention_expires_at is distinct from greatest(s.created_at + interval '1 microsecond', least(
  coalesce(s.retention_expires_at, s.created_at + make_interval(days => greatest(1, least(t.retention_days, 28)))),
  s.created_at + make_interval(days => greatest(1, least(t.retention_days, 28))), s.created_at + interval '28 days'));

update public.client_ruflo_agents a
set retention_expires_at = greatest(a.created_at + interval '1 microsecond', least(
  coalesce(a.retention_expires_at, a.created_at + make_interval(days => greatest(1, least(t.retention_days, 28)))),
  a.created_at + make_interval(days => greatest(1, least(t.retention_days, 28))), a.created_at + interval '28 days'))
from public.client_tenants t
where t.slug = a.tenant_slug
  and a.retention_expires_at is distinct from greatest(a.created_at + interval '1 microsecond', least(
    coalesce(a.retention_expires_at, a.created_at + make_interval(days => greatest(1, least(t.retention_days, 28)))),
    a.created_at + make_interval(days => greatest(1, least(t.retention_days, 28))), a.created_at + interval '28 days'));

alter table public.client_ruflo_swarms alter column retention_expires_at set not null;
alter table public.client_ruflo_agents alter column retention_expires_at set not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.client_ruflo_swarms'::regclass and conname='client_ruflo_swarms_retention_after_create') then
    alter table public.client_ruflo_swarms add constraint client_ruflo_swarms_retention_after_create check (retention_expires_at > created_at) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.client_ruflo_agents'::regclass and conname='client_ruflo_agents_retention_after_create') then
    alter table public.client_ruflo_agents add constraint client_ruflo_agents_retention_after_create check (retention_expires_at > created_at) not valid;
  end if;
end;
$$;
alter table public.client_ruflo_swarms validate constraint client_ruflo_swarms_retention_after_create;
alter table public.client_ruflo_agents validate constraint client_ruflo_agents_retention_after_create;
create index if not exists client_ruflo_swarms_tenant_retention_idx on public.client_ruflo_swarms(tenant_slug, retention_expires_at, id);
create index if not exists client_ruflo_agents_tenant_retention_idx on public.client_ruflo_agents(tenant_slug, retention_expires_at, id);

create or replace function public.guard_client_ruflo_retention()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_days integer;
  v_created timestamptz;
  v_expiry timestamptz;
  v_row jsonb;
begin
  select retention_days into v_days from public.client_tenants where slug = new.tenant_slug;
  if v_days is null or v_days < 1 or v_days > 28 then raise exception 'ruflo_retention_tenant_not_configured'; end if;
  v_row := to_jsonb(new);
  if tg_op = 'INSERT' then
    v_created := now();
    v_expiry := v_created + make_interval(days => v_days);
    if tg_table_name = 'client_ruflo_agents' then
      select retention_expires_at into v_expiry from public.client_ruflo_swarms
        where id = new.swarm_id and tenant_slug = new.tenant_slug for update;
      if v_expiry is null or v_expiry <= now() then raise exception 'ruflo_swarm_expired_or_foreign'; end if;
      v_expiry := now() + make_interval(days => v_days);
    end if;
    v_row := jsonb_set(v_row, '{created_at}', to_jsonb(v_created));
    v_row := jsonb_set(v_row, '{retention_expires_at}', to_jsonb(least(coalesce((v_row->>'retention_expires_at')::timestamptz, v_expiry), v_expiry, v_created + interval '28 days')));
    if v_row ? 'updated_at' then v_row := jsonb_set(v_row, '{updated_at}', to_jsonb(v_created)); end if;
    if (v_row->>'retention_expires_at')::timestamptz <= v_created then raise exception 'ruflo_retention_expiry_invalid'; end if;
    new := jsonb_populate_record(new, v_row);
    return new;
  end if;
  if new.tenant_slug is distinct from old.tenant_slug or new.created_at is distinct from old.created_at
     or new.retention_expires_at is distinct from old.retention_expires_at
     or (tg_table_name = 'client_ruflo_agents' and new.swarm_id is distinct from old.swarm_id) then
    raise exception 'ruflo_retention_immutable';
  end if;
  if old.retention_expires_at <= now() then raise exception 'ruflo_content_expired'; end if;
  if tg_table_name = 'client_ruflo_swarms' then new.updated_at := now(); end if;
  return new;
end;
$$;

drop trigger if exists client_ruflo_swarms_retention_guard on public.client_ruflo_swarms;
create trigger client_ruflo_swarms_retention_guard before insert or update on public.client_ruflo_swarms
for each row execute function public.guard_client_ruflo_retention();
drop trigger if exists client_ruflo_agents_retention_guard on public.client_ruflo_agents;
create trigger client_ruflo_agents_retention_guard before insert or update on public.client_ruflo_agents
for each row execute function public.guard_client_ruflo_retention();

drop policy if exists client_ruflo_swarms_member_select on public.client_ruflo_swarms;
create policy client_ruflo_swarms_member_select on public.client_ruflo_swarms for select to authenticated
using (public.client_member(tenant_slug) and retention_expires_at > now());
drop policy if exists client_ruflo_agents_member_select on public.client_ruflo_agents;
create policy client_ruflo_agents_member_select on public.client_ruflo_agents for select to authenticated
using (public.client_member(tenant_slug) and retention_expires_at > now());
drop policy if exists client_ruflo_swarms_member_insert on public.client_ruflo_swarms;
create policy client_ruflo_swarms_member_insert on public.client_ruflo_swarms for insert to authenticated
with check (public.client_member(tenant_slug) and retention_expires_at > now());
drop policy if exists client_ruflo_agents_member_insert on public.client_ruflo_agents;
create policy client_ruflo_agents_member_insert on public.client_ruflo_agents for insert to authenticated
with check (public.client_member(tenant_slug) and retention_expires_at > now());
drop policy if exists client_ruflo_swarms_member_update on public.client_ruflo_swarms;
create policy client_ruflo_swarms_member_update on public.client_ruflo_swarms for update to authenticated
using (public.client_member(tenant_slug) and retention_expires_at > now()) with check (public.client_member(tenant_slug) and retention_expires_at > now());
drop policy if exists client_ruflo_agents_member_update on public.client_ruflo_agents;
create policy client_ruflo_agents_member_update on public.client_ruflo_agents for update to authenticated
using (public.client_member(tenant_slug) and retention_expires_at > now()) with check (public.client_member(tenant_slug) and retention_expires_at > now());
drop policy if exists client_ruflo_swarms_member_delete on public.client_ruflo_swarms;
create policy client_ruflo_swarms_member_delete on public.client_ruflo_swarms for delete to authenticated
using (public.client_member(tenant_slug) and retention_expires_at > now());
drop policy if exists client_ruflo_agents_member_delete on public.client_ruflo_agents;
create policy client_ruflo_agents_member_delete on public.client_ruflo_agents for delete to authenticated
using (public.client_member(tenant_slug) and retention_expires_at > now());

create or replace function public.purge_expired_client_ruflo_records(p_tenant_slug text, p_apply boolean default false, p_batch_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_days integer;
  v_cutoff timestamptz := now() - interval '7 days';
  v_agent_candidates integer;
  v_swarm_candidates integer;
  v_agents_deleted integer := 0;
  v_swarms_deleted integer := 0;
begin
  if p_tenant_slug is null or p_tenant_slug !~ '^[a-z][a-z0-9-]{2,40}$' or p_apply is null
     or p_batch_limit is null or p_batch_limit < 1 or p_batch_limit > 500 then raise exception 'ruflo_retention_invalid_input'; end if;
  select retention_days into v_days from public.client_tenants where slug = p_tenant_slug for update;
  if not found then raise exception 'ruflo_retention_tenant_not_found'; end if;
  if v_days is null or v_days < 1 or v_days > 28 then raise exception 'ruflo_retention_tenant_not_configured'; end if;
  select count(*) into v_agent_candidates from public.client_ruflo_agents where tenant_slug = p_tenant_slug and retention_expires_at <= v_cutoff;
  select count(*) into v_swarm_candidates from public.client_ruflo_swarms where tenant_slug = p_tenant_slug and retention_expires_at <= v_cutoff;
  if p_apply then
    with chosen as (
      select ctid from public.client_ruflo_agents where tenant_slug = p_tenant_slug and retention_expires_at <= v_cutoff
      order by retention_expires_at, id limit p_batch_limit for update skip locked
    ), removed as (delete from public.client_ruflo_agents a using chosen where a.ctid = chosen.ctid returning 1)
    select count(*) into v_agents_deleted from removed;
    with chosen as (
      select s.ctid from public.client_ruflo_swarms s where s.tenant_slug = p_tenant_slug and s.retention_expires_at <= v_cutoff
        and not exists (select 1 from public.client_ruflo_agents a where a.swarm_id = s.id)
      order by s.retention_expires_at, s.id limit p_batch_limit for update skip locked
    ), removed as (delete from public.client_ruflo_swarms s using chosen where s.ctid = chosen.ctid returning 1)
    select count(*) into v_swarms_deleted from removed;
  end if;
  if v_agents_deleted + v_swarms_deleted > 0 then
    insert into public.client_runtime_audit_events(tenant_slug, event_type, metadata)
    values (p_tenant_slug, 'tenant.ruflo.retention_purged', jsonb_build_object(
      'agents', v_agents_deleted, 'swarms', v_swarms_deleted, 'retentionDays', v_days,
      'recoveryDays', 7, 'purgeAfterDays', v_days + 7));
  end if;
  return jsonb_build_object('tenant', p_tenant_slug,
    'expiredOrPurgeDue', jsonb_build_object('agents', v_agent_candidates, 'swarms', v_swarm_candidates),
    'deleted', jsonb_build_object('agents', v_agents_deleted, 'swarms', v_swarms_deleted),
    'retentionDays', v_days, 'recoveryDays', 7, 'purgeAfterDays', v_days + 7,
    'applied', p_apply, 'batchLimitPerTable', p_batch_limit,
    'scope', jsonb_build_array('client_ruflo_agents', 'client_ruflo_swarms'));
end;
$$;

revoke all on function public.guard_client_ruflo_retention() from public, anon, authenticated;
revoke all on function public.purge_expired_client_ruflo_records(text, boolean, integer) from public, anon, authenticated;
grant execute on function public.purge_expired_client_ruflo_records(text, boolean, integer) to service_role;

commit;
