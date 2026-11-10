-- Apply after supabase-client-adapter-host.sql, supabase-client-adapter-token-uses.sql and
-- supabase-client-retention-policy-28.sql (which caps client_tenants.retention_days at 28).
-- Selected policy: adapter data is active for the tenant's configured days (at most 28), then recovery-only for
-- seven days, then purged. Applies to private and shared memory, promotions, provenance, approvals and budget events.
-- Outbox rows and token-use rows are short-lived operational state and are purged on their own clocks.
-- Local source only; hosted application needs separate approval. Design record:
-- docs/architecture/adr-008-adapter-retention.md
begin;

alter table public.client_adapter_memory_items add column if not exists retention_expires_at timestamptz;
alter table public.client_adapter_memory_promotions add column if not exists retention_expires_at timestamptz;
alter table public.client_adapter_memory_provenance add column if not exists retention_expires_at timestamptz;
alter table public.client_adapter_approvals add column if not exists retention_expires_at timestamptz;
alter table public.client_adapter_budget_events add column if not exists retention_expires_at timestamptz;

-- Backfill rows that already exist. The append-only tables allow this only with the purge flag on.
select set_config('veloce.adapter_purge', 'on', true);
update public.client_adapter_memory_items x
  set retention_expires_at = x.created_at + make_interval(days => greatest(1, least(t.retention_days, 28)))
  from public.client_tenants t where t.slug = x.tenant_slug and x.retention_expires_at is null;
update public.client_adapter_memory_promotions x
  set retention_expires_at = x.created_at + make_interval(days => greatest(1, least(t.retention_days, 28)))
  from public.client_tenants t where t.slug = x.tenant_slug and x.retention_expires_at is null;
update public.client_adapter_memory_provenance x
  set retention_expires_at = x.created_at + make_interval(days => greatest(1, least(t.retention_days, 28)))
  from public.client_tenants t where t.slug = x.tenant_slug and x.retention_expires_at is null;
update public.client_adapter_approvals x
  set retention_expires_at = x.created_at + make_interval(days => greatest(1, least(t.retention_days, 28)))
  from public.client_tenants t where t.slug = x.tenant_slug and x.retention_expires_at is null;
update public.client_adapter_budget_events x
  set retention_expires_at = x.created_at + make_interval(days => greatest(1, least(t.retention_days, 28)))
  from public.client_tenants t where t.slug = x.tenant_slug and x.retention_expires_at is null;
select set_config('veloce.adapter_purge', 'off', true);

alter table public.client_adapter_memory_items alter column retention_expires_at set not null;
alter table public.client_adapter_memory_promotions alter column retention_expires_at set not null;
alter table public.client_adapter_memory_provenance alter column retention_expires_at set not null;
alter table public.client_adapter_approvals alter column retention_expires_at set not null;
alter table public.client_adapter_budget_events alter column retention_expires_at set not null;

do $$
declare t text;
begin
  foreach t in array array['client_adapter_memory_items', 'client_adapter_memory_promotions', 'client_adapter_memory_provenance',
                           'client_adapter_approvals', 'client_adapter_budget_events'] loop
    if not exists (select 1 from pg_constraint where conrelid = format('public.%I', t)::regclass and conname = t || '_retention_after_create') then
      execute format('alter table public.%I add constraint %I check (retention_expires_at > created_at)', t, t || '_retention_after_create');
    end if;
    execute format('create index if not exists %I on public.%I (tenant_slug, retention_expires_at, id)', t || '_tenant_retention_idx', t);
  end loop;
end;
$$;

-- At insert the expiry is set from the tenant's configured days, whatever the caller sent. After that it cannot change.
create or replace function public.client_adapter_retention_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
begin
  if tg_op = 'INSERT' then
    select retention_days into v_days from public.client_tenants where slug = new.tenant_slug;
    if v_days is null or v_days < 1 or v_days > 28 then
      raise exception 'adapter_retention_tenant_not_configured';
    end if;
    new.retention_expires_at := now() + make_interval(days => v_days);
    return new;
  end if;
  if new.retention_expires_at is distinct from old.retention_expires_at then
    raise exception 'adapter_retention_immutable';
  end if;
  return new;
end;
$$;
revoke all on function public.client_adapter_retention_stamp() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['client_adapter_memory_items', 'client_adapter_memory_promotions', 'client_adapter_memory_provenance',
                           'client_adapter_approvals', 'client_adapter_budget_events'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_retention_stamp', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.client_adapter_retention_stamp()',
                   t || '_retention_stamp', t);
  end loop;
