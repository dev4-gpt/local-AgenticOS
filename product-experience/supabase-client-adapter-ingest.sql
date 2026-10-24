-- Apply after supabase-client-adapter-proposals.sql and BEFORE supabase-client-lifecycle-restore.sql.
-- The host side of the adapter events feed (Veloce phase 2 slice 2b, ADR-013, tracker 10j).
--
-- The host pulls an adapter's `events` feed (the adapter never calls the host). For each memory proposal the host's
-- puller (src/lib/adapterEventsPuller.ts) recomputes the content hash, runs its own scan, then calls the function below.
-- Nothing the adapter sent is trusted as a label: the adapter id, the requester and the scan all come from the host.
--
--   client_adapter_event_cursors              one row per adapter: how far the feed has been read (a number, no content)
--   client_adapter_events_cursor_get          the cursor, 0 when there is none
--   client_adapter_events_cursor_advance      moves it forward only if nobody else moved it first (compare and set)
--   client_adapter_ingest_memory_proposal     one proposal -> private note + provenance + quarantined promotion, atomically
--
-- All three functions are for the service role only. The table has no policy and no grant for signed-in users. A lost
-- cursor (for example after a restore, which does not bring it back) is safe: ingest is idempotent by event id, so the
-- feed is simply read again from the start.

create table if not exists public.client_adapter_event_cursors (
  tenant_slug text not null,
  adapter_id text not null check (adapter_id ~ '^[a-z][a-z0-9-]{2,40}$'),
  last_seq bigint not null default 0 check (last_seq >= 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_slug, adapter_id),
  foreign key (tenant_slug, adapter_id) references public.client_adapter_registry (tenant_slug, adapter_id) on delete cascade
);
alter table public.client_adapter_event_cursors enable row level security;
revoke all on public.client_adapter_event_cursors from public, anon, authenticated;

-- A proposal that arrives is counted in the activity panel (counts only: the event holds ids, never text). The outbox's allowed event types are stated in every file that adds one; the list is the same in all of them.
alter table public.client_adapter_outbox drop constraint if exists client_adapter_outbox_event_type_check;
alter table public.client_adapter_outbox add constraint client_adapter_outbox_event_type_check
  check (event_type in ('memory.committed', 'memory.tombstoned', 'task.requested', 'approval.requested', 'approval.decided', 'approval.executed', 'promotion.decided', 'memory.proposed', 'memory.erased'));

create or replace function public.client_adapter_events_cursor_get(p_tenant_slug text, p_adapter_id text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select last_seq from public.client_adapter_event_cursors where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id), 0);
$$;

