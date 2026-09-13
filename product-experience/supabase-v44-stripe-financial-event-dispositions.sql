-- V44: retain a minimal, immutable operator review trail for non-credit
-- Stripe financial events. This deliberately does not store a Stripe payload,
-- card data, customer content, or credentials; stripe_webhook_events retains
-- only the matching payload hash.

create table if not exists public.stripe_financial_event_dispositions (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  event_type text not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  financial_scope text not null check (financial_scope in ('public_launch')),
  disposition text not null check (disposition in ('review_required', 'public_launch_refund_reviewed')),
  recorded_by text not null check (length(trim(recorded_by)) between 1 and 320),
  reason text not null check (length(trim(reason)) between 1 and 2000),
  recorded_at timestamptz not null default now(),
  unique (event_id, disposition)
);

-- The webhook event records the scope selected for the terminal delivery.
-- Existing rows remain null because their historic payloads are not being
-- reclassified by this migration.
alter table public.stripe_webhook_events
  add column if not exists financial_scope text
    check (financial_scope is null or financial_scope in ('managed_credit', 'public_launch', 'unknown'));

alter table public.stripe_financial_event_dispositions enable row level security;
revoke all on public.stripe_financial_event_dispositions from public, anon, authenticated;
revoke all on public.stripe_financial_event_dispositions from service_role;
grant select, insert on public.stripe_financial_event_dispositions to service_role;

create index if not exists stripe_financial_event_dispositions_event_idx
  on public.stripe_financial_event_dispositions (event_id, recorded_at desc);

create or replace function public.reject_stripe_financial_event_disposition_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'stripe_financial_event_dispositions are append-only';
end;
$$;

drop trigger if exists stripe_financial_event_dispositions_append_only
  on public.stripe_financial_event_dispositions;
create trigger stripe_financial_event_dispositions_append_only
  before update or delete on public.stripe_financial_event_dispositions
  for each row execute function public.reject_stripe_financial_event_disposition_mutation();

drop trigger if exists stripe_financial_event_dispositions_no_truncate
  on public.stripe_financial_event_dispositions;
create trigger stripe_financial_event_dispositions_no_truncate
  before truncate on public.stripe_financial_event_dispositions
  for each statement execute function public.reject_stripe_financial_event_disposition_mutation();

comment on table public.stripe_financial_event_dispositions is
  'Append-only service-role/operator review dispositions for non-credit Stripe events. Never store raw payloads, payment details, credentials, or customer content.';