end;
$$;

-- Read barrier: expired rows are hidden from members straight away, while they wait out the recovery days.
drop policy if exists client_adapter_memory_items_select on public.client_adapter_memory_items;
create policy client_adapter_memory_items_select on public.client_adapter_memory_items
  for select to authenticated
  using (public.client_member(tenant_slug) and retention_expires_at > now()
         and (namespace = 'shared' or public.client_adapter_admin(tenant_slug)));

drop policy if exists client_adapter_memory_provenance_select on public.client_adapter_memory_provenance;
create policy client_adapter_memory_provenance_select on public.client_adapter_memory_provenance
  for select to authenticated
  using (
    retention_expires_at > now() and (
      public.client_adapter_admin(tenant_slug)
      or (public.client_member(tenant_slug) and exists (
        select 1 from public.client_adapter_memory_items i where i.id = item_id and i.namespace = 'shared'
      ))
    )
  );

drop policy if exists client_adapter_memory_promotions_select on public.client_adapter_memory_promotions;
create policy client_adapter_memory_promotions_select on public.client_adapter_memory_promotions
  for select to authenticated
  using (retention_expires_at > now()
         and (public.client_adapter_admin(tenant_slug) or (public.client_member(tenant_slug) and requested_by = auth.uid())));

drop policy if exists client_adapter_memory_promotions_admin_decide on public.client_adapter_memory_promotions;
create policy client_adapter_memory_promotions_admin_decide on public.client_adapter_memory_promotions
  for update to authenticated
  using (public.client_adapter_admin(tenant_slug) and retention_expires_at > now())
  with check (public.client_adapter_admin(tenant_slug) and reviewed_by = auth.uid());

drop policy if exists client_adapter_approvals_select on public.client_adapter_approvals;
create policy client_adapter_approvals_select on public.client_adapter_approvals
  for select to authenticated
  using (retention_expires_at > now()
         and (public.client_adapter_admin(tenant_slug) or (public.client_member(tenant_slug) and requested_by = auth.uid())));

drop policy if exists client_adapter_approvals_admin_decide on public.client_adapter_approvals;
create policy client_adapter_approvals_admin_decide on public.client_adapter_approvals
  for update to authenticated
  using (public.client_adapter_admin(tenant_slug) and retention_expires_at > now())
  with check (public.client_adapter_admin(tenant_slug) and (decided_by is null or decided_by = auth.uid()));

drop policy if exists client_adapter_budget_events_member_select on public.client_adapter_budget_events;
create policy client_adapter_budget_events_member_select on public.client_adapter_budget_events
  for select to authenticated using (public.client_member(tenant_slug) and retention_expires_at > now());

