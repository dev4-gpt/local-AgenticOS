-- Apply after the runtime records and memory graph migrations. Reapply after
-- supabase-client-retention-policy-28.sql to activate the 28-day maximum.
-- This covers runtime records only. Objects, notebooks, backups, and financial
-- records have separate retention paths and must not be inferred from this RPC.
-- Member reads and writes stop at active retention; hard purge waits seven recovery days.

create index if not exists client_runtime_records_tenant_retention_idx
  on public.client_runtime_records (tenant_slug, created_at, id);

create or replace function public.guard_client_runtime_record_retention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_retention_days integer;
begin
  select retention_days into v_retention_days
  from public.client_tenants
  where slug = new.tenant_slug;
  if not found or v_retention_days is null or v_retention_days < 1 or v_retention_days > 28 then
    raise exception 'client_record_retention_tenant_not_configured';
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if new.tenant_slug is distinct from old.tenant_slug
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'client_record_retention_immutable';
  end if;
  if old.created_at <= now() - make_interval(days => v_retention_days) then
    raise exception 'client_runtime_record_expired';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists guard_client_runtime_record_retention on public.client_runtime_records;
create trigger guard_client_runtime_record_retention
  before insert or update on public.client_runtime_records
  for each row execute function public.guard_client_runtime_record_retention();

drop policy if exists client_runtime_records_member_select on public.client_runtime_records;
create policy client_runtime_records_member_select on public.client_runtime_records
  for select to authenticated
  using (public.client_member(tenant_slug)
    and created_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug)));

drop policy if exists client_runtime_records_member_insert on public.client_runtime_records;
create policy client_runtime_records_member_insert on public.client_runtime_records
  for insert to authenticated
  with check (public.client_member(tenant_slug) and created_by = auth.uid()
    and created_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug)));

drop policy if exists client_runtime_records_owner_update on public.client_runtime_records;
create policy client_runtime_records_owner_update on public.client_runtime_records
  for update to authenticated
  using (public.client_member(tenant_slug) and created_by = auth.uid()
    and created_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug)))
  with check (public.client_member(tenant_slug) and created_by = auth.uid()
    and created_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug)));

drop policy if exists client_runtime_records_owner_delete on public.client_runtime_records;
create policy client_runtime_records_owner_delete on public.client_runtime_records
  for delete to authenticated
  using (public.client_member(tenant_slug) and created_by = auth.uid()
    and created_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug)));

drop policy if exists client_memory_graph_nodes_member_select on public.client_runtime_memory_graph_nodes;
create policy client_memory_graph_nodes_member_select on public.client_runtime_memory_graph_nodes
  for select to authenticated
  using (public.client_member(tenant_slug) and (
    (kind = 'document' and exists (
      select 1 from public.client_runtime_records as record
      where record.id = record_id and record.tenant_slug = client_runtime_memory_graph_nodes.tenant_slug
        and record.kind = 'memory' and record.status = 'active'
        and record.created_at > now() - make_interval(days => public.client_tenant_retention_days(record.tenant_slug))
    ))
    or (kind = 'tag' and exists (
      select 1 from public.client_runtime_records as record
      where record.tenant_slug = client_runtime_memory_graph_nodes.tenant_slug
        and record.kind = 'memory' and record.status = 'active'
        and record.created_at > now() - make_interval(days => public.client_tenant_retention_days(record.tenant_slug))
        and position(lower(client_runtime_memory_graph_nodes.label) in lower(record.title || E'\n' || record.content)) > 0
    ))
    or (kind = 'url' and exists (
      select 1 from public.client_runtime_records as record
      where record.tenant_slug = client_runtime_memory_graph_nodes.tenant_slug
        and record.kind = 'memory' and record.status = 'active'
        and record.created_at > now() - make_interval(days => public.client_tenant_retention_days(record.tenant_slug))
        and (record.metadata ->> 'source_url' = client_runtime_memory_graph_nodes.metadata ->> 'url'
          or exists (
            select 1 from jsonb_array_elements(case when jsonb_typeof(record.metadata -> 'source_links') = 'array'
              then record.metadata -> 'source_links' else '[]'::jsonb end) as link(value)
            where link.value ->> 'url' = client_runtime_memory_graph_nodes.metadata ->> 'url'
          ))
    ))
  ));

