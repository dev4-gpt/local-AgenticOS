/**
 * Local standalone persistence, Node 24 SQLite. Server-only, not an HTTP API.
 * subject must come from verified authentication. Provisioning methods are privileged bootstrap
 * operations and must never be routed to callers. Hosted Veloce binding will use its own RLS/RPCs.
 */
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { CommerceError, createProposal, approveProposal, assertApprovalCurrent } from './proposals.mjs';
const fail = code => { throw new CommerceError(code); };
const identifier = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) fail('invalid_id');
  return value;
};
const tenantId = value => {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{2,40}$/.test(value)) fail('invalid_tenant');
  return value;
};
const parse = row => row ? JSON.parse(row.payload) : null;

export class CommerceStore {
  #db; #clock;
  constructor(path, { clock = Date.now } = {}) {
    if (typeof path !== 'string' || !path || typeof clock !== 'function') fail('invalid_store_configuration');
    this.#clock = clock;
    this.#db = new DatabaseSync(path, { timeout:5000 });
    this.#db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS commerce_workspaces (
        tenant TEXT PRIMARY KEY, policy_version TEXT NOT NULL, merchant_id TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS commerce_members (
        tenant TEXT NOT NULL REFERENCES commerce_workspaces(tenant), subject TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('owner','admin','member')), active INTEGER NOT NULL CHECK(active IN (0,1)),
        PRIMARY KEY(tenant,subject)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS commerce_sources (
        tenant TEXT NOT NULL REFERENCES commerce_workspaces(tenant), id TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)),
        PRIMARY KEY(tenant,id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS commerce_proposals (
        tenant TEXT NOT NULL REFERENCES commerce_workspaces(tenant), id TEXT NOT NULL, revision TEXT NOT NULL,
        requester TEXT NOT NULL, digest TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)),
        PRIMARY KEY(tenant,id,revision), FOREIGN KEY(tenant,requester) REFERENCES commerce_members(tenant,subject)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS commerce_approvals (
        tenant TEXT NOT NULL, id TEXT NOT NULL, proposal_id TEXT NOT NULL, proposal_revision TEXT NOT NULL,
        consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed IN (0,1)), payload TEXT NOT NULL CHECK(json_valid(payload)),
        PRIMARY KEY(tenant,id),
        FOREIGN KEY(tenant,proposal_id,proposal_revision) REFERENCES commerce_proposals(tenant,id,revision)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS commerce_intents (
        tenant TEXT NOT NULL, id TEXT NOT NULL, approval_id TEXT NOT NULL,
        proposal_id TEXT NOT NULL, proposal_revision TEXT NOT NULL,
        create_operation_id TEXT NOT NULL UNIQUE, capture_operation_id TEXT NOT NULL UNIQUE,
        payload TEXT NOT NULL CHECK(json_valid(payload)),
        PRIMARY KEY(tenant,id), UNIQUE(tenant,approval_id), UNIQUE(tenant,proposal_id,proposal_revision),
        FOREIGN KEY(tenant,approval_id) REFERENCES commerce_approvals(tenant,id)
      ) STRICT;
    `);
  }
  close() { this.#db.close(); }
  #transaction(fn) {
    this.#db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.#db.exec('COMMIT'); return value; }
    catch (error) { this.#db.exec('ROLLBACK'); throw error; }
  }
  #now() {
    const now = this.#clock();
    if (!Number.isSafeInteger(now) || now < 0) fail('invalid_time');
    return now;
  }
  #member(tenant, subject, roles = ['owner','admin','member']) {
    tenantId(tenant); identifier(subject);
    const m = this.#db.prepare('SELECT * FROM commerce_members WHERE tenant=? AND subject=?').get(tenant,subject);
    if (!m || m.active !== 1 || !roles.includes(m.role)) fail('not_allowed');
    return { tenant, subject, role:m.role, active:true };
  }
  #proposal(tenant, id, revision) {
    const row = this.#db.prepare('SELECT * FROM commerce_proposals WHERE tenant=? AND id=? AND revision=?').get(tenant,identifier(id),identifier(revision));
    if (!row) fail('not_found');
    return { row, proposal:parse(row) };
  }
  #context(proposal) {
    const workspace = this.#db.prepare('SELECT * FROM commerce_workspaces WHERE tenant=?').get(proposal.tenant);
    if (!workspace) fail('not_found');
    const get = this.#db.prepare('SELECT payload FROM commerce_sources WHERE tenant=? AND id=?');
    return {
      tenant:proposal.tenant, now:this.#now(), policyVersion:workspace.policy_version, merchantId:workspace.merchant_id,
      sources:proposal.sources.map(ref => parse(get.get(proposal.tenant,ref.id))).filter(Boolean),
    };
  }

  // PRIVILEGED provisioning: caller is the local server operator, not an application user.
  configureWorkspace({tenant,policyVersion,merchantId}) {
    tenantId(tenant);identifier(policyVersion);identifier(merchantId);
    this.#db.prepare(`INSERT INTO commerce_workspaces VALUES (?,?,?) ON CONFLICT(tenant) DO UPDATE SET policy_version=excluded.policy_version, merchant_id=excluded.merchant_id`).run(tenant,policyVersion,merchantId);
  }
  setMember({tenant,subject,role,active=true}) {
    tenantId(tenant);identifier(subject);
    if (!['owner','admin','member'].includes(role) || typeof active !== 'boolean') fail('invalid_member');
    this.#db.prepare(`INSERT INTO commerce_members VALUES (?,?,?,?) ON CONFLICT(tenant,subject) DO UPDATE SET role=excluded.role,active=excluded.active`).run(tenant,subject,role,active ? 1 : 0);
  }
  putSource(source) {
    tenantId(source?.tenant);identifier(source?.id);identifier(source?.revision);
    if (!['active','withdrawn'].includes(source.status) || !['approved','quarantined'].includes(source.reviewState) || !['ordinary','sensitive','unknown','restricted'].includes(source.sensitivity) || JSON.stringify(source).length>250_000) fail('invalid_source');
    this.#db.prepare(`INSERT INTO commerce_sources VALUES (?,?,?) ON CONFLICT(tenant,id) DO UPDATE SET payload=excluded.payload`).run(source.tenant,source.id,JSON.stringify(source));
  }

  saveProposal(subject, input) {
    return this.#transaction(() => {
      this.#member(input.tenant,subject);
      const context = this.#context(input);
      const proposal = createProposal(input,context.sources,context.now);
      // Binding workspace policy/merchant is checked here too, not just at approval time.
      if (proposal.policyVersion !== context.policyVersion || proposal.terms.merchantId !== context.merchantId) fail('policy_or_merchant_changed');
      const prior=this.#db.prepare('SELECT * FROM commerce_proposals WHERE tenant=? AND id=? AND revision=?').get(proposal.tenant,proposal.id,proposal.revision);
      if (prior) {
        if (prior.digest!==proposal.digest || prior.requester!==subject) fail('revision_conflict');
        return parse(prior);
      }
      this.#db.prepare('INSERT INTO commerce_proposals VALUES (?,?,?,?,?,?)').run(proposal.tenant,proposal.id,proposal.revision,subject,proposal.digest,JSON.stringify(proposal));
      return proposal;
    });
  }
  readProposal(subject, tenant, id, revision) {
    this.#member(tenant,subject);
    const proposal=this.#proposal(tenant,id,revision).proposal;
    if (Date.parse(proposal.expiresAt)<=this.#now()) fail('not_found');
    return proposal;
  }
  reviewProposal(subject, tenant, id, revision, review) {
    return this.#transaction(() => {
      const reviewer=this.#member(tenant,subject,['owner','admin']);
      const {row,proposal}=this.#proposal(tenant,id,revision);
      const approval=approveProposal(proposal,{
        id:randomUUID(),expectedDigest:review.expectedDigest,expiresAt:review.expiresAt,
        evidenceReviewed:review.evidenceReviewed,termsReviewed:review.termsReviewed,
        requester:this.#member(tenant,row.requester),reviewer,
      },this.#context(proposal));
      this.#db.prepare('INSERT INTO commerce_approvals(tenant,id,proposal_id,proposal_revision,payload) VALUES (?,?,?,?,?)').run(tenant,approval.id,id,revision,JSON.stringify(approval));
      return approval;
    });
  }
  beginIntent(subject, tenant, approvalId) {
    return this.#transaction(() => {
      const member=this.#member(tenant,subject);
      const row=this.#db.prepare('SELECT * FROM commerce_approvals WHERE tenant=? AND id=?').get(tenant,identifier(approvalId));
      if (!row) fail('not_found');
      const approval=parse(row);
      if (subject!==approval.requester && !['owner','admin'].includes(member.role)) fail('not_allowed');
      const {proposal}=this.#proposal(tenant,row.proposal_id,row.proposal_revision);
      assertApprovalCurrent(proposal,approval,this.#context(proposal));
      this.#member(tenant,approval.requester);this.#member(tenant,approval.reviewer,['owner','admin']);
      const prior=this.#db.prepare('SELECT payload FROM commerce_intents WHERE tenant=? AND approval_id=?').get(tenant,approvalId);
      if (prior) return parse(prior);
      if (row.consumed) fail('approval_consumed');
      if (this.#db.prepare('SELECT 1 FROM commerce_intents WHERE tenant=? AND proposal_id=? AND proposal_revision=?').get(tenant,proposal.id,proposal.revision)) fail('proposal_already_has_intent');
      const intent={
        id:randomUUID(),tenant,approvalId,proposalId:proposal.id,proposalRevision:proposal.revision,
        proposalDigest:proposal.digest,environment:'sandbox',state:'ready',merchantId:proposal.terms.merchantId,
        depositCents:proposal.terms.depositCents,createOperationId:randomUUID(),captureOperationId:randomUUID(),
        createdAt:new Date(this.#now()).toISOString(),expiresAt:approval.expiresAt,
      };
      this.#db.prepare('INSERT INTO commerce_intents VALUES (?,?,?,?,?,?,?,?)').run(tenant,intent.id,approvalId,proposal.id,proposal.revision,intent.createOperationId,intent.captureOperationId,JSON.stringify(intent));
      const changed=this.#db.prepare('UPDATE commerce_approvals SET consumed=1 WHERE tenant=? AND id=? AND consumed=0').run(tenant,approvalId);
      if (changed.changes!==1) fail('approval_consumed');
      return intent;
    });
  }
  readIntent(subject,tenant,id) {
    this.#member(tenant,subject);
    const result=parse(this.#db.prepare('SELECT payload FROM commerce_intents WHERE tenant=? AND id=?').get(tenant,identifier(id)));
    if (!result) fail('not_found');
    return result;
  }
}
