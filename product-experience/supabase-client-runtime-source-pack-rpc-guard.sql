-- Apply after supabase-client-runtime-source-pack-graph.sql and the artifact
-- lifecycle migration. Keep the original import body as a non-member-callable
-- implementation, then admit imports only from the artifact-review route.
begin;

do $$
begin
  if to_regprocedure('public.import_client_runtime_source_pack_legacy(text,uuid,text,jsonb)') is null then
    if to_regprocedure('public.import_client_runtime_source_pack(text,uuid,text,jsonb)') is null then
      raise exception 'source_pack_base_migration_missing';
    end if;
    alter function public.import_client_runtime_source_pack(text, uuid, text, jsonb)
      rename to import_client_runtime_source_pack_legacy;
  end if;
end;
$$;

revoke all on function public.import_client_runtime_source_pack_legacy(text, uuid, text, jsonb)
  from public, anon, authenticated;

-- An earlier version of this guard exposed a four-argument member RPC.
-- Revoke it during an in-place upgrade; a fresh install renamed it above.
do $$
begin
  if to_regprocedure('public.import_client_runtime_source_pack(text,uuid,text,jsonb)') is not null then
    revoke all on function public.import_client_runtime_source_pack(text, uuid, text, jsonb)
      from public, anon, authenticated;
  end if;
end;
$$;

create or replace function public.import_client_runtime_source_pack(
  p_tenant_slug text,
  p_artifact_id uuid,
  p_pack_sha256 text,
  p_sources jsonb,
  p_worker_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null or not public.client_member(p_tenant_slug) then
    raise exception 'tenant_not_authorized';
  end if;
  if length(coalesce(p_worker_token, '')) < 24 or not exists (
    select 1 from public.client_tenants t
    where t.slug = p_tenant_slug
      and t.status = 'active'
      and t.worker_token_hash = encode(extensions.digest(p_worker_token, 'sha256'), 'hex')
  ) then
    raise exception 'source_import_verifier_unavailable';
  end if;
  if p_artifact_id is null or not exists (
    select 1 from public.client_runtime_artifacts a
    where a.id = p_artifact_id
      and a.tenant_slug = p_tenant_slug
      and a.created_by = auth.uid()
      and a.status = 'ready'
      and a.content_type = 'application/json'
      and a.retention_expires_at > now()
  ) then
    raise exception 'source_artifact_not_verified';
  end if;
  if jsonb_typeof(p_sources) is distinct from 'array'
     or octet_length(p_sources::text) > 1250000 then
    raise exception 'source_pack_invalid';
  end if;

  -- Serialize imports in one tenant so another member cannot insert a key
  -- between the ownership check and the legacy upsert.
  perform pg_advisory_xact_lock(1735402026, hashtext(p_tenant_slug));

  if exists (
    select 1 from public.client_runtime_records r
    join jsonb_array_elements(p_sources) as source(value)
      on r.metadata ->> 'source_import_key' = source.value ->> 'sourceImportKey'
    where r.tenant_slug = p_tenant_slug
      and r.kind = 'memory'
      and r.created_by <> auth.uid()
  ) then
    raise exception 'source_pack_owned_by_other_member';
  end if;

  return public.import_client_runtime_source_pack_legacy(
    p_tenant_slug, p_artifact_id, p_pack_sha256, p_sources
  );
end;
$$;

revoke all on function public.import_client_runtime_source_pack(text, uuid, text, jsonb, text)
  from public, anon;
grant execute on function public.import_client_runtime_source_pack(text, uuid, text, jsonb, text)
  to authenticated;

commit;
