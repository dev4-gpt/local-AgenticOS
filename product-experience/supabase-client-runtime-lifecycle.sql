-- Apply after supabase-client-runtime-controls.sql.
-- Artifact lifecycle metadata. Object bytes remain in the tenant's private
-- Cloud Storage bucket; this table never contains provider credentials.

alter table public.client_runtime_artifacts
  add column if not exists original_name text,
  add column if not exists status text not null default 'pending',
  add column if not exists uploaded_at timestamptz;

create index if not exists client_artifacts_tenant_status_idx
  on public.client_runtime_artifacts (tenant_slug, status, created_at desc);

create or replace function public.confirm_client_runtime_artifact_worker(
  p_tenant_slug text,
  p_artifact_id uuid,
  p_worker_token text,
  p_byte_size bigint,
  p_content_type text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_worker_token is null or length(p_worker_token) < 24
     or p_byte_size < 0
     or length(coalesce(p_content_type, '')) = 0
     or not exists (
       select 1 from public.client_tenants
       where slug = p_tenant_slug
         and status = 'active'
         and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     ) then
    return false;
  end if;

  update public.client_runtime_artifacts
    set status = 'ready',
        byte_size = p_byte_size,
        content_type = left(p_content_type, 180),
        uploaded_at = now()
  where id = p_artifact_id
    and tenant_slug = p_tenant_slug
    and status = 'pending';

  return found;
end;
$$;

revoke all on function public.confirm_client_runtime_artifact_worker(text, uuid, text, bigint, text)
  from public, authenticated;
grant execute on function public.confirm_client_runtime_artifact_worker(text, uuid, text, bigint, text)
  to anon;
