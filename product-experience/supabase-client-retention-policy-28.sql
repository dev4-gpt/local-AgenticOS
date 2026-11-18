-- Apply after client runtime, notebook, artifact, and ECC tables exist.
-- Selected policy: all tenant data and files are active for their configured
-- per-item retention (at most 28 days), then recovery-only for seven days.
-- This migration only caps expiry metadata; family-specific read barriers and
-- purge paths must also be installed and verified. It does not implement the
-- policy for every tenant table, export, backup, vendor copy, or legal hold.

begin;

alter table public.client_tenants
  alter column retention_days set default 28;

update public.client_tenants
set retention_days = 28, updated_at = now()
where retention_days > 28;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.client_tenants'::regclass
      and conname = 'client_tenants_retention_days_max_28'
  ) then
    alter table public.client_tenants
      add constraint client_tenants_retention_days_max_28
      check (retention_days between 1 and 28) not valid;
  end if;
end;
$$;

alter table public.client_tenants
  validate constraint client_tenants_retention_days_max_28;

create or replace function public.client_tenant_retention_days(p_tenant_slug text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select retention_days
  from public.client_tenants
  where slug = p_tenant_slug
    and public.client_member(p_tenant_slug)
$$;
revoke all on function public.client_tenant_retention_days(text) from public, anon;
grant execute on function public.client_tenant_retention_days(text) to authenticated, service_role;

do $$
begin
  if to_regclass('public.client_runtime_artifacts') is not null then
    execute $sql$
      update public.client_runtime_artifacts
      set retention_expires_at = case
        when retention_expires_at is null then created_at + interval '28 days'
        else least(retention_expires_at, created_at + interval '28 days')
      end
      where retention_expires_at is null
        or retention_expires_at > created_at + interval '28 days'
    $sql$;
  end if;
  if to_regclass('public.client_notebook_sources') is not null then
    execute $sql$
      update public.client_notebook_sources
      set retention_expires_at = case
        when retention_expires_at is null then created_at + interval '28 days'
        else least(retention_expires_at, created_at + interval '28 days')
      end
      where retention_expires_at is null
        or retention_expires_at > created_at + interval '28 days'
    $sql$;
  end if;
  if to_regclass('public.client_learning_items') is not null then
    execute $sql$
      update public.client_learning_items
      set retention_expires_at = case
        when retention_expires_at is null then created_at + interval '28 days'
        else least(retention_expires_at, created_at + interval '28 days')
      end
      where retention_expires_at is null
        or retention_expires_at > created_at + interval '28 days'
    $sql$;
  end if;
  if to_regclass('public.client_ecc_skill_revisions') is not null
     and to_regclass('public.client_learning_items') is not null then
    execute $sql$
      update public.client_ecc_skill_revisions as revision
      set expires_at = case
        when revision.expires_at is null then item.retention_expires_at
        else least(revision.expires_at, item.retention_expires_at)
      end
      from public.client_learning_items as item
      where item.tenant_slug = revision.tenant_slug
        and item.id = revision.item_id
        and (revision.expires_at is null or revision.expires_at > item.retention_expires_at)
    $sql$;
  end if;
end;
$$;

commit;
