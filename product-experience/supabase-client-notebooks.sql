-- Apply after supabase-client-runtime-records.sql.
--
-- Notebooks as containers. The local Notebook is organised around several
-- notebooks, each scoping its own sources, chat and studio outputs; the hosted
-- edition had a single flat library, which made "ask this notebook" mean "ask
-- everything this tenant has ever imported". This adds the container and links
-- notebook records to it.
--
-- The link is nullable on purpose: records imported before this migration stay
-- valid and simply belong to no notebook, so applying this cannot orphan or
-- hide anything a tenant already owns.
--
-- Contains no provider credentials.

create table if not exists public.client_notebooks (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id),
  title text not null check (length(title) between 1 and 240),
  summary text not null default '' check (length(summary) <= 2000),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_notebooks_tenant_idx
  on public.client_notebooks (tenant_slug, status, created_at desc);

-- Deleting a notebook must not delete the client's sources. The records
-- survive and fall back to the unfiled library, because losing imported
-- material as a side effect of tidying up would be the worse failure.
alter table public.client_runtime_records
  add column if not exists notebook_id uuid references public.client_notebooks(id) on delete set null;

create index if not exists client_runtime_records_notebook_idx
  on public.client_runtime_records (tenant_slug, notebook_id, created_at desc);

alter table public.client_notebooks enable row level security;

drop policy if exists client_notebooks_member_select on public.client_notebooks;
create policy client_notebooks_member_select on public.client_notebooks
  for select to authenticated
  using (public.client_member(tenant_slug));

drop policy if exists client_notebooks_member_insert on public.client_notebooks;
create policy client_notebooks_member_insert on public.client_notebooks
  for insert to authenticated
  with check (public.client_member(tenant_slug) and created_by = auth.uid());

drop policy if exists client_notebooks_owner_update on public.client_notebooks;
create policy client_notebooks_owner_update on public.client_notebooks
  for update to authenticated
  using (public.client_member(tenant_slug) and created_by = auth.uid())
  with check (public.client_member(tenant_slug) and created_by = auth.uid());

drop policy if exists client_notebooks_owner_delete on public.client_notebooks;
create policy client_notebooks_owner_delete on public.client_notebooks
  for delete to authenticated
  using (public.client_member(tenant_slug) and created_by = auth.uid());

grant select, insert, update, delete
  on public.client_notebooks
  to authenticated;
