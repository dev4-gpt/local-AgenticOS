-- Apply after Notebook lineage and client runtime audit events exist. Reapply
-- after supabase-client-retention-policy-28.sql to activate the 28-day maximum.
-- This removes source metadata and cascading chunks, not referenced artifact
-- objects or any financial, backup, or vendor records.

create or replace function public.guard_client_notebook_source_retention()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_retention_days integer;
begin
  if auth.role() <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.tenant_slug is distinct from old.tenant_slug
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
      or new.retention_expires_at is distinct from old.retention_expires_at then
      raise exception 'client_notebook_retention_immutable';
    end if;
    return new;
  end if;

  select retention_days into v_retention_days
  from public.client_tenants where slug = new.tenant_slug;
  if v_retention_days is null or v_retention_days < 1 or v_retention_days > 28
    or new.retention_expires_at is null then
    raise exception 'client_notebook_retention_invalid';
  end if;
  new.created_at := now();
  if new.retention_expires_at <= new.created_at then
    raise exception 'client_notebook_retention_invalid';
  end if;
  new.retention_expires_at := least(
    new.retention_expires_at,
    new.created_at + make_interval(days => v_retention_days)
  );
  return new;
end;
$$;

drop trigger if exists guard_client_notebook_source_retention on public.client_notebook_sources;
create trigger guard_client_notebook_source_retention
  before insert or update on public.client_notebook_sources
  for each row execute function public.guard_client_notebook_source_retention();

revoke all on function public.guard_client_notebook_source_retention() from public, anon, authenticated;

create index if not exists client_notebook_sources_retention_purge_idx
  on public.client_notebook_sources (tenant_slug, created_at, id)
  where retention_expires_at is not null;

create or replace function public.purge_expired_client_notebook_sources(
  p_tenant_slug text,
  p_apply boolean default false,
  p_batch_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_retention_days integer;
  v_cutoff timestamptz;
  v_purge_cutoff timestamptz;
  v_child_purge_cutoff timestamptz;
  v_candidates integer;
  v_legacy_missing_expiry integer;
  v_legacy_extended_expiry integer;
  v_in_recovery integer;
  v_deferred_newer_chunks integer;
  v_deleted integer := 0;
  v_remaining integer;
begin
  if p_tenant_slug is null or p_tenant_slug !~ '^[a-z][a-z0-9-]{2,40}$'
    or p_apply is null or p_batch_limit is null or p_batch_limit < 1 or p_batch_limit > 100 then
    raise exception 'client_notebook_retention_invalid_input';
  end if;

  select retention_days into v_retention_days
  from public.client_tenants
  where slug = p_tenant_slug
  for update;
  if not found then
    raise exception 'client_notebook_retention_tenant_not_found';
  end if;
  if v_retention_days is null or v_retention_days < 1 or v_retention_days > 28 then
    raise exception 'client_notebook_retention_tenant_not_configured';
  end if;
  v_cutoff := now() - make_interval(days => v_retention_days);
  v_purge_cutoff := now() - interval '7 days';
  v_child_purge_cutoff := now() - make_interval(days => v_retention_days + 7);

  with aged as (
    select source.retention_expires_at, source.created_at,
      exists (
        select 1 from public.client_notebook_chunks as chunk
        where chunk.source_id = source.id and chunk.tenant_slug = p_tenant_slug
          and chunk.created_at > v_child_purge_cutoff
      ) as has_newer_chunks
    from public.client_notebook_sources as source
    where source.tenant_slug = p_tenant_slug
  )
  select count(*) filter (where retention_expires_at <= v_purge_cutoff and not has_newer_chunks),
    count(*) filter (where retention_expires_at is null and created_at <= v_cutoff),
    count(*) filter (where retention_expires_at > now() and created_at <= v_cutoff),
    count(*) filter (where retention_expires_at <= now() and retention_expires_at > v_purge_cutoff),
    count(*) filter (where retention_expires_at <= v_purge_cutoff and has_newer_chunks)
  into v_candidates, v_legacy_missing_expiry, v_legacy_extended_expiry, v_in_recovery, v_deferred_newer_chunks
  from aged;

  if p_apply then
    with selected as (
      select id from public.client_notebook_sources
      where tenant_slug = p_tenant_slug and retention_expires_at <= v_purge_cutoff
        and not exists (
          select 1 from public.client_notebook_chunks as chunk
          where chunk.source_id = client_notebook_sources.id and chunk.tenant_slug = p_tenant_slug
            and chunk.created_at > v_child_purge_cutoff
        )
      order by created_at, id
      limit p_batch_limit
      for update skip locked
    ), removed as (
      delete from public.client_notebook_sources as source
      using selected
      where source.id = selected.id and source.tenant_slug = p_tenant_slug
      returning source.id
    )
    select count(*) into v_deleted from removed;

    if v_deleted > 0 then
      insert into public.client_runtime_audit_events (tenant_slug, event_type, metadata)
      values (p_tenant_slug, 'tenant.notebook_sources.retention_purged',
        jsonb_build_object('deleted', v_deleted, 'activeRetentionDays', v_retention_days,
          'recoveryDays', 7, 'purgeAfterDays', v_retention_days + 7,
          'purgeCutoff', v_purge_cutoff));
    end if;
  end if;

  select count(*) into v_remaining
  from public.client_notebook_sources
  where tenant_slug = p_tenant_slug and retention_expires_at <= v_purge_cutoff
    and not exists (
      select 1 from public.client_notebook_chunks as chunk
      where chunk.source_id = client_notebook_sources.id and chunk.tenant_slug = p_tenant_slug
        and chunk.created_at > v_child_purge_cutoff
    );

  return jsonb_build_object(
    'tenant', p_tenant_slug, 'cutoff', v_cutoff, 'retentionDays', v_retention_days,
    'recoveryDays', 7, 'purgeAfterDays', v_retention_days + 7,
    'candidates', v_candidates, 'deleted', v_deleted,
    'remainingCandidates', v_remaining,
    'legacyMissingExpiry', v_legacy_missing_expiry,
    'legacyExtendedExpiry', v_legacy_extended_expiry,
    'inRecovery', v_in_recovery,
    'deferredNewerChunks', v_deferred_newer_chunks,
    'applied', p_apply, 'scope', 'client_notebook_sources_and_chunks'
  );
end;
$$;

revoke all on function public.purge_expired_client_notebook_sources(text, boolean, integer) from public, anon, authenticated;
grant execute on function public.purge_expired_client_notebook_sources(text, boolean, integer) to service_role;
