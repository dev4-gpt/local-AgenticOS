-- Which deployment may run scheduled (background) work: retention purges, approval expiry, token purges.
-- Design note: borrowed from QM's "background ownership" (docs/background-ownership.md), reduced to what Veloce needs.
-- During a blue/green overlap two deployments are alive and each could have a scheduler. Exactly one deployment id is
-- recorded here as the owner, a scheduled job asks "may this deployment run?" before it does anything, and a stale
-- writer cannot take the record over because the change is a compare-and-set. This does not choose a scheduler; it
-- makes any scheduler safe to run twice.
-- Apply after the adapter host migrations. Additive and safe to run twice (re-applying keeps the current owner).
-- The table holds one row and no tenant data. Only the service role can read it, only through these functions can it change.

create table if not exists public.client_adapter_background_owner (
  singleton boolean primary key default true check (singleton),
  owner_deployment_id text check (owner_deployment_id is null or owner_deployment_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'),
  set_at timestamptz not null default now(),
  set_by text check (set_by is null or set_by ~ '^[A-Za-z0-9][A-Za-z0-9._:@ -]{0,127}$')
);

-- A fresh database has no owner, so no deployment runs background work until an operator names one.
insert into public.client_adapter_background_owner (singleton) values (true) on conflict do nothing;

alter table public.client_adapter_background_owner enable row level security;
revoke all on public.client_adapter_background_owner from public, anon, authenticated;
grant select on public.client_adapter_background_owner to service_role;

create or replace function public.client_adapter_background_owner_status()
returns table (owner_deployment_id text, set_at timestamptz, set_by text)
language sql
stable
security definer
set search_path = public
as $$
  select o.owner_deployment_id, o.set_at, o.set_by from public.client_adapter_background_owner o where o.singleton;
$$;

-- True only for the recorded owner. No owner, a different owner or a malformed id all answer false.
create or replace function public.client_adapter_background_owner_may_run(p_deployment_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select o.owner_deployment_id = p_deployment_id from public.client_adapter_background_owner o where o.singleton),
    false
  ) and p_deployment_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$';
$$;

-- Compare-and-set: the owner changes only if it is still what the caller last saw. Returns true if it changed, false if
-- the caller was stale or nothing would change. p_new_owner null means nobody runs background work.
create or replace function public.client_adapter_background_owner_set(p_expected_owner text, p_new_owner text, p_set_by text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  if (p_expected_owner is not null and p_expected_owner !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$')
     or (p_new_owner is not null and p_new_owner !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$')
     or p_set_by is null or p_set_by !~ '^[A-Za-z0-9][A-Za-z0-9._:@ -]{0,127}$' then
    raise exception 'adapter_background_owner_invalid_input';
  end if;
  update public.client_adapter_background_owner
    set owner_deployment_id = p_new_owner, set_at = now(), set_by = p_set_by
    where singleton
      and owner_deployment_id is not distinct from p_expected_owner
      and owner_deployment_id is distinct from p_new_owner;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

-- Supabase gives new functions execute for anon by default, so each is revoked explicitly.
revoke all on function public.client_adapter_background_owner_status() from public, anon, authenticated;
revoke all on function public.client_adapter_background_owner_may_run(text) from public, anon, authenticated;
revoke all on function public.client_adapter_background_owner_set(text, text, text) from public, anon, authenticated;
grant execute on function public.client_adapter_background_owner_status() to service_role;
grant execute on function public.client_adapter_background_owner_may_run(text) to service_role;
grant execute on function public.client_adapter_background_owner_set(text, text, text) to service_role;
