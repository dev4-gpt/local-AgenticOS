-- Apply after the source-pack RPC guard. Extends the private legacy importer
-- without changing the guarded public entrypoint or its worker-token policy.
begin;

do $$
begin
  if to_regprocedure('public.import_client_runtime_source_pack_legacy(text,uuid,text,jsonb)') is null
     or to_regprocedure('public.import_client_runtime_source_pack(text,uuid,text,jsonb,text)') is null then
    raise exception 'source_pack_guard_migration_missing';
  end if;
  if has_function_privilege('authenticated', 'public.import_client_runtime_source_pack_legacy(text,uuid,text,jsonb)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.import_client_runtime_source_pack_legacy(text,uuid,text,jsonb)', 'EXECUTE') then
    raise exception 'source_pack_legacy_must_remain_private';
  end if;
end;
$$;

create or replace function public.import_client_runtime_source_pack_legacy(
  p_tenant_slug text,
  p_artifact_id uuid,
  p_pack_sha256 text,
  p_sources jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_total integer;
  v_existing integer;
  v_written integer;
  v_inserted integer;
  v_link_count integer;
begin
  if auth.uid() is null or not public.client_member(p_tenant_slug) then
    raise exception 'tenant_not_authorized';
  end if;
  perform 1 from public.client_tenants where slug = p_tenant_slug for update;
  if not exists (
    select 1 from public.client_runtime_artifacts as artifact
    where artifact.id = p_artifact_id
      and artifact.tenant_slug = p_tenant_slug
      and artifact.created_by = auth.uid()
      and artifact.status = 'ready'
      and artifact.content_type = 'application/json'
  ) then
    raise exception 'source_artifact_not_verified';
  end if;
  if p_pack_sha256 !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_sources) is distinct from 'array' then
    raise exception 'source_pack_invalid';
  end if;
  v_total := jsonb_array_length(p_sources);
  if v_total < 1 or v_total > 100 then
    raise exception 'source_pack_size_invalid';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_sources) as source(value)
    where jsonb_typeof(source.value) is distinct from 'object'
      or coalesce(length(source.value ->> 'title'), 0) not between 1 and 240
      or coalesce(length(source.value ->> 'text'), 0) not between 1 and 30000
      or coalesce(source.value ->> 'sourceUrl', '') !~ '^https?://[^[:space:]]+$'
      or coalesce(source.value ->> 'sourceImportKey', '') !~ '^[a-f0-9]{64}$'
      or (source.value ? 'publishedAt' and source.value ->> 'publishedAt' is not null
        and (source.value ->> 'publishedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          or (source.value ->> 'publishedAt')::date::text <> source.value ->> 'publishedAt'))
      or jsonb_typeof(source.value -> 'links') is distinct from 'array'
      or jsonb_array_length(case when jsonb_typeof(source.value -> 'links') = 'array' then source.value -> 'links' else '[]'::jsonb end) > 100
  ) then
    raise exception 'source_pack_item_invalid';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_sources) as source(value)
    group by source.value ->> 'sourceImportKey'
    having count(*) > 1
  ) then
    raise exception 'source_pack_duplicate_source';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_sources) as source(value)
    cross join lateral jsonb_array_elements(source.value -> 'links') as link(value)
    where coalesce(link.value ->> 'url', '') !~ '^https?://[^[:space:]]+$'
      or length(coalesce(link.value ->> 'text', '')) > 300
  ) then
    raise exception 'source_pack_link_invalid';
  end if;
  select coalesce(sum(jsonb_array_length(source.value -> 'links')), 0) into v_link_count
  from jsonb_array_elements(p_sources) as source(value);

  select count(*) into v_existing
  from public.client_runtime_records as record
  join jsonb_array_elements(p_sources) as source(value)
    on record.metadata ->> 'source_import_key' = source.value ->> 'sourceImportKey'
  where record.tenant_slug = p_tenant_slug and record.kind = 'memory';

  insert into public.client_runtime_records
    (tenant_slug, created_by, kind, title, content, metadata)
  select
    p_tenant_slug,
    auth.uid(),
    'memory',
    source.value ->> 'title',
    source.value ->> 'text',
    jsonb_build_object(
      'source', 'user_source_pack',
      'source_url', source.value ->> 'sourceUrl',
      'source_tab', source.value ->> 'tab',
      'source_links', source.value -> 'links',
      'source_import_key', source.value ->> 'sourceImportKey',
      'source_collected_at', source.value ->> 'collectedAt',
      'source_published_at', source.value ->> 'publishedAt',
      'source_artifact_id', p_artifact_id,
      'source_pack_sha256', p_pack_sha256,
      'imported_at', now()
    )
  from jsonb_array_elements(p_sources) as source(value)
  on conflict (tenant_slug, (metadata ->> 'source_import_key'))
    where kind = 'memory' and metadata ? 'source_import_key'
  do update set
    title = excluded.title,
    content = excluded.content,
    status = 'active',
    metadata = client_runtime_records.metadata || excluded.metadata
  where client_runtime_records.title is distinct from excluded.title
    or client_runtime_records.content is distinct from excluded.content
    or client_runtime_records.status is distinct from 'active'
    or client_runtime_records.metadata ->> 'source_url' is distinct from excluded.metadata ->> 'source_url'
    or client_runtime_records.metadata ->> 'source_tab' is distinct from excluded.metadata ->> 'source_tab'
    or client_runtime_records.metadata -> 'source_links' is distinct from excluded.metadata -> 'source_links'
    or client_runtime_records.metadata ->> 'source_collected_at' is distinct from excluded.metadata ->> 'source_collected_at'
    or client_runtime_records.metadata ->> 'source_published_at' is distinct from excluded.metadata ->> 'source_published_at';
  get diagnostics v_written = row_count;
  v_inserted := v_total - v_existing;
  if v_written > 0 and not public.refresh_client_runtime_memory_graph(p_tenant_slug) then
    raise exception 'source_graph_refresh_failed';
  end if;
  insert into public.client_runtime_audit_events (tenant_slug, actor_id, event_type, metadata)
  values (p_tenant_slug, auth.uid(), 'tenant.source_pack.imported', jsonb_build_object(
    'artifactId', p_artifact_id,
    'packSha256', p_pack_sha256,
    'sourceCount', v_total,
    'linkCount', v_link_count,
    'imported', v_inserted,
    'updated', v_written - v_inserted,
    'duplicates', v_total - v_written
  ));
  return jsonb_build_object('imported', v_inserted, 'updated', v_written - v_inserted, 'duplicates', v_total - v_written, 'graphRefreshed', v_written > 0);
end;
$$;

revoke all on function public.import_client_runtime_source_pack_legacy(text, uuid, text, jsonb)
  from public, anon, authenticated, service_role;

commit;
