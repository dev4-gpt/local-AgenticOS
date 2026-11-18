-- Pitch-night demo data for staging (tenant agentos-staging). Every row is marked: the adapter id is zz-demo-creator,
-- task ids and note text start with zz-demo / [zz-demo]. Remove it all with scripts/staging-demo-cleanup.sql.
-- It goes through the real host functions, as the real users, so every row obeys the same rules as production data.
-- Needs two existing staging accounts, named by the first 8 or more hex characters of each account id. The ids are not kept in the
-- repository. In the same run, before this block, set them (replace the two placeholders):
--   select set_config('zz_demo.account_a', '<first 8+ hex chars of account A id>', false), set_config('zz_demo.account_b', '<first 8+ hex chars of account B id>', false);
-- Nothing else is read or kept.
do $seed$
declare
  t constant text := 'agentos-staging';
  a constant text := 'zz-demo-creator';
  v_a uuid; v_b uuid; n integer;
  scan jsonb; c text; ev text; r jsonb; promo uuid; shared uuid; canon text; owed jsonb;
begin
  if coalesce(current_setting('zz_demo.account_a', true), '') !~ '^[0-9a-f]{8,}$'
     or coalesce(current_setting('zz_demo.account_b', true), '') !~ '^[0-9a-f]{8,}$'
     or current_setting('zz_demo.account_a', true) = current_setting('zz_demo.account_b', true) then
    raise exception 'zz-demo: set zz_demo.account_a and zz_demo.account_b first (two different account id prefixes of 8 or more hex characters; see the top of this file)';
  end if;
  select id into v_a from auth.users where id::text like current_setting('zz_demo.account_a') || '%';
  select id into v_b from auth.users where id::text like current_setting('zz_demo.account_b') || '%';
  if v_a is null or v_b is null then raise exception 'zz-demo: the two staging accounts were not found'; end if;
  if not exists (select 1 from public.client_tenants where slug = t) then raise exception 'zz-demo: tenant % not found', t; end if;
  if exists (select 1 from public.client_adapter_registry where tenant_slug = t and adapter_id = a) then raise exception 'zz-demo: already seeded'; end if;

  perform set_config('search_path', 'public, extensions', true);
  -- A membership that already exists is never touched; the notice says which ones this run added, so cleanup can remove only those.
  insert into public.client_memberships (tenant_slug, user_id, role, status) values (t, v_a, 'admin', 'active') on conflict (tenant_slug, user_id) do nothing;
  get diagnostics n = row_count;
  raise notice 'zz-demo: account A %', case when n = 1 then 'was added as admin; set zz_demo.remove_account_a to yes when running the cleanup' else 'was already a member and is left as it is' end;
  insert into public.client_memberships (tenant_slug, user_id, role, status) values (t, v_b, 'admin', 'active') on conflict (tenant_slug, user_id) do nothing;
  get diagnostics n = row_count;
  raise notice 'zz-demo: account B %', case when n = 1 then 'was added as admin; set zz_demo.remove_account_b to yes when running the cleanup' else 'was already a member and is left as it is' end;

  insert into public.client_adapter_registry (tenant_slug, adapter_id, display_name, contract_version, manifest_sha256, state,
      side_effect_ceiling, deletion_guarantee, budget_cap_micros, budget_period, created_by)
    values (t, a, 'Creator OS (demo)', 'h1', encode(digest('zz-demo-manifest', 'sha256'), 'hex'), 'enabled',
      'publish', 'receipt', 5000000, 'month', v_a);

  -- Three notes the content agent proposed: one shared (reviewed), one waiting for review, one erased with a receipt.
  for i in 1..3 loop
    c := case i
      when 1 then '[zz-demo] LinkedIn posts that open with a customer question get more replies than posts that open with a claim.'
      when 2 then '[zz-demo] Posting on Tuesday mornings performed best for this client over the last month.'
      else '[zz-demo] An old tagline test that the client later withdrew.' end;
    ev := md5('zz-demo-event-' || i);
    scan := jsonb_build_object('scanner', 'memory-scan-h1', 'content_sha256', encode(digest(c, 'sha256'), 'hex'), 'verdict', 'clean', 'findings', '[]'::jsonb, 'scanned_chars', length(c));
    r := public.client_adapter_ingest_memory_proposal(t, a, ev, c, encode(digest(c, 'sha256'), 'hex'), scan, '0.1.0', a, 'zz-demo-task-' || i || '-aaaaaaaa', 'https://example.com/zz-demo', null);
    promo := (r ->> 'promotion_id')::uuid;
    if i in (1, 3) then
      perform set_config('request.jwt.claim.sub', v_b::text, true); execute 'set local role authenticated';
      perform public.client_adapter_decide_promotion(promo, 'approve', encode(digest(c, 'sha256'), 'hex'), null, 'ordinary');
      execute 'reset role';
      insert into public.client_adapter_memory_items (tenant_slug, namespace, origin_adapter_id, content, content_sha256, trust_level, promotion_id, idempotency_key)
        values (t, 'shared', a, c, encode(digest(c, 'sha256'), 'hex'), 'reviewed', promo, 'shared-' || ev) returning id into shared;
    end if;
    if i = 3 then
      perform set_config('request.jwt.claim.sub', v_a::text, true); execute 'set local role authenticated';
      perform public.client_adapter_revoke_shared_memory(shared, 'the client withdrew this');
      execute 'reset role';
      owed := public.client_adapter_tombstones_pending(t, a, 20);
      perform public.client_adapter_tombstone_ack((owed -> 0 ->> 'event_id')::uuid, encode(digest('zz-demo-receipt', 'sha256'), 'hex'), 3);
    end if;
  end loop;

  -- One publish approval waiting for the second person (the requester cannot approve it).
  canon := '{"adapterId":"' || a || '","destination":"https://www.linkedin.com/company/zz-demo","kind":"publish","payload":{"text":"[zz-demo] Draft: why replies beat reach."},"policyVersion":"policy-1","v":"approval-action-h1"}';
  perform set_config('request.jwt.claim.sub', v_a::text, true); execute 'set local role authenticated';
  perform public.client_adapter_request_approval(t, a, 'publish', encode(digest(convert_to(canon, 'UTF8'), 'sha256'), 'hex'), canon, 'https://www.linkedin.com/company/zz-demo', 'policy-1', 86400);
  execute 'reset role';

  -- Spend: one task reserved then settled against real spend, one still reserved.
  insert into public.client_adapter_budget_events (tenant_slug, adapter_id, task_id, kind, amount_micros, provider, model, idempotency_key) values
    (t, a, 'zz-demo-task-1', 'reserve', 400000, 'demo-provider', 'demo-model', 'zz-demo-reserve-1'),
    (t, a, 'zz-demo-task-1', 'settle', 312000, 'demo-provider', 'demo-model', 'zz-demo-settle-1'),
    (t, a, 'zz-demo-task-2', 'reserve', 250000, 'demo-provider', 'demo-model', 'zz-demo-reserve-2');
  -- The Adapters page reads spend from the runtime ledger, which the real reserve and settle functions write.
  insert into public.client_runtime_budget_ledger (tenant_slug, job_id, provider, model, amount_micros, usage_metadata) values
    (t, null, 'demo-provider', 'demo-model', 312000, jsonb_build_object('reserved_by', 'adapter-budget', 'adapter_id', a, 'task_id', 'zz-demo-task-1', 'settled', true)),
    (t, null, 'demo-provider', 'demo-model', 250000, jsonb_build_object('reserved_by', 'adapter-budget', 'adapter_id', a, 'task_id', 'zz-demo-task-2'));
end
$seed$;
