-- Apply after supabase-client-runtime-control-plane.sql.
-- Standalone tenant-record migration for memory, journal, goals, notebook,
-- and hosted workflow state. It contains no provider credentials.

create table if not exists public.client_runtime_records (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id),
  kind text not null check (kind in ('memory', 'journal', 'goal', 'notebook', 'workflow')),
  title text not null check (length(title) between 1 and 240),
  content text not null check (length(content) between 1 and 30000),
  status text not null default 'active' check (status in ('active', 'done', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_runtime_records
  drop constraint if exists client_runtime_records_kind_check;
alter table public.client_runtime_records
  add constraint client_runtime_records_kind_check
  check (kind in ('memory', 'journal', 'goal', 'notebook', 'workflow'));

create index if not exists client_runtime_records_tenant_kind_idx
  on public.client_runtime_records (tenant_slug, kind, created_at desc);

alter table public.client_runtime_records enable row level security;

drop policy if exists client_runtime_records_member_select on public.client_runtime_records;
create policy client_runtime_records_member_select on public.client_runtime_records
  for select to authenticated
  using (public.client_member(tenant_slug));

drop policy if exists client_runtime_records_member_insert on public.client_runtime_records;
create policy client_runtime_records_member_insert on public.client_runtime_records
  for insert to authenticated
  with check (public.client_member(tenant_slug) and created_by = auth.uid());

drop policy if exists client_runtime_records_owner_update on public.client_runtime_records;
create policy client_runtime_records_owner_update on public.client_runtime_records
  for update to authenticated
  using (public.client_member(tenant_slug) and created_by = auth.uid())
  with check (public.client_member(tenant_slug) and created_by = auth.uid());

drop policy if exists client_runtime_records_owner_delete on public.client_runtime_records;
create policy client_runtime_records_owner_delete on public.client_runtime_records
  for delete to authenticated
  using (public.client_member(tenant_slug) and created_by = auth.uid());

grant select, insert, update, delete
  on public.client_runtime_records
  to authenticated;
