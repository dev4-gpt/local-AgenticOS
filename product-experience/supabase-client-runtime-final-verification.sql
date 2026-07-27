-- Read-only verification for the hosted client runtime.
-- Run in Supabase SQL Editor as postgres after the controls, hosted-capability,
-- workflow-reconciliation, and records migrations.

select
  has_table_privilege('authenticated', 'public.client_tenants', 'SELECT') as tenant_table_select,
  has_column_privilege('authenticated', 'public.client_tenants', 'slug', 'SELECT') as slug_select,
  has_column_privilege('authenticated', 'public.client_tenants', 'worker_token_hash', 'SELECT') as worker_hash_select;

select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'client_tenants',
    'client_memberships',
    'client_runtime_requests',
    'client_runtime_jobs',
    'client_runtime_artifacts',
    'client_runtime_records',
    'client_runtime_delivery_actions',
    'client_runtime_rate_limits',
    'client_runtime_budget_ledger'
  )
order by table_name;

select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'consume_client_runtime_rate_limit',
    'enqueue_client_runtime_job',
    'claim_client_runtime_job',
    'complete_client_runtime_job',
    'retry_client_runtime_job',
    'cancel_client_runtime_job',
    'reserve_client_runtime_budget_worker',
    'settle_client_runtime_budget_worker',
    'create_client_runtime_artifact_worker',
    'confirm_client_runtime_artifact_worker',
    'delete_client_runtime_artifact',
    'checkpoint_client_runtime_job_worker',
    'create_client_delivery_action',
    'claim_client_delivery_action_worker',
    'complete_client_delivery_action_worker',
    'update_client_runtime_record_worker'
  )
order by p.proname;

select slug, status, retention_days
from public.client_tenants
where slug = 'veloce-cloud-test';
