-- Apply after supabase-client-retention-policy-28.sql,
-- supabase-client-notebooks.sql, notebook lineage, and audit-event tables.
-- Expiring a notebook removes its metadata only. Sources and runtime records
-- are detached by their SET NULL foreign keys and keep their own retention.
-- Member reads expire at active retention; hard purge waits seven recovery days.

begin;

create or replace function public.guard_client_notebook_container_retention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_retention_days integer;
begin
  select retention_days into v_retention_days
  from public.client_tenants
  where slug = new.tenant_slug;
  if v_retention_days is null or v_retention_days < 1 or v_retention_days > 28 then
    raise exception 'client_notebook_container_retention_unconfigured';
  end if;

  if tg_op = 'UPDATE' then
    if new.tenant_slug is distinct from old.tenant_slug
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'client_notebook_container_identity_immutable';
    end if;
    if old.created_at <= now() - make_interval(days => v_retention_days) then
      raise exception 'client_notebook_container_expired';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if auth.role() = 'authenticated' then
    new.created_at := now();
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists guard_client_notebook_container_retention on public.client_notebooks;
create trigger guard_client_notebook_container_retention
  before insert or update on public.client_notebooks
  for each row execute function public.guard_client_notebook_container_retention();
revoke all on function public.guard_client_notebook_container_retention() from public, anon, authenticated;

create index if not exists client_notebooks_tenant_retention_idx
  on public.client_notebooks (tenant_slug, created_at, id);

create or replace function public.guard_active_client_notebook_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_retention_days integer;
begin
  if new.notebook_id is null then return new; end if;
  select retention_days into v_retention_days
  from public.client_tenants where slug = new.tenant_slug;
  if v_retention_days is null or v_retention_days < 1 or v_retention_days > 28
     or not exists (
       select 1 from public.client_notebooks as notebook
       where notebook.id = new.notebook_id
         and notebook.tenant_slug = new.tenant_slug
         and notebook.created_at > now() - make_interval(days => v_retention_days)
     ) then
    raise exception 'client_notebook_reference_expired_or_foreign';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_active_client_notebook_reference() from public, anon, authenticated;

drop trigger if exists guard_active_client_notebook_reference on public.client_runtime_records;
create trigger guard_active_client_notebook_reference
  before insert or update of notebook_id on public.client_runtime_records
  for each row execute function public.guard_active_client_notebook_reference();
drop trigger if exists guard_active_client_notebook_source_reference on public.client_notebook_sources;
create trigger guard_active_client_notebook_source_reference
  before insert or update of notebook_id on public.client_notebook_sources
  for each row execute function public.guard_active_client_notebook_reference();

drop policy if exists client_notebooks_member_select on public.client_notebooks;
create policy client_notebooks_member_select on public.client_notebooks
  for select to authenticated
  using (
    public.client_member(tenant_slug)
    and created_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug))
  );

drop policy if exists client_notebooks_member_insert on public.client_notebooks;
create policy client_notebooks_member_insert on public.client_notebooks
  for insert to authenticated
  with check (
    public.client_member(tenant_slug)
    and created_by = auth.uid()
    and created_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug))
  );

drop policy if exists client_notebooks_owner_update on public.client_notebooks;
create policy client_notebooks_owner_update on public.client_notebooks
  for update to authenticated
  using (
    public.client_member(tenant_slug)
    and created_by = auth.uid()
    and created_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug))
  )
  with check (
    public.client_member(tenant_slug)
    and created_by = auth.uid()
    and created_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug))
  );

create or replace function public.purge_expired_client_notebooks(
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
  v_candidates integer;
  v_deleted integer := 0;
  v_remaining integer;
begin
  if p_tenant_slug is null or p_tenant_slug !~ '^[a-z][a-z0-9-]{2,40}$'
     or p_apply is null or p_batch_limit is null
     or p_batch_limit < 1 or p_batch_limit > 500 then
    raise exception 'client_notebook_container_retention_invalid_input';
  end if;

  select retention_days into v_retention_days
  from public.client_tenants
  where slug = p_tenant_slug
  for update;
  if not found then
    raise exception 'client_notebook_container_retention_tenant_not_found';
  end if;
  if v_retention_days is null or v_retention_days < 1 or v_retention_days > 28 then
    raise exception 'client_notebook_container_retention_unconfigured';
  end if;
  v_cutoff := now() - make_interval(days => v_retention_days + 7);

  select count(*) into v_candidates from public.client_notebooks
   where tenant_slug = p_tenant_slug and created_at <= v_cutoff;

  if p_apply then
    with selected as (
      select id from public.client_notebooks
       where tenant_slug = p_tenant_slug and created_at <= v_cutoff
       order by created_at, id limit p_batch_limit for update skip locked
    ), removed as (
      delete from public.client_notebooks as notebook
       using selected where notebook.id = selected.id
        and notebook.tenant_slug = p_tenant_slug returning notebook.id
    ) select count(*) into v_deleted from removed;

    if v_deleted > 0 then
      insert into public.client_runtime_audit_events (tenant_slug, event_type, metadata)
      values (p_tenant_slug, 'tenant.notebooks.retention_purged', jsonb_build_object(
        'deleted', v_deleted, 'cutoff', v_cutoff, 'retentionDays', v_retention_days,
        'recoveryDays', 7, 'purgeAfterDays', v_retention_days + 7,
        'linkedContentPolicy', 'detach_not_delete'
      ));
    end if;
  end if;

  select count(*) into v_remaining from public.client_notebooks
   where tenant_slug = p_tenant_slug and created_at <= v_cutoff;

  return jsonb_build_object(
    'tenant', p_tenant_slug, 'cutoff', v_cutoff, 'retentionDays', v_retention_days,
    'recoveryDays', 7, 'purgeAfterDays', v_retention_days + 7,
    'candidates', v_candidates, 'deleted', v_deleted,
    'remainingCandidates', v_remaining, 'applied', p_apply,
    'scope', 'client_notebooks_metadata_only'
  );
end;
$$;

revoke all on function public.purge_expired_client_notebooks(text, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.purge_expired_client_notebooks(text, boolean, integer)
  to service_role;

commit;
