-- Apply after supabase-client-adapter-ingest.sql and BEFORE supabase-client-lifecycle-restore.sql.
-- Deletion receipts for adapter memory (Veloce phase 2 slice 2c, ADR-014; tracker "tombstones acknowledged").
--
-- When a note an adapter proposed is erased on the host (a reviewer withdraws it, or retention expires it), the adapter is
-- told to erase its own copies and answers with a receipt. The host's dispatcher (src/lib/adapterTombstoneDispatcher.ts)
-- does the telling; these objects keep the books:
--
--   client_adapter_tombstone_receipts      one row per erased note that has an adapter copy: its event id, attempts, receipt
--   client_adapter_tombstone_exposures     where a withdrawn fact had already been sent out, found at the moment of withdrawal
--   client_adapter_source_event_id         the adapter's own event id behind a note (private note, or the source of a shared one)
--   client_adapter_tombstones_pending      registers new erased notes and lists what still has to be delivered
--   client_adapter_tombstone_attempt       counts one delivery attempt
--   client_adapter_tombstone_ack           records the adapter's receipt
--   client_adapter_tombstone_summary       counts: pending, gave up, acknowledged
--   client_adapter_revoke_shared_memory    replaced: the same rules, plus the exposure search before the text is erased
--
-- Only adapters registered with the `receipt` deletion guarantee are told; any other stays "unconfirmed" and outside the
-- guarantee. A receipt row is deleted with its note by the retention purge, so no purge wiring is needed. Every function is
-- for the service role only, except the replaced withdraw function, which keeps its grants. Nothing here holds note text.

