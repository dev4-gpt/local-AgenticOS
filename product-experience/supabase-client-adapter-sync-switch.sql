-- Apply after supabase-client-adapter-tombstones.sql. Additive and safe to run twice.
-- The sync switch (Veloce phase 2, ADR-019): the one visible control that keeps the scheduled adapter sync from keeping a
-- paid service warm all day.
--
-- The scheduler keeps firing every few minutes, which costs pennies. What costs real money is the sync job calling the
-- adapter, because that keeps the adapter's service running. So the job asks this switch first and, when it is off, does
-- nothing and never touches the adapter. Three things turn a run on:
--   * the switch is on: for 1, 4 or 24 hours (it turns itself off), or "always" if the operator allowed that for this client;
--   * "sync now": one run, asked for by an admin, used up by the run that honours it;
--   * a deletion is owed: a note the host erased whose adapter copy has not been confirmed. An erasure promise is never
--     paused by the switch (ADR-014), so this one reason ignores it.
--
-- Admins (owner or admin) turn it on and off and ask for a sync; any member can read it. "Always" can be allowed only by the
-- service role, so a tenant admin cannot give themselves an unlimited bill. The table holds no note text and nothing is
-- granted on it directly: it is reached only through these functions.

create table if not exists public.client_adapter_sync_switch (
  tenant_slug text not null,
  adapter_id text not null check (adapter_id ~ '^[a-z][a-z0-9-]{2,40}$'),
  on_until timestamptz,
  always_on boolean not null default false,
  always_on_allowed boolean not null default false,
  sync_now_requested_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (tenant_slug, adapter_id),
  foreign key (tenant_slug, adapter_id) references public.client_adapter_registry (tenant_slug, adapter_id) on delete cascade,
  constraint client_adapter_sync_switch_one_mode check (not (always_on and on_until is not null))
);
alter table public.client_adapter_sync_switch enable row level security;
revoke all on public.client_adapter_sync_switch from public, anon, authenticated;
grant select on public.client_adapter_sync_switch to service_role;

