#!/usr/bin/env node
// Live acceptance only: existing test tenants, fixed deterministic adapters.
// Cookies stay in private files; the report contains identifiers and hashes only.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';

const configPath = process.argv[2];
if (!configPath) throw new Error('Usage: node scripts/verify-ecc-runtime.mjs PRIVATE_CONFIG.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));
if (!Array.isArray(config.targets) || config.targets.length !== 2 || !config.reportPath) throw new Error('Two test targets and reportPath are required');
const adapters = JSON.parse(await readFile(new URL('../src/data/ecc-adapters.json', import.meta.url), 'utf8')).adapters;
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), runId: randomUUID(), sourceRevision: config.sourceRevision, checks: [], artifacts: [], fixtures: [], completed: false };
const hash = value => createHash('sha256').update(value).digest('hex');
const check = (name, passed, details = {}) => { report.checks.push({ name, passed: Boolean(passed), ...details }); if (!passed) throw new Error(name); };
const persist = () => writeFile(config.reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
const targets = [];
for (const target of config.targets) {
  const url = new URL(target.url);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.a.run.app')) throw new Error('Only explicitly configured HTTPS Cloud Run test targets are permitted');
  const cookies = {};
  for (const role of ['owner', 'member', 'viewer']) cookies[role] = (await readFile(target[`${role}CookieFile`], 'utf8')).trim();
  targets.push({ ...target, cookies });
}
async function api(target, role, path, method = 'GET', body) {
  const response = await fetch(new URL(path, target.url), { method, redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { ...(role ? { cookie: target.cookies[role] } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  // Persist rotated cookies locally, never in evidence. Refresh can occur on any route.
  if (role) {
    const jar = new Map(target.cookies[role].split(';').map(part => { const i = part.indexOf('='); return [part.slice(0, i).trim(), part.slice(i + 1).trim()]; }));
    for (const raw of response.headers.getSetCookie()) { const pair = raw.split(';')[0]; const i = pair.indexOf('='); jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    target.cookies[role] = [...jar].map(([key, value]) => `${key}=${value}`).join('; ');
    await writeFile(target[`${role}CookieFile`], target.cookies[role], { mode: 0o600 });
  }
  return { status: response.status, body: await response.json().catch(() => null) };
}
async function waitJob(target, id) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const response = await api(target, 'owner', '/api/client-runtime/ecc');
    check(`${target.tenantSlug}: job status readable`, response.status === 200);
    const job = response.body.jobs.find(row => row.id === id);
    if (job && ['succeeded', 'failed', 'cancelled'].includes(job.status)) return job;
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error(`${target.tenantSlug}: job timeout`);
}
async function runJob(target, adapter, lessons = [], repeat = false) {
  const input = { adapterId: adapter.id, brief: 'Prepare a reviewable acceptance artifact. No external action is requested.', evidence: [], contextBudgetBytes: 12000 };
  const payload = { input, idempotencyKey: `acceptance:${randomUUID()}`, learningRevisions: lessons };
  const queued = await api(target, 'member', '/api/client-runtime/ecc', 'POST', payload);
  check(`${target.tenantSlug}: ${adapter.id} accepted`, queued.status === 202 && queued.body?.jobId);
  report.fixtures.push({ tenantSlug: target.tenantSlug, jobId: queued.body.jobId }); await persist();
  if (repeat) {
    const replay = await api(target, 'member', '/api/client-runtime/ecc', 'POST', payload);
    check(`${target.tenantSlug}: duplicate job retains identity`, [200, 202].includes(replay.status) && replay.body?.jobId === queued.body.jobId);
    const conflict = await api(target, 'member', '/api/client-runtime/ecc', 'POST', { ...payload, input: { ...input, brief: 'Different acceptance input' } });
    check(`${target.tenantSlug}: duplicate key with changed input rejected`, conflict.status === 409);
  }
  const job = await waitJob(target, queued.body.jobId);
  check(`${target.tenantSlug}: ${adapter.id} completed`, job.status === 'succeeded', { jobId: job.id, errorCode: job.error_code });
  const out = job.output_metadata;
  check(`${target.tenantSlug}: artifact contract and hash`, out?.artifact?.adapterId === adapter.id && out.artifactHash === hash(JSON.stringify(out.artifact)) && out.artifactId);
  report.artifacts.push({ tenantSlug: target.tenantSlug, jobId: job.id, artifactId: out.artifactId, artifactHash: out.artifactHash, adapterId: adapter.id }); await persist();
  check(`${target.tenantSlug}: zero inference, missing evidence retained`, out.evaluation.inferenceCalls === 0 && out.evaluation.providerCostMicros === 0 && out.evaluation.infrastructureCostMicros === null && out.evaluation.releaseReady === false && out.evaluation.checks.some(row => row.id === 'source-evidence' && row.status === 'missing'));
  check(`${target.tenantSlug}: exact reviewed lessons used`, out.evaluation.reviewedLessonCount === lessons.length && lessons.every(item => out.artifact.reviewedLessons.some(row => row.id === item.id && row.contentHash === item.contentHash)));
  return job;
}
try {
  for (const target of targets) {
    const prefix = target.tenantSlug;
    check(`${prefix}: anonymous access denied`, (await api(target, null, '/api/client-runtime/learning')).status === 401);
    for (const role of ['owner', 'member', 'viewer']) {
      const state = await api(target, role, '/api/client-runtime/learning');
      check(`${prefix}: ${role} identity`, state.status === 200 && state.body?.role === role);
    }
    const other = targets.find(row => row !== target);
    const foreign = { ...target, cookies: other.cookies, ownerCookieFile: other.ownerCookieFile };
    check(`${prefix}: cross-tenant session denied`, (await api(foreign, 'owner', '/api/client-runtime/learning')).status === 401);
    const state = await api(target, 'owner', '/api/client-runtime/ecc');
    check(`${prefix}: deployed capability enabled`, state.status === 200 && state.body.runtimeEnabled && state.body.policyEnabled);
    check(`${prefix}: viewer cannot activate`, (await api(target, 'viewer', '/api/client-runtime/ecc', 'PATCH', { enabled: true })).status === 403);
    const content = { summary: 'Require source evidence during acceptance.', trigger: 'A departmental artifact is reviewed.', action: 'Check source references and record unresolved evidence.', evidenceReferences: [`acceptance:${report.runId}`], sourceHashes: [hash(report.runId)] };
    const proposal = { content, idempotencyKey: `acceptance:${report.runId}`, confidence: 1 };
    check(`${prefix}: viewer cannot propose`, (await api(target, 'viewer', '/api/client-runtime/learning', 'POST', proposal)).status === 403);
    const created = await api(target, 'member', '/api/client-runtime/learning', 'POST', proposal);
    check(`${prefix}: member proposal`, created.status === 200 && created.body?.id);
    const id = created.body.id; report.fixtures.push({ tenantSlug: prefix, learningItemId: id }); await persist();
    check(`${prefix}: proposal retry`, (await api(target, 'member', '/api/client-runtime/learning', 'POST', proposal)).body?.id === id);
    const rows = await api(target, 'owner', '/api/client-runtime/learning'); const item = rows.body.items.find(row => row.id === id);
    check(`${prefix}: confidence is not approval`, item?.status === 'proposed' && !(await api(target, 'owner', '/api/client-runtime/learning?active=1')).body.revisions.some(row => row.item_id === id));
    const approval = { action: 'review', id, expectedHash: item.content_hash, decision: 'approve' };
    check(`${prefix}: member cannot review`, (await api(target, 'member', '/api/client-runtime/learning', 'PATCH', approval)).status === 403);
    check(`${prefix}: wrong hash rejected`, (await api(target, 'owner', '/api/client-runtime/learning', 'PATCH', { ...approval, expectedHash: '0'.repeat(64) })).status === 409);
    const competing = await Promise.all([api(target, 'owner', '/api/client-runtime/learning', 'PATCH', approval), api(target, 'owner', '/api/client-runtime/learning', 'PATCH', approval)]);
    check(`${prefix}: concurrent HTTP review has exactly one winner`, competing.map(row => row.status).sort().join(',') === '200,409');
    const revision = (await api(target, 'owner', '/api/client-runtime/learning?active=1')).body.revisions.find(row => row.item_id === id);
    check(`${prefix}: immutable revision created`, revision?.content_hash === item.content_hash);
    const selection = [{ id: revision.id, contentHash: revision.content_hash }];
    for (const [index, adapter] of adapters.entries()) await runJob(target, adapter, index === 0 ? selection : [], index === 0);
    check(`${prefix}: lesson revoked`, (await api(target, 'owner', '/api/client-runtime/learning', 'PATCH', { action: 'revoke', id, expectedHash: item.content_hash })).status === 200);
    const stale = await api(target, 'member', '/api/client-runtime/ecc', 'POST', { input: { adapterId: adapters[0].id, brief: 'Check revoked lesson.', evidence: [] }, idempotencyKey: `revoked:${randomUUID()}`, learningRevisions: selection });
    check(`${prefix}: revoked lesson cannot dispatch`, stale.status === 409 && stale.body?.error === 'ecc_lesson_not_active');
    const outcomes = (await api(target, 'owner', '/api/client-runtime/learning')).body.items;
    const jobs = report.fixtures.filter(row => row.tenantSlug === prefix && row.jobId);
    check(`${prefix}: structured outcomes remain proposed`, jobs.every(job => outcomes.some(row => row.source_job_id === job.jobId && row.status === 'proposed' && Number(row.confidence) === 0 && !JSON.stringify(row.content).includes('Prepare a reviewable acceptance artifact'))));
  }
  report.completed = true;
} catch (error) { report.failure = error.message; process.exitCode = 1; }
finally {
  // Only artifacts created by this run are removed. Exact DB fixture IDs are
  // retained for operator cleanup and independent readback, never broad deletes.
  for (const artifact of report.artifacts) {
    const target = targets.find(row => row.tenantSlug === artifact.tenantSlug);
    const result = await api(target, 'owner', `/api/client-runtime/artifacts/${artifact.artifactId}`, 'DELETE').catch(() => ({ status: 0 }));
    artifact.cleaned = result.status === 200;
    if (!artifact.cleaned) { report.completed = false; process.exitCode = 1; }
  }
  report.finishedAt = new Date().toISOString(); await persist();
  console.log(JSON.stringify({ completed: report.completed, checks: report.checks.length, failed: report.checks.filter(row => !row.passed), failure: report.failure, reportPath: config.reportPath }));
}
