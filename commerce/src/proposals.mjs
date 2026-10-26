/**
 * Evidence-bound proposal contract. No network, database, vault, secrets or model calls.
 * Callers supply authenticated identity, authorized current sources and trusted server time.
 * These functions validate domain state; accepting an object is NOT authenticating a user.
 */
import { createHash } from 'node:crypto';

export class CommerceError extends Error {
  constructor(code) { super(code); this.name = 'CommerceError'; this.code = code; }
}
const fail = (code) => { throw new CommerceError(code); };
const record = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype) fail('invalid_input');
  return v;
};
function text(v, max = 200) {
  if (typeof v !== 'string' || !v.trim() || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v)) fail('invalid_text');
  return v;
}
function id(v) {
  if (typeof v !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v)) fail('invalid_id');
  return v;
}
function tenant(v) {
  if (typeof v !== 'string' || !/^[a-z][a-z0-9-]{2,40}$/.test(v)) fail('invalid_tenant');
  return v;
}
function hash(v) {
  if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v)) fail('invalid_hash');
  return v;
}
function time(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== v) fail('invalid_time');
  return v;
}
function nowTime(v) {
  if (!Number.isSafeInteger(v) || v < 0 || !Number.isFinite(new Date(v).getTime())) fail('invalid_time');
  return v;
}
function frozen(v) {
  if (v && typeof v === 'object') { Object.values(v).forEach(frozen); Object.freeze(v); }
  return v;
}
function exactKeys(v, keys) {
  if (Object.keys(record(v)).sort().join('|') !== [...keys].sort().join('|')) fail('invalid_shape');
}
function canonical(v) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'number' && Number.isSafeInteger(v)) return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  return `{${Object.keys(record(v)).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
}
export const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

export function usdValue(cents) {
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > 100_000_000) fail('invalid_amount');
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

function sourceRef(value) {
  const s = record(value);
  return {
    tenant: tenant(s.tenant), id: id(s.id), revision: id(s.revision),
    contentHash: hash(s.contentHash), metadataHash: hash(s.metadataHash), expiresAt: time(s.expiresAt),
  };
}

/** Admission checks fresh authorized sources, not a cached background invalidation result. */
export function assertSourcesEligible(refs, currentSources, tenantSlug, now) {
  tenant(tenantSlug); nowTime(now);
  if (!Array.isArray(refs) || refs.length < 1 || refs.length > 20 || !Array.isArray(currentSources) || currentSources.length > 20) fail('invalid_sources');
  const seen = new Set();
  const current = new Map();
  for (const value of currentSources) {
    const s = record(value);
    const key = `${tenant(s.tenant)}:${id(s.id)}`;
    if (current.has(key)) fail('ambiguous_source');
    current.set(key, s);
  }
  for (const value of refs) {
    const ref = sourceRef(value);
    if (ref.tenant !== tenantSlug) fail('source_not_available');
    if (seen.has(ref.id)) fail('duplicate_source');
    seen.add(ref.id);
    const s = current.get(`${tenantSlug}:${ref.id}`);
    if (!s || s.status !== 'active' || s.reviewState !== 'approved' || s.sensitivity !== 'ordinary') fail('source_not_available');
    if (time(s.expiresAt) !== ref.expiresAt || Date.parse(ref.expiresAt) <= now) fail('source_expired_or_changed');
    if (id(s.revision) !== ref.revision || hash(s.contentHash) !== ref.contentHash || hash(s.metadataHash) !== ref.metadataHash) fail('source_changed');
    if (s.content !== undefined && sha256(text(s.content, 200_000)) !== ref.contentHash) fail('source_changed');
  }
  return true;
}

function terms(value) {
  const t = record(value);
  if (t.currency !== 'USD') fail('unsupported_currency');
  usdValue(t.depositCents); usdValue(t.totalCents);
  if (t.depositCents > t.totalCents) fail('invalid_amount');
  return {
    currency: 'USD', depositCents: t.depositCents, totalCents: t.totalCents,
    merchantId: id(t.merchantId), description: text(t.description, 1000),
  };
}

function proposalPayload(input) {
  const p = record(input);
  if (p.schema !== 1 || p.environment !== 'sandbox') fail('invalid_proposal');
  const sources = p.sources;
  if (!Array.isArray(sources) || !sources.length || sources.length > 20) fail('invalid_sources');
  const refs = sources.map(sourceRef).sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (new Set(refs.map(s => s.id)).size !== refs.length) fail('duplicate_source');
  const tenantSlug = tenant(p.tenant);
  if (refs.some(s => s.tenant !== tenantSlug)) fail('source_not_available');
  const createdAt = time(p.createdAt), expiresAt = time(p.expiresAt);
  if (Date.parse(expiresAt) <= Date.parse(createdAt) || refs.some(s => Date.parse(s.expiresAt) < Date.parse(expiresAt))) fail('invalid_expiry');
  return {
    schema: 1, environment: 'sandbox', tenant: tenantSlug, id: id(p.id), revision: id(p.revision),
    title: text(p.title, 200), body: text(p.body, 30_000), terms: terms(p.terms),
    policyVersion: id(p.policyVersion), sources: refs, createdAt, expiresAt,
  };
}
const proposalKeys = ['schema','environment','tenant','id','revision','title','body','terms','policyVersion','sources','createdAt','expiresAt'];

/** Returns a detached deep-frozen snapshot; mutation of caller objects cannot change it. */
export function createProposal(input, currentSources, now) {
  const payload = proposalPayload(input);
  nowTime(now);
  if (Date.parse(payload.createdAt) > now || Date.parse(payload.expiresAt) <= now) fail('invalid_expiry');
  assertSourcesEligible(payload.sources, currentSources, payload.tenant, now);
  return frozen({ ...payload, digest: sha256(canonical(payload)) });
}

export function assertProposalCurrent(proposal, context) {
  exactKeys(proposal, [...proposalKeys, 'digest']);
  exactKeys(proposal.terms, ['currency','depositCents','totalCents','merchantId','description']);
  if (!Array.isArray(proposal.sources)) fail('invalid_sources');
  for (const s of proposal.sources) exactKeys(s, ['tenant','id','revision','contentHash','metadataHash','expiresAt']);
  const p = proposalPayload(proposal);
  if (hash(proposal.digest) !== sha256(canonical(p))) fail('proposal_changed');
  const ctx = record(context);
  if (p.tenant !== tenant(ctx.tenant)) fail('not_allowed');
  const now = nowTime(ctx.now);
  if (Date.parse(p.createdAt) > now || Date.parse(p.expiresAt) <= now) fail('proposal_expired');
  if (p.policyVersion !== id(ctx.policyVersion) || p.terms.merchantId !== id(ctx.merchantId)) fail('policy_or_merchant_changed');
  assertSourcesEligible(p.sources, ctx.sources, p.tenant, now);
  return true;
}

/** Trusted host must derive this principal from the authenticated session, never a request body. */
function assertPrincipal(principal, tenantSlug, allowedRoles) {
  const p = record(principal);
  if (p.tenant !== tenantSlug || p.active !== true || !allowedRoles.includes(p.role)) fail('not_allowed');
  return id(p.subject);
}

/** Review binds exact evidence and commercial terms; it does not consume durable execution authority. */
export function approveProposal(proposal, input, context) {
  assertProposalCurrent(proposal, context);
  const i = record(input);
  const requester = assertPrincipal(i.requester, proposal.tenant, ['owner','admin','member']);
  const reviewer = assertPrincipal(i.reviewer, proposal.tenant, ['owner','admin']);
  if (requester === reviewer) fail('reviewer_must_differ');
  if (i.expectedDigest !== proposal.digest) fail('proposal_changed');
  if (i.evidenceReviewed !== true || i.termsReviewed !== true) fail('review_required');
  const expiresAt = time(i.expiresAt);
  if (Date.parse(expiresAt) <= context.now || Date.parse(expiresAt) > Date.parse(proposal.expiresAt)) fail('invalid_expiry');
  return frozen({
    schema: 1, id: id(i.id), tenant: proposal.tenant, proposalId: proposal.id,
    proposalRevision: proposal.revision, proposalDigest: proposal.digest,
    requester, reviewer, approvedAt: new Date(context.now).toISOString(), expiresAt,
    environment: 'sandbox', policyVersion: proposal.policyVersion,
  });
}

/** A stored server approval is required. This validator does not verify a signature or query storage. */
export function assertApprovalCurrent(proposal, approval, context) {
  assertProposalCurrent(proposal, context);
  const a = record(approval);
  exactKeys(a, ['schema','id','tenant','proposalId','proposalRevision','proposalDigest','requester','reviewer','approvedAt','expiresAt','environment','policyVersion']);
  id(a.id); id(a.requester); id(a.reviewer);
  if (a.schema !== 1 || a.environment !== 'sandbox' || a.tenant !== proposal.tenant || a.proposalId !== proposal.id || a.proposalRevision !== proposal.revision || a.proposalDigest !== proposal.digest || a.policyVersion !== proposal.policyVersion) fail('approval_mismatch');
  if (a.requester === a.reviewer) fail('reviewer_must_differ');
  const approvedAt = Date.parse(time(a.approvedAt)), expiry = Date.parse(time(a.expiresAt));
  if (approvedAt < Date.parse(proposal.createdAt) || approvedAt > context.now || expiry <= approvedAt || expiry <= context.now || expiry > Date.parse(proposal.expiresAt)) fail('approval_expired');
  return true;
}
