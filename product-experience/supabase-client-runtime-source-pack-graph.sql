-- Apply after supabase-client-runtime-memory-graph.sql, the artifact tables,
-- and supabase-client-runtime-control-plane.sql (audit events).
-- User-provided source packs become tenant memories with canonical URLs. This
-- migration does not authorize automated collection from any platform.

create unique index if not exists client_runtime_records_source_import_key_idx
  on public.client_runtime_records (tenant_slug, (metadata ->> 'source_import_key'))
  where kind = 'memory' and metadata ? 'source_import_key';

alter table public.client_runtime_memory_graph_nodes
  drop constraint if exists client_runtime_memory_graph_nodes_kind_check;
alter table public.client_runtime_memory_graph_nodes
  add constraint client_runtime_memory_graph_nodes_kind_check
  check (kind in ('document', 'tag', 'url'));

alter table public.client_runtime_memory_graph_edges
  drop constraint if exists client_runtime_memory_graph_edges_relation_check;
alter table public.client_runtime_memory_graph_edges
  add constraint client_runtime_memory_graph_edges_relation_check
  check (relation in ('tagged', 'source_at', 'links_to'));

create or replace function public.import_client_runtime_source_pack(
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
    or client_runtime_records.metadata ->> 'source_collected_at' is distinct from excluded.metadata ->> 'source_collected_at';
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

revoke all on function public.import_client_runtime_source_pack(text, uuid, text, jsonb) from public, anon;
grant execute on function public.import_client_runtime_source_pack(text, uuid, text, jsonb) to authenticated;

create or replace function public.refresh_client_runtime_memory_graph(p_tenant_slug text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.client_member(p_tenant_slug) then
    return false;
  end if;
  perform 1 from public.client_tenants where slug = p_tenant_slug for update;

  delete from public.client_runtime_memory_graph_edges where tenant_slug = p_tenant_slug;
  delete from public.client_runtime_memory_graph_nodes where tenant_slug = p_tenant_slug;

  insert into public.client_runtime_memory_graph_nodes
    (tenant_slug, record_id, graph_key, label, kind, metadata)
  select record.tenant_slug, record.id, 'record:' || record.id::text,
    record.title, 'document',
    jsonb_build_object('record_id', record.id, 'status', record.status)
      || case when record.metadata ? 'source_url' then jsonb_build_object('source_url', record.metadata ->> 'source_url') else '{}'::jsonb end
  from public.client_runtime_records as record
  where record.tenant_slug = p_tenant_slug and record.kind = 'memory' and record.status = 'active';

  insert into public.client_runtime_memory_graph_nodes
    (tenant_slug, graph_key, label, kind, metadata)
  select p_tenant_slug, 'tag:' || tag.tag, '#' || tag.tag, 'tag', jsonb_build_object('tag', tag.tag)
  from (
    select distinct lower(matches.tag_parts[1]) as tag
    from public.client_runtime_records as record
    cross join lateral regexp_matches(lower(record.title || E'\n' || record.content), '#([a-z0-9][a-z0-9_-]{1,47})', 'g') as matches(tag_parts)
    where record.tenant_slug = p_tenant_slug and record.kind = 'memory' and record.status = 'active'
  ) as tag
  on conflict (tenant_slug, graph_key) do nothing;

  insert into public.client_runtime_memory_graph_nodes
    (tenant_slug, graph_key, label, kind, metadata)
  select distinct on (url) p_tenant_slug, 'url:' || md5(url), left(coalesce(nullif(label, ''), url), 240), 'url', jsonb_build_object('url', url)
  from (
    select record.metadata ->> 'source_url' as url, record.title as label
    from public.client_runtime_records as record
    where record.tenant_slug = p_tenant_slug and record.kind = 'memory' and record.status = 'active' and record.metadata ? 'source_url'
    union all
    select link.value ->> 'url', link.value ->> 'text'
    from public.client_runtime_records as record
    cross join lateral jsonb_array_elements(case when jsonb_typeof(record.metadata -> 'source_links') = 'array' then record.metadata -> 'source_links' else '[]'::jsonb end) as link(value)
    where record.tenant_slug = p_tenant_slug and record.kind = 'memory' and record.status = 'active'
  ) as urls
  where url ~ '^https?://[^[:space:]]+$'
  order by url, label
  on conflict (tenant_slug, graph_key) do nothing;

  insert into public.client_runtime_memory_graph_edges
    (tenant_slug, source_node_id, target_node_id, relation, weight, metadata)
  select p_tenant_slug, document_node.id, tag_node.id, 'tagged', 1,
    jsonb_build_object('record_id', tags.record_id, 'tag', tags.tag)
  from (
    select distinct record.id as record_id, lower(matches.tag_parts[1]) as tag
    from public.client_runtime_records as record
    cross join lateral regexp_matches(lower(record.title || E'\n' || record.content), '#([a-z0-9][a-z0-9_-]{1,47})', 'g') as matches(tag_parts)
    where record.tenant_slug = p_tenant_slug and record.kind = 'memory' and record.status = 'active'
  ) as tags
  join public.client_runtime_memory_graph_nodes as document_node on document_node.tenant_slug = p_tenant_slug and document_node.graph_key = 'record:' || tags.record_id::text
  join public.client_runtime_memory_graph_nodes as tag_node on tag_node.tenant_slug = p_tenant_slug and tag_node.graph_key = 'tag:' || tags.tag
  on conflict (tenant_slug, source_node_id, target_node_id, relation) do nothing;

  insert into public.client_runtime_memory_graph_edges
    (tenant_slug, source_node_id, target_node_id, relation, weight, metadata)
  select p_tenant_slug, document_node.id, url_node.id, 'source_at', 1, jsonb_build_object('record_id', record.id)
  from public.client_runtime_records as record
  join public.client_runtime_memory_graph_nodes as document_node on document_node.tenant_slug = p_tenant_slug and document_node.graph_key = 'record:' || record.id::text
  join public.client_runtime_memory_graph_nodes as url_node on url_node.tenant_slug = p_tenant_slug and url_node.graph_key = 'url:' || md5(record.metadata ->> 'source_url')
  where record.tenant_slug = p_tenant_slug and record.kind = 'memory' and record.status = 'active' and record.metadata ? 'source_url'
  on conflict (tenant_slug, source_node_id, target_node_id, relation) do nothing;

  insert into public.client_runtime_memory_graph_edges
    (tenant_slug, source_node_id, target_node_id, relation, weight, metadata)
  select p_tenant_slug, document_node.id, url_node.id, 'links_to', 1, jsonb_build_object('record_id', record.id)
  from public.client_runtime_records as record
  cross join lateral jsonb_array_elements(case when jsonb_typeof(record.metadata -> 'source_links') = 'array' then record.metadata -> 'source_links' else '[]'::jsonb end) as link(value)
  join public.client_runtime_memory_graph_nodes as document_node on document_node.tenant_slug = p_tenant_slug and document_node.graph_key = 'record:' || record.id::text
  join public.client_runtime_memory_graph_nodes as url_node on url_node.tenant_slug = p_tenant_slug and url_node.graph_key = 'url:' || md5(link.value ->> 'url')
  where record.tenant_slug = p_tenant_slug and record.kind = 'memory' and record.status = 'active'
  on conflict (tenant_slug, source_node_id, target_node_id, relation) do nothing;

  return true;
end;
$$;

revoke all on function public.refresh_client_runtime_memory_graph(text) from public, anon;
grant execute on function public.refresh_client_runtime_memory_graph(text) to authenticated;

create or replace function public.search_client_runtime_memories(
  p_tenant_slug text,
  p_query text,
  p_offset integer default 0,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_query text := lower(btrim(p_query));
  v_records jsonb;
  v_has_more boolean;
begin
  if auth.uid() is null or not public.client_member(p_tenant_slug) then
    raise exception 'tenant_not_authorized';
  end if;
  if v_query is null or length(v_query) not between 2 and 200
    or p_offset is null or p_offset < 0 or p_offset > 100000
    or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'memory_search_invalid';
  end if;

  select
    coalesce(jsonb_agg(to_jsonb(page) - 'rn' order by page.created_at desc, page.id desc)
      filter (where page.rn <= p_limit), '[]'::jsonb),
    count(*) > p_limit
  into v_records, v_has_more
  from (
    select matched.*, row_number() over (order by matched.created_at desc, matched.id desc) as rn
    from (
      select record.*
      from public.client_runtime_records as record
      where record.tenant_slug = p_tenant_slug
        and record.kind = 'memory'
        and record.status = 'active'
        and (
          position(v_query in lower(record.title || E'\n' || record.content)) > 0
          or position(v_query in lower(coalesce(record.metadata ->> 'source_url', ''))) > 0
          or position(v_query in lower(coalesce(record.metadata -> 'source_links', '[]'::jsonb)::text)) > 0
        )
      order by record.created_at desc, record.id desc
      limit p_limit + 1 offset p_offset
    ) as matched
  ) as page;
  return jsonb_build_object('records', v_records, 'hasMore', v_has_more);
end;
$$;

revoke all on function public.search_client_runtime_memories(text, text, integer, integer) from public, anon;
grant execute on function public.search_client_runtime_memories(text, text, integer, integer) to authenticated;
