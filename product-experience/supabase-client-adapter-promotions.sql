-- Apply after supabase-client-adapter-host.sql (and, if used, supabase-client-adapter-retention-28.sql).
-- Two functions for the people who review shared memory (ADR-009; the reviewer also labels what they approve, QM-6a). Adds no tables. A decision writes a
-- `promotion.decided` outbox event (counts only in the activity view, tracker item 6b).
--   client_adapter_decide_promotion       an owner or admin who is not the requester approves or rejects a promotion
--   client_adapter_revoke_shared_memory   an owner or admin withdraws a shared note: its text is erased and adapters are
--                                         told to drop their copies
-- Identity always comes from auth.uid(). The rules about scans and notes (a blocked scan cannot be approved, a flagged
-- one needs a written reason of at least 20 characters) live in the promotion guard trigger, so they hold for any route.

-- The outbox's allowed event types are listed in three files (host, approval gateway, this one) and whichever is
-- applied last wins, so all three carry the same list; a test fails if they ever differ.
alter table public.client_adapter_outbox drop constraint if exists client_adapter_outbox_event_type_check;
alter table public.client_adapter_outbox add constraint client_adapter_outbox_event_type_check
  check (event_type in ('memory.committed', 'memory.tombstoned', 'task.requested', 'approval.requested', 'approval.decided', 'approval.executed', 'promotion.decided'));

-- The reviewer now also labels what they approve (QM-6a), so the function has a fifth argument. The old four-argument
-- form is removed so a call cannot be ambiguous and nobody can approve without a label.
drop function if exists public.client_adapter_decide_promotion(uuid, text, text, text);

create or replace function public.client_adapter_decide_promotion(
  p_promotion_id uuid,
  p_decision text,
  p_expected_content_sha256 text,
  p_note text default null,
  p_sensitivity text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  promo public.client_adapter_memory_promotions%rowtype;
  expiry text;
begin
  if auth.uid() is null then
    raise exception 'adapter_promotion_not_allowed';
  end if;
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'adapter_promotion_bad_decision';
  end if;
  if p_note is not null and length(p_note) > 2000 then
    raise exception 'adapter_promotion_bad_note';
  end if;
  -- Approving needs a label ("ordinary" or "sensitive"); anything that must not be shared is rejected instead.
  if p_decision = 'approve' and (p_sensitivity is null or p_sensitivity not in ('ordinary', 'sensitive')) then
    raise exception 'adapter_promotion_sensitivity_required';
  end if;
  if p_decision = 'reject' and p_sensitivity is not null then
    raise exception 'adapter_promotion_sensitivity_unexpected';
  end if;
  select * into promo from public.client_adapter_memory_promotions where id = p_promotion_id for update;
  -- Unknown ids, other tenants' promotions and plain members all get the same answer, so nothing leaks.
  if not found or not public.client_adapter_admin(promo.tenant_slug) then
    raise exception 'adapter_promotion_not_found';
  end if;
  expiry := to_jsonb(promo) ->> 'retention_expires_at';
  if expiry is not null and expiry::timestamptz <= now() then
    raise exception 'adapter_promotion_not_found';
  end if;
  if promo.requested_by = auth.uid() then
    raise exception 'adapter_promotion_requester_cannot_decide';
  end if;
  if promo.status <> 'quarantined' then
    raise exception 'adapter_promotion_not_pending';
  end if;
  if p_decision = 'approve' then
    if p_expected_content_sha256 is distinct from promo.content_sha256 then
      raise exception 'adapter_promotion_hash_mismatch';
    end if;
    update public.client_adapter_memory_promotions
      set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
          approved_content_sha256 = promo.content_sha256, decision_note = p_note, approved_sensitivity = p_sensitivity
      where id = promo.id;
    insert into public.client_adapter_outbox (tenant_slug, event_type, adapter_id, payload, causation_id)
    values (promo.tenant_slug, 'promotion.decided', promo.origin_adapter_id,
            jsonb_build_object('promotion_id', promo.id, 'status', 'approved', 'sensitivity', p_sensitivity), promo.id);
    return 'approved';
  end if;
  update public.client_adapter_memory_promotions
    set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), decision_note = p_note
    where id = promo.id;
  insert into public.client_adapter_outbox (tenant_slug, event_type, adapter_id, payload, causation_id)
  values (promo.tenant_slug, 'promotion.decided', promo.origin_adapter_id,
          jsonb_build_object('promotion_id', promo.id, 'status', 'rejected'), promo.id);
  return 'rejected';
end;
$$;

create or replace function public.client_adapter_revoke_shared_memory(p_item_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.client_adapter_memory_items%rowtype;
begin
  if auth.uid() is null then
    raise exception 'adapter_revoke_not_allowed';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 or length(p_reason) > 500 then
    raise exception 'adapter_revoke_bad_reason';
  end if;
  select * into item from public.client_adapter_memory_items where id = p_item_id for update;
  if not found or not public.client_adapter_admin(item.tenant_slug) then
    raise exception 'adapter_revoke_not_found';
  end if;
  if item.namespace <> 'shared' then
    raise exception 'adapter_revoke_not_shared';
  end if;
  if item.status = 'tombstoned' then
    return false; -- already withdrawn; nothing more to do
  end if;
  update public.client_adapter_memory_items
    set status = 'tombstoned', content = '[tombstoned]', tombstoned_at = now()
    where id = item.id;
  insert into public.client_adapter_outbox (tenant_slug, event_type, adapter_id, payload, causation_id)
  values (item.tenant_slug, 'memory.tombstoned', item.origin_adapter_id,
          jsonb_build_object('item_id', item.id, 'reason', 'revoked_by_reviewer', 'note', btrim(p_reason)), item.id);
  return true;
end;
$$;

revoke all on function public.client_adapter_decide_promotion(uuid, text, text, text, text) from public, anon;
grant execute on function public.client_adapter_decide_promotion(uuid, text, text, text, text) to authenticated;
revoke all on function public.client_adapter_revoke_shared_memory(uuid, text) from public, anon;
grant execute on function public.client_adapter_revoke_shared_memory(uuid, text) to authenticated;
