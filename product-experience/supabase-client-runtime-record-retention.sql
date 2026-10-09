-- Apply after the runtime records and memory graph migrations.
-- This covers runtime records only. Objects, notebooks, backups, and financial
-- records have separate retention paths and must not be inferred from this RPC.

create index if not exists client_runtime_records_tenant_retention_idx
  on public.client_runtime_records (tenant_slug, created_at, id);

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
  v_cutoff timestamptz := now() - interval '45 days';
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
  if v_retention_days <> 45 then
    raise exception 'client_record_retention_tenant_not_configured';
  end if;

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
          'cutoff', v_cutoff, 'retentionDays', 45));
    end if;
  end if;

  select count(*) into v_remaining
  from public.client_runtime_records
  where tenant_slug = p_tenant_slug and created_at <= v_cutoff;

  return jsonb_build_object(
    'tenant', p_tenant_slug, 'cutoff', v_cutoff, 'retentionDays', 45,
    'candidates', v_candidates, 'deleted', v_deleted,
    'remainingCandidates', v_remaining, 'graphOrphanNodesDeleted', v_orphan_nodes_deleted,
    'applied', p_apply, 'scope', 'client_runtime_records'
  );
end;
$$;

revoke all on function public.purge_expired_client_runtime_records(text, boolean, integer) from public, anon, authenticated;
grant execute on function public.purge_expired_client_runtime_records(text, boolean, integer) to service_role;
