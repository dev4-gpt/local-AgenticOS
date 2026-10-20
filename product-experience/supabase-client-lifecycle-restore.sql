-- Apply after all client lifecycle tables and retention guards. Local source
-- only: hosted application requires separate approval. Metadata is one
-- transaction; Cloud Storage transfers and their cleanup remain separate.
begin;

create or replace function public.client_lifecycle_restore_columns()
returns jsonb language sql immutable set search_path = public
as $columns$
  select '{"client_ecc_policy":"tenant_slug,enabled,updated_by,updated_at","client_learning_items":"id,tenant_slug,created_by,idempotency_key,source_job_id,source_record_id,content,content_hash,confidence,revision,status,approved_hash,reviewed_by,reviewed_at,revoked_at,retention_expires_at,created_at,updated_at","client_ecc_skill_revisions":"id,tenant_slug,item_id,revision,content,content_hash,approved_by,created_at,expires_at,revoked_at","client_tenants":"slug,name,status,retention_days,created_at,updated_at","client_memberships":"tenant_slug,user_id,role,status,created_at","client_manifest_proposals":"id,tenant_slug,requested_by,catalog_ids,provider_keys,credential_modes,pricing_snapshot_ids,idempotency_key,manifest_hash,status,metadata,created_at,updated_at","client_provider_connections":"id,tenant_slug,catalog_id,provider_key,credential_mode,status,pricing_snapshot_id,manifest_version,last_validated_at,revoked_at,created_at,updated_at","client_support_requests":"id,tenant_slug,email,subject,message,status,request_id,request_type,provider_key,requested_budget_micros,created_at,updated_at","client_runtime_requests":"id,tenant_slug,submitted_by,request_type,title,details,fields,status,created_at,updated_at","client_runtime_audit_events":"id,tenant_slug,actor_id,event_type,request_id,metadata,created_at","client_runtime_jobs":"id,tenant_slug,requested_by,capability,provider,model,idempotency_key,status,attempt_count,input_metadata,output_metadata,error_code,created_at,started_at,finished_at","client_runtime_artifacts":"id,tenant_slug,job_id,created_by,object_key,original_name,content_type,byte_size,status,retention_expires_at,created_at,review_decision,review_sha256,reviewed_by,reviewed_at","client_runtime_records":"id,tenant_slug,created_by,kind,title,content,status,metadata,notebook_id,created_at,updated_at","client_notebooks":"id,tenant_slug,created_by,title,summary,status,created_at,updated_at","client_notebook_sources":"id,tenant_slug,notebook_id,created_by,kind,title,source_url,artifact_id,source_hash,status,failure_reason,retention_expires_at,deleted_at,created_at,updated_at","client_notebook_chunks":"id,tenant_slug,source_id,ordinal,content,content_hash,metadata,created_at","client_research_runs":"id,tenant_slug,notebook_id,job_id,created_by,provider,query,status,idempotency_key,result_count,created_at,updated_at","client_research_records":"id,tenant_slug,research_run_id,notebook_id,source_url,retrieved_at,fields,confidence,status,failure_reason,created_at","client_research_citations":"id,tenant_slug,research_run_id,research_record_id,url,title,retrieved_at,evidence,created_at","client_research_worker_failures":"id,tenant_slug,job_id,idempotency_key,phase,sqlstate,record_count,created_at","client_visual_qa_reports":"id,tenant_slug,artifact_id,job_id,worker,frames_sampled,runtime_ms,status,warnings,created_at","client_visual_qa_findings":"id,tenant_slug,report_id,code,severity,frame,confidence,message","client_runtime_memory_graph_nodes":"id,tenant_slug,record_id,graph_key,label,kind,metadata,created_at,updated_at","client_runtime_memory_graph_edges":"id,tenant_slug,source_node_id,target_node_id,relation,weight,metadata,created_at","client_runtime_budget_ledger":"id,tenant_slug,job_id,provider,model,amount_micros,usage_metadata,created_at","client_runtime_delivery_actions":"id,tenant_slug,request_id,requested_by,action,destination,artifact_ids,status,error_code,idempotency_key,created_at,updated_at","client_paperclip_companies":"tenant_slug,name,description,issue_prefix,issue_counter,brand_color,budget_monthly_micros,status,retention_expires_at,created_at,updated_at","client_paperclip_projects":"id,tenant_slug,created_by,name,url_key,description,color,icon,status,target_date,retention_expires_at,created_at,updated_at","client_paperclip_agents":"id,tenant_slug,created_by,name,role,title,icon,status,reports_to,provider,model,budget_monthly_micros,last_heartbeat_at,url_key,retention_expires_at,created_at,updated_at","client_paperclip_issues":"id,tenant_slug,created_by,issue_number,identifier,title,description,status,priority,project_id,assignee_agent_id,labels,execution_state,execution_job_id,build_artifact_id,started_at,completed_at,retention_expires_at,created_at,updated_at","client_paperclip_comments":"id,tenant_slug,issue_id,created_by,author_agent_id,body,retention_expires_at,created_at","client_paperclip_runs":"id,tenant_slug,created_by,issue_id,agent_id,job_id,status,provider,model,summary,error_code,cost_micros,started_at,finished_at,retention_expires_at,created_at,updated_at","client_room_conversations":"id,tenant_slug,created_by,title,status,present_agents,created_at,updated_at,retention_expires_at","client_room_messages":"id,tenant_slug,conversation_id,created_by,role,kind,agent_id,agent_name,agent_color,content,provider,model,cost_micros,error_code,linked_record_id,seq,created_at,retention_expires_at","client_room_rounds":"id,tenant_slug,conversation_id,created_by,job_id,status,agent_ids,speaking_agent_id,completed_agents,cost_micros,error_code,created_at,updated_at,retention_expires_at","client_pipeline_items":"id,tenant_slug,created_by,slug,title,stage,route,confidence,tags,idea,classification,plan,tasks,pinned,build_artifact_id,execution_state,execution_job_id,execution_error,decided_by,decided_at,retention_expires_at,created_at,updated_at","client_board_tasks":"id,tenant_slug,created_by,board,title,body,status,assignee,priority,labels,build_artifact_id,execution_state,execution_job_id,execution_error,result,started_at,completed_at,retention_expires_at,created_at,updated_at","client_board_comments":"id,tenant_slug,task_id,created_by,author,body,retention_expires_at,created_at","client_board_events":"id,tenant_slug,task_id,kind,detail,retention_expires_at,created_at","client_loop_runs":"id,tenant_slug,created_by,goal,title,status,job_id,builder_provider,builder_model,judge_provider,judge_model,max_rounds,rounds_completed,best_score,final_summary,build_artifact_id,cost_micros,error_code,retention_expires_at,created_at,updated_at","client_loop_rounds":"id,tenant_slug,run_id,round,passed,score,issues,summary,artifact_chars,cost_micros,error_code,retention_expires_at,created_at","client_hermes_content_factory_runs":"id,tenant_slug,created_by,workflow_id,idempotency_key,content_type,brief,plan,stages,citations,quality_report,approval,delivery,status,current_stage,job_id,error_code,retention_expires_at,created_at,updated_at","client_hermes_content_factory_stage_outputs":"id,run_id,tenant_slug,stage,status,output_record_id,artifact_id,citation_record_id,quality_report_id,error_code,output,retention_expires_at,created_at,updated_at","client_hermes_content_factory_citations":"id,run_id,tenant_slug,url,title,retrieved_at,evidence,retention_expires_at,created_at","client_hermes_content_factory_quality_reports":"id,run_id,tenant_slug,passed,score,citation_count,findings,checked_at,retention_expires_at,created_at","client_hermes_content_factory_approvals":"id,run_id,tenant_slug,workflow_id,approved_by,approved_at,retention_expires_at,created_at","client_hermes_content_factory_deliveries":"id,run_id,tenant_slug,workflow_id,destination,status,approval_id,artifact_id,retention_expires_at,created_at","client_ruflo_swarms":"id,tenant_slug,created_by,objective,topology,preset,status,job_id,provider,model,agent_count,completed_count,failed_count,report_artifact_id,cost_micros,error_code,retention_expires_at,created_at,updated_at","client_ruflo_agents":"id,tenant_slug,swarm_id,agent_type,name,task,position,status,output,error_code,cost_micros,started_at,finished_at,retention_expires_at,created_at","client_adapter_registry":"id,tenant_slug,adapter_id,display_name,contract_version,manifest_sha256,state,side_effect_ceiling,deletion_guarantee,budget_cap_micros,budget_period,created_by,created_at,updated_at","client_adapter_memory_items":"id,tenant_slug,namespace,origin_adapter_id,status,content,content_sha256,trust_level,idempotency_key,promotion_id,supersedes_id,valid_from,tombstoned_at,created_at,retention_expires_at,sensitivity","client_adapter_memory_promotions":"id,tenant_slug,source_item_id,origin_adapter_id,content_sha256,status,scan_result,requested_by,reviewed_by,reviewed_at,approved_content_sha256,decision_note,created_at,retention_expires_at,approved_sensitivity","client_adapter_memory_provenance":"id,tenant_slug,item_id,adapter_id,adapter_version,agent_principal,source_task_id,source_url,source_sha256,confidence,actor_user,created_at,retention_expires_at","client_adapter_approvals":"id,tenant_slug,adapter_id,action_kind,action_hash,action_canonical,destination,policy_version,requested_by,decided_by,approved_action_hash,status,expires_at,decided_at,executed_at,execution_receipt_sha256,created_at,retention_expires_at","client_adapter_budget_events":"id,tenant_slug,adapter_id,task_id,kind,amount_micros,provider,model,runtime_budget_ref,idempotency_key,created_at,retention_expires_at"}'::jsonb
