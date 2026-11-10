-- Apply after Room fixed retention, Pipeline retention, runtime-record/job retention and the
-- 28-day tenant policy. No new table or independent retention clock is added.
begin;

-- Retire the legacy worker's unrestricted memory/workflow write lane.
drop function if exists public.create_client_runtime_record_worker(text, text, text, text, text, jsonb);

create or replace function public.guard_client_room_record_origin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.client_runtime_jobs%rowtype;
  v_days integer;
begin
  if new.metadata ->> 'source' = 'agent-room'
     and not (new.metadata ? 'roomSourceJobId') and new.status = 'active' then
    raise exception 'client_room_legacy_record_unreviewed';
  end if;
  if tg_op = 'UPDATE' then
    if new.metadata -> 'roomSourceJobId' is distinct from old.metadata -> 'roomSourceJobId'
       or new.metadata -> 'roomDirectiveIndex' is distinct from old.metadata -> 'roomDirectiveIndex'
       or (old.metadata ->> 'source' = 'agent-room' and new.metadata -> 'source' is distinct from old.metadata -> 'source') then
      raise exception 'client_room_record_origin_immutable';
    end if;
    return new;
  end if;
  if not (new.metadata ? 'roomSourceJobId') then return new; end if;
  if coalesce(new.metadata ->> 'roomSourceJobId', '') !~ '^[0-9a-fA-F-]{36}$' then
    raise exception 'client_room_record_origin_invalid';
  end if;
  select job.* into v_job from public.client_runtime_jobs as job
  join public.client_tenants as tenant on tenant.slug = job.tenant_slug
  where job.id = (new.metadata ->> 'roomSourceJobId')::uuid
    and job.tenant_slug = new.tenant_slug and job.requested_by = new.created_by
    and job.capability = 'room-round' and job.status = 'succeeded' and job.error_code is null
    and tenant.retention_days between 1 and 28
    and public.client_runtime_job_active_until(job.created_at,tenant.retention_days,job.capability,job.input_metadata)>clock_timestamp();
  if not found then raise exception 'client_room_record_origin_invalid'; end if;
  -- Run after ordinary and restore clock triggers. The service-role restore
  -- has no member session; provenance still has to match its restored job.
  select retention_days into v_days from public.client_tenants where slug=new.tenant_slug;
  new.created_at := public.client_runtime_job_active_until(v_job.created_at,v_days,v_job.capability,v_job.input_metadata)-make_interval(days=>v_days);
  return new;
end;
$$;

drop trigger if exists z_guard_client_room_record_origin on public.client_runtime_records;
drop trigger if exists zzzzzz_guard_client_room_record_origin on public.client_runtime_records;
create trigger zzzzzz_guard_client_room_record_origin
  before insert or update on public.client_runtime_records
  for each row execute function public.guard_client_room_record_origin();

-- Reconcile copies approved under an earlier clock. The migration transaction
-- alone may shorten immutable dates; missing approval provenance aborts it.
alter table public.client_runtime_records disable trigger guard_client_runtime_record_retention;
alter table public.client_pipeline_items disable trigger guard_client_pipeline_retention;
do $derived_clocks$
declare
  item record;
  deadline timestamptz;
  days integer;
