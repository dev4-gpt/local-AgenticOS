// Data only: this module never authenticates, connects, applies or deletes.
export function clientIsolationFixture({ memberA, memberB, createdAt }) {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (typeof memberA !== 'string' || typeof memberB !== 'string'
      || !uuid.test(memberA) || !uuid.test(memberB)
      || memberA.toLowerCase() === memberB.toLowerCase()) throw new Error('distinct_fixture_members_required');
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== createdAt) throw new Error('canonical_fixture_clock_required');
  const expiry = new Date(date.getTime() + 28 * 86400000).toISOString();
  const groups = new Map();
  const add = (table, row) => {
    if (!groups.has(table)) groups.set(table, []);
    groups.get(table).push(row);
  };
  for (const [index, member] of [memberA.toLowerCase(), memberB.toLowerCase()].entries()) {
    const tenant = `iso-rehearsal-${index ? 'b' : 'a'}`;
    const id = n => `00000000-0000-4000-8000-${String((index + 1) * 1000 + n).padStart(12, '0')}`;
    const base = { tenant_slug: tenant, created_at: createdAt };
    const owned = { ...base, created_by: member };
    const retained = { ...owned, retention_expires_at: expiry };
    const title = `SYNTHETIC ISOLATION SENTINEL ${index ? 'B' : 'A'}`;
    const url = `https://example.invalid/${tenant}`;
    add('client_tenants', { slug: tenant, name: title, status: 'active', retention_days: 28, created_at: createdAt });
    add('client_memberships', { ...base, user_id: member, role: 'member', status: 'active' });
    add('client_runtime_records', { ...owned, id: id(1), kind: 'memory', title, content: title });
    add('client_runtime_jobs', { ...base, id: id(2), requested_by: member, capability: 'text-agents',
      idempotency_key: 'synthetic-isolation-only', status: 'cancelled', input_metadata: { synthetic: true, executionDisabled: true } });
    add('client_runtime_artifacts', { ...retained, id: id(3), job_id: id(2),
      object_key: `${tenant}/synthetic/no-object.txt`, content_type: 'text/plain', byte_size: 0, status: 'pending' });
    add('client_notebooks', { ...owned, id: id(4), title });
    add('client_notebook_sources', { ...retained, id: id(5), notebook_id: id(4), kind: 'web',
      title, source_url: url, status: 'ready', source_hash: '0'.repeat(64) });
    add('client_notebook_chunks', { ...base, id: id(6), source_id: id(5), ordinal: 0,
      content: title, content_hash: '0'.repeat(64), metadata: { synthetic: true } });
    add('client_research_runs', { ...owned, id: id(7), notebook_id: id(4), job_id: id(2),
      provider: 'synthetic-disabled', query: title, idempotency_key: 'synthetic-isolation-only', status: 'failed' });
    add('client_research_records', { ...base, id: id(8), research_run_id: id(7), notebook_id: id(4),
      source_url: url, retrieved_at: createdAt, status: 'failed', fields: { synthetic: true } });
    add('client_research_citations', { ...base, id: id(9), research_run_id: id(7), research_record_id: id(8),
      url, retrieved_at: createdAt, evidence: title });
    add('client_visual_qa_reports', { ...base, id: id(10), artifact_id: id(3), job_id: id(2),
      worker: 'synthetic-disabled', frames_sampled: 0, runtime_ms: 0, status: 'failed' });
    add('client_visual_qa_findings', { tenant_slug: tenant, report_id: id(10), code: 'synthetic_only',
      severity: 'info', frame: 0, confidence: 0, message: title });
    add('client_paperclip_companies', { ...base, name: title, issue_prefix: 'ISO', status: 'paused' });
    add('client_paperclip_projects', { ...owned, id: id(11), name: title, url_key: 'synthetic-only', status: 'paused' });
    add('client_paperclip_agents', { ...owned, id: id(12), name: title, url_key: 'synthetic-only', status: 'paused' });
    add('client_paperclip_issues', { ...owned, id: id(13), title, issue_number: 1, identifier: 'ISO-1',
      project_id: id(11), assignee_agent_id: id(12), status: 'cancelled' });
    add('client_paperclip_comments', { ...owned, id: id(14), issue_id: id(13), body: title });
    add('client_paperclip_runs', { ...owned, id: id(15), issue_id: id(13), agent_id: id(12), job_id: id(2), status: 'cancelled' });
    add('client_room_conversations', { ...retained, id: id(16), title });
    add('client_room_messages', { ...retained, id: id(17), conversation_id: id(16), role: 'user', content: title });
    add('client_room_rounds', { ...retained, id: id(18), conversation_id: id(16), job_id: id(2), status: 'cancelled' });
    add('client_pipeline_items', { ...owned, id: id(19), slug: 'synthetic-only', title, idea: title, stage: 'rejected' });
    add('client_board_tasks', { ...owned, id: id(20), board: 'kanban', title, status: 'archived' });
    add('client_board_comments', { ...owned, id: id(21), task_id: id(20), body: title });
    add('client_board_events', { ...base, task_id: id(20), kind: 'synthetic_only', detail: title });
    add('client_loop_runs', { ...owned, id: id(22), goal: title, title, job_id: id(2), status: 'cancelled' });
    add('client_loop_rounds', { ...base, id: id(23), run_id: id(22), round: 1, passed: false, summary: title });
    add('client_hermes_content_factory_runs', { ...retained, id: id(24), workflow_id: 'synthetic-only',
      idempotency_key: 'synthetic-isolation-only', content_type: 'article', brief: title,
      plan: { synthetic: true, executionDisabled: true }, status: 'failed', job_id: id(2) });
    const factoryChild = { ...base, run_id: id(24), retention_expires_at: expiry };
    add('client_hermes_content_factory_stage_outputs', { ...factoryChild, id: id(25), stage: 'draft', status: 'failed', output: { synthetic: true } });
    add('client_hermes_content_factory_citations', { ...factoryChild, id: 'synthetic-only', url, title, retrieved_at: createdAt, evidence: title });
    add('client_hermes_content_factory_quality_reports', { ...factoryChild, id: 'synthetic-only',
      passed: false, score: 0, citation_count: 0, checked_at: createdAt });
    add('client_hermes_content_factory_approvals', { ...factoryChild, id: 'synthetic-not-a-human-decision',
      workflow_id: 'synthetic-only', approved_by: member, approved_at: createdAt });
    add('client_hermes_content_factory_deliveries', { ...factoryChild, id: id(26), workflow_id: 'synthetic-only',
      destination: 'synthetic:no-external-delivery', status: 'blocked' });
    add('client_ruflo_swarms', { ...owned, id: id(27), objective: title, job_id: id(2), status: 'cancelled' });
    add('client_ruflo_agents', { ...base, id: id(28), swarm_id: id(27), agent_type: 'synthetic', name: title, status: 'skipped' });
  }
  return { schemaVersion: 1, synthetic: true, createdAt, retentionExpiresAt: expiry,
    tenants: ['iso-rehearsal-a', 'iso-rehearsal-b'],
    groups: [...groups].map(([table, rows]) => ({ table, rows })),
    expectedApplicationRows: 72, hostedApplyAuthorized: false,
    limitations: ['Synthetic approval rows are test sentinels, not human decisions.',
      'Artifact metadata has no object bytes; jobs and deliveries must not be executed.'] };
}

