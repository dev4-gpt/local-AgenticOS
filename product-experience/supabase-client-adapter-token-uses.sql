-- Apply after supabase-client-adapter-host.sql.
-- Replay protection for adapter tokens: each token id (jti) can be consumed once per tenant.
-- Only the host worker (publishable key plus tenant worker token) can consume; members cannot read or write rows.

create table if not exists public.client_adapter_token_uses (
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  jti uuid not null,
  adapter_id text not null check (adapter_id ~ '^[a-z][a-z0-9-]{2,40}$'),
  expires_at timestamptz not null,
  used_at timestamptz not null default now(),
  primary key (tenant_slug, jti)
);

create index if not exists client_adapter_token_uses_expiry_idx on public.client_adapter_token_uses (expires_at);

alter table public.client_adapter_token_uses enable row level security;
revoke all on public.client_adapter_token_uses from public, anon, authenticated;
grant select, insert, delete on public.client_adapter_token_uses to service_role;

create or replace function public.client_adapter_consume_token(
  p_tenant_slug text,
  p_worker_token text,
  p_adapter_id text,
  p_jti uuid,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  inserted integer;
begin
  if p_worker_token is null or length(p_worker_token) < 24
     or not exists (
       select 1 from public.client_tenants
       where slug = p_tenant_slug
         and status = 'active'
         and worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     ) then
    return false;
  end if;
  -- Tokens live at most five minutes; refuse anything already expired or claiming a longer life.
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '6 minutes' then
    return false;
  end if;
  if not exists (select 1 from public.client_adapter_registry where tenant_slug = p_tenant_slug and adapter_id = p_adapter_id) then
    return false;
  end if;
  insert into public.client_adapter_token_uses (tenant_slug, jti, adapter_id, expires_at)
  values (p_tenant_slug, p_jti, p_adapter_id, p_expires_at)
  on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 1 then
    -- A first use only (a replay is refused above and counts nothing). Only a count is kept, no token id (item 6b).
    insert into public.client_adapter_token_use_counts (tenant_slug, adapter_id, day, uses)
    values (p_tenant_slug, p_adapter_id, (now() at time zone 'utc')::date, 1)
    on conflict (tenant_slug, adapter_id, day) do update set uses = public.client_adapter_token_use_counts.uses + 1;
  end if;
  return inserted = 1;
end;
$$;

-- Bounded purge of rows whose token expired long ago (token life is at most five minutes).
create or replace function public.client_adapter_purge_token_uses(p_limit integer default 1000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  with doomed as (
    select tenant_slug, jti from public.client_adapter_token_uses
    where expires_at < now() - interval '1 day'
    order by expires_at
    limit least(greatest(coalesce(p_limit, 1000), 1), 5000)
  )
  delete from public.client_adapter_token_uses u using doomed d
   where u.tenant_slug = d.tenant_slug and u.jti = d.jti;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- Scoped read: an adapter reads only the memory items its token names (the host checks the token's handles; this
-- function enforces the database side). Returns only active items in the tenant that are shared or in the calling
-- adapter's own namespace. Another adapter's private memory, other tenants, unknown ids and inactive items all give
-- the same answer, no rows, so nothing can be probed. Adapters that are not in preview or enabled read nothing.
create or replace function public.client_adapter_read_scoped(
  p_tenant_slug text,
  p_worker_token text,
  p_adapter_id text,
  p_item_ids uuid[]
)
returns table (id uuid, namespace text, content text, content_sha256 text, trust_level text, valid_from timestamptz)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if p_worker_token is null or length(p_worker_token) < 24
     or not exists (
       select 1 from public.client_tenants t
       where t.slug = p_tenant_slug
         and t.status = 'active'
         and t.worker_token_hash = encode(digest(p_worker_token, 'sha256'), 'hex')
     ) then
    return;
  end if;
  if p_item_ids is null or cardinality(p_item_ids) not between 1 and 20 then
    return;
  end if;
  if not exists (
    select 1 from public.client_adapter_registry r
    where r.tenant_slug = p_tenant_slug and r.adapter_id = p_adapter_id and r.state in ('preview', 'enabled')
  ) then
    return;
  end if;
  return query
  select i.id, i.namespace, i.content, i.content_sha256, i.trust_level, i.valid_from
    from public.client_adapter_memory_items i
    where i.tenant_slug = p_tenant_slug
      and i.id = any (p_item_ids)
      and i.status = 'active'
      and (i.namespace = 'shared' or i.namespace = 'adapter:' || p_adapter_id)
    order by i.created_at, i.id;
end;
$$;

revoke all on function public.client_adapter_consume_token(text, text, text, uuid, timestamptz) from public, authenticated;
grant execute on function public.client_adapter_consume_token(text, text, text, uuid, timestamptz) to anon;
-- Daily token-use counters are kept for the 28-day activity view and removed after 28 + 7 days. Bounded and safe to repeat.
create or replace function public.client_adapter_purge_token_counts(p_limit integer default 1000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  with doomed as (
    select tenant_slug, adapter_id, day from public.client_adapter_token_use_counts
    where day < (now() at time zone 'utc')::date - 35
    order by day
    limit least(greatest(coalesce(p_limit, 1000), 1), 5000)
  )
  delete from public.client_adapter_token_use_counts c using doomed d
   where c.tenant_slug = d.tenant_slug and c.adapter_id = d.adapter_id and c.day = d.day;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.client_adapter_purge_token_uses(integer) from public, anon, authenticated;
grant execute on function public.client_adapter_purge_token_uses(integer) to service_role;
revoke all on function public.client_adapter_read_scoped(text, text, text, uuid[]) from public, authenticated;
grant execute on function public.client_adapter_read_scoped(text, text, text, uuid[]) to anon;
revoke all on function public.client_adapter_purge_token_counts(integer) from public, anon, authenticated;
grant execute on function public.client_adapter_purge_token_counts(integer) to service_role;
