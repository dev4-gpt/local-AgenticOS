-- Apply after v43 ECC learning and the client runtime control-plane migration.
-- A source can expire before a learning item created from it. Preserve the
-- learning item's own configured retention clock (capped at 28 days) when a
-- source job or record is removed.

alter table public.client_learning_items
  drop constraint if exists client_learning_items_tenant_slug_source_job_id_fkey;
alter table public.client_learning_items
  add constraint client_learning_items_tenant_slug_source_job_id_fkey
  foreign key (tenant_slug, source_job_id)
  references public.client_runtime_jobs (tenant_slug, id)
  on delete set null (source_job_id);

alter table public.client_learning_items
  drop constraint if exists client_learning_items_tenant_slug_source_record_id_fkey;
alter table public.client_learning_items
  add constraint client_learning_items_tenant_slug_source_record_id_fkey
  foreign key (tenant_slug, source_record_id)
  references public.client_runtime_records (tenant_slug, id)
  on delete set null (source_record_id);

create or replace function public.client_learning_retention_references_ready()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with required(name, parent, source_column) as (
    values
      ('client_learning_items_tenant_slug_source_job_id_fkey', 'public.client_runtime_jobs'::regclass, 'source_job_id'),
      ('client_learning_items_tenant_slug_source_record_id_fkey', 'public.client_runtime_records'::regclass, 'source_record_id')
  )
  select count(*) = 2
  from required
  join pg_constraint as fk on fk.conname = required.name
  join pg_attribute as source on source.attrelid = 'public.client_learning_items'::regclass
    and source.attname = required.source_column
  where fk.conrelid = 'public.client_learning_items'::regclass
    and fk.confrelid = required.parent
    and fk.contype = 'f'
    and fk.confdeltype = 'n'
    and fk.confdelsetcols = array[source.attnum]::smallint[];
$$;

revoke all on function public.client_learning_retention_references_ready() from public, anon, authenticated;
grant execute on function public.client_learning_retention_references_ready() to service_role;
