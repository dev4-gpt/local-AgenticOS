-- Phase 1 proof on a hosted STAGING Supabase project (never production, never a client's project).
-- Run each block on its own (SQL editor or the Supabase MCP). Each block creates a fake tenant, two fake users and a fake
-- adapter, exercises the adapter host, and then raises an exception on purpose: Postgres rolls everything back, so the
-- project is left exactly as it was, and the results come back in the error message as JSON. No real data is used.
-- Prerequisites: the adapter migrations in the order of tests/client-schema-upgrade.spec.ts (host, token-uses,
-- approval-gateway, budget, retention-28, promotions, background-owner, lifecycle-restore, table-privilege-hardening).
-- First run: veloce-agentos-staging, 2026-10-21. Every check passed; see docs/guide/04-open-items-tracker.md (5a2, 8f).
-- What this does NOT prove: sign-in goes through request.jwt.claims set in SQL, not the real login layer (GoTrue and
-- PostgREST); the retention purge is a dry run; there is no real backup and restore; nothing runs concurrently.
-- A field ending "ALLOWED (bad)" in the result means a rule failed.

-- Block 1: memory, promotion, approval, budget, tokens, activity, row-level security, append-only rows, retention.
do $proof$
declare
  r jsonb := '{}'::jsonb;
  t text := 'zz-phase1-proof';
  ua uuid := '00000000-0000-4000-8000-0000000000a1';
  ub uuid := '00000000-0000-4000-8000-0000000000b2';
  tok text := 'proof-worker-token-not-a-secret-000';
  item_id uuid; shared_id uuid; promo_id uuid; appr_id uuid;
  canon text; h text; rr jsonb; me text := current_user; sha text;
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'proof-a@example.invalid', 'authenticated', 'authenticated'),
    (ub, 'proof-b@example.invalid', 'authenticated', 'authenticated');
  insert into public.client_tenants (slug, name, status, retention_days, worker_token_hash)
    values (t, 'Phase 1 proof (fake)', 'active', 28, encode(extensions.digest(tok, 'sha256'), 'hex'));
  insert into public.client_memberships (tenant_slug, user_id, role, status)
    values (t, ua, 'member', 'active'), (t, ub, 'admin', 'active');
  insert into public.client_adapter_registry (tenant_slug, adapter_id, display_name, contract_version, manifest_sha256, state, side_effect_ceiling, budget_cap_micros, budget_period, created_by)
    values (t, 'proof-adapter', 'Proof adapter', 'h1', repeat('a', 64), 'preview', 'publish', 5000000, 'month', ub);

  -- 1. Memory write through the host service path: a private note and where it came from.
  sha := encode(extensions.digest('Fake fact: the staging proof ran.', 'sha256'), 'hex');
  insert into public.client_adapter_memory_items (tenant_slug, namespace, origin_adapter_id, content, content_sha256, idempotency_key)
    values (t, 'adapter:proof-adapter', 'proof-adapter', 'Fake fact: the staging proof ran.', sha, 'proof-key-0001') returning id into item_id;
  insert into public.client_adapter_memory_provenance (tenant_slug, item_id, adapter_id, adapter_version, agent_principal, source_task_id, confidence)
    values (t, item_id, 'proof-adapter', '0.0.1', 'proof-agent', 'task-1', 0.9);
  r := r || jsonb_build_object('memory_retention_days',
    (select round(extract(epoch from retention_expires_at - created_at) / 86400) from public.client_adapter_memory_items where id = item_id));

  -- 2. Promotion to shared memory: quarantined, requester cannot approve, label required, reviewer approves.
  insert into public.client_adapter_memory_promotions (tenant_slug, source_item_id, origin_adapter_id, content_sha256, scan_result, requested_by)
    values (t, item_id, 'proof-adapter', sha, jsonb_build_object('scanner', 'proof', 'content_sha256', sha, 'verdict', 'clean'), ua)
    returning id into promo_id;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  begin
    perform public.client_adapter_decide_promotion(promo_id, 'approve', sha, null, 'ordinary');
    r := r || '{"self_promotion":"ALLOWED (bad)"}';
  exception when others then r := r || jsonb_build_object('self_promotion_refused', sqlerrm); end;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  begin
    perform public.client_adapter_decide_promotion(promo_id, 'approve', sha, null, null);
    r := r || '{"unlabelled_approval":"ALLOWED (bad)"}';
  exception when others then r := r || jsonb_build_object('unlabelled_approval_refused', sqlerrm); end;
  r := r || jsonb_build_object('promotion', public.client_adapter_decide_promotion(promo_id, 'approve', sha, null, 'ordinary'));
  insert into public.client_adapter_memory_items (tenant_slug, namespace, origin_adapter_id, content, content_sha256, trust_level, idempotency_key, promotion_id, sensitivity)
    values (t, 'shared', 'proof-adapter', 'Fake fact: the staging proof ran.', sha, 'reviewed', 'proof-key-0002', promo_id, 'restricted')
    returning id into shared_id;
  r := r || jsonb_build_object('shared_label_taken_from_reviewer',
    (select sensitivity from public.client_adapter_memory_items where id = shared_id));

  -- 3. Two-person approval bound to the exact action.
  canon := '{"adapterId":"proof-adapter","destination":"staging-proof","kind":"publish","payload":{"note":"fake"},"policyVersion":"proof-v1","v":"approval-action-h1"}';
  h := encode(extensions.digest(convert_to(canon, 'UTF8'), 'sha256'), 'hex');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  appr_id := public.client_adapter_request_approval(t, 'proof-adapter', 'publish', h, canon, 'staging-proof', 'proof-v1', 3600);
  begin
    perform public.client_adapter_decide_approval(appr_id, 'approve', h);
    r := r || '{"self_approval":"ALLOWED (bad)"}';
  exception when others then r := r || jsonb_build_object('self_approval_refused', sqlerrm); end;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  begin
    perform public.client_adapter_decide_approval(appr_id, 'approve', repeat('0', 64));
    r := r || '{"wrong_hash_approval":"ALLOWED (bad)"}';
  exception when others then r := r || jsonb_build_object('wrong_hash_refused', sqlerrm); end;
  r := r || jsonb_build_object('approval', public.client_adapter_decide_approval(appr_id, 'approve', h));
  r := r || jsonb_build_object('execute_bad_token', public.client_adapter_execute_approval(t, 'wrong-token-wrong-token-xx', appr_id, h, repeat('c', 64)));
  r := r || jsonb_build_object('execute_first', public.client_adapter_execute_approval(t, tok, appr_id, h, repeat('c', 64)));
  r := r || jsonb_build_object('execute_again', public.client_adapter_execute_approval(t, tok, appr_id, h, repeat('c', 64)));

  -- 4. Budget: reserve, idempotent repeat, adapter cap, settle never above the reservation.
  r := r || jsonb_build_object('budget_reserve', public.client_adapter_budget_reserve(t, tok, 'proof-adapter', 'task-1', 'proof-budget-0001', 1000000, 'openai', 'gpt-test', 10000000));
  r := r || jsonb_build_object('budget_reserve_repeat', public.client_adapter_budget_reserve(t, tok, 'proof-adapter', 'task-1', 'proof-budget-0001', 1000000, 'openai', 'gpt-test', 10000000));
  r := r || jsonb_build_object('budget_over_adapter_cap', public.client_adapter_budget_reserve(t, tok, 'proof-adapter', 'task-2', 'proof-budget-0002', 9000000, 'openai', 'gpt-test', 10000000));
  r := r || jsonb_build_object('budget_settle_above_reserved', public.client_adapter_budget_settle(t, tok, 'proof-adapter', 'task-1', 'proof-settle-0001', 2000000));
  r := r || jsonb_build_object('budget_settle', public.client_adapter_budget_settle(t, tok, 'proof-adapter', 'task-1', 'proof-settle-0002', 600000));
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  select to_jsonb(s) - 'display_name' into rr from public.client_adapter_budget_summary(t) s;
  r := r || jsonb_build_object('budget_summary_for_member', rr);

  -- 5. Adapter tokens: single use, short life, scoped reads.
  r := r || jsonb_build_object('token_first', public.client_adapter_consume_token(t, tok, 'proof-adapter', '11111111-1111-4111-8111-111111111111', now() + interval '4 minutes'));
  r := r || jsonb_build_object('token_replay', public.client_adapter_consume_token(t, tok, 'proof-adapter', '11111111-1111-4111-8111-111111111111', now() + interval '4 minutes'));
  r := r || jsonb_build_object('token_life_too_long', public.client_adapter_consume_token(t, tok, 'proof-adapter', '22222222-2222-4222-8222-222222222222', now() + interval '1 hour'));
  r := r || jsonb_build_object('scoped_read_own_adapter', (select count(*) from public.client_adapter_read_scoped(t, tok, 'proof-adapter', array[shared_id, item_id])));
  r := r || jsonb_build_object('scoped_read_unknown_adapter', (select count(*) from public.client_adapter_read_scoped(t, tok, 'other-adapter', array[shared_id, item_id])));

  -- 6. Activity view for a member (counts only).
  select jsonb_object_agg(a.event_type, a.event_count) into rr from public.client_adapter_activity_counts(t) a;
  r := r || jsonb_build_object('activity_counts', rr);

  -- 7. What a signed-in plain member and an anonymous visitor can see (row-level security and grants).
  perform set_config('role', 'authenticated', true);
  r := r || jsonb_build_object('member_sees_namespaces', (select jsonb_agg(namespace) from public.client_adapter_memory_items where tenant_slug = t));
  begin
    perform 1 from public.client_adapter_token_uses limit 1;
    r := r || '{"member_reads_token_uses":"ALLOWED (bad)"}';
  exception when others then r := r || jsonb_build_object('member_token_uses_denied', sqlstate); end;
  perform set_config('role', 'anon', true);
  begin
    perform 1 from public.client_adapter_memory_items limit 1;
    r := r || '{"anon_reads_memory":"ALLOWED (bad)"}';
  exception when others then r := r || jsonb_build_object('anon_memory_denied', sqlstate); end;
  perform set_config('role', me, true);

  -- 8. Append-only and immutable records.
  begin
    update public.client_adapter_memory_items set content = 'changed' where id = item_id;
    r := r || '{"note_edit":"ALLOWED (bad)"}';
  exception when others then r := r || jsonb_build_object('note_edit_refused', sqlerrm); end;
  begin
    delete from public.client_adapter_budget_events where tenant_slug = t;
    r := r || '{"budget_delete":"ALLOWED (bad)"}';
  exception when others then r := r || jsonb_build_object('budget_delete_refused', sqlerrm); end;

  -- 9. Retention dry run, restore graph, background owner.
  r := r || jsonb_build_object('purge_dry_run_due', public.purge_expired_client_adapter_records(t, false, 100) -> 'expiredOrPurgeDue');
  r := r || jsonb_build_object('restore_graph_valid', public.validate_client_adapter_restore_graph(t));
  r := r || jsonb_build_object('background_may_run_without_owner', public.client_adapter_background_owner_may_run('veloce-proof-1'));

  raise exception 'PHASE1_PROOF %', r;
