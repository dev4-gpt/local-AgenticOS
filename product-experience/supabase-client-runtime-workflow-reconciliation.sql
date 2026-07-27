-- Apply after supabase-client-runtime-hosted-capabilities.sql.
-- Worker-only reconciliation for hosted workflow surfaces. It records execution
-- state on a tenant workflow card without copying provider output into it.

drop function if exists public.update_client_runtime_record_worker(text, uuid, text, jsonb);

create or replace function public.update_client_runtime_record_worker(
  p_tenant_slug text,
  p_record_id uuid,
  p_worker_token text,
  p_execution jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_worker_token is null
     or length(p_worker_token) < 24
     or p_execution is null
     or jsonb_typeof(p_execution) <> 'object'
     or pg_column_size(p_execution) > 65536
     or not exists (
       select 1 from public.client_tenants
       where slug = p_tenant_slug
         and status = 'active'
         and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     ) then
    return false;
  end if;

  update public.client_runtime_records
    set metadata = case
          when jsonb_typeof(p_execution->'steps') = 'array'
            then jsonb_set(
              jsonb_set(coalesce(metadata, '{}'::jsonb), '{execution}', p_execution, true),
              '{steps}',
              p_execution->'steps',
              true
            )
          else jsonb_set(coalesce(metadata, '{}'::jsonb), '{execution}', p_execution, true)
        end,
        status = case when p_execution->>'status' = 'completed' then 'done' else status end,
        updated_at = now()
  where id = p_record_id
    and tenant_slug = p_tenant_slug
    and kind = 'workflow'
    and status <> 'archived';

  return found;
end;
$$;

revoke all on function public.update_client_runtime_record_worker(text, uuid, text, jsonb)
  from public, authenticated;
grant execute on function public.update_client_runtime_record_worker(text, uuid, text, jsonb)
  to anon;
