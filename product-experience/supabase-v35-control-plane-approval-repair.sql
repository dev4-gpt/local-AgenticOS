-- Idempotent repair for control-plane approval persistence.
-- Safe to run against an existing production database before retrying an
-- approved manifest. It creates only the columns needed by the approval and
-- deployment state machine; it does not modify existing tenant data.

alter table public.client_onboarding_accounts
  add column if not exists manifest_version text,
  add column if not exists manifest_hash text,
  add column if not exists approved_manifest jsonb;