begin
  for item in select * from public.client_runtime_records where metadata ? 'roomSourceJobId' for update loop
    select t.retention_days,public.client_runtime_job_active_until(j.created_at,t.retention_days,j.capability,j.input_metadata)
      into days,deadline
    from public.client_runtime_jobs j join public.client_tenants t on t.slug=j.tenant_slug
    where j.id::text=item.metadata->>'roomSourceJobId' and j.tenant_slug=item.tenant_slug
      and j.requested_by=item.created_by and j.capability='room-round' and j.status='succeeded' and j.error_code is null
      and t.retention_days between 1 and 28
      and j.output_metadata->'roomDirectiveReviews'->(item.metadata->>'roomDirectiveIndex')->>'decision'='approved'
      and j.output_metadata->'roomDirectiveReviews'->(item.metadata->>'roomDirectiveIndex')->>'recordId'=item.id::text
      and j.output_metadata->'roomDirectiveReviews'->(item.metadata->>'roomDirectiveIndex')->>'reviewedBy'=item.created_by::text
      and j.output_metadata->'roomDirectives'->(case when item.metadata->>'roomDirectiveIndex' ~ '^(0|[1-9]|1[0-5])$' then (item.metadata->>'roomDirectiveIndex')::integer else -1 end)->>'kind'='note';
    if not found or deadline is null or not isfinite(deadline) then raise exception 'client_room_derived_origin_unverified'; end if;
    update public.client_runtime_records set created_at=least(created_at,deadline-make_interval(days=>days)) where id=item.id;
  end loop;
  for item in select * from public.client_pipeline_items where slug ~ '^room-[a-f0-9]{32}-[0-9]+$' for update loop
    select min(public.client_runtime_job_active_until(j.created_at,t.retention_days,j.capability,j.input_metadata)),min(t.retention_days)
      into deadline,days
    from public.client_runtime_jobs j join public.client_tenants t on t.slug=j.tenant_slug
    cross join lateral jsonb_each(case when jsonb_typeof(j.output_metadata->'roomDirectiveReviews')='object' then j.output_metadata->'roomDirectiveReviews' else '{}'::jsonb end) review
    where j.tenant_slug=item.tenant_slug and j.requested_by=item.created_by
      and j.capability='room-round' and j.status='succeeded' and j.error_code is null and t.retention_days between 1 and 28
      and item.slug='room-'||replace(j.id::text,'-','')||'-'||review.key
      and review.value->>'decision'='approved' and review.value->>'recordId'=item.id::text
      and review.value->>'reviewedBy'=item.created_by::text
      and j.output_metadata->'roomDirectives'->(case when review.key ~ '^(0|[1-9]|1[0-5])$' then review.key::integer else -1 end)->>'kind'='pipeline';
    if deadline is null or not isfinite(deadline) then raise exception 'client_room_derived_origin_unverified'; end if;
    update public.client_pipeline_items set retention_expires_at=least(retention_expires_at,deadline),
      created_at=least(created_at,least(retention_expires_at,deadline)-make_interval(days=>days)) where id=item.id;
  end loop;
end;
$derived_clocks$;
alter table public.client_runtime_records enable trigger guard_client_runtime_record_retention;
alter table public.client_pipeline_items enable trigger guard_client_pipeline_retention;

-- Existing worker-written records have no member decision. Quarantine active
-- legacy rows, preserving their content and original clock; never infer consent.
update public.client_runtime_records as record
set status = 'archived'
from public.client_tenants as tenant
where record.tenant_slug = tenant.slug and tenant.retention_days between 1 and 28
  and record.metadata ->> 'source' = 'agent-room' and not (record.metadata ? 'roomSourceJobId')
  and record.status = 'active'
  and record.created_at > now() - make_interval(days => tenant.retention_days);

drop policy if exists client_room_record_origin_insert on public.client_runtime_records;
create policy client_room_record_origin_insert on public.client_runtime_records
  as restrictive for insert to authenticated
  with check (not (metadata ? 'roomSourceJobId') and not (metadata ? 'roomDirectiveIndex'));

