-- Apply after supabase-client-paperclip.sql.
-- Hosted Agent Room: tenant-owned group-chat conversations, their durable
-- message log, and the per-round dispatch state. The local room keeps history
-- as JSON files in an Obsidian vault plus a localStorage cache; neither exists
-- in Cloud Run, so history lives here under tenant RLS instead.

create table if not exists public.client_room_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id),
  title text not null default 'New chat' check (length(title) between 1 and 120),
  status text not null default 'active' check (status in ('active', 'archived')),
  -- Which roster agents are currently in the room for this conversation.
  present_agents text[] not null default '{}'::text[] check (cardinality(present_agents) <= 16),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_room_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  conversation_id uuid not null references public.client_room_conversations(id) on delete cascade,
  created_by uuid references auth.users(id),
  -- 'user' is the member speaking; 'agent' is a persona reply; 'system' is a
  -- context or action notice, matching the local room's centred pills.
  role text not null check (role in ('user', 'agent', 'system')),
  kind text not null default 'message' check (kind in ('message', 'context', 'action', 'error')),
  agent_id text check (length(agent_id) <= 40),
  agent_name text check (length(agent_name) <= 60),
  agent_color text check (agent_color ~ '^#[0-9a-fA-F]{6}$'),
  content text not null check (length(content) between 1 and 20000),
  provider text check (length(provider) <= 40),
  model text check (length(model) <= 120),
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  error_code text check (length(error_code) <= 120),
  -- Set when a system row records a real side effect (a saved memory record or
  -- a queued pipeline workflow), so the UI links to something that exists.
  linked_record_id uuid,
  seq integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.client_room_rounds (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  conversation_id uuid not null references public.client_room_conversations(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id),
  job_id uuid references public.client_runtime_jobs(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  -- The agents this round will speak, in order, after @mention narrowing.
  agent_ids text[] not null default '{}'::text[] check (cardinality(agent_ids) <= 16),
  -- Which agent the worker is currently waiting on, so the UI can show the
  -- same "X is typing" affordance the local room streams.
  speaking_agent_id text check (length(speaking_agent_id) <= 40),
  completed_agents integer not null default 0 check (completed_agents >= 0),
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  error_code text check (length(error_code) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_room_conversations_tenant_idx
  on public.client_room_conversations (tenant_slug, status, updated_at desc);
create index if not exists client_room_messages_conversation_idx
  on public.client_room_messages (tenant_slug, conversation_id, seq, created_at);
create index if not exists client_room_rounds_conversation_idx
  on public.client_room_rounds (tenant_slug, conversation_id, created_at desc);
create index if not exists client_room_rounds_job_idx
  on public.client_room_rounds (job_id) where job_id is not null;

alter table public.client_room_conversations enable row level security;
alter table public.client_room_messages enable row level security;
alter table public.client_room_rounds enable row level security;

do $$
declare
  room_table text;
begin
  foreach room_table in array array[
    'client_room_conversations',
    'client_room_messages',
    'client_room_rounds'
  ]
  loop
    execute format('drop policy if exists %1$s_member_select on public.%1$s', room_table);
    execute format(
      'create policy %1$s_member_select on public.%1$s for select to authenticated using (public.client_member(tenant_slug))',
      room_table
    );
    execute format('drop policy if exists %1$s_member_insert on public.%1$s', room_table);
    execute format(
      'create policy %1$s_member_insert on public.%1$s for insert to authenticated with check (public.client_member(tenant_slug))',
      room_table
    );
    execute format('drop policy if exists %1$s_member_update on public.%1$s', room_table);
    execute format(
      'create policy %1$s_member_update on public.%1$s for update to authenticated using (public.client_member(tenant_slug)) with check (public.client_member(tenant_slug))',
      room_table
    );
    execute format('drop policy if exists %1$s_member_delete on public.%1$s', room_table);
    execute format(
      'create policy %1$s_member_delete on public.%1$s for delete to authenticated using (public.client_member(tenant_slug))',
      room_table
    );
  end loop;
end
$$;

grant select, insert, update, delete on public.client_room_conversations to authenticated;
grant select, insert, update, delete on public.client_room_messages to authenticated;
grant select, insert, update, delete on public.client_room_rounds to authenticated;

-- Appends a message and hands back the next sequence number for the
-- conversation. Two agents finishing close together must not collide on seq,
-- so the number is allocated under the conversation's row lock.
create or replace function public.append_client_room_message(
  p_tenant_slug text,
  p_conversation_id uuid,
  p_role text,
  p_kind text,
  p_content text,
  p_agent_id text,
  p_agent_name text,
  p_agent_color text,
  p_provider text,
  p_model text,
  p_cost_micros bigint,
  p_error_code text,
  p_linked_record_id uuid
)
returns public.client_room_messages
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_seq integer;
  inserted public.client_room_messages;
begin
  update public.client_room_conversations
    set updated_at = now()
  where id = p_conversation_id
    and tenant_slug = p_tenant_slug;

  if not found then
    raise exception 'room_conversation_missing';
  end if;

  select coalesce(max(seq), 0) + 1 into next_seq
  from public.client_room_messages
  where tenant_slug = p_tenant_slug
    and conversation_id = p_conversation_id;

  insert into public.client_room_messages (
    tenant_slug, conversation_id, role, kind, content,
    agent_id, agent_name, agent_color, provider, model,
    cost_micros, error_code, linked_record_id, seq
  )
  values (
    p_tenant_slug, p_conversation_id, p_role, coalesce(p_kind, 'message'), p_content,
    p_agent_id, p_agent_name, p_agent_color, p_provider, p_model,
    greatest(0, coalesce(p_cost_micros, 0)), p_error_code, p_linked_record_id, next_seq
  )
  returning * into inserted;

  return inserted;
end;
$$;

grant execute on function public.append_client_room_message(text, uuid, text, text, text, text, text, text, text, text, bigint, text, uuid) to authenticated;

-- Worker-only: the Cloud Run job has no member session, so it appends agent
-- turns and advances round state through a token-verified function.
drop function if exists public.append_client_room_message_worker(text, text, uuid, text, text, text, text, text, text, text, text, bigint, text, uuid);

create or replace function public.append_client_room_message_worker(
  p_tenant_slug text,
  p_worker_token text,
  p_conversation_id uuid,
  p_role text,
  p_kind text,
  p_content text,
  p_agent_id text,
  p_agent_name text,
  p_agent_color text,
  p_provider text,
  p_model text,
  p_cost_micros bigint,
  p_error_code text,
  p_linked_record_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  next_seq integer;
begin
  if p_worker_token is null
     or length(p_worker_token) < 24
     or p_role not in ('user', 'agent', 'system')
     or p_content is null
     or length(p_content) = 0
     or not exists (
       select 1 from public.client_tenants
       where slug = p_tenant_slug
         and status = 'active'
         and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     )
     or not exists (
       select 1 from public.client_room_conversations
       where id = p_conversation_id and tenant_slug = p_tenant_slug
     ) then
    return false;
  end if;

  select coalesce(max(seq), 0) + 1 into next_seq
  from public.client_room_messages
  where tenant_slug = p_tenant_slug
    and conversation_id = p_conversation_id;

  insert into public.client_room_messages (
    tenant_slug, conversation_id, role, kind, content,
    agent_id, agent_name, agent_color, provider, model,
    cost_micros, error_code, linked_record_id, seq
  )
  values (
    p_tenant_slug, p_conversation_id, p_role, coalesce(p_kind, 'message'), left(p_content, 20000),
    p_agent_id, p_agent_name, p_agent_color, p_provider, p_model,
    greatest(0, coalesce(p_cost_micros, 0)), p_error_code, p_linked_record_id, next_seq
  );

  update public.client_room_conversations
    set updated_at = now()
  where id = p_conversation_id and tenant_slug = p_tenant_slug;

  return true;
end;
$$;

revoke all on function public.append_client_room_message_worker(text, text, uuid, text, text, text, text, text, text, text, text, bigint, text, uuid)
  from public, authenticated;
grant execute on function public.append_client_room_message_worker(text, text, uuid, text, text, text, text, text, text, text, text, bigint, text, uuid)
  to anon;

drop function if exists public.update_client_room_round_worker(text, text, uuid, text, text, integer, bigint, text);

create or replace function public.update_client_room_round_worker(
  p_tenant_slug text,
  p_worker_token text,
  p_job_id uuid,
  p_status text,
  p_speaking_agent_id text,
  p_completed_agents integer,
  p_cost_micros bigint,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_worker_token is null
     or length(p_worker_token) < 24
     or p_status not in ('running', 'succeeded', 'failed', 'cancelled')
     or not exists (
       select 1 from public.client_tenants
       where slug = p_tenant_slug
         and status = 'active'
         and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     ) then
    return false;
  end if;

  update public.client_room_rounds
    set status = p_status,
        -- Only a running round has someone speaking; clear it on any terminal
        -- state so the UI cannot keep showing a stale typing indicator.
        speaking_agent_id = case when p_status = 'running' then p_speaking_agent_id else null end,
        completed_agents = greatest(completed_agents, coalesce(p_completed_agents, completed_agents)),
        cost_micros = greatest(0, coalesce(p_cost_micros, cost_micros)),
        error_code = p_error_code,
        updated_at = now()
  where tenant_slug = p_tenant_slug
    and job_id = p_job_id;

  return found;
end;
$$;

revoke all on function public.update_client_room_round_worker(text, text, uuid, text, text, integer, bigint, text)
  from public, authenticated;
grant execute on function public.update_client_room_round_worker(text, text, uuid, text, text, integer, bigint, text)
  to anon;

-- Worker-only tenant record creation. A room agent's NOTE:: directive becomes a
-- memory record and PIPELINE:: becomes a pipeline workflow record, so a room
-- action produces a row the other surfaces already render. The worker has no
-- member session and client_runtime_records.created_by is NOT NULL, so the row
-- is attributed to the member who owns the originating conversation.
drop function if exists public.create_client_runtime_record_worker(text, text, text, text, text, jsonb);

create or replace function public.create_client_runtime_record_worker(
  p_tenant_slug text,
  p_worker_token text,
  p_kind text,
  p_title text,
  p_content text,
  p_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  owner uuid;
  new_id uuid;
begin
  if p_worker_token is null
     or length(p_worker_token) < 24
     or p_kind not in ('memory', 'workflow')
     or p_title is null
     or length(btrim(p_title)) = 0
     or p_content is null
     or length(btrim(p_content)) = 0
     or p_metadata is null
     or jsonb_typeof(p_metadata) <> 'object'
     or pg_column_size(p_metadata) > 65536
     or not exists (
       select 1 from public.client_tenants
       where slug = p_tenant_slug
         and status = 'active'
         and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     ) then
    return null;
  end if;

  -- Attribute to an active owner/admin of the tenant so the record is visible
  -- and deletable through the normal member-scoped policies.
  select user_id into owner
  from public.client_memberships
  where tenant_slug = p_tenant_slug
    and status = 'active'
  order by case role when 'owner' then 0 when 'admin' then 1 else 2 end, created_at
  limit 1;

  if owner is null then
    return null;
  end if;

  insert into public.client_runtime_records (tenant_slug, created_by, kind, title, content, metadata)
  values (p_tenant_slug, owner, p_kind, left(btrim(p_title), 240), left(btrim(p_content), 30000), p_metadata)
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_client_runtime_record_worker(text, text, text, text, text, jsonb)
  from public, authenticated;
grant execute on function public.create_client_runtime_record_worker(text, text, text, text, text, jsonb)
  to anon;