-- Purge. Dry run unless p_apply is true. Rows are removed seven days after they expire, tenant by tenant, in small
-- batches. Content is erased first, so no note text outlives the window even when a row has to stay a little longer
-- because another row still points at it (a shared note points at its promotion, a promotion at its source note).
create or replace function public.purge_expired_client_adapter_records(
  p_tenant_slug text,
  p_apply boolean default false,
  p_batch_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
  v_cutoff timestamptz := now() - interval '7 days';
  due jsonb;
  erased_items integer := 0;
  erased_notes integer := 0;
  d_provenance integer := 0;
  d_budget integer := 0;
  d_approvals integer := 0;
  d_shared integer := 0;
  d_promotions integer := 0;
  d_private integer := 0;
  d_outbox integer := 0;
  d_tokens integer := 0;
begin
  if p_tenant_slug is null or p_tenant_slug !~ '^[a-z][a-z0-9-]{2,40}$' or p_apply is null
     or p_batch_limit is null or p_batch_limit < 1 or p_batch_limit > 500 then
    raise exception 'adapter_retention_invalid_input';
  end if;
  select retention_days into v_days from public.client_tenants where slug = p_tenant_slug for update;
  if not found then raise exception 'adapter_retention_tenant_not_found'; end if;
  if v_days is null or v_days < 1 or v_days > 28 then raise exception 'adapter_retention_tenant_not_configured'; end if;

  due := jsonb_build_object(
    'items', (select count(*) from public.client_adapter_memory_items where tenant_slug = p_tenant_slug and retention_expires_at <= v_cutoff),
    'promotions', (select count(*) from public.client_adapter_memory_promotions where tenant_slug = p_tenant_slug and retention_expires_at <= v_cutoff),
    'provenance', (select count(*) from public.client_adapter_memory_provenance where tenant_slug = p_tenant_slug and retention_expires_at <= v_cutoff),
    'approvals', (select count(*) from public.client_adapter_approvals where tenant_slug = p_tenant_slug and retention_expires_at <= v_cutoff),
    'budgetEvents', (select count(*) from public.client_adapter_budget_events where tenant_slug = p_tenant_slug and retention_expires_at <= v_cutoff),
    'outbox', (select count(*) from public.client_adapter_outbox where tenant_slug = p_tenant_slug
                 and ((acked_at is not null and acked_at <= v_cutoff) or created_at <= now() - make_interval(days => v_days + 7))),
    'tokenUses', (select count(*) from public.client_adapter_token_uses where tenant_slug = p_tenant_slug and expires_at < now() - interval '1 day')
  );

  if p_apply then
    perform set_config('veloce.adapter_purge', 'on', true);

    -- 1. Erase the text of every due note, private or shared, and tell adapters about shared ones.
    with chosen as (
      select id, namespace from public.client_adapter_memory_items
      where tenant_slug = p_tenant_slug and retention_expires_at <= v_cutoff and status <> 'tombstoned'
      order by retention_expires_at, id limit p_batch_limit for update skip locked
    ), erased as (
      update public.client_adapter_memory_items i
        set status = 'tombstoned', content = '[tombstoned]', tombstoned_at = now()
        from chosen where i.id = chosen.id
        returning i.id, chosen.namespace, i.origin_adapter_id
    ), announced as (
      insert into public.client_adapter_outbox (tenant_slug, event_type, adapter_id, payload, causation_id)
      select p_tenant_slug, 'memory.tombstoned', e.origin_adapter_id,
             jsonb_build_object('item_id', e.id, 'reason', 'retention_expired'), e.id
      from erased e where e.namespace = 'shared'
      returning 1
    )
    select count(*) into erased_items from erased;

    -- 2. Clear the free-text note and scan result of due promotions.
    with chosen as (
      select id from public.client_adapter_memory_promotions
      where tenant_slug = p_tenant_slug and retention_expires_at <= v_cutoff
        and (decision_note is not null or scan_result <> '{}'::jsonb)
      order by retention_expires_at, id limit p_batch_limit for update skip locked
    ), cleared as (
      update public.client_adapter_memory_promotions p
        set decision_note = null, scan_result = '{}'::jsonb
        from chosen where p.id = chosen.id returning 1
    )
    select count(*) into erased_notes from cleared;

    -- 3. Child rows first.
    with chosen as (
      select ctid from public.client_adapter_memory_provenance
      where tenant_slug = p_tenant_slug and retention_expires_at <= v_cutoff
      order by retention_expires_at, id limit p_batch_limit for update skip locked
    ), removed as (delete from public.client_adapter_memory_provenance x using chosen where x.ctid = chosen.ctid returning 1)
    select count(*) into d_provenance from removed;

    with chosen as (
      select ctid from public.client_adapter_budget_events
      where tenant_slug = p_tenant_slug and retention_expires_at <= v_cutoff
      order by retention_expires_at, id limit p_batch_limit for update skip locked
    ), removed as (delete from public.client_adapter_budget_events x using chosen where x.ctid = chosen.ctid returning 1)
    select count(*) into d_budget from removed;

    with chosen as (
      select ctid from public.client_adapter_approvals
      where tenant_slug = p_tenant_slug and retention_expires_at <= v_cutoff
      order by retention_expires_at, id limit p_batch_limit for update skip locked
    ), removed as (delete from public.client_adapter_approvals x using chosen where x.ctid = chosen.ctid returning 1)
    select count(*) into d_approvals from removed;

    -- 4. Shared notes (they point at a promotion), then promotions nothing points at, then private notes nothing points at.
    -- A newer note that superseded a removed one simply loses the link.
    update public.client_adapter_memory_items n
      set supersedes_id = null
      where n.tenant_slug = p_tenant_slug and n.supersedes_id in (
        select id from public.client_adapter_memory_items
        where tenant_slug = p_tenant_slug and retention_expires_at <= v_cutoff and status = 'tombstoned');

    with chosen as (
      select ctid from public.client_adapter_memory_items
      where tenant_slug = p_tenant_slug and retention_expires_at <= v_cutoff and namespace = 'shared'
      order by retention_expires_at, id limit p_batch_limit for update skip locked
    ), removed as (delete from public.client_adapter_memory_items x using chosen where x.ctid = chosen.ctid returning 1)
    select count(*) into d_shared from removed;

    with chosen as (
      select p.ctid from public.client_adapter_memory_promotions p
      where p.tenant_slug = p_tenant_slug and p.retention_expires_at <= v_cutoff
        and not exists (select 1 from public.client_adapter_memory_items i where i.promotion_id = p.id)
      order by p.retention_expires_at, p.id limit p_batch_limit for update skip locked
    ), removed as (delete from public.client_adapter_memory_promotions x using chosen where x.ctid = chosen.ctid returning 1)
    select count(*) into d_promotions from removed;

    with chosen as (
      select i.ctid from public.client_adapter_memory_items i
      where i.tenant_slug = p_tenant_slug and i.retention_expires_at <= v_cutoff and i.namespace <> 'shared'
        and not exists (select 1 from public.client_adapter_memory_promotions p where p.source_item_id = i.id)
        and not exists (select 1 from public.client_adapter_memory_items n where n.supersedes_id = i.id and n.retention_expires_at > v_cutoff)
      order by i.retention_expires_at, i.id limit p_batch_limit for update skip locked
    ), removed as (delete from public.client_adapter_memory_items x using chosen where x.ctid = chosen.ctid returning 1)
    select count(*) into d_private from removed;

    -- 5. Operational rows on their own clocks.
    with chosen as (
      select ctid from public.client_adapter_outbox
      where tenant_slug = p_tenant_slug
        and ((acked_at is not null and acked_at <= v_cutoff) or created_at <= now() - make_interval(days => v_days + 7))
      order by created_at, id limit p_batch_limit for update skip locked
    ), removed as (delete from public.client_adapter_outbox x using chosen where x.ctid = chosen.ctid returning 1)
    select count(*) into d_outbox from removed;

    with chosen as (
      select ctid from public.client_adapter_token_uses
      where tenant_slug = p_tenant_slug and expires_at < now() - interval '1 day'
      order by expires_at limit p_batch_limit for update skip locked
    ), removed as (delete from public.client_adapter_token_uses x using chosen where x.ctid = chosen.ctid returning 1)
    select count(*) into d_tokens from removed;

    perform set_config('veloce.adapter_purge', 'off', true);

    if erased_items + erased_notes + d_provenance + d_budget + d_approvals + d_shared + d_promotions + d_private + d_outbox + d_tokens > 0 then
      insert into public.client_runtime_audit_events (tenant_slug, event_type, metadata)
      values (p_tenant_slug, 'tenant.adapter.retention_purged', jsonb_build_object(
        'notesErased', erased_items, 'promotionNotesCleared', erased_notes,
        'deleted', jsonb_build_object('provenance', d_provenance, 'budgetEvents', d_budget, 'approvals', d_approvals,
          'sharedNotes', d_shared, 'promotions', d_promotions, 'privateNotes', d_private, 'outbox', d_outbox, 'tokenUses', d_tokens),
        'retentionDays', v_days, 'recoveryDays', 7, 'purgeAfterDays', v_days + 7));
    end if;
  end if;

  return jsonb_build_object(
    'tenant', p_tenant_slug,
    'expiredOrPurgeDue', due,
    'notesErased', erased_items,
    'promotionNotesCleared', erased_notes,
    'deleted', jsonb_build_object('provenance', d_provenance, 'budgetEvents', d_budget, 'approvals', d_approvals,
      'sharedNotes', d_shared, 'promotions', d_promotions, 'privateNotes', d_private, 'outbox', d_outbox, 'tokenUses', d_tokens),
    'retentionDays', v_days, 'recoveryDays', 7, 'purgeAfterDays', v_days + 7,
    'applied', p_apply, 'batchLimitPerTable', p_batch_limit,
    'scope', jsonb_build_array('client_adapter_memory_items', 'client_adapter_memory_promotions', 'client_adapter_memory_provenance',
      'client_adapter_approvals', 'client_adapter_budget_events', 'client_adapter_outbox', 'client_adapter_token_uses'));
end;
$$;

revoke all on function public.purge_expired_client_adapter_records(text, boolean, integer) from public, anon, authenticated;
grant execute on function public.purge_expired_client_adapter_records(text, boolean, integer) to service_role;

commit;