end
$proof$;

-- Block 2: the requester rule when both people are admins, a tampered action text, and the sensitive-label reason.
do $proof$
declare
  r jsonb := '{}'::jsonb;
  t text := 'zz-phase1-proof';
  ua uuid := '00000000-0000-4000-8000-0000000000a1';
  ub uuid := '00000000-0000-4000-8000-0000000000b2';
  item_id uuid; promo_id uuid; appr_id uuid; canon text; h text; sha text;
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'proof-a@example.invalid', 'authenticated', 'authenticated'),
    (ub, 'proof-b@example.invalid', 'authenticated', 'authenticated');
  insert into public.client_tenants (slug, name, status, retention_days) values (t, 'Phase 1 proof (fake)', 'active', 28);
  insert into public.client_memberships (tenant_slug, user_id, role, status) values (t, ua, 'admin', 'active'), (t, ub, 'admin', 'active');
  insert into public.client_adapter_registry (tenant_slug, adapter_id, display_name, contract_version, manifest_sha256, state, side_effect_ceiling, created_by)
    values (t, 'proof-adapter', 'Proof adapter', 'h1', repeat('a', 64), 'preview', 'publish', ub);
  sha := encode(extensions.digest('Fake fact two.', 'sha256'), 'hex');
  insert into public.client_adapter_memory_items (tenant_slug, namespace, origin_adapter_id, content, content_sha256, idempotency_key)
    values (t, 'adapter:proof-adapter', 'proof-adapter', 'Fake fact two.', sha, 'proof-key-0101') returning id into item_id;
  insert into public.client_adapter_memory_provenance (tenant_slug, item_id, adapter_id, adapter_version, agent_principal, source_task_id, confidence)
    values (t, item_id, 'proof-adapter', '0.0.1', 'proof-agent', 'task-9', 0.9);
  insert into public.client_adapter_memory_promotions (tenant_slug, source_item_id, origin_adapter_id, content_sha256, scan_result, requested_by)
    values (t, item_id, 'proof-adapter', sha, jsonb_build_object('scanner', 'proof', 'content_sha256', sha, 'verdict', 'clean'), ua) returning id into promo_id;
  canon := '{"adapterId":"proof-adapter","destination":"staging-proof","kind":"publish","payload":{"note":"fake-2"},"policyVersion":"proof-v1","v":"approval-action-h1"}';
  h := encode(extensions.digest(convert_to(canon, 'UTF8'), 'sha256'), 'hex');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  appr_id := public.client_adapter_request_approval(t, 'proof-adapter', 'publish', h, canon, 'staging-proof', 'proof-v1', 3600);
  begin perform public.client_adapter_decide_approval(appr_id, 'approve', h); r := r || '{"admin_self_approval":"ALLOWED (bad)"}';
  exception when others then r := r || jsonb_build_object('admin_self_approval_refused', sqlerrm); end;
  begin perform public.client_adapter_decide_promotion(promo_id, 'approve', sha, null, 'ordinary'); r := r || '{"admin_self_promotion":"ALLOWED (bad)"}';
  exception when others then r := r || jsonb_build_object('admin_self_promotion_refused', sqlerrm); end;
  begin perform public.client_adapter_request_approval(t, 'proof-adapter', 'publish', h, replace(canon, 'fake-2', 'fake-3'), 'staging-proof', 'proof-v1', 3600);
    r := r || '{"tampered_canonical":"ALLOWED (bad)"}';
  exception when others then r := r || jsonb_build_object('tampered_canonical_refused', sqlerrm); end;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  begin perform public.client_adapter_decide_promotion(promo_id, 'approve', sha, 'short', 'sensitive'); r := r || '{"sensitive_without_reason":"ALLOWED (bad)"}';
  exception when others then r := r || jsonb_build_object('sensitive_without_reason_refused', sqlerrm); end;
  raise exception 'PHASE1_PROOF_2 %', r;
