-- Apply after supabase-client-runtime-control-plane.sql (needs client_tenants, client_memberships and client_member).
-- Host-side data model for adapter products: registry, private and shared memory, provenance, promotions,
-- outbox, approvals and per-adapter budget events. Design record: docs/architecture/adr-005-adapter-host-contract.md
-- Additive and safe to run twice. It stores no provider credentials.
-- Do not apply to a hosted project until the 28-day active + 7-day recovery purge and restore wiring covers these
-- tables. Every adapter starts in the 'disabled' state.

create or replace function public.client_adapter_admin(p_tenant_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.client_member(p_tenant_slug)
    and exists (
      select 1 from public.client_memberships
      where tenant_slug = p_tenant_slug
        and user_id = auth.uid()
        and status = 'active'
        and role in ('owner', 'admin')
    );
$$;

grant execute on function public.client_adapter_admin(text) to authenticated;

-- True only inside the protected tenant restore (supabase-client-lifecycle-restore.sql): the service role with the
-- restore context set for this very table and tenant. The guards below use it to let backed-up rows come back
-- exactly as they were. Nobody else can reach it, and the restore checks the whole graph at the end.
create or replace function public.client_adapter_restoring(p_table text, p_tenant_slug text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  context jsonb;
begin
  if current_setting('role', true) is distinct from 'service_role'
     or coalesce(current_setting('app.client_lifecycle_restore', true), '') = '' then
    return false;
  end if;
  begin
    context := current_setting('app.client_lifecycle_restore')::jsonb;
  exception when others then
    return false;
  end;
  return context ->> 'table' = p_table and context ->> 'tenant' = p_tenant_slug;
end;
$$;
revoke all on function public.client_adapter_restoring(text, text) from public, anon, authenticated;
grant execute on function public.client_adapter_restoring(text, text) to service_role;

-- After a restore: every shared note needs an approved promotion of the same adapter and hash, and every promotion
-- needs its private source note. Returns false if the restored rows do not form that picture.
create or replace function public.validate_client_adapter_restore_graph(p_tenant_slug text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return not exists (
    select 1 from public.client_adapter_memory_items i
    where i.tenant_slug = p_tenant_slug and i.namespace = 'shared'
      and not exists (
        select 1 from public.client_adapter_memory_promotions p
        where p.id = i.promotion_id and p.tenant_slug = i.tenant_slug and p.origin_adapter_id = i.origin_adapter_id
          and p.status = 'approved' and p.approved_content_sha256 = i.content_sha256)
  ) and not exists (
    select 1 from public.client_adapter_memory_promotions p
    where p.tenant_slug = p_tenant_slug
      and not exists (
        select 1 from public.client_adapter_memory_items s
        where s.id = p.source_item_id and s.tenant_slug = p.tenant_slug and s.origin_adapter_id = p.origin_adapter_id
          and s.namespace = 'adapter:' || p.origin_adapter_id and s.content_sha256 = p.content_sha256)
  );
end;
$$;
revoke all on function public.validate_client_adapter_restore_graph(text) from public, anon, authenticated;
grant execute on function public.validate_client_adapter_restore_graph(text) to service_role;

-- Direct updates and deletes are refused. Deleting a tenant still cascades (trigger depth above 1), and a future
-- retention purge function may set veloce.adapter_purge to 'on' for its own transaction.
create or replace function public.client_adapter_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1 or current_setting('veloce.adapter_purge', true) = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  raise exception '% is append-only', tg_table_name;
end;
$$;

create or replace function public.client_adapter_reject_truncate()
returns trigger
language plpgsql
as $$
begin
  raise exception '% cannot be truncated', tg_table_name;
end;
$$;

-- 1. Registry: which adapters a tenant has, their state, side-effect ceiling, deletion guarantee and budget cap.
create table if not exists public.client_adapter_registry (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  adapter_id text not null check (adapter_id ~ '^[a-z][a-z0-9-]{2,40}$'),
  display_name text not null check (length(display_name) between 1 and 120),
  contract_version text not null check (contract_version ~ '^h[0-9]+$'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  state text not null default 'disabled' check (state in ('disabled', 'preview', 'enabled', 'suspended')),
  side_effect_ceiling text not null default 'read' check (side_effect_ceiling in ('read', 'draft', 'publish')),
  deletion_guarantee text not null default 'none' check (deletion_guarantee in ('none', 'host-owned', 'receipt')),
  budget_cap_micros bigint check (budget_cap_micros is null or budget_cap_micros >= 0),
  budget_period text check (budget_period is null or budget_period in ('day', 'month', 'total')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_slug, adapter_id),
  constraint client_adapter_registry_cap_pair check ((budget_cap_micros is null) = (budget_period is null))
);

-- 2. Memory items: private (namespace adapter:<id>) and shared. Shared items exist only through an approved promotion.
create table if not exists public.client_adapter_memory_items (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  namespace text not null check (namespace = 'shared' or namespace ~ '^adapter:[a-z][a-z0-9-]{2,40}$'),
  origin_adapter_id text not null check (origin_adapter_id ~ '^[a-z][a-z0-9-]{2,40}$'),
  status text not null default 'active' check (status in ('active', 'superseded', 'tombstoned')),
  content text not null check (length(content) between 1 and 30000),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  trust_level text not null default 'untrusted' check (trust_level in ('untrusted', 'reviewed')),
  idempotency_key text not null check (length(idempotency_key) between 8 and 180),
  promotion_id uuid,
  supersedes_id uuid references public.client_adapter_memory_items(id),
  valid_from timestamptz not null default now(),
  tombstoned_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (tenant_slug, origin_adapter_id) references public.client_adapter_registry (tenant_slug, adapter_id),
  unique (tenant_slug, origin_adapter_id, idempotency_key),
  constraint client_adapter_memory_items_namespace_matches_adapter check (namespace = 'shared' or namespace = 'adapter:' || origin_adapter_id),
  constraint client_adapter_memory_items_shared_promotion check ((namespace = 'shared') = (promotion_id is not null)),
  constraint client_adapter_memory_items_shared_trust check ((namespace = 'shared') = (trust_level = 'reviewed')),
  constraint client_adapter_memory_items_tombstone_check check ((status = 'tombstoned') = (tombstoned_at is not null))
);

-- The door for duplicates: one active shared fact per content hash and tenant.
create unique index if not exists client_adapter_memory_items_shared_hash_idx
  on public.client_adapter_memory_items (tenant_slug, content_sha256)
  where namespace = 'shared' and status = 'active';

create index if not exists client_adapter_memory_items_tenant_ns_idx
  on public.client_adapter_memory_items (tenant_slug, namespace, status);

-- 3. Promotions: a reviewed request to share one private item. The reviewer must differ from the requester and
-- must approve the exact content hash.
create table if not exists public.client_adapter_memory_promotions (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  source_item_id uuid not null references public.client_adapter_memory_items(id),
  origin_adapter_id text not null check (origin_adapter_id ~ '^[a-z][a-z0-9-]{2,40}$'),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'quarantined' check (status in ('quarantined', 'approved', 'rejected', 'withdrawn')),
  scan_result jsonb not null default '{}'::jsonb,
  requested_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  approved_content_sha256 text check (approved_content_sha256 is null or approved_content_sha256 ~ '^[0-9a-f]{64}$'),
  decision_note text check (decision_note is null or length(decision_note) <= 2000),
  created_at timestamptz not null default now(),
  foreign key (tenant_slug, origin_adapter_id) references public.client_adapter_registry (tenant_slug, adapter_id),
  constraint client_adapter_memory_promotions_distinct_reviewer check (reviewed_by is null or reviewed_by <> requested_by),
  constraint client_adapter_memory_promotions_approval_complete check (
    status <> 'approved'
    or (reviewed_by is not null and reviewed_at is not null and approved_content_sha256 = content_sha256)
  )
);

create index if not exists client_adapter_memory_promotions_tenant_status_idx
  on public.client_adapter_memory_promotions (tenant_slug, status, created_at desc);

alter table public.client_adapter_memory_items
  drop constraint if exists client_adapter_memory_items_promotion_fk;
alter table public.client_adapter_memory_items
  add constraint client_adapter_memory_items_promotion_fk
  foreign key (promotion_id) references public.client_adapter_memory_promotions(id)
  deferrable initially immediate; -- a tenant restore defers it, because notes and promotions point at each other

-- 4. Provenance: append-only record of where every item came from.
create table if not exists public.client_adapter_memory_provenance (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  item_id uuid not null references public.client_adapter_memory_items(id) on delete cascade,
  adapter_id text not null check (adapter_id ~ '^[a-z][a-z0-9-]{2,40}$'),
  adapter_version text not null check (length(adapter_version) between 1 and 40),
  agent_principal text not null check (length(agent_principal) between 1 and 120),
  source_task_id text not null check (length(source_task_id) between 1 and 128),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  source_sha256 text check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$'),
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  actor_user uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists client_adapter_memory_provenance_item_idx
  on public.client_adapter_memory_provenance (item_id);

-- 5. Outbox: events for adapters (new shared facts, deletions). Deletions are acknowledged with a receipt hash.
create table if not exists public.client_adapter_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  event_id uuid not null unique default gen_random_uuid(),
  event_type text not null check (event_type in ('memory.committed', 'memory.tombstoned', 'task.requested', 'approval.requested', 'approval.decided')),
  adapter_id text check (adapter_id is null or adapter_id ~ '^[a-z][a-z0-9-]{2,40}$'),
  payload jsonb not null default '{}'::jsonb check (pg_column_size(payload) <= 16384),
  causation_id uuid,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  acked_at timestamptz,
  receipt_sha256 text check (receipt_sha256 is null or receipt_sha256 ~ '^[0-9a-f]{64}$'),
  constraint client_adapter_outbox_ack_after_delivery check (acked_at is null or delivered_at is not null)
);

create index if not exists client_adapter_outbox_pending_idx
  on public.client_adapter_outbox (tenant_slug, created_at)
  where delivered_at is null;

-- 6. Approvals: one live approval per exact action. Approval is bound to the action hash and expires.
create table if not exists public.client_adapter_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  adapter_id text not null check (adapter_id ~ '^[a-z][a-z0-9-]{2,40}$'),
  action_kind text not null check (action_kind in ('publish', 'promote', 'enable-adapter')),
  action_hash text not null check (action_hash ~ '^[0-9a-f]{64}$'),
  destination text not null check (length(destination) between 1 and 500),
  policy_version text not null check (length(policy_version) between 1 and 80),
  requested_by uuid not null references auth.users(id),
  decided_by uuid references auth.users(id),
  approved_action_hash text check (approved_action_hash is null or approved_action_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'executed', 'cancelled')),
  expires_at timestamptz not null,
  decided_at timestamptz,
  executed_at timestamptz,
  execution_receipt_sha256 text check (execution_receipt_sha256 is null or execution_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  foreign key (tenant_slug, adapter_id) references public.client_adapter_registry (tenant_slug, adapter_id),
  constraint client_adapter_approvals_distinct_approver check (decided_by is null or decided_by <> requested_by),
  constraint client_adapter_approvals_approved_complete check (
    status not in ('approved', 'executed')
    or (decided_by is not null and decided_at is not null and approved_action_hash = action_hash)
  ),
  constraint client_adapter_approvals_executed_complete check (
    status <> 'executed' or (executed_at is not null and execution_receipt_sha256 is not null)
  ),
  constraint client_adapter_approvals_expiry_after_creation check (expires_at > created_at)
);

-- The exact text that was hashed, so a reviewer sees what the fingerprint covers. The request function checks that it
-- hashes to action_hash and agrees with the row's kind, adapter, destination and policy version. Older rows have none.
alter table public.client_adapter_approvals add column if not exists action_canonical text;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.client_adapter_approvals'::regclass and conname = 'client_adapter_approvals_canonical_size') then
    alter table public.client_adapter_approvals
      add constraint client_adapter_approvals_canonical_size check (action_canonical is null or length(action_canonical) between 2 and 16384);
  end if;
end;
$$;

create unique index if not exists client_adapter_approvals_live_idx
  on public.client_adapter_approvals (tenant_slug, action_kind, action_hash, destination)
  where status in ('pending', 'approved');

-- 7. Budget events: a per-adapter log that points at the central runtime budget ledger. It is not a second ledger.
create table if not exists public.client_adapter_budget_events (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  adapter_id text not null check (adapter_id ~ '^[a-z][a-z0-9-]{2,40}$'),
  task_id text not null check (length(task_id) between 1 and 128),
  kind text not null check (kind in ('reserve', 'settle', 'release')),
  amount_micros bigint not null check (amount_micros >= 0),
  provider text not null check (length(provider) between 1 and 120),
  model text check (model is null or length(model) between 1 and 180),
  runtime_budget_ref text check (runtime_budget_ref is null or length(runtime_budget_ref) between 1 and 180),
  idempotency_key text not null check (length(idempotency_key) between 8 and 180),
  created_at timestamptz not null default now(),
  foreign key (tenant_slug, adapter_id) references public.client_adapter_registry (tenant_slug, adapter_id),
  unique (tenant_slug, adapter_id, idempotency_key)
);

create index if not exists client_adapter_budget_events_tenant_idx
  on public.client_adapter_budget_events (tenant_slug, adapter_id, created_at desc);

-- Guard: memory items.
create or replace function public.client_adapter_guard_memory_item()
returns trigger
language plpgsql
as $$
declare
  promo public.client_adapter_memory_promotions%rowtype;
begin
  if tg_op = 'INSERT' then
    -- A protected tenant restore brings rows back in dependency-free order; the restore then checks the whole graph.
    if new.namespace = 'shared' and not public.client_adapter_restoring(tg_table_name, new.tenant_slug) then
      select * into promo from public.client_adapter_memory_promotions where id = new.promotion_id;
      if not found
        or promo.status <> 'approved'
        or promo.tenant_slug <> new.tenant_slug
        or promo.origin_adapter_id <> new.origin_adapter_id
        or promo.approved_content_sha256 is distinct from new.content_sha256 then
        raise exception 'shared memory requires an approved promotion with the same content hash';
      end if;
    end if;
    return new;
  end if;
  if (new.tenant_slug, new.namespace, new.origin_adapter_id, new.content_sha256, new.promotion_id, new.idempotency_key, new.created_at)
     is distinct from
     (old.tenant_slug, old.namespace, old.origin_adapter_id, old.content_sha256, old.promotion_id, old.idempotency_key, old.created_at) then
    raise exception 'memory item identity and content hash are immutable';
  end if;
  if new.status = 'tombstoned' and old.status <> 'tombstoned' then
    if new.content <> '[tombstoned]' then
      raise exception 'tombstoning must erase the content';
    end if;
  elsif new.content <> old.content then
    raise exception 'memory item content is immutable except when it is tombstoned';
  end if;
  if old.status = 'tombstoned' and new.status <> 'tombstoned' then
    raise exception 'tombstoned memory cannot be restored';
  end if;
  if old.status = 'superseded' and new.status = 'active' then
    raise exception 'superseded memory cannot become active again';
  end if;
  return new;
end;
$$;

-- Guard: promotions.
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
    return new;
  end if;
  if (new.tenant_slug, new.source_item_id, new.origin_adapter_id, new.content_sha256, new.requested_by, new.created_at)
     is distinct from
     (old.tenant_slug, old.source_item_id, old.origin_adapter_id, old.content_sha256, old.requested_by, old.created_at) then
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
  return new;
end;
$$;

-- Guard: approvals.
create or replace function public.client_adapter_guard_approval()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' and not public.client_adapter_restoring(tg_table_name, new.tenant_slug) then
      raise exception 'an approval request starts pending';
    end if;
    return new;
  end if;
  if (new.tenant_slug, new.adapter_id, new.action_kind, new.action_hash, new.destination, new.policy_version, new.requested_by, new.expires_at, new.created_at)
     is distinct from
     (old.tenant_slug, old.adapter_id, old.action_kind, old.action_hash, old.destination, old.policy_version, old.requested_by, old.expires_at, old.created_at)
     or new.action_canonical is distinct from old.action_canonical then
    raise exception 'approval identity is immutable';
  end if;
  if new.status = old.status then
    if (new.decided_by, new.decided_at, new.approved_action_hash, new.executed_at, new.execution_receipt_sha256)
       is distinct from
       (old.decided_by, old.decided_at, old.approved_action_hash, old.executed_at, old.execution_receipt_sha256) then
      raise exception 'approval decision fields change only with a status transition';
    end if;
    return new;
  end if;
  if not (
    (old.status = 'pending' and new.status in ('approved', 'rejected', 'expired', 'cancelled'))
    or (old.status = 'approved' and new.status in ('executed', 'expired', 'cancelled'))
  ) then
    raise exception 'approval cannot move from % to %', old.status, new.status;
  end if;
  if new.status in ('approved', 'executed') and now() > old.expires_at then
    raise exception 'approval request expired';
  end if;
  return new;
end;
$$;

drop trigger if exists client_adapter_memory_items_guard on public.client_adapter_memory_items;
create trigger client_adapter_memory_items_guard
  before insert or update on public.client_adapter_memory_items
  for each row execute function public.client_adapter_guard_memory_item();

drop trigger if exists client_adapter_memory_promotions_guard on public.client_adapter_memory_promotions;
create trigger client_adapter_memory_promotions_guard
  before insert or update on public.client_adapter_memory_promotions
  for each row execute function public.client_adapter_guard_promotion();

drop trigger if exists client_adapter_approvals_guard on public.client_adapter_approvals;
create trigger client_adapter_approvals_guard
  before insert or update on public.client_adapter_approvals
  for each row execute function public.client_adapter_guard_approval();

drop trigger if exists client_adapter_memory_provenance_append_only on public.client_adapter_memory_provenance;
create trigger client_adapter_memory_provenance_append_only
  before update or delete on public.client_adapter_memory_provenance
  for each row execute function public.client_adapter_reject_mutation();

drop trigger if exists client_adapter_memory_provenance_no_truncate on public.client_adapter_memory_provenance;
create trigger client_adapter_memory_provenance_no_truncate
  before truncate on public.client_adapter_memory_provenance
  for each statement execute function public.client_adapter_reject_truncate();

drop trigger if exists client_adapter_budget_events_append_only on public.client_adapter_budget_events;
create trigger client_adapter_budget_events_append_only
  before update or delete on public.client_adapter_budget_events
  for each row execute function public.client_adapter_reject_mutation();

drop trigger if exists client_adapter_budget_events_no_truncate on public.client_adapter_budget_events;
create trigger client_adapter_budget_events_no_truncate
  before truncate on public.client_adapter_budget_events
  for each statement execute function public.client_adapter_reject_truncate();

-- Row-level security.
alter table public.client_adapter_registry enable row level security;
alter table public.client_adapter_memory_items enable row level security;
alter table public.client_adapter_memory_provenance enable row level security;
alter table public.client_adapter_memory_promotions enable row level security;
alter table public.client_adapter_outbox enable row level security;
alter table public.client_adapter_approvals enable row level security;
alter table public.client_adapter_budget_events enable row level security;

drop policy if exists client_adapter_registry_member_select on public.client_adapter_registry;
create policy client_adapter_registry_member_select on public.client_adapter_registry
  for select to authenticated using (public.client_member(tenant_slug));

drop policy if exists client_adapter_registry_admin_insert on public.client_adapter_registry;
create policy client_adapter_registry_admin_insert on public.client_adapter_registry
  for insert to authenticated with check (public.client_adapter_admin(tenant_slug) and created_by = auth.uid());

drop policy if exists client_adapter_registry_admin_update on public.client_adapter_registry;
create policy client_adapter_registry_admin_update on public.client_adapter_registry
  for update to authenticated
  using (public.client_adapter_admin(tenant_slug))
  with check (public.client_adapter_admin(tenant_slug));

-- Members read shared memory; private adapter memory is visible to owners and admins only.
drop policy if exists client_adapter_memory_items_select on public.client_adapter_memory_items;
create policy client_adapter_memory_items_select on public.client_adapter_memory_items
  for select to authenticated
  using (public.client_member(tenant_slug) and (namespace = 'shared' or public.client_adapter_admin(tenant_slug)));

drop policy if exists client_adapter_memory_provenance_select on public.client_adapter_memory_provenance;
create policy client_adapter_memory_provenance_select on public.client_adapter_memory_provenance
  for select to authenticated
  using (
    public.client_adapter_admin(tenant_slug)
    or (public.client_member(tenant_slug) and exists (
      select 1 from public.client_adapter_memory_items i where i.id = item_id and i.namespace = 'shared'
    ))
  );

drop policy if exists client_adapter_memory_promotions_select on public.client_adapter_memory_promotions;
create policy client_adapter_memory_promotions_select on public.client_adapter_memory_promotions
  for select to authenticated
  using (public.client_adapter_admin(tenant_slug) or (public.client_member(tenant_slug) and requested_by = auth.uid()));

drop policy if exists client_adapter_memory_promotions_admin_decide on public.client_adapter_memory_promotions;
create policy client_adapter_memory_promotions_admin_decide on public.client_adapter_memory_promotions
  for update to authenticated
  using (public.client_adapter_admin(tenant_slug))
  with check (public.client_adapter_admin(tenant_slug) and reviewed_by = auth.uid());

drop policy if exists client_adapter_outbox_admin_select on public.client_adapter_outbox;
create policy client_adapter_outbox_admin_select on public.client_adapter_outbox
  for select to authenticated using (public.client_adapter_admin(tenant_slug));

drop policy if exists client_adapter_approvals_select on public.client_adapter_approvals;
create policy client_adapter_approvals_select on public.client_adapter_approvals
  for select to authenticated
  using (public.client_adapter_admin(tenant_slug) or (public.client_member(tenant_slug) and requested_by = auth.uid()));

drop policy if exists client_adapter_approvals_admin_decide on public.client_adapter_approvals;
create policy client_adapter_approvals_admin_decide on public.client_adapter_approvals
  for update to authenticated
  using (public.client_adapter_admin(tenant_slug))
  with check (public.client_adapter_admin(tenant_slug) and (decided_by is null or decided_by = auth.uid()));

drop policy if exists client_adapter_budget_events_member_select on public.client_adapter_budget_events;
create policy client_adapter_budget_events_member_select on public.client_adapter_budget_events
  for select to authenticated using (public.client_member(tenant_slug));

-- Privileges. Writes to memory, provenance, outbox, approvals (create and execute) and budget events go through the
-- host service role. Signed-in users decide promotions and approvals; their update rights are limited to the
-- decision columns.
revoke all on public.client_adapter_registry from public, anon, authenticated;
revoke all on public.client_adapter_memory_items from public, anon, authenticated;
revoke all on public.client_adapter_memory_provenance from public, anon, authenticated;
revoke all on public.client_adapter_memory_promotions from public, anon, authenticated;
revoke all on public.client_adapter_outbox from public, anon, authenticated;
revoke all on public.client_adapter_approvals from public, anon, authenticated;
revoke all on public.client_adapter_budget_events from public, anon, authenticated;

grant select, insert, update on public.client_adapter_registry to authenticated, service_role;
grant select on public.client_adapter_memory_items to authenticated;
grant select, insert, update on public.client_adapter_memory_items to service_role;
grant select on public.client_adapter_memory_provenance to authenticated;
grant select, insert on public.client_adapter_memory_provenance to service_role;
grant select on public.client_adapter_memory_promotions to authenticated;
grant update (status, reviewed_by, reviewed_at, approved_content_sha256, decision_note) on public.client_adapter_memory_promotions to authenticated;
grant select, insert, update on public.client_adapter_memory_promotions to service_role;
grant select on public.client_adapter_outbox to authenticated;
grant select, insert, update on public.client_adapter_outbox to service_role;
grant select on public.client_adapter_approvals to authenticated;
grant update (status, decided_by, decided_at, approved_action_hash) on public.client_adapter_approvals to authenticated;
grant select, insert, update on public.client_adapter_approvals to service_role;
grant select on public.client_adapter_budget_events to authenticated;
grant select, insert on public.client_adapter_budget_events to service_role;
