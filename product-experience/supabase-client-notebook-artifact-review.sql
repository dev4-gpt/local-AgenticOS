-- Apply after artifact-owner-guard and hosted-capabilities. No hosted application
-- is authorized by this source change. Review data expires with its artifact.
alter table public.client_runtime_artifacts
  add column if not exists review_decision text,
  add column if not exists review_sha256 text,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz;

alter table public.client_runtime_artifacts drop constraint if exists client_artifact_review_valid;
alter table public.client_runtime_artifacts add constraint client_artifact_review_valid check (
  (review_decision is null and review_sha256 is null and reviewed_by is null and reviewed_at is null)
  or (review_decision is not null and review_decision in ('approved', 'rejected')
    and review_sha256 is not null and review_sha256 ~ '^[a-f0-9]{64}$'
    and reviewed_by is not null and reviewed_at is not null)
);

create or replace function public.review_client_notebook_artifact(
  p_tenant_slug text, p_artifact_id uuid, p_object_key text,
  p_byte_size bigint, p_content_type text, p_sha256 text, p_decision text
)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.client_member(p_tenant_slug)
    or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$'
    or p_decision is null or p_decision not in ('approved', 'rejected') then
    return false;
  end if;
  update public.client_runtime_artifacts a set
    review_decision = p_decision, review_sha256 = p_sha256,
    reviewed_by = auth.uid(), reviewed_at = now()
  where a.id = p_artifact_id and a.tenant_slug = p_tenant_slug
    and a.status = 'ready' and a.retention_expires_at > now()
    and a.object_key = p_object_key and a.byte_size = p_byte_size
    and a.content_type = p_content_type
    and a.byte_size between 1 and 200000
    and a.content_type ~* '^text/(markdown|plain)(;|$)'
    and exists (select 1 from public.client_runtime_jobs j
      where j.id = a.job_id and j.tenant_slug = a.tenant_slug
        and j.requested_by = auth.uid() and j.capability = 'workspace-execution'
        and j.input_metadata->>'surface' = 'notebook'
        and j.status = 'succeeded' and j.error_code is null
        and j.output_metadata->>'artifactId' = a.id::text
        and j.output_metadata #> '{citationAudit,ok}' = 'true'::jsonb
        and coalesce(j.output_metadata->>'failureDisposition', '') <> 'blocked');
  return found;
end;
$$;

revoke all on function public.review_client_notebook_artifact(text, uuid, text, bigint, text, text, text) from public, anon;
grant execute on function public.review_client_notebook_artifact(text, uuid, text, bigint, text, text, text) to authenticated;
