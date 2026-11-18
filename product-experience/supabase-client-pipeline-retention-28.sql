-- Apply after supabase-client-pipeline.sql and supabase-client-retention-policy-28.sql.
-- Pipeline items use a fixed per-item active expiry; edits do not extend it.

begin;

alter table public.client_pipeline_items
  add column if not exists retention_expires_at timestamptz;

update public.client_pipeline_items as item
set retention_expires_at = greatest(
  item.created_at + interval '1 microsecond',
  least(
    coalesce(item.retention_expires_at,
      item.created_at + make_interval(days => tenant.retention_days)),
    item.created_at + make_interval(days => tenant.retention_days),
    item.created_at + interval '28 days'
  )
)
from public.client_tenants as tenant
where tenant.slug = item.tenant_slug
  and (item.retention_expires_at is null
    or item.retention_expires_at <= item.created_at
    or item.retention_expires_at > item.created_at + make_interval(days => tenant.retention_days)
    or item.retention_expires_at > item.created_at + interval '28 days');

alter table public.client_pipeline_items
  alter column retention_expires_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.client_pipeline_items'::regclass
      and conname = 'client_pipeline_items_retention_after_creation'
  ) then
    alter table public.client_pipeline_items
      add constraint client_pipeline_items_retention_after_creation
      check (retention_expires_at > created_at) not valid;
  end if;
end;
$$;

alter table public.client_pipeline_items
  validate constraint client_pipeline_items_retention_after_creation;

create index if not exists client_pipeline_items_retention_idx
  on public.client_pipeline_items (tenant_slug, retention_expires_at, id);

create or replace function public.guard_client_pipeline_retention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_retention_days integer;
begin
  select retention_days into v_retention_days
  from public.client_tenants
  where slug = new.tenant_slug;
  if v_retention_days is null or v_retention_days < 1 or v_retention_days > 28 then
    raise exception 'client_pipeline_retention_tenant_not_configured';
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    new.retention_expires_at := least(
      coalesce(new.retention_expires_at,
        new.created_at + make_interval(days => v_retention_days)),
      new.created_at + make_interval(days => v_retention_days),
      new.created_at + interval '28 days'
    );
    if new.retention_expires_at <= new.created_at then
      raise exception 'client_pipeline_retention_expiry_invalid';
    end if;
    return new;
  end if;

  if new.tenant_slug is distinct from old.tenant_slug
     or new.created_at is distinct from old.created_at
     or new.retention_expires_at is distinct from old.retention_expires_at then
    raise exception 'client_pipeline_retention_immutable';
  end if;
  if old.retention_expires_at <= now() then
    if (to_jsonb(new) - 'build_artifact_id' - 'execution_job_id' - 'updated_at')
         is distinct from (to_jsonb(old) - 'build_artifact_id' - 'execution_job_id' - 'updated_at')
       or (new.build_artifact_id is not null and new.build_artifact_id is distinct from old.build_artifact_id)
       or (new.execution_job_id is not null and new.execution_job_id is distinct from old.execution_job_id) then
      raise exception 'client_pipeline_item_expired';
    end if;
    new.updated_at := old.updated_at;
    return new;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists guard_client_pipeline_retention on public.client_pipeline_items;
create trigger guard_client_pipeline_retention
  before insert or update on public.client_pipeline_items
  for each row execute function public.guard_client_pipeline_retention();

drop policy if exists client_pipeline_items_member_select on public.client_pipeline_items;
create policy client_pipeline_items_member_select on public.client_pipeline_items
  for select to authenticated using (
    public.client_member(tenant_slug) and retention_expires_at > now()
  );

drop policy if exists client_pipeline_items_member_insert on public.client_pipeline_items;
create policy client_pipeline_items_member_insert on public.client_pipeline_items
  for insert to authenticated with check (
    public.client_member(tenant_slug) and created_by = auth.uid()
    and retention_expires_at > now()
  );

drop policy if exists client_pipeline_items_member_update on public.client_pipeline_items;
create policy client_pipeline_items_member_update on public.client_pipeline_items
  for update to authenticated
  using (public.client_member(tenant_slug) and retention_expires_at > now())
  with check (public.client_member(tenant_slug) and retention_expires_at > now());

drop policy if exists client_pipeline_items_member_delete on public.client_pipeline_items;
create policy client_pipeline_items_member_delete on public.client_pipeline_items
  for delete to authenticated using (
    public.client_member(tenant_slug) and retention_expires_at > now()
  );