-- Members read where the switch stands: {"mode": "off" | "timed" | "always", "on_until", "always_on_allowed", "sync_now_pending", "now"}.
-- Nothing set up yet reads as off. An unknown tenant or adapter and a non-member get the same answer.
create or replace function public.client_adapter_sync_switch_status(p_tenant_slug text, p_adapter_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.client_adapter_sync_switch%rowtype;
begin
  if auth.uid() is null or not public.client_member(p_tenant_slug)
     or not exists (select 1 from public.client_adapter_registry where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id) then
    raise exception 'adapter_sync_switch_not_found';
  end if;
  select * into s from public.client_adapter_sync_switch where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id;
  return jsonb_build_object(
    'mode', case when s.always_on and s.always_on_allowed then 'always' when s.on_until > now() then 'timed' else 'off' end,
    'on_until', case when s.on_until > now() then s.on_until else null end,
    'always_on_allowed', coalesce(s.always_on_allowed, false),
    'sync_now_pending', s.sync_now_requested_at is not null,
    'now', now());
end;
$$;

-- An admin sets the switch: 'off', '1h', '4h', '24h' or 'always'. Returns the mode now in force ('off', 'timed', 'always').
create or replace function public.client_adapter_sync_switch_set(p_tenant_slug text, p_adapter_id text, p_mode text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
  hours integer;
begin
  if auth.uid() is null or not public.client_adapter_admin(p_tenant_slug) then
    raise exception 'adapter_sync_switch_not_found';
  end if;
  if p_mode is null or p_mode not in ('off', '1h', '4h', '24h', 'always') then
    raise exception 'adapter_sync_switch_bad_mode';
  end if;
  if not exists (select 1 from public.client_adapter_registry where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id and state = 'enabled') then
    raise exception 'adapter_sync_switch_adapter_not_active';
  end if;
  insert into public.client_adapter_sync_switch (tenant_slug, adapter_id) values (p_tenant_slug, p_adapter_id) on conflict do nothing;
  select always_on_allowed into allowed from public.client_adapter_sync_switch where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id for update;
  if p_mode = 'always' and not allowed then
    raise exception 'adapter_sync_switch_always_not_allowed';
  end if;
  hours := case p_mode when '1h' then 1 when '4h' then 4 when '24h' then 24 else null end;
  update public.client_adapter_sync_switch
    set always_on = (p_mode = 'always'),
        on_until = case when hours is null then null else now() + make_interval(hours => hours) end,
        updated_at = now(), updated_by = auth.uid()
    where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id;
  return case when p_mode = 'off' then 'off' when p_mode = 'always' then 'always' else 'timed' end;
end;
$$;

-- An admin asks for one sync. It stays pending until a run honours it. Asking twice before that is the same as asking once.
create or replace function public.client_adapter_sync_switch_request_now(p_tenant_slug text, p_adapter_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.client_adapter_admin(p_tenant_slug) then
    raise exception 'adapter_sync_switch_not_found';
  end if;
  if not exists (select 1 from public.client_adapter_registry where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id and state = 'enabled') then
    raise exception 'adapter_sync_switch_adapter_not_active';
  end if;
  insert into public.client_adapter_sync_switch (tenant_slug, adapter_id, sync_now_requested_at, updated_by)
    values (p_tenant_slug, p_adapter_id, now(), auth.uid())
    on conflict (tenant_slug, adapter_id) do update
      set sync_now_requested_at = coalesce(public.client_adapter_sync_switch.sync_now_requested_at, now()), updated_at = now(), updated_by = auth.uid();
  return true;
end;
$$;

-- The sync job asks before it does anything. Answers: 'run_on', 'run_now' (uses up the pending request), 'run_deletions_owed'
-- or 'skip'. Only the service role may ask. An adapter with no registry row, or one that is not enabled, is 'skip'.
create or replace function public.client_adapter_sync_switch_job_check(p_tenant_slug text, p_adapter_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.client_adapter_sync_switch%rowtype;
  used integer;
begin
  if not exists (select 1 from public.client_adapter_registry where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id and state = 'enabled') then
    return 'skip';
  end if;
  select * into s from public.client_adapter_sync_switch where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id;
  if found and ((s.always_on and s.always_on_allowed) or s.on_until > now()) then
    return 'run_on';
  end if;
  update public.client_adapter_sync_switch set sync_now_requested_at = null, updated_at = now()
    where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id and sync_now_requested_at is not null;
  get diagnostics used = row_count;
  if used = 1 then
    return 'run_now';
  end if;
  -- A deletion owed to an adapter that promised a receipt is never paused: an erased note with no confirmed copy-erasure yet.
  if exists (
    select 1
    from public.client_adapter_memory_items i
    join public.client_adapter_registry r on r.tenant_slug = i.tenant_slug and r.adapter_id = i.origin_adapter_id and r.deletion_guarantee = 'receipt'
    left join public.client_adapter_tombstone_receipts t on t.item_id = i.id
    where i.tenant_slug = p_tenant_slug and i.origin_adapter_id = p_adapter_id and i.status = 'tombstoned'
      and public.client_adapter_source_event_id(i.id) is not null
      and (t.item_id is null or (t.acked_at is null and t.attempt_count < 10))
  ) then
    return 'run_deletions_owed';
  end if;
  return 'skip';
end;
$$;

-- The operator (service role only) allows or forbids "always" for one client's adapter. Forbidding it also turns it off.
create or replace function public.client_adapter_sync_switch_allow_always(p_tenant_slug text, p_adapter_id text, p_allowed boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_allowed is null or not exists (select 1 from public.client_adapter_registry where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id) then
    return false;
  end if;
  insert into public.client_adapter_sync_switch (tenant_slug, adapter_id, always_on_allowed) values (p_tenant_slug, p_adapter_id, p_allowed)
    on conflict (tenant_slug, adapter_id) do update
      set always_on_allowed = p_allowed, always_on = case when p_allowed then public.client_adapter_sync_switch.always_on else false end, updated_at = now();
  return true;
end;
$$;

revoke all on function public.client_adapter_sync_switch_status(text, text) from public, anon;
revoke all on function public.client_adapter_sync_switch_set(text, text, text) from public, anon;
revoke all on function public.client_adapter_sync_switch_request_now(text, text) from public, anon;
revoke all on function public.client_adapter_sync_switch_job_check(text, text) from public, anon, authenticated;
revoke all on function public.client_adapter_sync_switch_allow_always(text, text, boolean) from public, anon, authenticated;
grant execute on function public.client_adapter_sync_switch_status(text, text) to authenticated;
grant execute on function public.client_adapter_sync_switch_set(text, text, text) to authenticated;
grant execute on function public.client_adapter_sync_switch_request_now(text, text) to authenticated;
grant execute on function public.client_adapter_sync_switch_job_check(text, text) to service_role;
grant execute on function public.client_adapter_sync_switch_allow_always(text, text, boolean) to service_role;

notify pgrst, 'reload schema';