create or replace function public.review_client_room_directive(
  p_tenant_slug text, p_job_id uuid, p_index integer,
  p_expected jsonb, p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.client_runtime_jobs%rowtype;
  v_proposal jsonb;
  v_reviews jsonb;
  v_review jsonb;
  v_record_id uuid;
  v_metadata jsonb;
begin
  if auth.uid() is null or not public.client_member(p_tenant_slug)
    or p_index is null or p_index < 0 or p_index >= 16
    or p_decision is null or p_decision not in ('approved', 'rejected')
    or p_expected is null or jsonb_typeof(p_expected) <> 'object'
    or pg_column_size(p_expected) > 32768 then return null; end if;

  select * into v_job from public.client_runtime_jobs
  where id = p_job_id and tenant_slug = p_tenant_slug
    and requested_by = auth.uid() and capability = 'room-round'
    and status = 'succeeded' and error_code is null
    and public.client_runtime_job_active_until(created_at,public.client_tenant_retention_days(p_tenant_slug),capability,input_metadata)>clock_timestamp()
    and exists(select 1 from public.client_room_conversations p where p.tenant_slug=p_tenant_slug
      and p.id::text=input_metadata->>'conversationId' and p.status='active'
      and p.retention_expires_at>clock_timestamp() and p.created_at>clock_timestamp()-make_interval(days=>public.client_tenant_retention_days(p_tenant_slug)))
  for update;
  if not found or v_job.output_metadata ->> 'failureDisposition' = 'blocked'
    or jsonb_typeof(v_job.output_metadata -> 'roomDirectives') is distinct from 'array' then return null; end if;
  if jsonb_array_length(v_job.output_metadata -> 'roomDirectives') > 16 then return null; end if;
  v_proposal := v_job.output_metadata -> 'roomDirectives' -> p_index;
  if v_proposal is null or v_proposal is distinct from p_expected
    or coalesce(v_proposal ->> 'kind', '') not in ('note', 'pipeline')
    or jsonb_typeof(v_proposal -> 'label') is distinct from 'string'
    or length(btrim(v_proposal ->> 'label')) not between 1 and 120
    or jsonb_typeof(v_proposal -> 'body') is distinct from 'string'
    or length(btrim(v_proposal ->> 'body')) not between 1 and 4000 then return null; end if;

  v_reviews := coalesce(v_job.output_metadata -> 'roomDirectiveReviews', '{}'::jsonb);
  if jsonb_typeof(v_reviews) <> 'object' then return null; end if;
  v_review := v_reviews -> p_index::text;
  if v_review is not null then
    if v_review ->> 'decision' = p_decision then return v_review; end if;
    return null;
  end if;

  if p_decision = 'approved' then
    if v_proposal ->> 'kind' = 'pipeline' then
      insert into public.client_pipeline_items(tenant_slug,created_by,slug,title,idea,stage,retention_expires_at)
      values (p_tenant_slug,auth.uid(),'room-' || replace(p_job_id::text,'-','') || '-' || p_index::text,
        v_proposal ->> 'label',v_proposal ->> 'body','inbox',
        public.client_runtime_job_active_until(v_job.created_at,public.client_tenant_retention_days(p_tenant_slug),v_job.capability,v_job.input_metadata))
      returning id into v_record_id;
    else
      v_metadata := jsonb_build_object('source', 'agent-room', 'roomSourceJobId', p_job_id, 'roomDirectiveIndex', p_index);
      insert into public.client_runtime_records(tenant_slug, created_by, kind, title, content, status, metadata)
      values (p_tenant_slug, auth.uid(), 'memory', v_proposal ->> 'label', v_proposal ->> 'body', 'active', v_metadata)
      returning id into v_record_id;
    end if;
  end if;
  v_review := jsonb_build_object('decision', p_decision, 'recordId', v_record_id,
    'reviewedBy', auth.uid(), 'reviewedAt', now());
  update public.client_runtime_jobs
  set output_metadata = jsonb_set(output_metadata, '{roomDirectiveReviews}', v_reviews || jsonb_build_object(p_index::text, v_review))
  where id = p_job_id and tenant_slug = p_tenant_slug;
  return v_review;
end;
$$;

revoke all on function public.guard_client_room_record_origin() from public, anon, authenticated;
revoke all on function public.review_client_room_directive(text, uuid, integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.review_client_room_directive(text, uuid, integer, jsonb, text) to authenticated;
commit;