$columns$;
revoke all on function public.client_lifecycle_restore_columns() from public, anon, authenticated;
grant execute on function public.client_lifecycle_restore_columns() to service_role;

create or replace function public.guard_client_lifecycle_restore_clock()
returns trigger language plpgsql security definer set search_path = public
as $guard$
declare
  context jsonb;
begin
  if current_setting('role', true) is distinct from 'service_role'
    or coalesce(current_setting('app.client_lifecycle_restore', true), '') = '' then
    return new;
  end if;
  context := current_setting('app.client_lifecycle_restore')::jsonb;
  if context->>'table' <> tg_table_name then return new; end if;
  if coalesce(to_jsonb(new)->>'tenant_slug', to_jsonb(new)->>'slug') <> context->>'tenant'
    or (context->>'id' is not null and to_jsonb(new)->>'id' is distinct from context->>'id') then
    raise exception 'client_restore_clock_context_mismatch';
  end if;
  new := jsonb_populate_record(new, context->'clocks');
  return new;
end;
$guard$;
revoke all on function public.guard_client_lifecycle_restore_clock() from public, anon, authenticated;

do $attach$
declare table_name text;
begin
  for table_name in select jsonb_object_keys(public.client_lifecycle_restore_columns()) loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('drop trigger if exists zzzz_client_lifecycle_restore_clock on public.%I', table_name);
      execute format('create trigger zzzz_client_lifecycle_restore_clock before insert on public.%I
        for each row execute function public.guard_client_lifecycle_restore_clock()', table_name);
    end if;
  end loop;
end;
$attach$;

create or replace function public.restore_client_lifecycle_metadata(p_tenant_slug text, p_batches jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $restore$
declare
  table_order text[] := array['client_tenants','client_memberships','client_manifest_proposals','client_provider_connections','client_support_requests','client_runtime_requests','client_runtime_audit_events','client_runtime_jobs','client_runtime_artifacts','client_notebooks','client_notebook_sources','client_notebook_chunks','client_runtime_records','client_research_runs','client_research_records','client_research_citations','client_research_worker_failures','client_visual_qa_reports','client_visual_qa_findings','client_runtime_memory_graph_nodes','client_runtime_memory_graph_edges','client_runtime_budget_ledger','client_runtime_delivery_actions','client_paperclip_companies','client_paperclip_projects','client_paperclip_agents','client_paperclip_issues','client_paperclip_comments','client_paperclip_runs','client_room_conversations','client_room_messages','client_room_rounds','client_pipeline_items','client_board_tasks','client_board_comments','client_board_events','client_loop_runs','client_loop_rounds','client_hermes_content_factory_runs','client_hermes_content_factory_stage_outputs','client_hermes_content_factory_citations','client_hermes_content_factory_quality_reports','client_hermes_content_factory_approvals','client_hermes_content_factory_deliveries','client_ruflo_swarms','client_ruflo_agents','client_ecc_policy','client_learning_items','client_ecc_skill_revisions','client_adapter_registry','client_adapter_memory_items','client_adapter_memory_promotions','client_adapter_memory_provenance','client_adapter_approvals','client_adapter_budget_events'];
  allowed jsonb := public.client_lifecycle_restore_columns();
  batch jsonb;
  item jsonb;
  field text;
  table_name text;
  position integer;
  previous_position integer := 0;
  columns_sql text;
  clocks jsonb;
  inserted jsonb;
  created timestamptz;
  expiry timestamptz;
  tenant_days integer;
  total_rows integer := 0;
  restored_rows integer := 0;
  tenant_rows integer := 0;
  counts jsonb := '{}'::jsonb;
begin
  if current_setting('role', true) is distinct from 'service_role' then
    raise exception 'client_restore_service_role_required';
  end if;
  if p_tenant_slug is null or p_tenant_slug !~ '^[a-z][a-z0-9-]{2,40}$'
    or p_batches is null or jsonb_typeof(p_batches) <> 'array'
    or octet_length(p_batches::text) > 33554432 then
    raise exception 'client_restore_invalid_input';
  end if;
  -- Validate the entire shape/column/tenant boundary before the first insert.
  for batch in select value from jsonb_array_elements(p_batches) loop
    table_name := batch->>'table';
    position := array_position(table_order, table_name);
    if jsonb_typeof(batch) <> 'object' or position is null or position < previous_position
      or jsonb_typeof(batch->'rows') is distinct from 'array'
      or jsonb_array_length(batch->'rows') not between 1 and 500 then
      raise exception 'client_restore_invalid_batch';
    end if;
    previous_position := position;
    total_rows := total_rows + jsonb_array_length(batch->'rows');
    if total_rows > 50000 then raise exception 'client_restore_row_limit'; end if;
    for item in select value from jsonb_array_elements(batch->'rows') loop
      if jsonb_typeof(item) <> 'object'
        or coalesce(item->>case when table_name = 'client_tenants' then 'slug' else 'tenant_slug' end, '') <> p_tenant_slug then
        raise exception 'client_restore_tenant_mismatch';
      end if;
      for field in select jsonb_object_keys(item) loop
        if not field = any(string_to_array(allowed->>table_name, ',')) then
          raise exception 'client_restore_column_not_allowed';
        end if;
      end loop;
      if table_name = 'client_tenants' then
        tenant_rows := tenant_rows + 1;
        tenant_days := (item->>'retention_days')::integer;
        if tenant_days is null or tenant_days not between 1 and 28 then
          raise exception 'client_restore_retention_not_configured';
        end if;
      end if;
    end loop;
  end loop;
  if tenant_rows <> 1 then raise exception 'client_restore_requires_one_tenant'; end if;
  -- Adapter notes and promotions point at each other; their link is checked at the end of the restore.
  set constraints all deferred;
  for batch in select value from jsonb_array_elements(p_batches) loop
    table_name := batch->>'table';
    for item in select value from jsonb_array_elements(batch->'rows') loop
      -- Restored adapters always come back disabled; someone turns them on again on purpose.
      if table_name = 'client_adapter_registry' then item := jsonb_set(item, '{state}', '"disabled"'); end if;
      clocks := '{}'::jsonb;
      created := null;
      if 'created_at' = any(string_to_array(allowed->>table_name, ',')) then
        created := (item->>'created_at')::timestamptz;
        if created is null or not isfinite(created) or created > statement_timestamp() then
          raise exception 'client_restore_original_clock_required';
        end if;
      elsif 'retrieved_at' = any(string_to_array(allowed->>table_name, ',')) then
        created := (item->>'retrieved_at')::timestamptz;
        if created is null or not isfinite(created) or created > statement_timestamp() then
          raise exception 'client_restore_original_clock_required';
        end if;
      end if;
      -- An approval's expires_at is its short request expiry, not a retention date; its retention clock is checked below.
      for field in select unnest(array['retention_expires_at','expires_at']) loop
        if field = any(string_to_array(allowed->>table_name, ','))
          and not (field = 'expires_at' and table_name = 'client_adapter_approvals') then
          expiry := (item->>field)::timestamptz;
          if expiry is null or not isfinite(expiry) or expiry <= statement_timestamp()
            or created is null or expiry <= created or expiry > created + make_interval(days => tenant_days) then
            raise exception 'client_restore_active_window_invalid';
          end if;
        end if;
      end loop;
      if not ('retention_expires_at' = any(string_to_array(allowed->>table_name, ','))
        or 'expires_at' = any(string_to_array(allowed->>table_name, ',')))
        and created is not null and table_name not in ('client_tenants','client_memberships',
        'client_provider_connections','client_manifest_proposals','client_adapter_registry')
        and created <= statement_timestamp() - make_interval(days => case when table_name = 'client_runtime_budget_ledger' then 28 else tenant_days end) then
        raise exception 'client_restore_active_window_invalid';
      end if;
      if table_name = 'client_provider_connections' and
        (item->>'status' is distinct from 'submitted' or item->>'manifest_version' is not null
          or item->>'last_validated_at' is not null or item->>'revoked_at' is not null) then
        raise exception 'client_restore_provider_requires_review';
      end if;
      if table_name = 'client_manifest_proposals' and
        (item->>'status' is distinct from 'submitted' or item->>'manifest_hash' is not null) then
        raise exception 'client_restore_manifest_requires_review';
      end if;
      -- An approval is a single-use, time-bound authorisation. Evidence of finished ones may come back; one that
      -- could still be used (pending or approved) never does.
      if table_name = 'client_adapter_approvals' and item->>'status' in ('pending', 'approved') then
        raise exception 'client_restore_adapter_requires_review';
      end if;
      if table_name = 'client_ecc_policy' and item->'enabled' is distinct from 'false'::jsonb then
        raise exception 'client_restore_learning_requires_review';
      end if;
      if table_name = 'client_ecc_skill_revisions' and item->>'revoked_at' is null then
        raise exception 'client_restore_learning_requires_review';
      end if;
      if table_name = 'client_learning_items' and (item->>'status' is distinct from 'proposed'
        or item->>'approved_hash' is not null or item->>'reviewed_by' is not null
        or item->>'reviewed_at' is not null or item->>'revoked_at' is not null) then
        raise exception 'client_restore_learning_requires_review';
      end if;
      for field in select unnest(array['created_at','updated_at','retention_expires_at','retrieved_at','expires_at']) loop
        if item ? field then clocks := clocks || jsonb_build_object(field, item->field); end if;
      end loop;
      perform set_config('app.client_lifecycle_restore', jsonb_build_object('table', table_name,
        'tenant', p_tenant_slug, 'id', item->>'id', 'clocks', clocks)::text, true);
      select string_agg(format('%I', key), ',' order by key) into columns_sql from jsonb_object_keys(item) key;
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) returning to_jsonb(%I.*)',
        table_name, columns_sql, columns_sql, table_name, table_name) into inserted using item;
      for field in select jsonb_object_keys(clocks) loop
        if (inserted->>field)::timestamptz is distinct from (clocks->>field)::timestamptz then
          raise exception 'client_restore_clock_changed';
        end if;
      end loop;
      perform set_config('app.client_lifecycle_restore', '', true);
      restored_rows := restored_rows + 1;
      counts := jsonb_set(counts, array[table_name], to_jsonb(coalesce((counts->>table_name)::integer,0) + 1));
    end loop;
  end loop;
  if to_regprocedure('public.validate_client_room_restore_graph(text)') is not null then
    execute 'select to_jsonb(public.validate_client_room_restore_graph($1))' into inserted using p_tenant_slug;
    if inserted is distinct from 'true'::jsonb then raise exception 'client_restore_room_origin_mismatch'; end if;
  end if;
  if to_regprocedure('public.validate_client_adapter_restore_graph(text)') is not null then
    execute 'select to_jsonb(public.validate_client_adapter_restore_graph($1))' into inserted using p_tenant_slug;
    if inserted is distinct from 'true'::jsonb then raise exception 'client_restore_adapter_graph_invalid'; end if;
  end if;
  return jsonb_build_object('restoredRows', restored_rows, 'tables', counts, 'atomicMetadata', true);
end;
$restore$;
revoke all on function public.restore_client_lifecycle_metadata(text,jsonb) from public, anon, authenticated;
grant execute on function public.restore_client_lifecycle_metadata(text,jsonb) to service_role;
commit;
