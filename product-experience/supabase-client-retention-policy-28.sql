-- Apply after client runtime, notebook, artifact, and ECC tables exist.
-- Tenant content is active for at most 28 days from item creation. Private
-- Cloud Storage objects then remain recoverable for the separately approved
-- seven-day soft-delete window (up to 35 days total recoverability).
-- Billing/credit records and minimized security/audit evidence are not
-- automatically purged by this content-retention policy.

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