create or replace function public.client_adapter_events_cursor_advance(p_tenant_slug text, p_adapter_id text, p_expected bigint, p_next bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  if p_expected is null or p_next is null or p_expected < 0 or p_next < p_expected or p_next - p_expected > 1000000 then
    return false;
  end if;
  if not exists (select 1 from public.client_adapter_registry where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id) then
    return false;
  end if;
  insert into public.client_adapter_event_cursors (tenant_slug, adapter_id, last_seq) values (p_tenant_slug, p_adapter_id, 0)
    on conflict (tenant_slug, adapter_id) do nothing;
  update public.client_adapter_event_cursors set last_seq = p_next, updated_at = now()
    where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id and last_seq = p_expected;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

-- Result: {"status": "created" | "duplicate" | "queue_full" | "adapter_not_active" | "hash_mismatch" | "scan_mismatch" |
--          "invalid_proposal", ...ids when there are any}. Only "created" and "duplicate" mean the proposal is stored.
-- A full review queue rolls the whole proposal back, so a later attempt starts clean.
create or replace function public.client_adapter_ingest_memory_proposal(
  p_tenant_slug text,
  p_adapter_id text,
  p_idempotency_key text,
  p_content text,
  p_content_sha256 text,
  p_scan_result jsonb,
  p_adapter_version text,
  p_agent_principal text,
  p_source_task_id text,
  p_source_url text default null,
  p_confidence numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  reg public.client_adapter_registry%rowtype;
  existing uuid;
  item uuid;
  promo uuid;
begin
  select * into reg from public.client_adapter_registry where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id;
  if not found or reg.state not in ('preview', 'enabled')
     or not exists (select 1 from public.client_tenants where slug = p_tenant_slug and status = 'active') then
    return jsonb_build_object('status', 'adapter_not_active');
  end if;
  if p_content is null or length(p_content) < 1 or length(p_content) > 30000
     or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 180
     or p_content_sha256 is null or p_content_sha256 !~ '^[0-9a-f]{64}$'
     or p_scan_result is null or jsonb_typeof(p_scan_result) <> 'object' then
    return jsonb_build_object('status', 'invalid_proposal');
  end if;
  if encode(digest(p_content, 'sha256'), 'hex') <> p_content_sha256 then
    return jsonb_build_object('status', 'hash_mismatch');
  end if;
  if p_scan_result ->> 'content_sha256' is distinct from p_content_sha256 then
    return jsonb_build_object('status', 'scan_mismatch');
  end if;
  select id into existing from public.client_adapter_memory_items
    where tenant_slug = p_tenant_slug and origin_adapter_id = p_adapter_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('status', 'duplicate', 'item_id', existing);
  end if;
  begin
    insert into public.client_adapter_memory_items (tenant_slug, namespace, origin_adapter_id, content, content_sha256, idempotency_key)
      values (p_tenant_slug, 'adapter:' || p_adapter_id, p_adapter_id, p_content, p_content_sha256, p_idempotency_key)
      returning id into item;
    insert into public.client_adapter_memory_provenance (tenant_slug, item_id, adapter_id, adapter_version, agent_principal, source_task_id, source_url, confidence)
      values (p_tenant_slug, item, p_adapter_id, p_adapter_version, p_agent_principal, p_source_task_id, p_source_url, p_confidence);
    insert into public.client_adapter_memory_promotions (tenant_slug, source_item_id, origin_adapter_id, content_sha256, requested_by_adapter, scan_result)
      values (p_tenant_slug, item, p_adapter_id, p_content_sha256, p_adapter_id, p_scan_result)
      returning id into promo;
  exception
    when unique_violation then
      -- two pullers racing for the same event: the other one won, and its rows are the ones that count
      select id into existing from public.client_adapter_memory_items
        where tenant_slug = p_tenant_slug and origin_adapter_id = p_adapter_id and idempotency_key = p_idempotency_key;
      return jsonb_build_object('status', 'duplicate', 'item_id', existing);
    when check_violation or string_data_right_truncation or numeric_value_out_of_range then
      return jsonb_build_object('status', 'invalid_proposal');
    when others then
      if sqlerrm = 'adapter_promotion_queue_full' then return jsonb_build_object('status', 'queue_full'); end if;
      if sqlerrm = 'adapter_promotion_scan_mismatch' then return jsonb_build_object('status', 'scan_mismatch'); end if;
      raise;
  end;
  insert into public.client_adapter_outbox (tenant_slug, event_type, adapter_id, payload, causation_id)
    values (p_tenant_slug, 'memory.proposed', p_adapter_id, jsonb_build_object('item_id', item, 'promotion_id', promo), item);
  return jsonb_build_object('status', 'created', 'item_id', item, 'promotion_id', promo);
end;
$$;

revoke all on function public.client_adapter_events_cursor_get(text, text) from public, anon, authenticated;
grant execute on function public.client_adapter_events_cursor_get(text, text) to service_role;
revoke all on function public.client_adapter_events_cursor_advance(text, text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.client_adapter_events_cursor_advance(text, text, bigint, bigint) to service_role;
revoke all on function public.client_adapter_ingest_memory_proposal(text, text, text, text, text, jsonb, text, text, text, text, numeric) from public, anon, authenticated;
grant execute on function public.client_adapter_ingest_memory_proposal(text, text, text, text, text, jsonb, text, text, text, text, numeric) to service_role;
