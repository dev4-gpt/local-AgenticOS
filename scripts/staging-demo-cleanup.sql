-- Removes everything scripts/staging-demo-seed.sql added (adapter zz-demo-creator in agentos-staging, and the two temporary
-- admin memberships). Set zz_demo.account_a and zz_demo.account_b first, exactly as at the top of the seed file.
-- Touches nothing else: every delete is limited to that adapter id, and the memberships to the two accounts.
do $clean$
declare
  t constant text := 'agentos-staging';
  a constant text := 'zz-demo-creator';
begin
  if coalesce(current_setting('zz_demo.account_a', true), '') !~ '^[0-9a-f]{8,}$'
     or coalesce(current_setting('zz_demo.account_b', true), '') !~ '^[0-9a-f]{8,}$'
     or current_setting('zz_demo.account_a', true) = current_setting('zz_demo.account_b', true) then
    raise exception 'zz-demo: set zz_demo.account_a and zz_demo.account_b first (two different account id prefixes of 8 or more hex characters; see the top of this file)';
  end if;
  -- The same transaction-local switch the retention purge uses to pass the append-only guard on budget events.
  perform set_config('veloce.adapter_purge', 'on', true);
  delete from public.client_adapter_tombstone_exposures where tenant_slug = t and item_id in (select id from public.client_adapter_memory_items where tenant_slug = t and origin_adapter_id = a);
  delete from public.client_adapter_tombstone_receipts where tenant_slug = t and adapter_id = a;
  delete from public.client_adapter_outbox where tenant_slug = t and adapter_id = a;
  delete from public.client_adapter_budget_events where tenant_slug = t and adapter_id = a;
  delete from public.client_runtime_budget_ledger where tenant_slug = t and usage_metadata ->> 'adapter_id' = a;
  delete from public.client_adapter_approvals where tenant_slug = t and adapter_id = a;
  delete from public.client_adapter_event_cursors where tenant_slug = t and adapter_id = a;
  delete from public.client_adapter_sync_switch where tenant_slug = t and adapter_id = a;
  delete from public.client_adapter_memory_items where tenant_slug = t and origin_adapter_id = a and namespace = 'shared';
  delete from public.client_adapter_memory_promotions where tenant_slug = t and origin_adapter_id = a;
  delete from public.client_adapter_memory_items where tenant_slug = t and origin_adapter_id = a;
  delete from public.client_adapter_registry where tenant_slug = t and adapter_id = a;
  delete from public.client_memberships where tenant_slug = t and user_id in (select id from auth.users where id::text like current_setting('zz_demo.account_a') || '%' or id::text like current_setting('zz_demo.account_b') || '%');
end
$clean$;
