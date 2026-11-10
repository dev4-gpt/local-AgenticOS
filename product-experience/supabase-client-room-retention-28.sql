-- Apply after client-room.sql and the 28-day tenant-retention policy.
-- Messages and rounds retain their individual clocks; a conversation remains
-- active while recently used. Parents are removed only after their children.

begin;

create index if not exists client_room_conversations_retention_idx
  on public.client_room_conversations (tenant_slug, updated_at, id);
create index if not exists client_room_messages_retention_idx
  on public.client_room_messages (tenant_slug, created_at, id);
create index if not exists client_room_rounds_retention_idx
  on public.client_room_rounds (tenant_slug, created_at, id);

create or replace function public.guard_client_room_retention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_retention_days integer;
  v_parent_updated_at timestamptz;
begin
  select retention_days into v_retention_days
  from public.client_tenants
  where slug = new.tenant_slug;
  if v_retention_days is null or v_retention_days < 1 or v_retention_days > 28 then
    raise exception 'client_room_retention_tenant_not_configured';
  end if;

  if tg_table_name = 'client_room_conversations' then
    if tg_op = 'INSERT' then
      new.created_at := now();
    else
      if new.tenant_slug is distinct from old.tenant_slug
         or new.created_at is distinct from old.created_at then
        raise exception 'client_room_retention_immutable';
      end if;
    end if;
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'INSERT' then
    select updated_at into v_parent_updated_at
    from public.client_room_conversations
    where id = new.conversation_id and tenant_slug = new.tenant_slug;
    if not found or v_parent_updated_at <= now() - make_interval(days => v_retention_days) then
      raise exception 'client_room_conversation_expired_or_foreign';
    end if;
    new.created_at := now();
    update public.client_room_conversations
    set updated_at = now()
    where id = new.conversation_id and tenant_slug = new.tenant_slug;
  else
    if new.tenant_slug is distinct from old.tenant_slug
       or new.conversation_id is distinct from old.conversation_id
       or new.created_at is distinct from old.created_at then
      raise exception 'client_room_retention_immutable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_client_room_conversation_retention on public.client_room_conversations;
create trigger guard_client_room_conversation_retention
  before insert or update on public.client_room_conversations
  for each row execute function public.guard_client_room_retention();
drop trigger if exists guard_client_room_message_retention on public.client_room_messages;
create trigger guard_client_room_message_retention
  before insert or update on public.client_room_messages
  for each row execute function public.guard_client_room_retention();
drop trigger if exists guard_client_room_round_retention on public.client_room_rounds;
create trigger guard_client_room_round_retention
  before insert or update on public.client_room_rounds
  for each row execute function public.guard_client_room_retention();

drop policy if exists client_room_conversations_member_select on public.client_room_conversations;
create policy client_room_conversations_member_select on public.client_room_conversations
  for select to authenticated using (
    public.client_member(tenant_slug)
    and updated_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug))
  );
drop policy if exists client_room_messages_member_select on public.client_room_messages;
create policy client_room_messages_member_select on public.client_room_messages
  for select to authenticated using (
    public.client_member(tenant_slug)
    and created_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug))
  );
drop policy if exists client_room_rounds_member_select on public.client_room_rounds;
create policy client_room_rounds_member_select on public.client_room_rounds
  for select to authenticated using (
    public.client_member(tenant_slug)
    and created_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug))
  );

drop policy if exists client_room_conversations_member_update on public.client_room_conversations;
create policy client_room_conversations_member_update on public.client_room_conversations
  for update to authenticated
  using (public.client_member(tenant_slug)
    and updated_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug)))
  with check (public.client_member(tenant_slug));
drop policy if exists client_room_messages_member_update on public.client_room_messages;
create policy client_room_messages_member_update on public.client_room_messages
  for update to authenticated
  using (public.client_member(tenant_slug)
    and created_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug)))
  with check (public.client_member(tenant_slug));
drop policy if exists client_room_rounds_member_update on public.client_room_rounds;
create policy client_room_rounds_member_update on public.client_room_rounds
  for update to authenticated
  using (public.client_member(tenant_slug)
    and created_at > now() - make_interval(days => public.client_tenant_retention_days(tenant_slug)))
  with check (public.client_member(tenant_slug));