end
$proof$;

-- Block 3 (8f): the real purge. A note is moved 10 days into the past for the test only (the guards are switched off for
-- those two updates and on again before the purge runs), then the real purge erases and deletes it. Rolled back.
do $proof$
declare
  r jsonb := '{}'::jsonb;
  t text := 'zz-phase1-purge';
  ua uuid := '00000000-0000-4000-8000-0000000000a1';
  v_item uuid; result jsonb; sha text := encode(extensions.digest('Fake note to expire.', 'sha256'), 'hex');
begin
  insert into auth.users (id, email, aud, role) values (ua, 'proof-a@example.invalid', 'authenticated', 'authenticated');
  insert into public.client_tenants (slug, name, status, retention_days) values (t, 'Purge proof (fake)', 'active', 1);
  insert into public.client_adapter_registry (tenant_slug, adapter_id, display_name, contract_version, manifest_sha256, state, created_by)
    values (t, 'proof-adapter', 'Proof adapter', 'h1', repeat('a', 64), 'preview', ua);
  insert into public.client_adapter_memory_items (tenant_slug, namespace, origin_adapter_id, content, content_sha256, idempotency_key)
    values (t, 'adapter:proof-adapter', 'proof-adapter', 'Fake note to expire.', sha, 'purge-key-0001') returning id into v_item;
  insert into public.client_adapter_memory_provenance (tenant_slug, item_id, adapter_id, adapter_version, agent_principal, source_task_id, confidence)
    values (t, v_item, 'proof-adapter', '0.0.1', 'proof-agent', 'task-1', 0.5);
  r := r || jsonb_build_object('stamped_expiry_days', (select round(extract(epoch from retention_expires_at - created_at) / 86400) from public.client_adapter_memory_items where id = v_item));
  alter table public.client_adapter_memory_items disable trigger user;
  alter table public.client_adapter_memory_provenance disable trigger user;
  update public.client_adapter_memory_items set created_at = now() - interval '10 days', retention_expires_at = now() - interval '9 days' where id = v_item;
  update public.client_adapter_memory_provenance p set created_at = now() - interval '10 days', retention_expires_at = now() - interval '9 days' where p.item_id = v_item;
  alter table public.client_adapter_memory_items enable trigger user;
  alter table public.client_adapter_memory_provenance enable trigger user;
  r := r || jsonb_build_object('dry_run_due', public.purge_expired_client_adapter_records(t, false, 100) -> 'expiredOrPurgeDue');
  result := public.purge_expired_client_adapter_records(t, true, 100);
  r := r || jsonb_build_object('apply_notes_erased', result -> 'notesErased', 'apply_deleted', result -> 'deleted');
  r := r || jsonb_build_object('rows_left',
    jsonb_build_object('items', (select count(*) from public.client_adapter_memory_items where tenant_slug = t),
                       'provenance', (select count(*) from public.client_adapter_memory_provenance where tenant_slug = t)));
  r := r || jsonb_build_object('audit_event_written', (select count(*) from public.client_runtime_audit_events where tenant_slug = t and event_type = 'tenant.adapter.retention_purged'));
  r := r || jsonb_build_object('second_run_deleted', public.purge_expired_client_adapter_records(t, true, 100) -> 'deleted');
  raise exception 'PURGE_PROOF %', r;
