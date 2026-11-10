-- Apply after the public launch control-plane and client runtime audit migrations.
-- Only tenant-linked support requests are tenant content; public inquiries without
-- a tenant stay outside this tenant-scoped cleanup path.
-- Tenant-linked content is hard-purged after active expiry plus seven days.

begin;

update public.client_support_requests
set created_at = least(created_at, now())
where created_at > now();

create or replace function public.guard_client_support_request_retention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_retention_days integer;
begin
  if tg_op = 'UPDATE' then
    if new.created_at is distinct from old.created_at
       or new.tenant_slug is distinct from old.tenant_slug then
      raise exception 'client_support_request_retention_immutable';
    end if;
    return new;
  end if;

  new.created_at := now();
  if new.tenant_slug is not null then
    select retention_days into v_retention_days
    from public.client_tenants where slug = new.tenant_slug;
    if v_retention_days is null or v_retention_days < 1 or v_retention_days > 28 then
      raise exception 'client_support_request_retention_tenant_not_configured';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_client_support_request_retention on public.client_support_requests;
create trigger guard_client_support_request_retention
  before insert or update on public.client_support_requests
  for each row execute function public.guard_client_support_request_retention();

revoke all on function public.guard_client_support_request_retention()
  from public, anon, authenticated;

create index if not exists client_support_requests_tenant_retention_idx
  on public.client_support_requests (tenant_slug, created_at, id)
  where tenant_slug is not null;

create or replace function public.purge_expired_client_support_requests(
  p_tenant_slug text,
  p_apply boolean default false,
  p_batch_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_retention_days integer;
  v_cutoff timestamptz;
  v_candidates integer;
  v_deleted integer := 0;
  v_remaining integer;
begin
  if p_tenant_slug is null or p_tenant_slug !~ '^[a-z][a-z0-9-]{2,40}$'
     or p_apply is null or p_batch_limit is null
     or p_batch_limit < 1 or p_batch_limit > 500 then
    raise exception 'client_support_request_retention_invalid_input';
  end if;

  select retention_days into v_retention_days
  from public.client_tenants where slug = p_tenant_slug for update;
  if not found then
    raise exception 'client_support_request_retention_tenant_not_found';
  end if;
  if v_retention_days is null or v_retention_days < 1 or v_retention_days > 28 then
    raise exception 'client_support_request_retention_tenant_not_configured';
  end if;
  v_cutoff := now() - make_interval(days => v_retention_days + 7);

  select count(*) into v_candidates from public.client_support_requests
  where tenant_slug = p_tenant_slug and created_at <= v_cutoff;

  if p_apply then
    with selected as (
      select id from public.client_support_requests
      where tenant_slug = p_tenant_slug and created_at <= v_cutoff
      order by created_at, id limit p_batch_limit for update skip locked
    ), removed as (
      delete from public.client_support_requests as request
      using selected where request.id = selected.id
        and request.tenant_slug = p_tenant_slug
      returning request.id
    ) select count(*) into v_deleted from removed;

    if v_deleted > 0 then
      insert into public.client_runtime_audit_events (tenant_slug, event_type, metadata)
      values (p_tenant_slug, 'tenant.support_requests.retention_purged',
        jsonb_build_object('deleted', v_deleted, 'cutoff', v_cutoff,
          'retentionDays', v_retention_days, 'recoveryDays', 7,
          'purgeAfterDays', v_retention_days + 7));
    end if;
  end if;

  select count(*) into v_remaining from public.client_support_requests
  where tenant_slug = p_tenant_slug and created_at <= v_cutoff;

  return jsonb_build_object(
    'tenant', p_tenant_slug, 'cutoff', v_cutoff, 'retentionDays', v_retention_days,
    'recoveryDays', 7, 'purgeAfterDays', v_retention_days + 7,
    'candidates', v_candidates, 'deleted', v_deleted,
    'remainingCandidates', v_remaining, 'applied', p_apply,
    'scope', 'tenant_linked_client_support_requests'
  );
end;
$$;

revoke all on function public.purge_expired_client_support_requests(text, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.purge_expired_client_support_requests(text, boolean, integer)
  to service_role;

commit;