drop policy if exists client_memory_graph_edges_member_select on public.client_runtime_memory_graph_edges;
create policy client_memory_graph_edges_member_select on public.client_runtime_memory_graph_edges
  for select to authenticated
  using (public.client_member(tenant_slug) and exists (
    select 1
    from public.client_runtime_memory_graph_nodes as document_node
    join public.client_runtime_records as record on record.id = document_node.record_id
    where document_node.id = source_node_id
      and document_node.tenant_slug = client_runtime_memory_graph_edges.tenant_slug
      and document_node.kind = 'document'
      and record.tenant_slug = client_runtime_memory_graph_edges.tenant_slug
      and record.kind = 'memory' and record.status = 'active'
      and record.created_at > now() - make_interval(days => public.client_tenant_retention_days(record.tenant_slug))
  ));

create or replace function public.purge_expired_client_runtime_records(
  p_tenant_slug text,
  p_apply boolean default false,
  p_batch_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_retention_days integer;
  v_cutoff timestamptz;
  v_candidates integer;
  v_deleted integer := 0;
  v_orphan_nodes_deleted integer := 0;
  v_remaining integer;
begin
  if p_tenant_slug is null or p_tenant_slug !~ '^[a-z][a-z0-9-]{2,40}$'
    or p_apply is null or p_batch_limit is null or p_batch_limit < 1 or p_batch_limit > 1000 then
    raise exception 'client_record_retention_invalid_input';
  end if;

  select retention_days into v_retention_days
  from public.client_tenants
  where slug = p_tenant_slug
  for update;
  if not found then
    raise exception 'client_record_retention_tenant_not_found';
  end if;
  if v_retention_days is null or v_retention_days < 1 or v_retention_days > 28 then
    raise exception 'client_record_retention_tenant_not_configured';
  end if;
  v_cutoff := now() - make_interval(days => v_retention_days + 7);

  select count(*) into v_candidates
  from public.client_runtime_records
  where tenant_slug = p_tenant_slug and created_at <= v_cutoff;

  if p_apply then
    with selected as (
      select id from public.client_runtime_records
      where tenant_slug = p_tenant_slug and created_at <= v_cutoff
      order by created_at, id
      limit p_batch_limit
      for update skip locked
    ), removed as (
      delete from public.client_runtime_records as record
      using selected
      where record.id = selected.id and record.tenant_slug = p_tenant_slug
      returning record.id
    )
    select count(*) into v_deleted from removed;

    if v_deleted > 0 then
      delete from public.client_runtime_memory_graph_nodes as node
      where node.tenant_slug = p_tenant_slug
        and node.kind in ('tag', 'url')
        and not exists (
          select 1 from public.client_runtime_memory_graph_edges as edge
          where edge.tenant_slug = p_tenant_slug
            and (edge.source_node_id = node.id or edge.target_node_id = node.id)
        );
      get diagnostics v_orphan_nodes_deleted = row_count;

      insert into public.client_runtime_audit_events (tenant_slug, event_type, metadata)
      values (p_tenant_slug, 'tenant.runtime_records.retention_purged',
        jsonb_build_object('deleted', v_deleted, 'graphOrphanNodesDeleted', v_orphan_nodes_deleted,
          'cutoff', v_cutoff, 'retentionDays', v_retention_days,
          'recoveryDays', 7, 'purgeAfterDays', v_retention_days + 7));
    end if;
  end if;

  select count(*) into v_remaining
  from public.client_runtime_records
  where tenant_slug = p_tenant_slug and created_at <= v_cutoff;

  return jsonb_build_object(
    'tenant', p_tenant_slug, 'cutoff', v_cutoff, 'retentionDays', v_retention_days,
    'recoveryDays', 7, 'purgeAfterDays', v_retention_days + 7,
    'candidates', v_candidates, 'deleted', v_deleted,
    'remainingCandidates', v_remaining, 'graphOrphanNodesDeleted', v_orphan_nodes_deleted,
    'applied', p_apply, 'scope', 'client_runtime_records'
  );
end;
$$;

revoke all on function public.purge_expired_client_runtime_records(text, boolean, integer) from public, anon, authenticated;
grant execute on function public.purge_expired_client_runtime_records(text, boolean, integer) to service_role;
