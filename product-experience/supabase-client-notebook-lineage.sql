-- Apply after supabase-client-notebooks.sql.
--
-- Notebook sources are lineage records, not a URL fetcher. Extraction and
-- retrieval workers must receive an explicit source id list and write chunks
-- back through the tenant-scoped worker RPCs below.

create table if not exists public.client_notebook_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  notebook_id uuid references public.client_notebooks(id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users(id),
  kind text not null check (kind in ('pdf', 'web', 'audio', 'repository')),
  title text not null check (length(title) between 1 and 240),
  source_url text,
  artifact_id uuid references public.client_runtime_artifacts(id) on delete set null,
  source_hash text check (source_hash is null or source_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'registered' check (status in ('registered', 'extracting', 'ready', 'failed', 'deleted')),
  failure_reason text,
  retention_expires_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((source_url is not null) <> (artifact_id is not null))
);

create unique index if not exists client_notebook_sources_url_unique
  on public.client_notebook_sources (tenant_slug, source_url) where source_url is not null and deleted_at is null;

create table if not exists public.client_notebook_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  source_id uuid not null references public.client_notebook_sources(id) on delete cascade,
  ordinal integer not null check (ordinal >= 0 and ordinal < 10000),
  content text not null check (length(content) between 1 and 20000),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_id, ordinal),
  unique (source_id, content_hash)
);

create index if not exists client_notebook_sources_tenant_idx
  on public.client_notebook_sources (tenant_slug, status, created_at desc);
create index if not exists client_notebook_chunks_source_idx
  on public.client_notebook_chunks (tenant_slug, source_id, ordinal);

alter table public.client_notebook_sources enable row level security;
alter table public.client_notebook_chunks enable row level security;

drop policy if exists client_notebook_sources_member_select on public.client_notebook_sources;
create policy client_notebook_sources_member_select on public.client_notebook_sources for select to authenticated using (public.client_member(tenant_slug));
drop policy if exists client_notebook_sources_member_insert on public.client_notebook_sources;
create policy client_notebook_sources_member_insert on public.client_notebook_sources for insert to authenticated with check (public.client_member(tenant_slug) and created_by = auth.uid());
drop policy if exists client_notebook_sources_owner_update on public.client_notebook_sources;
create policy client_notebook_sources_owner_update on public.client_notebook_sources for update to authenticated using (public.client_member(tenant_slug) and created_by = auth.uid()) with check (public.client_member(tenant_slug) and created_by = auth.uid());
drop policy if exists client_notebook_sources_owner_delete on public.client_notebook_sources;
create policy client_notebook_sources_owner_delete on public.client_notebook_sources for delete to authenticated using (public.client_member(tenant_slug) and created_by = auth.uid());

drop policy if exists client_notebook_chunks_member_select on public.client_notebook_chunks;
create policy client_notebook_chunks_member_select on public.client_notebook_chunks for select to authenticated using (public.client_member(tenant_slug));

grant select, insert, update, delete on public.client_notebook_sources to authenticated;
grant select on public.client_notebook_chunks to authenticated;

create or replace function public.delete_client_notebook_source(p_tenant_slug text, p_source_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare deleted_count integer;
begin
  if auth.uid() is null or not public.client_member(p_tenant_slug) then return false; end if;
  delete from public.client_notebook_sources
   where tenant_slug = p_tenant_slug and id = p_source_id and created_by = auth.uid();
  get diagnostics deleted_count = row_count;
  return deleted_count = 1;
end;
$$;

revoke all on function public.delete_client_notebook_source(text, uuid) from public;
grant execute on function public.delete_client_notebook_source(text, uuid) to authenticated;