create or replace function public.purge_expired_client_room_records(
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
  v_candidates jsonb;
  v_deleted jsonb := jsonb_build_object('messages', 0, 'rounds', 0, 'conversations', 0);
  v_remaining jsonb;
  v_deleted_messages integer := 0;
  v_deleted_rounds integer := 0;
  v_deleted_conversations integer := 0;
begin
  if p_tenant_slug is null or p_tenant_slug !~ '^[a-z][a-z0-9-]{2,40}$'
     or p_apply is null or p_batch_limit is null
     or p_batch_limit < 1 or p_batch_limit > 1000 then
    raise exception 'client_room_retention_invalid_input';
  end if;

  select retention_days into v_retention_days
  from public.client_tenants where slug = p_tenant_slug for update;
  if not found then
    raise exception 'client_room_retention_tenant_not_found';
  end if;
  if v_retention_days is null or v_retention_days < 1 or v_retention_days > 28 then
    raise exception 'client_room_retention_tenant_not_configured';
  end if;
  v_cutoff := now() - make_interval(days => v_retention_days + 7);

  select jsonb_build_object(
    'messages', (select count(*) from public.client_room_messages where tenant_slug = p_tenant_slug and created_at <= v_cutoff),
    'rounds', (select count(*) from public.client_room_rounds where tenant_slug = p_tenant_slug and created_at <= v_cutoff),
    'conversations', (select count(*) from public.client_room_conversations where tenant_slug = p_tenant_slug and updated_at <= v_cutoff)
  ) into v_candidates;

  if p_apply then
    with selected as (
      select id from public.client_room_messages
      where tenant_slug = p_tenant_slug and created_at <= v_cutoff
      order by created_at, id limit p_batch_limit for update skip locked
    ), removed as (
      delete from public.client_room_messages as message using selected
      where message.id = selected.id and message.tenant_slug = p_tenant_slug returning message.id
    ) select count(*) into v_deleted_messages from removed;

    with selected as (
      select id from public.client_room_rounds
      where tenant_slug = p_tenant_slug and created_at <= v_cutoff
      order by created_at, id limit p_batch_limit for update skip locked
    ), removed as (
      delete from public.client_room_rounds as round using selected
      where round.id = selected.id and round.tenant_slug = p_tenant_slug returning round.id
    ) select count(*) into v_deleted_rounds from removed;

    with selected as (
      select conversation.id
      from public.client_room_conversations as conversation
      where conversation.tenant_slug = p_tenant_slug
        and conversation.updated_at <= v_cutoff
        and not exists (
          select 1 from public.client_room_messages as message
          where message.tenant_slug = p_tenant_slug and message.conversation_id = conversation.id
        )
        and not exists (
          select 1 from public.client_room_rounds as round
          where round.tenant_slug = p_tenant_slug and round.conversation_id = conversation.id
        )
      order by conversation.updated_at, conversation.id
      limit p_batch_limit for update of conversation skip locked
    ), removed as (
      delete from public.client_room_conversations as conversation using selected
      where conversation.id = selected.id and conversation.tenant_slug = p_tenant_slug
      returning conversation.id
    ) select count(*) into v_deleted_conversations from removed;

    v_deleted := jsonb_build_object('messages', v_deleted_messages, 'rounds', v_deleted_rounds,
      'conversations', v_deleted_conversations);
    if v_deleted_messages + v_deleted_rounds + v_deleted_conversations > 0 then
      insert into public.client_runtime_audit_events (tenant_slug, event_type, metadata)
      values (p_tenant_slug, 'tenant.room.retention_purged', jsonb_build_object(
        'deleted', v_deleted, 'retentionDays', v_retention_days,
        'recoveryDays', 7, 'purgeAfterDays', v_retention_days + 7));
    end if;
  end if;

  select jsonb_build_object(
    'messages', (select count(*) from public.client_room_messages where tenant_slug = p_tenant_slug and created_at <= v_cutoff),
    'rounds', (select count(*) from public.client_room_rounds where tenant_slug = p_tenant_slug and created_at <= v_cutoff),
    'conversations', (select count(*) from public.client_room_conversations where tenant_slug = p_tenant_slug and updated_at <= v_cutoff)
  ) into v_remaining;

  return jsonb_build_object('tenant', p_tenant_slug, 'cutoff', v_cutoff,
    'retentionDays', v_retention_days, 'recoveryDays', 7, 'purgeAfterDays', v_retention_days + 7,
    'candidates', v_candidates, 'deleted', v_deleted, 'remainingCandidates', v_remaining,
    'applied', p_apply, 'scope', jsonb_build_array('client_room_conversations', 'client_room_messages', 'client_room_rounds'));
end;
$$;

revoke all on function public.guard_client_room_retention() from public, anon, authenticated;
revoke all on function public.purge_expired_client_room_records(text, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.purge_expired_client_room_records(text, boolean, integer)
  to service_role;

commit;
