-- Apply after supabase-client-runtime-hosted-capabilities.sql.
-- Tenant-scoped memory graph foundation. It indexes explicit Markdown tags
-- from active memory records; no provider prompt or credential is involved.

create table if not exists public.client_runtime_memory_graph_nodes (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  record_id uuid references public.client_runtime_records(id) on delete cascade,
  graph_key text not null check (length(graph_key) between 1 and 300),
  label text not null check (length(label) between 1 and 240),
  kind text not null check (kind in ('document', 'tag')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_slug, graph_key)
);

create index if not exists client_memory_graph_nodes_tenant_kind_idx
  on public.client_runtime_memory_graph_nodes (tenant_slug, kind, label);

create table if not exists public.client_runtime_memory_graph_edges (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  source_node_id uuid not null references public.client_runtime_memory_graph_nodes(id) on delete cascade,
  target_node_id uuid not null references public.client_runtime_memory_graph_nodes(id) on delete cascade,
  relation text not null check (relation in ('tagged')),
  weight integer not null default 1 check (weight between 1 and 1000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_slug, source_node_id, target_node_id, relation),
  check (source_node_id <> target_node_id)
);

create index if not exists client_memory_graph_edges_tenant_source_idx
  on public.client_runtime_memory_graph_edges (tenant_slug, source_node_id);
create index if not exists client_memory_graph_edges_tenant_target_idx
  on public.client_runtime_memory_graph_edges (tenant_slug, target_node_id);

alter table public.client_runtime_memory_graph_nodes enable row level security;
alter table public.client_runtime_memory_graph_edges enable row level security;

drop policy if exists client_memory_graph_nodes_member_select on public.client_runtime_memory_graph_nodes;
create policy client_memory_graph_nodes_member_select on public.client_runtime_memory_graph_nodes
  for select to authenticated using (public.client_member(tenant_slug));
drop policy if exists client_memory_graph_edges_member_select on public.client_runtime_memory_graph_edges;
create policy client_memory_graph_edges_member_select on public.client_runtime_memory_graph_edges
  for select to authenticated using (public.client_member(tenant_slug));

grant select on public.client_runtime_memory_graph_nodes to authenticated;
grant select on public.client_runtime_memory_graph_edges to authenticated;

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

  delete from public.client_runtime_memory_graph_edges
    where tenant_slug = p_tenant_slug;
  delete from public.client_runtime_memory_graph_nodes
    where tenant_slug = p_tenant_slug;

  insert into public.client_runtime_memory_graph_nodes
    (tenant_slug, record_id, graph_key, label, kind, metadata)
  select
    record.tenant_slug,
    record.id,
    'record:' || record.id::text,
    record.title,
    'document',
    jsonb_build_object('record_id', record.id, 'status', record.status)
  from public.client_runtime_records as record
  where record.tenant_slug = p_tenant_slug
    and record.kind = 'memory'
    and record.status = 'active'
    and record.created_at > now() - make_interval(days => public.client_tenant_retention_days(p_tenant_slug));

  insert into public.client_runtime_memory_graph_nodes
    (tenant_slug, graph_key, label, kind, metadata)
  select
    p_tenant_slug,
    'tag:' || tag.tag,
    '#' || tag.tag,
    'tag',
    jsonb_build_object('tag', tag.tag)
  from (
    select distinct lower(matches.tag_parts[1]) as tag
    from public.client_runtime_records as record
    cross join lateral regexp_matches(
      lower(record.title || E'\\n' || record.content),
      '#([a-z0-9][a-z0-9_-]{1,47})',
      'g'
    ) as matches(tag_parts)
    where record.tenant_slug = p_tenant_slug
      and record.kind = 'memory'
      and record.status = 'active'
      and record.created_at > now() - make_interval(days => public.client_tenant_retention_days(p_tenant_slug))
  ) as tag
  on conflict (tenant_slug, graph_key) do nothing;

  insert into public.client_runtime_memory_graph_edges
    (tenant_slug, source_node_id, target_node_id, relation, weight, metadata)
  select
    p_tenant_slug,
    document_node.id,
    tag_node.id,
    'tagged',
    1,
    jsonb_build_object('record_id', tags.record_id, 'tag', tags.tag)
  from (
    select distinct record.id as record_id, lower(matches.tag_parts[1]) as tag
    from public.client_runtime_records as record
    cross join lateral regexp_matches(
      lower(record.title || E'\\n' || record.content),
      '#([a-z0-9][a-z0-9_-]{1,47})',
      'g'
    ) as matches(tag_parts)
    where record.tenant_slug = p_tenant_slug
      and record.kind = 'memory'
      and record.status = 'active'
      and record.created_at > now() - make_interval(days => public.client_tenant_retention_days(p_tenant_slug))
  ) as tags
  join public.client_runtime_memory_graph_nodes as document_node
    on document_node.tenant_slug = p_tenant_slug
    and document_node.graph_key = 'record:' || tags.record_id::text
  join public.client_runtime_memory_graph_nodes as tag_node
    on tag_node.tenant_slug = p_tenant_slug
    and tag_node.graph_key = 'tag:' || tags.tag
  on conflict (tenant_slug, source_node_id, target_node_id, relation) do nothing;

  return true;
end;
$$;

revoke all on function public.refresh_client_runtime_memory_graph(text) from public, anon;
grant execute on function public.refresh_client_runtime_memory_graph(text) to authenticated;