create or replace function public.update_client_pipeline_item_worker(
  p_tenant_slug text,
  p_worker_token text,
  p_job_id uuid,
  p_patch jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  next_stage text;
  next_execution text;
begin
  if p_worker_token is null
     or length(p_worker_token) < 24
     or p_patch is null
     or jsonb_typeof(p_patch) <> 'object'
     or pg_column_size(p_patch) > 262144
     or not exists (
       select 1 from public.client_tenants
       where slug = p_tenant_slug
         and status = 'active'
         and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     ) then
    return false;
  end if;

  next_stage := p_patch->>'stage';
  next_execution := p_patch->>'execution_state';
  if next_stage is not null and next_stage not in ('inbox', 'shaping', 'review', 'building', 'shipped', 'rejected') then
    return false;
  end if;
  if next_execution is not null and next_execution not in ('queued', 'running', 'succeeded', 'failed', 'cancelled') then
    return false;
  end if;

  update public.client_pipeline_items
    set route = coalesce(nullif(p_patch->>'route', ''), route),
        confidence = coalesce((p_patch->>'confidence')::numeric, confidence),
        tags = case
          when jsonb_typeof(p_patch->'tags') = 'array'
            then (select coalesce(array_agg(value), '{}'::text[]) from jsonb_array_elements_text(p_patch->'tags') limit 12)
          else tags
        end,
        title = coalesce(left(nullif(p_patch->>'title', ''), 240), title),
        classification = coalesce(left(p_patch->>'classification', 8000), classification),
        plan = coalesce(left(p_patch->>'plan', 20000), plan),
        tasks = coalesce(left(p_patch->>'tasks', 20000), tasks),
        build_artifact_id = coalesce((p_patch->>'build_artifact_id')::uuid, build_artifact_id),
        build_preview_html = coalesce(left(p_patch->>'build_preview_html', 40000), build_preview_html),
        execution_state = coalesce(next_execution, execution_state),
        execution_error = case when next_execution in ('succeeded', 'running') then null else coalesce(left(p_patch->>'execution_error', 120), execution_error) end,
        stage = coalesce(next_stage, stage),
        updated_at = now()
  where tenant_slug = p_tenant_slug
    and execution_job_id = p_job_id
    and retention_expires_at > now();

  return found;
end;
$$;

create or replace function public.purge_expired_client_pipeline_items(
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
  v_expired_before timestamptz := now();
  v_purge_before timestamptz := now() - interval '7 days';
  v_candidates integer;
  v_purge_due integer;
  v_deleted integer := 0;
  v_remaining integer;
begin
  if p_tenant_slug is null or p_tenant_slug !~ '^[a-z][a-z0-9-]{2,40}$'
     or p_apply is null or p_batch_limit is null
     or p_batch_limit < 1 or p_batch_limit > 500 then
    raise exception 'client_pipeline_retention_invalid_input';
  end if;

  select retention_days into v_retention_days
  from public.client_tenants where slug = p_tenant_slug for update;
  if not found then raise exception 'client_pipeline_retention_tenant_not_found'; end if;
  if v_retention_days is null or v_retention_days < 1 or v_retention_days > 28 then
    raise exception 'client_pipeline_retention_tenant_not_configured';
  end if;

  select count(*) filter (where retention_expires_at <= v_expired_before),
    count(*) filter (where retention_expires_at <= v_purge_before)
  into v_candidates, v_purge_due
  from public.client_pipeline_items
  where tenant_slug = p_tenant_slug;

  if p_apply then
    with selected as (
      select id from public.client_pipeline_items
      where tenant_slug = p_tenant_slug and retention_expires_at <= v_purge_before
      order by retention_expires_at, id
      limit p_batch_limit for update skip locked
    ), removed as (
      delete from public.client_pipeline_items as item using selected
      where item.id = selected.id and item.tenant_slug = p_tenant_slug
      returning item.id
    ) select count(*) into v_deleted from removed;

    if v_deleted > 0 then
      insert into public.client_runtime_audit_events (tenant_slug, event_type, metadata)
      values (p_tenant_slug, 'tenant.pipeline.retention_purged', jsonb_build_object(
        'deleted', v_deleted, 'retentionDays', v_retention_days,
        'recoveryDays', 7, 'purgeAfterDays', v_retention_days + 7));
    end if;
  end if;

  select count(*) into v_remaining
  from public.client_pipeline_items
  where tenant_slug = p_tenant_slug and retention_expires_at <= v_purge_before;

  return jsonb_build_object(
    'tenant', p_tenant_slug, 'expiredCandidates', v_candidates,
    'purgeDueCandidates', v_purge_due, 'deleted', v_deleted,
    'remainingPurgeDue', v_remaining, 'retentionDays', v_retention_days,
    'recoveryDays', 7, 'purgeAfterDays', v_retention_days + 7,
    'applied', p_apply, 'scope', jsonb_build_array('client_pipeline_items')
  );
end;
$$;

revoke all on function public.guard_client_pipeline_retention() from public, anon, authenticated;
revoke all on function public.purge_expired_client_pipeline_items(text, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.purge_expired_client_pipeline_items(text, boolean, integer)
  to service_role;

commit;
