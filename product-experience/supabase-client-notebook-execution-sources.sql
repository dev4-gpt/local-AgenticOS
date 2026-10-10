-- Apply after supabase-client-notebooks.sql and the runtime-control-plane
-- migrations. The worker resolves source text only when it claims a notebook
-- draft job; the queued job therefore stores IDs and hashes, not copied text.
begin;

create or replace function public.load_client_notebook_execution_sources_worker(
  p_tenant_slug text,
  p_job_id uuid,
  p_worker_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_input jsonb;
  v_scope text;
  v_ids jsonb;
  v_count integer;
  v_sources jsonb;
begin
  if p_worker_token is null or length(p_worker_token) < 24
     or not exists (
       select 1 from public.client_tenants t
       where t.slug = p_tenant_slug
         and t.status = 'active'
         and t.retention_days = 45
         and t.worker_token_hash = encode(extensions.digest(p_worker_token, 'sha256'), 'hex')
     ) then
    return null;
  end if;

  select j.input_metadata into v_input
  from public.client_runtime_jobs j
  where j.id = p_job_id
    and j.tenant_slug = p_tenant_slug
    and j.capability = 'workspace-execution'
    and j.status = 'running';
  if not found or (v_input ->> 'surface') is distinct from 'notebook' then
    return null;
  end if;

  v_scope := v_input ->> 'notebookScope';
  v_ids := v_input -> 'sourceIds';
  if v_scope is null or (v_scope not in ('all', 'unfiled') and v_scope !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
     or jsonb_typeof(v_ids) is distinct from 'array'
     or jsonb_array_length(v_ids) not between 1 and 5
     or jsonb_typeof(v_input -> 'sourceReferences') is distinct from 'array'
     or jsonb_array_length(v_input -> 'sourceReferences') <> jsonb_array_length(v_ids)
     or exists (
       select 1 from jsonb_array_elements_text(v_ids) as ids(value)
       where value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     ) then
    return null;
  end if;

  if v_scope ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and not exists (
       select 1 from public.client_notebooks n
       where n.id = v_scope::uuid and n.tenant_slug = p_tenant_slug and n.status = 'active'
     ) then
    return null;
  end if;

  with requested as (
    select value::uuid as id, ordinality
    from jsonb_array_elements_text(v_ids) with ordinality as selected(value, ordinality)
  ), selected_records as (
    select r.id, r.title, r.content, r.metadata, r.created_at, r.notebook_id, requested.ordinality
    from requested
    join public.client_runtime_records r on r.id = requested.id
    where r.tenant_slug = p_tenant_slug
      and r.kind = 'notebook'
      and r.status = 'active'
      and r.created_at > now() - interval '45 days'
      and (v_scope = 'all'
        or (v_scope = 'unfiled' and r.notebook_id is null)
        or (v_scope ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and r.notebook_id = v_scope::uuid))
  )
  select count(*), coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'title', title, 'content', content, 'metadata', metadata,
    'createdAt', created_at, 'notebookId', notebook_id
  ) order by ordinality), '[]'::jsonb)
  into v_count, v_sources
  from selected_records;

  if v_count <> jsonb_array_length(v_ids) then
    return null;
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_ids) with ordinality requested(value, ordinality)
    group by value
    having count(*) > 1
  ) then
    return null;
  end if;

  return jsonb_build_object('sources', v_sources);
end;
$$;

revoke all on function public.load_client_notebook_execution_sources_worker(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.load_client_notebook_execution_sources_worker(text, uuid, text)
  to service_role;

commit;
