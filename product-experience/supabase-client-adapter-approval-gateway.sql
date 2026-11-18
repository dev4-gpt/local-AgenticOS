-- Apply after supabase-client-adapter-host.sql.
-- Three database functions that make adapter approvals durable and hash-bound:
--   client_adapter_request_approval  a signed-in tenant member asks for approval of one exact action
--   client_adapter_decide_approval   a different signed-in owner or admin approves or rejects it
--   client_adapter_execute_approval  the host worker consumes an approved request, once
-- Adds no tables. Identity always comes from auth.uid(); no function trusts a caller-supplied user id.
-- A request also stores the exact canonical text that was hashed (column added in the host migration) and the
-- database checks that it hashes to the fingerprint and agrees with the row, so a reviewer sees what they approve.
-- Do not apply to a hosted project until the adapter host tables are covered by the 28 + 7 day lifecycle.

-- The request now carries the exact canonical text that was hashed. The old signature is removed so there is no
-- overload that skips the check.
drop function if exists public.client_adapter_request_approval(text, text, text, text, text, text, integer);

create or replace function public.client_adapter_request_approval(
  p_tenant_slug text,
  p_adapter_id text,
  p_action_kind text,
  p_action_hash text,
  p_action_canonical text,
  p_destination text,
  p_policy_version text,
  p_ttl_seconds integer default 86400
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  adapter public.client_adapter_registry%rowtype;
  canonical jsonb;
  live_count integer;
  new_id uuid;
begin
  if auth.uid() is null or not public.client_member(p_tenant_slug) then
    raise exception 'adapter_approval_not_allowed';
  end if;
  if p_action_kind is null or p_action_kind not in ('publish', 'promote', 'enable-adapter', 'run-command') then
    raise exception 'adapter_approval_bad_kind';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds < 60 or p_ttl_seconds > 259200 then
    raise exception 'adapter_approval_bad_ttl';
  end if;
  -- What the reviewer will see must be exactly what the fingerprint covers.
  if p_action_canonical is null or length(p_action_canonical) not between 2 and 16384 then
    raise exception 'adapter_approval_canonical_invalid';
  end if;
  begin
    canonical := p_action_canonical::jsonb;
  exception when others then
    raise exception 'adapter_approval_canonical_invalid';
  end;
  if jsonb_typeof(canonical) <> 'object' then
    raise exception 'adapter_approval_canonical_invalid';
  end if;
  if encode(digest(convert_to(p_action_canonical, 'UTF8'), 'sha256'), 'hex') is distinct from p_action_hash
     or canonical ->> 'v' is distinct from 'approval-action-h1'
     or canonical ->> 'kind' is distinct from p_action_kind
     or canonical ->> 'adapterId' is distinct from p_adapter_id
     or canonical ->> 'destination' is distinct from p_destination
     or canonical ->> 'policyVersion' is distinct from p_policy_version then
    raise exception 'adapter_approval_canonical_mismatch';
  end if;
  select * into adapter
    from public.client_adapter_registry
    where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id;
  if not found then
    raise exception 'adapter_approval_unknown_adapter';
  end if;
  if p_action_kind = 'publish'
     and (adapter.side_effect_ceiling <> 'publish' or adapter.state not in ('preview', 'enabled')) then
    raise exception 'adapter_approval_adapter_not_ready';
  elsif p_action_kind = 'promote' and adapter.state not in ('preview', 'enabled') then
    raise exception 'adapter_approval_adapter_not_ready';
  elsif p_action_kind = 'enable-adapter' and adapter.state not in ('disabled', 'suspended') then
    raise exception 'adapter_approval_adapter_not_ready';
  elsif p_action_kind = 'run-command' and (adapter.side_effect_ceiling = 'read' or adapter.state not in ('preview', 'enabled')) then
    -- A command can change things, so an adapter whose ceiling is read-only cannot ask to run one (QM-6b).
    raise exception 'adapter_approval_adapter_not_ready';
  end if;

  -- An expired request must not block a fresh request for the same exact action.
  update public.client_adapter_approvals
    set status = 'expired'
    where tenant_slug = p_tenant_slug
      and action_kind = p_action_kind
      and action_hash = p_action_hash
      and destination = p_destination
      and status in ('pending', 'approved')
      and expires_at <= now();

  select count(*) into live_count
    from public.client_adapter_approvals
    where tenant_slug = p_tenant_slug
      and status in ('pending', 'approved')
      and expires_at > now();
  if live_count >= 50 then
    raise exception 'adapter_approval_too_many_open';
  end if;

  insert into public.client_adapter_approvals
    (tenant_slug, adapter_id, action_kind, action_hash, action_canonical, destination, policy_version, requested_by, expires_at)
  values
    (p_tenant_slug, p_adapter_id, p_action_kind, p_action_hash, p_action_canonical, p_destination, p_policy_version, auth.uid(),
     now() + make_interval(secs => p_ttl_seconds))
  returning id into new_id;

  insert into public.client_adapter_outbox (tenant_slug, event_type, adapter_id, payload, causation_id)
  values (p_tenant_slug, 'approval.requested', p_adapter_id,
          jsonb_build_object('approval_id', new_id, 'action_kind', p_action_kind), new_id);
  return new_id;
end;
$$;

-- The same goes for the approval kinds: widen the table's check on a database that already has it (QM-6b).
alter table public.client_adapter_approvals drop constraint if exists client_adapter_approvals_action_kind_check;
alter table public.client_adapter_approvals add constraint client_adapter_approvals_action_kind_check
  check (action_kind in ('publish', 'promote', 'enable-adapter', 'run-command'));

-- The outbox type list lives in the host file's create table; on a database that already has the table, widen it
-- here so execution can be recorded. Same name Postgres gave the inline check; safe to run twice.
alter table public.client_adapter_outbox drop constraint if exists client_adapter_outbox_event_type_check;
alter table public.client_adapter_outbox add constraint client_adapter_outbox_event_type_check
  check (event_type in ('memory.committed', 'memory.tombstoned', 'task.requested', 'approval.requested', 'approval.decided', 'approval.executed', 'promotion.decided', 'memory.proposed', 'memory.erased', 'budget.reported'));

create or replace function public.client_adapter_decide_approval(
  p_approval_id uuid,
  p_decision text,
  p_expected_action_hash text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  appr public.client_adapter_approvals%rowtype;
  outcome text;
begin
  if auth.uid() is null then
    raise exception 'adapter_approval_not_allowed';
  end if;
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'adapter_approval_bad_decision';
  end if;
  select * into appr from public.client_adapter_approvals where id = p_approval_id for update;
  -- Unknown ids and other tenants' approvals get the same answer, so nothing leaks.
  if not found or not public.client_adapter_admin(appr.tenant_slug) then
    raise exception 'adapter_approval_not_found';
  end if;
  if appr.requested_by = auth.uid() then
    raise exception 'adapter_approval_requester_cannot_decide';
  end if;
  if appr.status <> 'pending' then
    raise exception 'adapter_approval_not_pending';
  end if;
  if appr.expires_at <= now() then
    update public.client_adapter_approvals set status = 'expired' where id = appr.id;
    return 'expired';
  end if;
  if p_decision = 'approve' then
    if p_expected_action_hash is distinct from appr.action_hash then
      raise exception 'adapter_approval_hash_mismatch';
    end if;
    update public.client_adapter_approvals
      set status = 'approved', decided_by = auth.uid(), decided_at = now(), approved_action_hash = appr.action_hash
      where id = appr.id;
    outcome := 'approved';
  else
    update public.client_adapter_approvals
      set status = 'rejected', decided_by = auth.uid(), decided_at = now()
      where id = appr.id;
    outcome := 'rejected';
  end if;
  insert into public.client_adapter_outbox (tenant_slug, event_type, adapter_id, payload, causation_id)
  values (appr.tenant_slug, 'approval.decided', appr.adapter_id,
          jsonb_build_object('approval_id', appr.id, 'action_kind', appr.action_kind, 'status', outcome), appr.id);
  return outcome;
end;
$$;

-- Host worker path, same pattern as the other worker functions: publishable key plus the tenant worker token.
create or replace function public.client_adapter_execute_approval(
  p_tenant_slug text,
  p_worker_token text,
  p_approval_id uuid,
  p_expected_action_hash text,
  p_receipt_sha256 text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  changed integer;
begin
  if p_worker_token is null or length(p_worker_token) < 24
     or not exists (
       select 1 from public.client_tenants
       where slug = p_tenant_slug
         and status = 'active'
         and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     ) then
    return false;
  end if;
  if p_receipt_sha256 is null or p_receipt_sha256 !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  update public.client_adapter_approvals
    set status = 'executed', executed_at = now(), execution_receipt_sha256 = p_receipt_sha256
    where id = p_approval_id
      and tenant_slug = p_tenant_slug
      and status = 'approved'
      and action_hash = p_expected_action_hash
      and approved_action_hash = p_expected_action_hash
      and expires_at > now();
  get diagnostics changed = row_count;
  if changed = 1 then
    insert into public.client_adapter_outbox (tenant_slug, event_type, adapter_id, payload, causation_id)
    select a.tenant_slug, 'approval.executed', a.adapter_id,
           jsonb_build_object('approval_id', a.id, 'action_kind', a.action_kind), a.id
    from public.client_adapter_approvals a where a.id = p_approval_id;
  end if;
  return changed = 1;
end;
$$;

-- Marks open requests whose time has run out as expired, so they stop showing as waiting even if nobody touches them.
-- Bounded and safe to repeat; only the host's service role runs it (the lifecycle retention command calls it).
create or replace function public.client_adapter_expire_approvals(p_limit integer default 1000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  with due as (
    select id from public.client_adapter_approvals
    where status in ('pending', 'approved') and expires_at <= now()
    order by expires_at, id
    limit least(greatest(coalesce(p_limit, 1000), 1), 5000)
    for update skip locked
  )
  update public.client_adapter_approvals a set status = 'expired' from due where a.id = due.id;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.client_adapter_expire_approvals(integer) from public, anon, authenticated;
grant execute on function public.client_adapter_expire_approvals(integer) to service_role;

revoke all on function public.client_adapter_request_approval(text, text, text, text, text, text, text, integer) from public, anon;
grant execute on function public.client_adapter_request_approval(text, text, text, text, text, text, text, integer) to authenticated;

revoke all on function public.client_adapter_decide_approval(uuid, text, text) from public, anon;
grant execute on function public.client_adapter_decide_approval(uuid, text, text) to authenticated;

revoke all on function public.client_adapter_execute_approval(text, text, uuid, text, text) from public, authenticated;
grant execute on function public.client_adapter_execute_approval(text, text, uuid, text, text) to anon;