export function clientIsolationFixtureSql(fixture) {
  if (fixture.schemaVersion !== 1 || fixture.synthetic !== true
      || fixture.groups.length !== 36 || fixture.groups.some(group => group.rows.length !== 2))
    throw new Error('fixture_shape_invalid');
  const members = fixture.groups.find(group => group.table === 'client_memberships').rows.map(row => row.user_id);
  // Regeneration validates the supplied identities and the canonical clock.
  const expected = clientIsolationFixture({ memberA: members[0], memberB: members[1], createdAt: fixture.createdAt });
  if (JSON.stringify(fixture) !== JSON.stringify(expected)) throw new Error('fixture_content_drift');
  const identifier = value => {
    if (!/^[a-z_]+$/.test(value)) throw new Error('fixture_identifier_invalid');
    return `"${value}"`;
  };
  const statements = fixture.groups.map(({ table, rows }) => {
    const columns = Object.keys(rows[0]).map(identifier).join(',');
    const json = JSON.stringify(rows);
    if (json.includes('$agentos_fixture$')) throw new Error('fixture_delimiter_collision');
    return `insert into public.${identifier(table)}(${columns}) select ${columns}
from jsonb_populate_recordset(null::public.${identifier(table)},$agentos_fixture$${json}$agentos_fixture$::jsonb);`;
  });
  return `-- Synthetic fixture proposal only. No Auth accounts, objects, jobs or providers are executed.
-- Verify the independently approved staging project in the execution surface before submission.
begin;
do $fixture_preflight$
begin
  if (select count(*) from auth.users where id in ('${members[0]}'::uuid,'${members[1]}'::uuid))<>2 then
    raise exception 'fixture_auth_members_missing';
  end if;
  if exists(select 1 from public.client_memberships where user_id in ('${members[0]}'::uuid,'${members[1]}'::uuid)) then
    raise exception 'fixture_members_already_assigned';
  end if;
  if exists(select 1 from public.client_tenants where slug in ('iso-rehearsal-a','iso-rehearsal-b')) then
    raise exception 'fixture_namespace_exists';
  end if;
  if '${fixture.createdAt}'::timestamptz>clock_timestamp()+interval '1 minute'
     or '${fixture.createdAt}'::timestamptz<clock_timestamp()-interval '20 minutes' then
    raise exception 'fixture_clock_outside_prepared_window';
  end if;
end;
$fixture_preflight$;
${statements.join('\n')}
commit;
`;
}
