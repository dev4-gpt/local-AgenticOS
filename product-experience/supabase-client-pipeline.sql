-- Apply after supabase-client-room.sql.
-- Hosted Pipeline: the tenant-owned idea funnel. The local pipeline keeps each
-- item as a Markdown file with YAML frontmatter in an Obsidian vault; Cloud Run
-- has no vault, so the same fields live here under tenant RLS.

create table if not exists public.client_pipeline_items (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,60}$'),
  title text not null check (length(title) between 1 and 240),
  -- Mirrors the local funnel exactly: capture, classify/route, human gate,
  -- execute, shipped, plus an explicit rejected terminal.
  stage text not null default 'inbox' check (stage in ('inbox', 'shaping', 'review', 'building', 'shipped', 'rejected')),
  route text check (route in ('project', 'action', 'idea', 'reference', 'escalate')),
  confidence numeric(4, 3) check (confidence >= 0 and confidence <= 1),
  tags text[] not null default '{}'::text[] check (cardinality(tags) <= 12),
  idea text not null check (length(idea) between 1 and 20000),
  classification text check (length(classification) <= 8000),
  plan text check (length(plan) <= 20000),
  tasks text check (length(tasks) <= 20000),
  pinned boolean not null default false,
  -- Execute stage output, committed through the same artifact lane Paperclip uses.
  build_artifact_id uuid references public.client_runtime_artifacts(id) on delete set null,
  build_preview_html text check (length(build_preview_html) <= 40000),
  execution_state text check (execution_state in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  execution_job_id uuid references public.client_runtime_jobs(id) on delete set null,
  execution_error text check (length(execution_error) <= 120),
  -- Who approved or rejected at the human gate, and when.
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_slug, slug)
);

create index if not exists client_pipeline_items_tenant_stage_idx
  on public.client_pipeline_items (tenant_slug, stage, pinned desc, created_at desc);
create index if not exists client_pipeline_items_job_idx
  on public.client_pipeline_items (execution_job_id) where execution_job_id is not null;

alter table public.client_pipeline_items enable row level security;

drop policy if exists client_pipeline_items_member_select on public.client_pipeline_items;
create policy client_pipeline_items_member_select on public.client_pipeline_items
  for select to authenticated using (public.client_member(tenant_slug));

drop policy if exists client_pipeline_items_member_insert on public.client_pipeline_items;
create policy client_pipeline_items_member_insert on public.client_pipeline_items
  for insert to authenticated with check (public.client_member(tenant_slug) and created_by = auth.uid());

drop policy if exists client_pipeline_items_member_update on public.client_pipeline_items;
create policy client_pipeline_items_member_update on public.client_pipeline_items
  for update to authenticated
  using (public.client_member(tenant_slug))
  with check (public.client_member(tenant_slug));

drop policy if exists client_pipeline_items_member_delete on public.client_pipeline_items;
create policy client_pipeline_items_member_delete on public.client_pipeline_items
  for delete to authenticated using (public.client_member(tenant_slug));

grant select, insert, update, delete on public.client_pipeline_items to authenticated;

-- Worker-only reconciliation. The shaping job writes back the classification,
-- plan, and tasks; the build job writes back the artifact. Both run without a
-- member session, so they go through a token-verified function.
drop function if exists public.update_client_pipeline_item_worker(text, text, uuid, jsonb);

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
        -- The worker may only advance a stage it was asked to advance; the
        -- human gate itself is never crossed by a job.
        stage = coalesce(next_stage, stage),
        updated_at = now()
  where tenant_slug = p_tenant_slug
    and execution_job_id = p_job_id;

  return found;
end;
$$;

revoke all on function public.update_client_pipeline_item_worker(text, text, uuid, jsonb)
  from public, authenticated;
grant execute on function public.update_client_pipeline_item_worker(text, text, uuid, jsonb)
  to anon;
