-- Apply after supabase-client-notebook-lineage.sql and
-- supabase-client-runtime-artifact-owner-guard.sql.
-- A source may only reference a same-tenant notebook and an active artifact
-- owned by the uploader or the requester of its producing job.

create or replace function public.client_notebook_source_reference_allowed(
  p_tenant_slug text,
  p_notebook_id uuid,
  p_artifact_id uuid,
  p_retention_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not public.client_member(p_tenant_slug)
     or p_retention_expires_at is null
     or p_retention_expires_at <= now() then
    return false;
  end if;

  if p_notebook_id is not null and not exists (
    select 1 from public.client_notebooks n
    where n.id = p_notebook_id and n.tenant_slug = p_tenant_slug
  ) then
    return false;
  end if;

  if p_artifact_id is not null and not exists (
    select 1 from public.client_runtime_artifacts a
    where a.id = p_artifact_id
      and a.tenant_slug = p_tenant_slug
      and a.status = 'ready'
      and a.retention_expires_at >= p_retention_expires_at
      and a.retention_expires_at > now()
      and (
        a.created_by = auth.uid()
        or exists (
          select 1 from public.client_runtime_jobs j
          where j.id = a.job_id
            and j.tenant_slug = a.tenant_slug
            and j.requested_by = auth.uid()
        )
      )
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.client_notebook_source_reference_allowed(text, uuid, uuid, timestamptz) from public, anon;
grant execute on function public.client_notebook_source_reference_allowed(text, uuid, uuid, timestamptz) to authenticated;

drop policy if exists client_notebook_sources_member_insert on public.client_notebook_sources;
create policy client_notebook_sources_member_insert on public.client_notebook_sources
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.client_notebook_source_reference_allowed(tenant_slug, notebook_id, artifact_id, retention_expires_at)
  );

drop policy if exists client_notebook_sources_owner_update on public.client_notebook_sources;
create policy client_notebook_sources_owner_update on public.client_notebook_sources
  for update to authenticated
  using (public.client_member(tenant_slug) and created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and public.client_notebook_source_reference_allowed(tenant_slug, notebook_id, artifact_id, retention_expires_at)
  );