create table if not exists public.client_adapter_tombstone_receipts (
  item_id uuid primary key references public.client_adapter_memory_items(id) on delete cascade,
  tenant_slug text not null,
  adapter_id text not null check (adapter_id ~ '^[a-z][a-z0-9-]{2,40}$'),
  event_id uuid not null unique default gen_random_uuid(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  acked_at timestamptz,
  receipt_sha256 text check (receipt_sha256 is null or receipt_sha256 ~ '^[0-9a-f]{64}$'),
  deleted_count integer check (deleted_count is null or deleted_count >= 0),
  created_at timestamptz not null default now(),
  foreign key (tenant_slug, adapter_id) references public.client_adapter_registry (tenant_slug, adapter_id) on delete cascade,
  constraint client_adapter_tombstone_receipts_ack_complete check ((acked_at is null) = (receipt_sha256 is null) and (acked_at is null) = (deleted_count is null))
);
alter table public.client_adapter_tombstone_receipts enable row level security;
revoke all on public.client_adapter_tombstone_receipts from public, anon, authenticated;

create table if not exists public.client_adapter_tombstone_exposures (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  item_id uuid not null references public.client_adapter_memory_items(id) on delete cascade,
  approval_id uuid not null,
  destination text not null check (length(destination) between 1 and 500),
  approval_status text not null,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.client_adapter_tombstone_exposures enable row level security;
revoke all on public.client_adapter_tombstone_exposures from public, anon, authenticated;
grant select on public.client_adapter_tombstone_exposures to authenticated;
drop policy if exists client_adapter_tombstone_exposures_admin_select on public.client_adapter_tombstone_exposures;
create policy client_adapter_tombstone_exposures_admin_select on public.client_adapter_tombstone_exposures
  for select to authenticated using (public.client_adapter_admin(tenant_slug));

-- A confirmed erasure is counted in the activity panel (counts only). The outbox's allowed event types are stated in every file that adds one; the list is the same in all of them.
alter table public.client_adapter_outbox drop constraint if exists client_adapter_outbox_event_type_check;
alter table public.client_adapter_outbox add constraint client_adapter_outbox_event_type_check
  check (event_type in ('memory.committed', 'memory.tombstoned', 'task.requested', 'approval.requested', 'approval.decided', 'approval.executed', 'promotion.decided', 'memory.proposed', 'memory.erased', 'budget.reported'));

create or replace function public.client_adapter_source_event_id(p_item_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when key ~ '^[0-9a-f]{32}$' then key end
  from (
    select coalesce(
      (select i.idempotency_key from public.client_adapter_memory_items i where i.id = p_item_id and i.namespace <> 'shared'),
      (select src.idempotency_key
         from public.client_adapter_memory_items i
         join public.client_adapter_memory_promotions p on p.id = i.promotion_id
         join public.client_adapter_memory_items src on src.id = p.source_item_id
        where i.id = p_item_id and i.namespace = 'shared')
    ) as key
  ) s;
$$;

create or replace function public.client_adapter_tombstones_pending(p_tenant_slug text, p_adapter_id text, p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lim integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  insert into public.client_adapter_tombstone_receipts (item_id, tenant_slug, adapter_id)
  select i.id, i.tenant_slug, i.origin_adapter_id
  from public.client_adapter_memory_items i
  join public.client_adapter_registry r on r.tenant_slug = i.tenant_slug and r.adapter_id = i.origin_adapter_id and r.deletion_guarantee = 'receipt'
  where i.tenant_slug = p_tenant_slug and i.origin_adapter_id = p_adapter_id and i.status = 'tombstoned'
    and public.client_adapter_source_event_id(i.id) is not null
  on conflict (item_id) do nothing;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'event_id', t.event_id, 'item_id', t.item_id, 'adapter_event_id', public.client_adapter_source_event_id(t.item_id),
      'content_sha256', i.content_sha256, 'attempts', t.attempt_count) order by t.created_at, t.item_id)
    from (
      select * from public.client_adapter_tombstone_receipts
      where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id and acked_at is null and attempt_count < 10
      order by created_at, item_id limit lim
    ) t
    join public.client_adapter_memory_items i on i.id = t.item_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.client_adapter_tombstone_attempt(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  update public.client_adapter_tombstone_receipts
    set attempt_count = attempt_count + 1, last_attempt_at = now()
    where event_id = p_event_id and acked_at is null and attempt_count < 10;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.client_adapter_tombstone_ack(p_event_id uuid, p_receipt_sha256 text, p_deleted_count integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.client_adapter_tombstone_receipts%rowtype;
begin
  if p_receipt_sha256 is null or p_receipt_sha256 !~ '^[0-9a-f]{64}$' or p_deleted_count is null or p_deleted_count < 0 or p_deleted_count > 1000000 then
    return false;
  end if;
  select * into existing from public.client_adapter_tombstone_receipts where event_id = p_event_id for update;
  if not found then return false; end if;
  if existing.acked_at is not null then
    return existing.receipt_sha256 = p_receipt_sha256 and existing.deleted_count = p_deleted_count; -- a repeated answer is fine, a different one is not
  end if;
  update public.client_adapter_tombstone_receipts
    set acked_at = now(), receipt_sha256 = p_receipt_sha256, deleted_count = p_deleted_count
    where event_id = p_event_id;
  insert into public.client_adapter_outbox (tenant_slug, event_type, adapter_id, payload, causation_id)
    values (existing.tenant_slug, 'memory.erased', existing.adapter_id, jsonb_build_object('item_id', existing.item_id, 'deleted_count', p_deleted_count), existing.item_id);
  return true;
end;
$$;

create or replace function public.client_adapter_tombstone_summary(p_tenant_slug text, p_adapter_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pending', count(*) filter (where acked_at is null and attempt_count < 10),
    'gave_up', count(*) filter (where acked_at is null and attempt_count >= 10),
    'acknowledged', count(*) filter (where acked_at is not null),
    'exposures', (select count(*) from public.client_adapter_tombstone_exposures e
                  join public.client_adapter_memory_items i on i.id = e.item_id
                  where e.tenant_slug = p_tenant_slug and i.origin_adapter_id = p_adapter_id))
  from public.client_adapter_tombstone_receipts
  where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id;
$$;

-- A reviewer withdraws a shared note. The same rules as supabase-client-adapter-promotions.sql, plus one step: before the
-- text is erased, look for publish approvals that carried it, so the people who must take a published copy down by hand
-- can be told where it went. Once the text is erased it can no longer be searched for, which is why this happens here.
-- A fact shorter than 12 characters is not searched for inside other text, and a retention expiry is not searched at all:
-- every copy the host holds expires on the same clock.
create or replace function public.client_adapter_revoke_shared_memory(p_item_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.client_adapter_memory_items%rowtype;
  needle text;
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
  needle := regexp_replace(lower(regexp_replace(btrim(item.content), '\s+', ' ', 'g')), '[.!?;:,\s]+$', '');
  if length(needle) >= 12 then
    insert into public.client_adapter_tombstone_exposures (tenant_slug, item_id, approval_id, destination, approval_status, executed_at)
    select a.tenant_slug, item.id, a.id, a.destination, a.status, a.executed_at
    from public.client_adapter_approvals a
    where a.tenant_slug = item.tenant_slug and a.action_kind = 'publish' and a.status in ('approved', 'executed')
      and position(needle in lower(regexp_replace(a.action_canonical, '\s+', ' ', 'g'))) > 0;
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
revoke all on function public.client_adapter_revoke_shared_memory(uuid, text) from public, anon;
grant execute on function public.client_adapter_revoke_shared_memory(uuid, text) to authenticated;

revoke all on function public.client_adapter_source_event_id(uuid) from public, anon, authenticated;
grant execute on function public.client_adapter_source_event_id(uuid) to service_role;
revoke all on function public.client_adapter_tombstones_pending(text, text, integer) from public, anon, authenticated;
grant execute on function public.client_adapter_tombstones_pending(text, text, integer) to service_role;
revoke all on function public.client_adapter_tombstone_attempt(uuid) from public, anon, authenticated;
grant execute on function public.client_adapter_tombstone_attempt(uuid) to service_role;
revoke all on function public.client_adapter_tombstone_ack(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.client_adapter_tombstone_ack(uuid, text, integer) to service_role;
revoke all on function public.client_adapter_tombstone_summary(text, text) from public, anon, authenticated;
grant execute on function public.client_adapter_tombstone_summary(text, text) to service_role;
