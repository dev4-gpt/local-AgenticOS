-- Apply after supabase-client-runtime-lifecycle.sql and hosted-capabilities.sql.
-- Member artifact mutations must be scoped to the uploading member or the
-- requester of the producing job. Worker artifacts use their separate RPC.

create or replace function public.confirm_client_runtime_artifact(
  p_tenant_slug text,
  p_artifact_id uuid,
  p_byte_size bigint,
  p_content_type text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not public.client_member(p_tenant_slug)
     or p_artifact_id is null
     or p_byte_size < 1
     or length(coalesce(p_content_type, '')) = 0 then
    return false;
  end if;

  update public.client_runtime_artifacts
    set status = 'ready',
        byte_size = p_byte_size,
        content_type = left(p_content_type, 180),
        uploaded_at = now()
  where id = p_artifact_id
    and tenant_slug = p_tenant_slug
    and created_by = auth.uid()
    and status = 'pending'
    and retention_expires_at > now();

  return found;
end;
$$;

revoke all on function public.confirm_client_runtime_artifact(text, uuid, bigint, text) from public, anon;
grant execute on function public.confirm_client_runtime_artifact(text, uuid, bigint, text) to authenticated;

create or replace function public.delete_client_runtime_artifact(
  p_tenant_slug text,
  p_artifact_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not public.client_member(p_tenant_slug)
     or p_artifact_id is null then
    return false;
  end if;

  delete from public.client_runtime_artifacts a
  where a.id = p_artifact_id
    and a.tenant_slug = p_tenant_slug
    and (
      a.created_by = auth.uid()
      or exists (
        select 1 from public.client_runtime_jobs j
        where j.id = a.job_id
          and j.tenant_slug = a.tenant_slug
          and j.requested_by = auth.uid()
      )
    );

  return found;
end;
$$;

revoke all on function public.delete_client_runtime_artifact(text, uuid) from public, anon;
grant execute on function public.delete_client_runtime_artifact(text, uuid) to authenticated;

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
  requested_artifacts jsonb := coalesce(p_artifact_ids, '[]'::jsonb);
begin
  if auth.uid() is null
     or not public.client_member(p_tenant_slug)
     or p_request_id is null
     or p_action not in ('review', 'handoff', 'release', 'record')
     or length(coalesce(p_idempotency_key, '')) < 8
     or length(coalesce(p_idempotency_key, '')) > 180
     or (p_action in ('handoff', 'release') and length(coalesce(p_destination, '')) = 0)
     or jsonb_typeof(requested_artifacts) <> 'array'
     or not exists (
       select 1 from public.client_runtime_requests
       where id = p_request_id
         and tenant_slug = p_tenant_slug
         and request_type = 'deliver'
         and submitted_by = auth.uid()
     ) then
    return null;
  end if;
  if jsonb_array_length(requested_artifacts) > 20 then return null; end if;

  if exists (
    select 1 from jsonb_array_elements_text(requested_artifacts) as requested(value)
    where requested.value !~ '^[0-9a-fA-F-]{36}$'
       or not exists (
         select 1 from public.client_runtime_artifacts a
         where a.id::text = requested.value
           and a.tenant_slug = p_tenant_slug
           and a.status = 'ready'
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
       )
  ) then
    return null;
  end if;

  insert into public.client_runtime_delivery_actions
    (tenant_slug, request_id, requested_by, action, destination, artifact_ids, idempotency_key)
  values
    (p_tenant_slug, p_request_id, auth.uid(), p_action, nullif(left(p_destination, 500), ''), requested_artifacts, left(p_idempotency_key, 180))
  on conflict (tenant_slug, idempotency_key) do update
    set updated_at = now()
    where public.client_runtime_delivery_actions.requested_by = auth.uid()
      and public.client_runtime_delivery_actions.request_id = p_request_id
  returning id into action_id;

  return action_id;
end;
$$;

revoke all on function public.create_client_delivery_action(text, uuid, text, text, jsonb, text) from public, anon;
grant execute on function public.create_client_delivery_action(text, uuid, text, text, jsonb, text) to authenticated;
