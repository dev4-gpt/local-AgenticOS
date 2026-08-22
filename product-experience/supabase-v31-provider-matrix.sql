-- V3.1 provider matrix and tenant manifest proposals.
-- Browser clients may submit a proposal only through the authenticated RPC;
-- activation remains an operator/control-plane responsibility.

create table if not exists public.client_manifest_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references public.client_tenants(slug) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  catalog_ids text[] not null check (cardinality(catalog_ids) between 1 and 100),
  provider_keys text[] not null default '{}',
  credential_modes jsonb not null default '{}'::jsonb,
  pricing_snapshot_ids text[] not null default '{}',
  idempotency_key text not null,
  manifest_hash text,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected', 'activated', 'rolled_back')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_slug, idempotency_key)
);

create or replace function public.create_client_manifest_proposal(
  p_tenant_slug text,
  p_catalog_ids text[],
  p_provider_keys text[] default '{}',
  p_pricing_snapshot_ids text[] default '{}',
  p_credential_modes jsonb default '{}'::jsonb,
  p_idempotency_key text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal_id uuid;
begin
  if auth.uid() is null or p_tenant_slug is null or p_tenant_slug = ''
    or not exists (select 1 from public.client_memberships m where m.tenant_slug = p_tenant_slug and m.user_id = auth.uid() and m.status = 'active')
    or p_catalog_ids is null or cardinality(p_catalog_ids) < 1 or cardinality(p_catalog_ids) > 100
    or p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    return null;
  end if;

  insert into public.client_manifest_proposals
    (tenant_slug, requested_by, catalog_ids, provider_keys, credential_modes, pricing_snapshot_ids, idempotency_key, metadata)
  values
    (p_tenant_slug, auth.uid(), p_catalog_ids, coalesce(p_provider_keys, '{}'), coalesce(p_credential_modes, '{}'::jsonb), coalesce(p_pricing_snapshot_ids, '{}'), trim(p_idempotency_key), jsonb_build_object('source', 'authenticated-provider-matrix'))
  on conflict (tenant_slug, idempotency_key) do update set updated_at = now()
  returning id into proposal_id;
  return proposal_id;
end;
$$;

create or replace function public.list_client_manifest_proposals(p_tenant_slug text)
returns table (id uuid, tenant_slug text, catalog_ids text[], provider_keys text[], credential_modes jsonb, pricing_snapshot_ids text[], status text, created_at timestamptz, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select p.id, p.tenant_slug, p.catalog_ids, p.provider_keys, p.credential_modes, p.pricing_snapshot_ids, p.status, p.created_at, p.updated_at
  from public.client_manifest_proposals p
  where p.tenant_slug = p_tenant_slug
    and exists (select 1 from public.client_memberships m where m.tenant_slug = p_tenant_slug and m.user_id = auth.uid() and m.status = 'active')
  order by p.created_at desc;
$$;

alter table public.client_manifest_proposals enable row level security;
revoke all on public.client_manifest_proposals from anon, authenticated;
revoke execute on function public.create_client_manifest_proposal(text, text[], text[], text[], jsonb, text) from anon, authenticated;
revoke execute on function public.list_client_manifest_proposals(text) from anon, authenticated;
grant execute on function public.create_client_manifest_proposal(text, text[], text[], text[], jsonb, text) to authenticated;
grant execute on function public.list_client_manifest_proposals(text) to authenticated;
create index if not exists client_manifest_proposals_tenant_idx on public.client_manifest_proposals (tenant_slug, created_at desc);