end
$proof$;

-- Block 4 (8f): the real restore of a backed-up fake tenant, and the backups it must refuse. Rolled back.
do $proof$
declare
  r jsonb := '{}'::jsonb;
  t text := 'zz-phase1-restore';
  ua uuid := '00000000-0000-4000-8000-0000000000a1';
  item uuid := '11111111-1111-4111-8111-000000000001';
  prov uuid := '11111111-1111-4111-8111-000000000002';
  reg uuid := '11111111-1111-4111-8111-000000000003';
  appr uuid := '11111111-1111-4111-8111-000000000004';
  c timestamptz := date_trunc('second', now() - interval '1 day');
  exp timestamptz := date_trunc('second', now() + interval '20 days');
  sha text := encode(extensions.digest('Restored fake note.', 'sha256'), 'hex');
  batches jsonb; out jsonb; me text := current_user;
begin
  insert into auth.users (id, email, aud, role) values (ua, 'proof-a@example.invalid', 'authenticated', 'authenticated');
  batches := jsonb_build_array(
    jsonb_build_object('table', 'client_tenants', 'rows', jsonb_build_array(jsonb_build_object('slug', t, 'name', 'Restore proof (fake)', 'status', 'active', 'retention_days', 28, 'created_at', c, 'updated_at', c))),
    jsonb_build_object('table', 'client_memberships', 'rows', jsonb_build_array(jsonb_build_object('tenant_slug', t, 'user_id', ua, 'role', 'admin', 'status', 'active', 'created_at', c))),
    jsonb_build_object('table', 'client_adapter_registry', 'rows', jsonb_build_array(jsonb_build_object('id', reg, 'tenant_slug', t, 'adapter_id', 'proof-adapter', 'display_name', 'Proof adapter', 'contract_version', 'h1', 'manifest_sha256', repeat('a', 64), 'state', 'enabled', 'side_effect_ceiling', 'draft', 'deletion_guarantee', 'none', 'created_by', ua, 'created_at', c, 'updated_at', c))),
    jsonb_build_object('table', 'client_adapter_memory_items', 'rows', jsonb_build_array(jsonb_build_object('id', item, 'tenant_slug', t, 'namespace', 'adapter:proof-adapter', 'origin_adapter_id', 'proof-adapter', 'status', 'active', 'content', 'Restored fake note.', 'content_sha256', sha, 'trust_level', 'untrusted', 'idempotency_key', 'restore-key-0001', 'valid_from', c, 'created_at', c, 'retention_expires_at', exp, 'sensitivity', 'unknown'))),
    jsonb_build_object('table', 'client_adapter_memory_provenance', 'rows', jsonb_build_array(jsonb_build_object('id', prov, 'tenant_slug', t, 'item_id', item, 'adapter_id', 'proof-adapter', 'adapter_version', '0.0.1', 'agent_principal', 'proof-agent', 'source_task_id', 'task-1', 'confidence', 0.9, 'created_at', c, 'retention_expires_at', exp))),
    jsonb_build_object('table', 'client_adapter_approvals', 'rows', jsonb_build_array(jsonb_build_object('id', appr, 'tenant_slug', t, 'adapter_id', 'proof-adapter', 'action_kind', 'publish', 'action_hash', repeat('b', 64), 'destination', 'staging-proof', 'policy_version', 'proof-v1', 'requested_by', ua, 'status', 'rejected', 'expires_at', c + interval '1 hour', 'created_at', c, 'retention_expires_at', exp)))
  );
  perform set_config('role', 'service_role', true);
  begin
    perform public.restore_client_lifecycle_metadata(t, jsonb_set(batches, '{5,rows,0,status}', '"pending"'));
    r := r || '{"pending_approval_restored":"ALLOWED (bad)"}';
  exception when others then r := r || jsonb_build_object('pending_approval_refused', sqlerrm); end;
  begin
    perform public.restore_client_lifecycle_metadata(t, jsonb_set(batches, '{3,rows,0,secret_column}', '"x"'));
    r := r || '{"unknown_column_restored":"ALLOWED (bad)"}';
  exception when others then r := r || jsonb_build_object('unknown_column_refused', sqlerrm); end;
  begin
    perform public.restore_client_lifecycle_metadata(t, jsonb_set(batches, '{3,rows,0,retention_expires_at}', to_jsonb(now() - interval '1 hour')));
    r := r || '{"expired_note_restored":"ALLOWED (bad)"}';
  exception when others then r := r || jsonb_build_object('expired_note_refused', sqlerrm); end;
  begin
    perform public.restore_client_lifecycle_metadata('zz-someone-else', batches);
    r := r || '{"other_tenant_restored":"ALLOWED (bad)"}';
  exception when others then r := r || jsonb_build_object('other_tenant_refused', sqlerrm); end;
  out := public.restore_client_lifecycle_metadata(t, batches);
  perform set_config('role', me, true);
  r := r || jsonb_build_object('restored', out);
  r := r || jsonb_build_object('registry_state_after_restore', (select state from public.client_adapter_registry where id = reg));
  r := r || jsonb_build_object('note_clocks_kept', (select created_at = c and retention_expires_at = exp from public.client_adapter_memory_items where id = item));
  r := r || jsonb_build_object('provenance_clocks_kept', (select created_at = c and retention_expires_at = exp from public.client_adapter_memory_provenance where id = prov));
  r := r || jsonb_build_object('approval_restored_as', (select status from public.client_adapter_approvals where id = appr));
  r := r || jsonb_build_object('graph_valid_after_restore', public.validate_client_adapter_restore_graph(t));
  begin
    perform public.restore_client_lifecycle_metadata(t, batches);
    r := r || '{"restore_without_service_role":"ALLOWED (bad)"}';
  exception when others then r := r || jsonb_build_object('restore_without_service_role_refused', sqlerrm); end;
  raise exception 'RESTORE_PROOF %', r;
end
$proof$;
