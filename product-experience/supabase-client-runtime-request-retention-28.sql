-- Apply after client runtime requests, delivery actions, and the shared
-- supabase-client-retention-policy-28.sql migration.
-- Requests and delivery-action content is member-invisible after its own
-- tenant retention window. Cleanup removes children before requests and never
-- cascades a younger delivery action with an older request.
-- Member access ends at active expiry; physical purge waits seven more days.

begin;

update public.client_runtime_requests
set created_at = least(created_at, now())
where created_at > now();

update public.client_runtime_delivery_actions
set created_at = least(created_at, now())
where created_at > now();

create or replace function public.guard_client_runtime_request_retention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_retention_days integer;
  v_request_created_at timestamptz;
begin
  if tg_op = 'UPDATE' then
    if new.created_at is distinct from old.created_at
       or new.tenant_slug is distinct from old.tenant_slug then
      raise exception 'client_runtime_request_retention_immutable';
    end if;
    if tg_table_name = 'client_runtime_requests'
       and new.submitted_by is distinct from old.submitted_by then
      raise exception 'client_runtime_request_owner_immutable';
    end if;
    if tg_table_name = 'client_runtime_delivery_actions'
       and (new.request_id is distinct from old.request_id
         or new.requested_by is distinct from old.requested_by) then
      raise exception 'client_runtime_delivery_owner_immutable';
    end if;
    return new;
  end if;

  new.created_at := now();
  select retention_days into v_retention_days
  from public.client_tenants
  where slug = new.tenant_slug;
  if v_retention_days is null or v_retention_days < 1 or v_retention_days > 28 then
    raise exception 'client_runtime_request_retention_tenant_not_configured';
  end if;

  if tg_table_name = 'client_runtime_delivery_actions' then
    select created_at into v_request_created_at
    from public.client_runtime_requests
    where id = new.request_id and tenant_slug = new.tenant_slug;
    if not found or v_request_created_at <= now() - make_interval(days => v_retention_days) then
      raise exception 'client_runtime_delivery_request_expired_or_foreign';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_client_runtime_request_retention on public.client_runtime_requests;
create trigger guard_client_runtime_request_retention
  before insert or update on public.client_runtime_requests
  for each row execute function public.guard_client_runtime_request_retention();

drop trigger if exists guard_client_runtime_delivery_retention on public.client_runtime_delivery_actions;
create trigger guard_client_runtime_delivery_retention
  before insert or update on public.client_runtime_delivery_actions
  for each row execute function public.guard_client_runtime_request_retention();

revoke all on function public.guard_client_runtime_request_retention()
  from public, anon, authenticated;

drop policy if exists client_requests_member_select on public.client_runtime_requests;
create policy client_requests_member_select on public.client_runtime_requests
  for select to authenticated
  using (
    public.client_member(tenant_slug)
    and created_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug))
  );

drop policy if exists client_delivery_actions_member_select on public.client_runtime_delivery_actions;
create policy client_delivery_actions_member_select on public.client_runtime_delivery_actions
  for select to authenticated
  using (
    public.client_member(tenant_slug)
    and created_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug))
  );

create index if not exists client_runtime_requests_retention_idx
  on public.client_runtime_requests (tenant_slug, created_at, id);
create index if not exists client_runtime_delivery_retention_idx
  on public.client_runtime_delivery_actions (tenant_slug, created_at, id);

create or replace function public.purge_expired_client_runtime_requests(
  p_tenant_slug text,
  p_apply boolean default false,
  p_batch_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_retention_days integer;
  v_cutoff timestamptz;
  v_candidate_requests integer;
  v_candidate_actions integer;
  v_deleted_requests integer := 0;
  v_deleted_actions integer := 0;
  v_remaining_requests integer;
  v_remaining_actions integer;
begin
  if p_tenant_slug is null or p_tenant_slug !~ '^[a-z][a-z0-9-]{2,40}$'
     or p_apply is null or p_batch_limit is null
     or p_batch_limit < 1 or p_batch_limit > 1000 then
    raise exception 'client_runtime_request_retention_invalid_input';
  end if;

  select retention_days into v_retention_days
  from public.client_tenants
  where slug = p_tenant_slug
  for update;
  if not found then
    raise exception 'client_runtime_request_retention_tenant_not_found';
  end if;
  if v_retention_days is null or v_retention_days < 1 or v_retention_days > 28 then
    raise exception 'client_runtime_request_retention_tenant_not_configured';
  end if;
  v_cutoff := now() - make_interval(days => v_retention_days + 7);

  select count(*) into v_candidate_requests from public.client_runtime_requests
   where tenant_slug = p_tenant_slug and created_at <= v_cutoff;
  select count(*) into v_candidate_actions from public.client_runtime_delivery_actions
   where tenant_slug = p_tenant_slug and created_at <= v_cutoff;

  if p_apply then
    with selected as (
      select id from public.client_runtime_delivery_actions
       where tenant_slug = p_tenant_slug and created_at <= v_cutoff
       order by created_at, id limit p_batch_limit for update skip locked
    ), removed as (
      delete from public.client_runtime_delivery_actions as action
       using selected where action.id = selected.id
        and action.tenant_slug = p_tenant_slug returning action.id
    ) select count(*) into v_deleted_actions from removed;

    with selected as (
      select request.id from public.client_runtime_requests as request
       where request.tenant_slug = p_tenant_slug and request.created_at <= v_cutoff
         and not exists (
           select 1 from public.client_runtime_delivery_actions as action
           where action.tenant_slug = request.tenant_slug
             and action.request_id = request.id
         )
       order by request.created_at, request.id limit p_batch_limit
       for update of request skip locked
    ), removed as (
      delete from public.client_runtime_requests as request
       using selected where request.id = selected.id
        and request.tenant_slug = p_tenant_slug returning request.id
    ) select count(*) into v_deleted_requests from removed;

    if v_deleted_actions + v_deleted_requests > 0 then
      insert into public.client_runtime_audit_events (tenant_slug, event_type, metadata)
      values (p_tenant_slug, 'tenant.runtime_requests.retention_purged', jsonb_build_object(
        'requests', v_deleted_requests, 'deliveryActions', v_deleted_actions,
        'cutoff', v_cutoff, 'retentionDays', v_retention_days,
        'recoveryDays', 7, 'purgeAfterDays', v_retention_days + 7
      ));
    end if;
  end if;

  select count(*) into v_remaining_requests from public.client_runtime_requests
   where tenant_slug = p_tenant_slug and created_at <= v_cutoff;
  select count(*) into v_remaining_actions from public.client_runtime_delivery_actions
   where tenant_slug = p_tenant_slug and created_at <= v_cutoff;

  return jsonb_build_object(
    'tenant', p_tenant_slug, 'cutoff', v_cutoff, 'retentionDays', v_retention_days,
    'recoveryDays', 7, 'purgeAfterDays', v_retention_days + 7,
    'candidates', jsonb_build_object('requests', v_candidate_requests, 'deliveryActions', v_candidate_actions),
    'deleted', jsonb_build_object('requests', v_deleted_requests, 'deliveryActions', v_deleted_actions),
    'remaining', jsonb_build_object('requests', v_remaining_requests, 'deliveryActions', v_remaining_actions),
    'applied', p_apply, 'scope', 'client_runtime_requests_and_delivery_actions'
  );
end;
$$;

revoke all on function public.purge_expired_client_runtime_requests(text, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.purge_expired_client_runtime_requests(text, boolean, integer)
  to service_role;

commit;
