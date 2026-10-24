-- Apply after supabase-client-adapter-promotions.sql and BEFORE supabase-client-lifecycle-restore.sql.
-- Adapter-originated memory proposals (Veloce phase 2 slice 2b, ADR-013, tracker 10j).
--
-- An adapter only ever proposes (ADR-005). The host pulls an adapter's `events` feed and turns each memory proposal into
-- a private note, its provenance and a quarantined promotion. Two columns assumed a person behind every proposal, which
-- an adapter-originated one does not have:
--   * client_adapter_memory_promotions.requested_by   is now nullable, and a new requested_by_adapter names the adapter
--     that asked. Exactly one of the two is set, and an adapter can only ask for its own notes. Any owner or admin may
--     review an adapter-requested promotion, because no person asked for it (the reviewer-is-not-requester rule still
--     holds for person-requested ones).
--   * client_adapter_memory_provenance.confidence     is now nullable: an adapter that reports none is shown as
--     "not reported", never as 0%.
-- Existing rows are untouched (they all have a person requester). Re-running this file is safe.

alter table public.client_adapter_memory_promotions alter column requested_by drop not null;
alter table public.client_adapter_memory_promotions add column if not exists requested_by_adapter text
  check (requested_by_adapter is null or requested_by_adapter ~ '^[a-z][a-z0-9-]{2,40}$');
alter table public.client_adapter_memory_promotions drop constraint if exists client_adapter_memory_promotions_one_requester;
alter table public.client_adapter_memory_promotions add constraint client_adapter_memory_promotions_one_requester
  check ((requested_by is null) <> (requested_by_adapter is null));
alter table public.client_adapter_memory_promotions drop constraint if exists client_adapter_memory_promotions_requester_is_origin;
alter table public.client_adapter_memory_promotions add constraint client_adapter_memory_promotions_requester_is_origin
  check (requested_by_adapter is null or requested_by_adapter = origin_adapter_id);

alter table public.client_adapter_memory_provenance alter column confidence drop not null;

-- Guard: promotions. The same rules as supabase-client-adapter-host.sql, with the new column part of a promotion's
-- immutable identity.
create or replace function public.client_adapter_guard_promotion()
returns trigger
language plpgsql
as $$
declare
  src public.client_adapter_memory_items%rowtype;
begin
  if tg_op = 'INSERT' then
    if public.client_adapter_restoring(tg_table_name, new.tenant_slug) then
      return new; -- protected tenant restore; the restore validates the whole graph afterwards
    end if;
    select * into src from public.client_adapter_memory_items where id = new.source_item_id;
    if not found
      or src.tenant_slug <> new.tenant_slug
      or src.origin_adapter_id <> new.origin_adapter_id
      or src.namespace <> 'adapter:' || new.origin_adapter_id
      or src.content_sha256 <> new.content_sha256
      or src.status <> 'active' then
      raise exception 'a promotion must reference an active private item of the same adapter with the same content hash';
    end if;
    if new.status <> 'quarantined' then
      raise exception 'a promotion starts quarantined';
    end if;
    -- Shared memory is read by every adapter, so what goes in must have been scanned, must say where it came from, and
    -- must not flood the reviewers. The scan is made by the host (src/lib/adapterMemoryGuard.ts) and is tied to the
    -- exact content hash, so a scan of other text cannot be reused.
    if coalesce(new.scan_result ->> 'scanner', '') = ''
       or new.scan_result ->> 'content_sha256' is distinct from new.content_sha256
       or coalesce(new.scan_result ->> 'verdict', '') not in ('clean', 'flagged', 'blocked') then
      raise exception 'adapter_promotion_scan_mismatch';
    end if;
    if not exists (select 1 from public.client_adapter_memory_provenance pv where pv.item_id = new.source_item_id) then
      raise exception 'adapter_promotion_provenance_required';
    end if;
    if (select count(*) from public.client_adapter_memory_promotions q
        where q.tenant_slug = new.tenant_slug and q.origin_adapter_id = new.origin_adapter_id and q.status = 'quarantined') >= 25 then
      raise exception 'adapter_promotion_queue_full';
    end if;
    return new;
  end if;
  if (new.tenant_slug, new.source_item_id, new.origin_adapter_id, new.content_sha256, new.requested_by, new.requested_by_adapter, new.created_at)
     is distinct from
     (old.tenant_slug, old.source_item_id, old.origin_adapter_id, old.content_sha256, old.requested_by, old.requested_by_adapter, old.created_at) then
    raise exception 'promotion identity is immutable';
  end if;
  -- The retention purge may clear the free-text note and scan result of a decided promotion, and nothing else.
  if current_setting('veloce.adapter_purge', true) = 'on'
     and (new.status, new.reviewed_by, new.reviewed_at, new.approved_content_sha256)
         is not distinct from (old.status, old.reviewed_by, old.reviewed_at, old.approved_content_sha256) then
    return new;
  end if;
  if old.status <> 'quarantined' then
    raise exception 'a decided promotion cannot change';
  end if;
  if new.scan_result is distinct from old.scan_result then
    raise exception 'adapter_promotion_scan_immutable';
  end if;
  if new.status = 'approved' then
    if new.scan_result ->> 'verdict' = 'blocked' then
      raise exception 'adapter_promotion_blocked';
    end if;
    if coalesce(new.scan_result ->> 'verdict', '') not in ('clean', 'flagged') then
      raise exception 'adapter_promotion_scan_required';
    end if;
    if new.approved_sensitivity is null then
      raise exception 'adapter_promotion_sensitivity_required';
    end if;
    if new.approved_sensitivity = 'sensitive' and length(btrim(coalesce(new.decision_note, ''))) < 20 then
      raise exception 'adapter_promotion_note_required';
    end if;
    if new.scan_result ->> 'verdict' = 'flagged' and length(btrim(coalesce(new.decision_note, ''))) < 20 then
      raise exception 'adapter_promotion_note_required';
    end if;
  elsif new.approved_sensitivity is not null then
    raise exception 'adapter_promotion_sensitivity_unexpected';
  end if;
  return new;
end;
$$;
revoke all on function public.client_adapter_guard_promotion() from public, anon, authenticated;
