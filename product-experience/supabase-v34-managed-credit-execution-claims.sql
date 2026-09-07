-- Managed-credit execution claims.
-- A reservation must be atomically claimed and tenant/model-price matched
-- before any external provider request can spend the Veloce-owned account.

create table if not exists public.client_credit_execution_claims (
  reservation_id uuid primary key references public.client_credit_reservations(id) on delete cascade,
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  catalog_id text not null,
  provider_key text not null,
  claim_key text not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  pricing_snapshot_id text not null
    constraint client_credit_execution_claims_pricing_snapshot_fk
    references public.client_pricing_snapshots(id),
  metadata jsonb not null default '{}'::jsonb,
  claimed_at timestamptz not null default now(),
  unique (tenant_slug, claim_key)
);

-- Fail safely if an earlier partial application created nullable claims.
-- Operators must reconcile any null rows instead of silently weakening the
-- spend boundary.
alter table public.client_credit_execution_claims
  alter column pricing_snapshot_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'client_credit_execution_claims_pricing_snapshot_fk'
      and conrelid = 'public.client_credit_execution_claims'::regclass
  ) then
    alter table public.client_credit_execution_claims
      add constraint client_credit_execution_claims_pricing_snapshot_fk
      foreign key (pricing_snapshot_id) references public.client_pricing_snapshots(id);
  end if;
end;
$$;

create index if not exists client_credit_execution_claims_tenant_claimed_idx
  on public.client_credit_execution_claims (tenant_slug, claimed_at desc);

create or replace function public.claim_client_credit_reservation(
  p_reservation_id uuid,
  p_tenant_slug text,
  p_catalog_id text,
  p_provider_key text,
  p_reserved_amount_micros bigint,
  p_pricing_snapshot_id text,
  p_claim_key text,
  p_request_hash text,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation_row public.client_credit_reservations%rowtype;
  claimed_id uuid;
begin
  if p_reservation_id is null
     or coalesce(trim(p_tenant_slug), '') = ''
     or coalesce(trim(p_catalog_id), '') = ''
     or coalesce(trim(p_provider_key), '') = ''
     or p_reserved_amount_micros is null
     or p_reserved_amount_micros <= 0
     or coalesce(trim(p_pricing_snapshot_id), '') = ''
     or coalesce(trim(p_claim_key), '') = ''
     or length(p_claim_key) > 240
     or coalesce(p_request_hash, '') !~ '^[0-9a-f]{64}$'
     or p_metadata is null
     or jsonb_typeof(p_metadata) <> 'object'
     or pg_column_size(p_metadata) > 4096 then
    return false;
  end if;

  select *
    into reservation_row
  from public.client_credit_reservations
  where id = p_reservation_id
  for update;

  if not found
     or reservation_row.status <> 'reserved'
     or reservation_row.expires_at <= now()
     or reservation_row.tenant_slug <> p_tenant_slug
     or reservation_row.catalog_id <> p_catalog_id
     or reservation_row.provider_key <> p_provider_key
     or reservation_row.reserved_amount_micros <> p_reserved_amount_micros
     or reservation_row.pricing_snapshot_id is null
     or reservation_row.pricing_snapshot_id <> p_pricing_snapshot_id then
    return false;
  end if;

  insert into public.client_credit_execution_claims (
    reservation_id,
    tenant_slug,
    catalog_id,
    provider_key,
    claim_key,
    request_hash,
    pricing_snapshot_id,
    metadata
  )
  values (
    reservation_row.id,
    reservation_row.tenant_slug,
    reservation_row.catalog_id,
    reservation_row.provider_key,
    p_claim_key,
    p_request_hash,
    reservation_row.pricing_snapshot_id,
    p_metadata
  )
  on conflict do nothing
  returning reservation_id into claimed_id;

  if claimed_id is null then
    return false;
  end if;

  update public.client_credit_reservations
  set audit_metadata = audit_metadata || jsonb_build_object(
        'execution_claim_key', p_claim_key,
        'execution_request_hash', p_request_hash,
        'execution_claimed_at', now()
      ),
      updated_at = now()
  where id = reservation_row.id;

  return true;
end;
$$;

alter table public.client_credit_execution_claims enable row level security;
revoke all on public.client_credit_execution_claims from anon, authenticated;
revoke all on function public.claim_client_credit_reservation(uuid, text, text, text, bigint, text, text, text, jsonb)
  from public, anon, authenticated;
grant all on public.client_credit_execution_claims to service_role;
grant execute on function public.claim_client_credit_reservation(uuid, text, text, text, bigint, text, text, text, jsonb)
  to service_role;
