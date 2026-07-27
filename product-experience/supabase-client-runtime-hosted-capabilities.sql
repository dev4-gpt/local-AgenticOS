-- Apply after supabase-client-runtime-lifecycle.sql.
-- Hosted capability contracts. These records are tenant-scoped and never
-- contain provider credentials.

create table if not exists public.client_runtime_records (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id),
  kind text not null check (kind in ('memory', 'journal', 'goal', 'notebook')),
  title text not null check (length(title) between 1 and 240),
  content text not null check (length(content) between 1 and 30000),
  status text not null default 'active' check (status in ('active', 'done', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_runtime_records_tenant_kind_idx
  on public.client_runtime_records (tenant_slug, kind, created_at desc);

alter table public.client_runtime_records enable row level security;

drop policy if exists client_runtime_records_member_select on public.client_runtime_records;
create policy client_runtime_records_member_select on public.client_runtime_records
  for select to authenticated using (public.client_member(tenant_slug));
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

grant select, insert, update, delete on public.client_runtime_records to authenticated;

create or replace function public.create_client_runtime_artifact_worker(
  p_tenant_slug text,
  p_job_id uuid,
  p_worker_token text,
  p_namespace text,
  p_object_key text,
  p_original_name text,
  p_content_type text,
  p_byte_size bigint,
  p_retention_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  artifact_id uuid;
begin
  if p_worker_token is null or length(p_worker_token) < 24
     or p_byte_size < 0
     or length(coalesce(p_namespace, '')) < 1
     or length(coalesce(p_object_key, '')) < 1
     or p_object_key not like left(p_namespace, 120) || '/%'
     or length(coalesce(p_original_name, '')) < 1
     or length(coalesce(p_content_type, '')) < 1
     or not exists (
       select 1 from public.client_tenants
       where slug = p_tenant_slug
         and status = 'active'
         and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     ) then
    return null;
  end if;

  if p_job_id is not null and not exists (
    select 1 from public.client_runtime_jobs
    where id = p_job_id
      and tenant_slug = p_tenant_slug
  ) then
    return null;
  end if;

  insert into public.client_runtime_artifacts
    (tenant_slug, job_id, object_key, original_name, content_type, byte_size, status, retention_expires_at)
  values
    (p_tenant_slug, p_job_id, left(p_object_key, 500), left(p_original_name, 180), left(p_content_type, 180), p_byte_size, 'pending', p_retention_expires_at)
  returning id into artifact_id;

  return artifact_id;
end;
$$;

revoke all on function public.create_client_runtime_artifact_worker(text, uuid, text, text, text, text, text, bigint, timestamptz)
  from public, authenticated;
grant execute on function public.create_client_runtime_artifact_worker(text, uuid, text, text, text, text, text, bigint, timestamptz)
  to anon;

create or replace function public.checkpoint_client_runtime_job_worker(
  p_tenant_slug text,
  p_job_id uuid,
  p_worker_token text,
  p_provider_job_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_worker_token is null or length(p_worker_token) < 24
     or length(coalesce(p_provider_job_id, '')) < 1
     or length(p_provider_job_id) > 500
     or not exists (
       select 1 from public.client_tenants
       where slug = p_tenant_slug
         and status = 'active'
         and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     ) then
    return false;
  end if;

  update public.client_runtime_jobs
    set input_metadata = coalesce(input_metadata, '{}'::jsonb)
      || jsonb_build_object('provider_job_id', left(p_provider_job_id, 500)),
        updated_at = now()
  where id = p_job_id
    and tenant_slug = p_tenant_slug
    and status = 'running';

  return found;
end;
$$;

revoke all on function public.checkpoint_client_runtime_job_worker(text, uuid, text, text)
  from public, authenticated;
grant execute on function public.checkpoint_client_runtime_job_worker(text, uuid, text, text)
  to anon;

create table if not exists public.client_runtime_delivery_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  request_id uuid not null references public.client_runtime_requests(id) on delete cascade,
  requested_by uuid not null default auth.uid() references auth.users(id),
  action text not null check (action in ('review', 'handoff', 'release', 'record')),
  destination text,
  artifact_ids jsonb not null default '[]'::jsonb,
  status text not null default 'pending_approval' check (status in ('pending_approval', 'approved', 'running', 'rejected', 'executed', 'failed', 'cancelled')),
  error_code text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_slug, idempotency_key)
);

alter table public.client_runtime_delivery_actions
  add column if not exists error_code text;
alter table public.client_runtime_delivery_actions
  drop constraint if exists client_runtime_delivery_actions_status_check;
alter table public.client_runtime_delivery_actions
  add constraint client_runtime_delivery_actions_status_check
  check (status in ('pending_approval', 'approved', 'running', 'rejected', 'executed', 'failed', 'cancelled'));

create index if not exists client_delivery_actions_tenant_created_idx
  on public.client_runtime_delivery_actions (tenant_slug, created_at desc);

alter table public.client_runtime_delivery_actions enable row level security;

drop policy if exists client_delivery_actions_member_select on public.client_runtime_delivery_actions;
create policy client_delivery_actions_member_select on public.client_runtime_delivery_actions
  for select to authenticated using (public.client_member(tenant_slug));
drop policy if exists client_delivery_actions_member_insert on public.client_runtime_delivery_actions;
create policy client_delivery_actions_member_insert on public.client_runtime_delivery_actions
  for insert to authenticated
  with check (public.client_member(tenant_slug) and requested_by = auth.uid());

grant select, insert on public.client_runtime_delivery_actions to authenticated;

create or replace function public.create_client_delivery_action(
  p_tenant_slug text,
  p_request_id uuid,
  p_action text,
  p_destination text,
  p_artifact_ids jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  action_id uuid;
begin
  if not public.client_member(p_tenant_slug)
     or p_request_id is null
     or p_action not in ('review', 'handoff', 'release', 'record')
     or length(coalesce(p_idempotency_key, '')) < 8
     or length(coalesce(p_idempotency_key, '')) > 180
     or jsonb_typeof(coalesce(p_artifact_ids, '[]'::jsonb)) <> 'array'
     or not exists (
       select 1 from public.client_runtime_requests
       where id = p_request_id
         and tenant_slug = p_tenant_slug
         and request_type = 'deliver'
         and submitted_by = auth.uid()
     )
     or (jsonb_typeof(coalesce(p_artifact_ids, '[]'::jsonb)) = 'array' and exists (
       select 1
       from jsonb_array_elements_text(coalesce(p_artifact_ids, '[]'::jsonb)) as requested(value)
       where requested.value !~ '^[0-9a-fA-F-]{36}$'
          or not exists (
            select 1 from public.client_runtime_artifacts a
            where a.id::text = requested.value
              and a.tenant_slug = p_tenant_slug
              and a.status = 'ready'
          )
     )) then
    return null;
  end if;

  insert into public.client_runtime_delivery_actions
    (tenant_slug, request_id, requested_by, action, destination, artifact_ids, idempotency_key)
  values
    (p_tenant_slug, p_request_id, auth.uid(), p_action, nullif(left(p_destination, 500), ''), coalesce(p_artifact_ids, '[]'::jsonb), left(p_idempotency_key, 180))
  on conflict (tenant_slug, idempotency_key) do update
    set updated_at = now()
  returning id into action_id;

  return action_id;
end;
$$;

revoke all on function public.create_client_delivery_action(text, uuid, text, text, jsonb, text)
  from public, anon;
grant execute on function public.create_client_delivery_action(text, uuid, text, text, jsonb, text)
  to authenticated;

create or replace function public.claim_client_delivery_action_worker(
  p_tenant_slug text,
  p_action_id uuid,
  p_worker_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  action jsonb;
begin
  if p_worker_token is null or length(p_worker_token) < 24
     or not exists (
       select 1 from public.client_tenants
       where slug = p_tenant_slug
         and status = 'active'
         and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     ) then
    return null;
  end if;

  update public.client_runtime_delivery_actions
    set status = 'running', updated_at = now()
  where id = p_action_id
    and tenant_slug = p_tenant_slug
    and status = 'approved'
  returning jsonb_build_object(
    'id', id,
    'tenant_slug', tenant_slug,
    'request_id', request_id,
    'action', action,
    'destination', destination,
    'artifact_ids', artifact_ids
  ) into action;

  return action;
end;
$$;

drop function if exists public.complete_client_delivery_action_worker(text, uuid, text, text);

create or replace function public.complete_client_delivery_action_worker(
  p_tenant_slug text,
  p_action_id uuid,
  p_worker_token text,
  p_status text,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_worker_token is null or length(p_worker_token) < 24
     or p_status not in ('executed', 'failed', 'cancelled')
     or not exists (
       select 1 from public.client_tenants
       where slug = p_tenant_slug
         and status = 'active'
         and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     ) then
    return false;
  end if;

  update public.client_runtime_delivery_actions
    set status = p_status, error_code = left(p_error_code, 120), updated_at = now()
  where id = p_action_id
    and tenant_slug = p_tenant_slug
    and status = 'running';

  return found;
end;
$$;

revoke all on function public.claim_client_delivery_action_worker(text, uuid, text),
  public.complete_client_delivery_action_worker(text, uuid, text, text, text)
  from public, authenticated;
grant execute on function public.claim_client_delivery_action_worker(text, uuid, text),
  public.complete_client_delivery_action_worker(text, uuid, text, text, text)
  to anon;
