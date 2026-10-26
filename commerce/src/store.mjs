/**
 * Local standalone persistence, Node 24 SQLite. Server-only, not an HTTP API.
 * subject must come from verified authentication. Provisioning methods are privileged bootstrap
 * operations and must never be routed to callers. Hosted Veloce binding will use its own RLS/RPCs.
 */
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import {exportWorkspaceSnapshot,restoreWorkspaceSnapshot} from './recovery.mjs';
import { CommerceError, createProposal, approveProposal, assertProposalCurrent, assertApprovalCurrent, sha256, usdValue } from './proposals.mjs';
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
      PRAGMA secure_delete = ON;
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
        requester TEXT NOT NULL, digest TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)), parent_revision TEXT,
        PRIMARY KEY(tenant,id,revision), FOREIGN KEY(tenant,requester) REFERENCES commerce_members(tenant,subject)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS commerce_approvals (
        tenant TEXT NOT NULL, id TEXT NOT NULL, proposal_id TEXT NOT NULL, proposal_revision TEXT NOT NULL,
        consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed IN (0,1)), payload TEXT NOT NULL CHECK(json_valid(payload)),
        PRIMARY KEY(tenant,id),
        FOREIGN KEY(tenant,proposal_id,proposal_revision) REFERENCES commerce_proposals(tenant,id,revision)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS commerce_revoked_approvals (
        tenant TEXT NOT NULL, approval_id TEXT NOT NULL, reason TEXT NOT NULL CHECK(reason='workspace_restore'),
        PRIMARY KEY(tenant,approval_id), FOREIGN KEY(tenant,approval_id) REFERENCES commerce_approvals(tenant,id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS commerce_workspace_restores (
        tenant TEXT PRIMARY KEY REFERENCES commerce_workspaces(tenant), snapshot_digest TEXT NOT NULL, restored_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS commerce_intents (
        tenant TEXT NOT NULL, id TEXT NOT NULL, approval_id TEXT NOT NULL,
        proposal_id TEXT NOT NULL, proposal_revision TEXT NOT NULL,
        create_operation_id TEXT NOT NULL UNIQUE, capture_operation_id TEXT NOT NULL UNIQUE,
        payload TEXT NOT NULL CHECK(json_valid(payload)),
        PRIMARY KEY(tenant,id), UNIQUE(tenant,approval_id), UNIQUE(tenant,proposal_id,proposal_revision),
        FOREIGN KEY(tenant,approval_id) REFERENCES commerce_approvals(tenant,id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS commerce_operations (
        id TEXT PRIMARY KEY, tenant TEXT NOT NULL, intent_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('create','capture')),
        claim TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('running','reconciling','succeeded')),
        started_at INTEGER NOT NULL, lease_until INTEGER NOT NULL,
        FOREIGN KEY(tenant,intent_id) REFERENCES commerce_intents(tenant,id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS commerce_orders (
        order_id TEXT PRIMARY KEY, tenant TEXT NOT NULL, intent_id TEXT NOT NULL, merchant_id TEXT NOT NULL,
        UNIQUE(tenant,intent_id), FOREIGN KEY(tenant,intent_id) REFERENCES commerce_intents(tenant,id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS commerce_captures (
        capture_id TEXT PRIMARY KEY, tenant TEXT NOT NULL, intent_id TEXT NOT NULL, order_id TEXT NOT NULL,
        UNIQUE(tenant,intent_id), FOREIGN KEY(tenant,intent_id) REFERENCES commerce_intents(tenant,id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS commerce_payment_inbox (
        event_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, disposition TEXT NOT NULL,
        tenant TEXT REFERENCES commerce_workspaces(tenant)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS commerce_kickoff_outbox (
        tenant TEXT NOT NULL, intent_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','delivered','review_required')),
        PRIMARY KEY(tenant,intent_id), FOREIGN KEY(tenant,intent_id) REFERENCES commerce_intents(tenant,id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS commerce_projects (
        tenant TEXT NOT NULL, intent_id TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)),
        PRIMARY KEY(tenant,intent_id), FOREIGN KEY(tenant,intent_id) REFERENCES commerce_intents(tenant,id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS commerce_draft_runs (
        id TEXT PRIMARY KEY, tenant TEXT NOT NULL, subject TEXT NOT NULL,started_at INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('running','succeeded','failed')),payload TEXT NOT NULL CHECK(json_valid(payload)),
        FOREIGN KEY(tenant,subject) REFERENCES commerce_members(tenant,subject)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS commerce_proposal_decisions (
        tenant TEXT NOT NULL,proposal_id TEXT NOT NULL,proposal_revision TEXT NOT NULL,
        decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')),subject TEXT NOT NULL,reason TEXT NOT NULL,
        PRIMARY KEY(tenant,proposal_id,proposal_revision),
        FOREIGN KEY(tenant,proposal_id,proposal_revision) REFERENCES commerce_proposals(tenant,id,revision)
      ) STRICT;
    `);
    if(!this.#db.prepare('PRAGMA table_info(commerce_proposals)').all().some(column=>column.name==='parent_revision'))this.#db.exec('ALTER TABLE commerce_proposals ADD COLUMN parent_revision TEXT');
    this.#db.exec('CREATE UNIQUE INDEX IF NOT EXISTS commerce_one_proposal_successor ON commerce_proposals(tenant,id,parent_revision) WHERE parent_revision IS NOT NULL');
    if(!this.#db.prepare('PRAGMA table_info(commerce_payment_inbox)').all().some(column=>column.name==='tenant')){
      this.#db.exec('ALTER TABLE commerce_payment_inbox ADD COLUMN tenant TEXT REFERENCES commerce_workspaces(tenant)');
    }
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
    if(this.#db.prepare('SELECT 1 FROM commerce_proposals WHERE tenant=? AND id=? AND parent_revision=?').get(proposal.tenant,proposal.id,proposal.revision))fail('proposal_superseded');
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
    const now=this.#now(),expiry=Date.parse(source.expiresAt);
    if(!Number.isSafeInteger(expiry)||new Date(expiry).toISOString()!==source.expiresAt)fail('invalid_expiry');
    const prior=parse(this.#db.prepare('SELECT payload FROM commerce_sources WHERE tenant=? AND id=?').get(source.tenant,source.id));
    // An update is not a new retention window, even for a privileged importer.
    if(prior&&(prior.expiresAt!==source.expiresAt||prior.purgedAt))fail('retention_clock_changed');
    if(!prior&&(expiry<=now||expiry>now+28*24*60*60*1000))fail('invalid_expiry');
    const changed=this.#db.prepare(`INSERT INTO commerce_sources VALUES (?,?,?) ON CONFLICT(tenant,id) DO UPDATE SET payload=excluded.payload
      WHERE json_extract(commerce_sources.payload,'$.purgedAt') IS NULL
      AND json_extract(commerce_sources.payload,'$.expiresAt')=json_extract(excluded.payload,'$.expiresAt')`).run(source.tenant,source.id,JSON.stringify(source));
    if(changed.changes!==1)fail('retention_clock_changed');
  }

  submitSource(subject,tenant,{title,content}) {
    this.#member(tenant,subject);
    if(typeof title!=='string'||!title.trim()||title.length>200||typeof content!=='string'||!content.trim()||content.length>12_000)fail('invalid_source');
    const source={tenant,id:randomUUID(),revision:randomUUID(),title:title.trim(),type:'source',content,contentHash:sha256(content),metadataHash:sha256(JSON.stringify({title:title.trim(),type:'source'})),status:'active',reviewState:'quarantined',sensitivity:'unknown',submittedBy:subject,createdAt:new Date(this.#now()).toISOString(),expiresAt:new Date(this.#now()+28*24*60*60*1000).toISOString()};
    this.putSource(source);return source;
  }
  reviewSource(subject,tenant,id,{sensitivity}) {
    return this.#transaction(()=>{
      this.#member(tenant,subject,['owner','admin']);
      const source=parse(this.#db.prepare('SELECT payload FROM commerce_sources WHERE tenant=? AND id=?').get(tenant,identifier(id)));
      if(!source||source.status!=='active'||Date.parse(source.expiresAt)<=this.#now())fail('not_found');
      if(source.submittedBy===subject)fail('reviewer_must_differ');
      if(sensitivity!=='ordinary')fail('source_not_available');
      source.reviewState='approved';source.sensitivity='ordinary';source.reviewedBy=subject;source.revision=randomUUID();
      this.putSource(source);return source;
    });
  }
  withdrawSource(subject,tenant,id) {
    return this.#transaction(()=>{
      const member=this.#member(tenant,subject);
      const source=parse(this.#db.prepare('SELECT payload FROM commerce_sources WHERE tenant=? AND id=?').get(tenant,identifier(id)));
      if(!source)fail('not_found');
      if(subject!==source.submittedBy&&!['owner','admin'].includes(member.role))fail('not_allowed');
      source.status='withdrawn';source.content='';source.revision=randomUUID();
      this.putSource(source);
      for(const row of this.#db.prepare('SELECT payload FROM commerce_intents WHERE tenant=?').all(tenant)){
        const intent=parse(row),{proposal}=this.#proposal(tenant,intent.proposalId,intent.proposalRevision);
        if(!proposal.sources.some(ref=>ref.id===id))continue;
        intent.reviewRequired=true;intent.state=intent.captureId?'paid_review_required':'evidence_review_required';this.#saveIntent(intent);
        this.#db.prepare("UPDATE commerce_kickoff_outbox SET state='review_required' WHERE tenant=? AND intent_id=?").run(tenant,intent.id);
        this.#db.prepare("UPDATE commerce_projects SET payload=json_set(payload,'$.state','review_required') WHERE tenant=? AND intent_id=?").run(tenant,intent.id);
      }
      return {id:source.id,status:'withdrawn'};
    });
  }
  selectedSources(subject,tenant,ids) {
    this.#member(tenant,subject);
    if(!Array.isArray(ids)||!ids.length||ids.length>5||new Set(ids).size!==ids.length)fail('invalid_sources');
    return ids.map(id=>{
      const source=parse(this.#db.prepare('SELECT payload FROM commerce_sources WHERE tenant=? AND id=?').get(tenant,identifier(id)));
      if(!source||source.status!=='active'||source.reviewState!=='approved'||source.sensitivity!=='ordinary'||Date.parse(source.expiresAt)<=this.#now())fail('source_not_available');
      return source;
    });
  }
  workspace(subject,tenant) {
    const member=this.#member(tenant,subject),config=this.#db.prepare('SELECT * FROM commerce_workspaces WHERE tenant=?').get(tenant),now=this.#now();
    const rows=table=>this.#db.prepare(`SELECT payload FROM ${table} WHERE tenant=? ORDER BY rowid DESC LIMIT 100`).all(tenant).map(parse);
    const sources=rows('commerce_sources').filter(s=>s.status==='active'&&Date.parse(s.expiresAt)>now&&(s.reviewState==='approved'||s.submittedBy===subject||['owner','admin'].includes(member.role)));
    const proposals=rows('commerce_proposals').filter(p=>Date.parse(p.expiresAt)>now).map(proposal=>{
      let eligibility='current';try{assertProposalCurrent(proposal,this.#context(proposal));}
      catch(error){eligibility=error.code??'review_required';}
      const authorRow=this.#db.prepare('SELECT requester,parent_revision FROM commerce_proposals WHERE tenant=? AND id=? AND revision=?').get(tenant,proposal.id,proposal.revision);
      const decision=this.#db.prepare('SELECT decision,reason FROM commerce_proposal_decisions WHERE tenant=? AND proposal_id=? AND proposal_revision=?').get(tenant,proposal.id,proposal.revision);
      return {...proposal,eligibility,requestedBy:authorRow.requester,parentRevision:authorRow.parent_revision,reviewDecision:decision?.decision??'pending',reviewReason:decision?.reason??''};
    });
    return {tenant,subject,role:member.role,policyVersion:config.policy_version,merchantId:config.merchant_id,sources,proposals,approvals:rows('commerce_approvals').filter(a=>Date.parse(a.expiresAt)>now),intents:rows('commerce_intents').map(i=>this.#intentView(i)),projects:rows('commerce_projects').filter(p=>Date.parse(p.expiresAt)>now)};
  }
  reserveDraft(subject,tenant) {
    return this.#transaction(()=>{
      this.#member(tenant,subject);const now=this.#now();
      const count=this.#db.prepare('SELECT count(*) AS n FROM commerce_draft_runs WHERE tenant=? AND started_at>?').get(tenant,now-60*60*1000).n;
      if(count>=12)fail('draft_limit_reached');
      if(this.#db.prepare("SELECT 1 FROM commerce_draft_runs WHERE tenant=? AND status='running' AND started_at>?").get(tenant,now-75_000))fail('draft_in_progress');
      const id=randomUUID();this.#db.prepare("INSERT INTO commerce_draft_runs VALUES (?,?,?,?,'running','{}')").run(id,tenant,subject,now);return id;
    });
  }
  finishDraft(subject,tenant,id,status,metadata={}) {
    this.#member(tenant,subject);
    if(!['succeeded','failed'].includes(status))fail('invalid_input');
    const safe={provider:['ollama','claude-cli'].includes(metadata.provider)?metadata.provider:'unknown',model:typeof metadata.model==='string'?metadata.model.slice(0,128):null,costMicros:null,costStatus:metadata.provider==='claude-cli'?'subscription_usage_only':'not_reported',proposalId:metadata.proposalId??null};
    this.#db.prepare("UPDATE commerce_draft_runs SET status=?,payload=? WHERE tenant=? AND subject=? AND id=? AND status='running'").run(status,JSON.stringify(safe),tenant,subject,id);
  }

  saveProposal(subject, input) {
    return this.#transaction(() => {
      this.#member(input.tenant,subject);
      const context = this.#context(input);
      const proposal = createProposal(input,context.sources,context.now);
      // Binding workspace policy/merchant is checked here too, not just at approval time.
      if(Date.parse(proposal.expiresAt)-Date.parse(proposal.createdAt)>28*24*60*60*1000)fail('invalid_expiry');
      if (proposal.policyVersion !== context.policyVersion || proposal.terms.merchantId !== context.merchantId) fail('policy_or_merchant_changed');
      const prior=this.#db.prepare('SELECT * FROM commerce_proposals WHERE tenant=? AND id=? AND revision=?').get(proposal.tenant,proposal.id,proposal.revision);
      if (prior) {
        if (prior.digest!==proposal.digest || prior.requester!==subject) fail('revision_conflict');
        return parse(prior);
      }
      this.#db.prepare('INSERT INTO commerce_proposals(tenant,id,revision,requester,digest,payload) VALUES (?,?,?,?,?,?)').run(proposal.tenant,proposal.id,proposal.revision,subject,proposal.digest,JSON.stringify(proposal));
      return proposal;
    });
  }
  /** Human correction after rejection: new immutable revision, same evidence/terms/original lifetime. */
  reviseProposal(subject,tenant,id,revision,{expectedDigest,title,body}) {
    return this.#transaction(()=>{
      this.#member(tenant,subject);
      const {row,proposal}=this.#proposal(tenant,id,revision);
      if(row.requester!==subject)fail('not_allowed');
      if(expectedDigest!==proposal.digest)fail('proposal_changed');
      const context=this.#context(proposal);assertProposalCurrent(proposal,context);
      if(!this.#db.prepare("SELECT 1 FROM commerce_proposal_decisions WHERE tenant=? AND proposal_id=? AND proposal_revision=? AND decision='rejected'").get(tenant,id,revision))fail('revision_requires_rejection');
      // A correction must never be a shortcut around approved or uncertain payment work.
      if(this.#db.prepare('SELECT 1 FROM commerce_approvals WHERE tenant=? AND proposal_id=?').get(tenant,id)||this.#db.prepare('SELECT 1 FROM commerce_intents WHERE tenant=? AND proposal_id=?').get(tenant,id))fail('proposal_has_authority');
      const citations=typeof body==='string'?[...body.matchAll(/\[source:([^\]]+)\]/g)].map(match=>match[1]):[];
      if(citations.some(id=>!proposal.sources.some(ref=>ref.id===id))||proposal.sources.some(ref=>!citations.includes(ref.id)))fail('invalid_citations');
      if(title===proposal.title&&body===proposal.body)fail('revision_unchanged');
      const next=createProposal({...proposal,revision:randomUUID(),title,body},context.sources,context.now);
      this.#db.prepare('INSERT INTO commerce_proposals(tenant,id,revision,requester,digest,payload,parent_revision) VALUES (?,?,?,?,?,?,?)').run(tenant,id,next.revision,subject,next.digest,JSON.stringify(next),revision);
      return next;
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
      if(this.#db.prepare("SELECT 1 FROM commerce_proposal_decisions WHERE tenant=? AND proposal_id=? AND proposal_revision=? AND decision='rejected'").get(tenant,id,revision))fail('proposal_rejected');
      const approval=approveProposal(proposal,{
        id:randomUUID(),expectedDigest:review.expectedDigest,expiresAt:review.expiresAt,
        evidenceReviewed:review.evidenceReviewed,termsReviewed:review.termsReviewed,
        requester:this.#member(tenant,row.requester),reviewer,
      },this.#context(proposal));
      this.#db.prepare('INSERT INTO commerce_approvals(tenant,id,proposal_id,proposal_revision,payload) VALUES (?,?,?,?,?)').run(tenant,approval.id,id,revision,JSON.stringify(approval));
      this.#db.prepare("INSERT INTO commerce_proposal_decisions VALUES(?,?,?,'approved',?,'') ON CONFLICT(tenant,proposal_id,proposal_revision) DO NOTHING").run(tenant,id,revision,subject);
      return approval;
    });
  }
  rejectProposal(subject,tenant,id,revision,reason){
    return this.#transaction(()=>{
      this.#member(tenant,subject,['owner','admin']);const {row,proposal}=this.#proposal(tenant,id,revision);
      if(row.requester===subject)fail('reviewer_must_differ');
      if(Date.parse(proposal.expiresAt)<=this.#now())fail('not_found');
      if(typeof reason!=='string'||reason.trim().length<5||reason.length>1000)fail('review_reason_required');
      const prior=this.#db.prepare('SELECT decision FROM commerce_proposal_decisions WHERE tenant=? AND proposal_id=? AND proposal_revision=?').get(tenant,id,revision);
      if(prior?.decision==='approved'||this.#db.prepare('SELECT 1 FROM commerce_approvals WHERE tenant=? AND proposal_id=? AND proposal_revision=?').get(tenant,id,revision))fail('proposal_already_reviewed');
      this.#db.prepare("INSERT INTO commerce_proposal_decisions VALUES(?,?,?,'rejected',?,?) ON CONFLICT(tenant,proposal_id,proposal_revision) DO NOTHING").run(tenant,id,revision,subject,reason.trim());
      return {proposalId:id,revision,decision:'rejected'};
    });
  }
  beginIntent(subject, tenant, approvalId) {
    return this.#transaction(() => {
      const member=this.#member(tenant,subject);
      const row=this.#db.prepare('SELECT * FROM commerce_approvals WHERE tenant=? AND id=?').get(tenant,identifier(approvalId));
      if (!row) fail('not_found');
      const approval=parse(row);
      if(this.#db.prepare('SELECT 1 FROM commerce_revoked_approvals WHERE tenant=? AND approval_id=?').get(tenant,approvalId))fail('approval_revoked');
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
    return this.#intentView(result);
  }

  #intentView(intent) {
    // Provider facts stay available for reconciliation, but an expired buyer link does not.
    if(Date.parse(intent.expiresAt)<=this.#now())return {...intent,approvalUrl:null,executionExpired:true};
    return intent;
  }

  #intent(tenant,id) {
    const intent=parse(this.#db.prepare('SELECT payload FROM commerce_intents WHERE tenant=? AND id=?').get(tenant,identifier(id)));
    if (!intent) fail('not_found');
    return intent;
  }
  #saveIntent(intent) {
    this.#db.prepare('UPDATE commerce_intents SET payload=? WHERE tenant=? AND id=?').run(JSON.stringify(intent),intent.tenant,intent.id);
    return this.#intentView(structuredClone(intent));
  }
  #admit(intent) {
    if(this.#db.prepare('SELECT 1 FROM commerce_revoked_approvals WHERE tenant=? AND approval_id=?').get(intent.tenant,intent.approvalId))fail('approval_revoked');
    const approval=parse(this.#db.prepare('SELECT payload FROM commerce_approvals WHERE tenant=? AND id=?').get(intent.tenant,intent.approvalId));
    const {proposal}=this.#proposal(intent.tenant,intent.proposalId,intent.proposalRevision);
    if (!approval) fail('approval_mismatch');
    assertApprovalCurrent(proposal,approval,this.#context(proposal));
    this.#member(intent.tenant,approval.requester);this.#member(intent.tenant,approval.reviewer,['owner','admin']);
  }
  #eligible(intent) {
    try { this.#admit(intent); return true; } catch { return false; }
  }
  #actor(subject,intent) {
    const member=this.#member(intent.tenant,subject);
    const approval=parse(this.#db.prepare('SELECT payload FROM commerce_approvals WHERE tenant=? AND id=?').get(intent.tenant,intent.approvalId));
    if (!approval || (subject!==approval.requester && !['owner','admin'].includes(member.role))) fail('not_allowed');
  }

  /** Commit claim before external work. Explicit uncertain retries reuse the same operation id. */
  claimOperation(subject,tenant,intentId,kind,{retryUncertain=false}={}) {
    return this.#transaction(()=>{
      this.#member(tenant,subject);
      const intent=this.#intent(tenant,intentId);this.#actor(subject,intent);this.#admit(intent);
      if (!['create','capture'].includes(kind)) fail('invalid_operation');
      if (intent.captureId || intent.reviewRequired) fail('intent_not_executable');
      if (kind==='create' && intent.orderId) fail('order_already_created');
      if (kind==='capture' && !intent.orderId) fail('order_not_created');
      const id=kind==='create'?intent.createOperationId:intent.captureOperationId;
      const prior=this.#db.prepare('SELECT * FROM commerce_operations WHERE id=?').get(id),now=this.#now();
      if (prior) {
        if (prior.state==='succeeded') fail('operation_complete');
        if (prior.state==='running' && prior.lease_until>now) fail('operation_in_progress');
        if (!retryUncertain || now-prior.started_at>=6*60*60*1000) fail('reconciliation_required');
      }
      const claim=randomUUID();
      this.#db.prepare(`INSERT INTO commerce_operations VALUES (?,?,?,?,?,'running',?,?) ON CONFLICT(id) DO UPDATE SET claim=excluded.claim,state='running',lease_until=excluded.lease_until`).run(id,tenant,intentId,kind,claim,prior?.started_at??now,now+60_000);
      intent.state=kind==='create'?'creating_order':'capturing';this.#saveIntent(intent);
      return {intent:structuredClone(intent),operationId:id,claim};
    });
  }
  operationUncertain(operationId,claim) {
    this.#transaction(()=>{
      const op=this.#db.prepare('SELECT * FROM commerce_operations WHERE id=? AND claim=?').get(identifier(operationId),identifier(claim));
      if (!op || op.state==='succeeded') return;
      this.#db.prepare("UPDATE commerce_operations SET state='reconciling' WHERE id=? AND claim=?").run(operationId,claim);
      const intent=this.#intent(op.tenant,op.intent_id);
      if (!intent.captureId) {intent.state='reconciling';this.#saveIntent(intent);}
    });
  }
  #matchObservation(intent,observation) {
    if (!observation || observation.environment!=='sandbox' || observation.intentId!==intent.id || observation.merchantId!==intent.merchantId || observation.depositCents!==intent.depositCents) fail('payment_mismatch');
    identifier(observation.orderId);
    if (intent.orderId && observation.orderId!==intent.orderId) fail('payment_mismatch');
  }
  #applyObservation(intent,observation) {
    this.#matchObservation(intent,observation);
    if (!['CREATED','SAVED','APPROVED','VOIDED','COMPLETED','PAYER_ACTION_REQUIRED'].includes(observation.status)) fail('payment_mismatch');
    const mapped=this.#db.prepare('SELECT * FROM commerce_orders WHERE order_id=?').get(observation.orderId);
    if (mapped && (mapped.tenant!==intent.tenant || mapped.intent_id!==intent.id)) fail('payment_mismatch');
    this.#db.prepare('INSERT INTO commerce_orders VALUES (?,?,?,?) ON CONFLICT(order_id) DO NOTHING').run(observation.orderId,intent.tenant,intent.id,intent.merchantId);
    intent.orderId=observation.orderId;
    // Never let an old pending/approved observation undo a completed payment or a review hold.
    if (observation.capture) {
      const c=observation.capture;identifier(c.id);
      if (!['COMPLETED','PENDING','DECLINED','FAILED','REFUNDED','PARTIALLY_REFUNDED'].includes(c.status)) fail('payment_mismatch');
      if (c.status==='COMPLETED') {
        const existing=this.#db.prepare('SELECT * FROM commerce_captures WHERE capture_id=?').get(c.id);
        if (existing && (existing.tenant!==intent.tenant || existing.intent_id!==intent.id)) fail('payment_mismatch');
        if (intent.captureId && intent.captureId!==c.id) fail('payment_mismatch');
        this.#db.prepare('INSERT INTO commerce_captures VALUES (?,?,?,?) ON CONFLICT(capture_id) DO NOTHING').run(c.id,intent.tenant,intent.id,observation.orderId);
        intent.captureId=c.id;intent.paidAt??=new Date(this.#now()).toISOString();
        intent.reviewRequired=!!intent.reviewRequired||!this.#eligible(intent);
        intent.state=intent.reviewRequired?'paid_review_required':'paid';
        this.#db.prepare(`INSERT INTO commerce_kickoff_outbox VALUES (?,?,?) ON CONFLICT(tenant,intent_id) DO UPDATE SET state=CASE WHEN excluded.state='review_required' THEN 'review_required' ELSE commerce_kickoff_outbox.state END`).run(intent.tenant,intent.id,intent.reviewRequired?'review_required':'pending');
        if(intent.reviewRequired)this.#db.prepare("UPDATE commerce_projects SET payload=json_set(payload,'$.state','review_required') WHERE tenant=? AND intent_id=?").run(intent.tenant,intent.id);
      } else if (['REFUNDED','PARTIALLY_REFUNDED'].includes(c.status)) {
        intent.reviewRequired=true;intent.state='payment_review_required';
        this.#db.prepare("UPDATE commerce_kickoff_outbox SET state='review_required' WHERE tenant=? AND intent_id=?").run(intent.tenant,intent.id);
        this.#db.prepare("UPDATE commerce_projects SET payload=json_set(payload,'$.state','review_required') WHERE tenant=? AND intent_id=?").run(intent.tenant,intent.id);
      } else if (!intent.captureId && !intent.reviewRequired) intent.state=c.status==='PENDING'?'payment_pending':'payment_failed';
    } else if (!intent.captureId && !intent.reviewRequired) {
      intent.state=observation.status==='VOIDED'?'cancelled':observation.status==='APPROVED'?'buyer_approved':'awaiting_buyer';
      intent.approvalUrl=observation.approvalUrl??null;
    }
    return this.#saveIntent(intent);
  }
  completeOperation(operationId,claim,observation) {
    return this.#transaction(()=>{
      const op=this.#db.prepare('SELECT * FROM commerce_operations WHERE id=? AND claim=?').get(identifier(operationId),identifier(claim));
      if (!op || op.state!=='running') fail('operation_claim_lost');
      const intent=this.#applyObservation(this.#intent(op.tenant,op.intent_id),observation);
      this.#db.prepare("UPDATE commerce_operations SET state='succeeded' WHERE id=? AND claim=?").run(operationId,claim);
      return intent;
    });
  }
  reconcileOrder(subject,tenant,intentId,observation) {
    return this.#transaction(()=>{
      this.#member(tenant,subject);
      const intent=this.#intent(tenant,intentId);this.#actor(subject,intent);
      if (!intent.orderId) fail('order_not_created');
      return this.#applyObservation(intent,observation);
    });
  }

  /** PRIVILEGED: only call after provider verification of exactly these raw bytes. */
  acceptVerifiedWebhook(rawBody,verified) {
    if (typeof rawBody!=='string' || Buffer.byteLength(rawBody)>128_000 || verified?.environment!=='sandbox' || verified.payloadHash!==sha256(rawBody)) fail('invalid_webhook');
    let event;try {event=JSON.parse(rawBody);} catch {fail('invalid_webhook');}
    if (!event || event.id!==verified.eventId || event.event_type!==verified.eventType) fail('invalid_webhook');
    identifier(event.id);
    return this.#transaction(()=>{
      const prior=this.#db.prepare('SELECT * FROM commerce_payment_inbox WHERE event_id=?').get(event.id);
      if (prior) {
        if (prior.payload_hash!==verified.payloadHash) fail('event_identity_conflict');
        return {duplicate:true,disposition:prior.disposition};
      }
      let disposition='ignored';
      const r=event.resource,orderId=r?.supplementary_data?.related_ids?.order_id;
      const mapping=typeof orderId==='string'?this.#db.prepare('SELECT * FROM commerce_orders WHERE order_id=?').get(orderId):null;
      if (mapping && ['PAYMENT.CAPTURE.COMPLETED','PAYMENT.CAPTURE.PENDING','PAYMENT.CAPTURE.DENIED','PAYMENT.CAPTURE.REVERSED'].includes(event.event_type)) {
        const intent=this.#intent(mapping.tenant,mapping.intent_id);
        const status={'PAYMENT.CAPTURE.COMPLETED':'COMPLETED','PAYMENT.CAPTURE.PENDING':'PENDING','PAYMENT.CAPTURE.DENIED':'DECLINED','PAYMENT.CAPTURE.REVERSED':'REFUNDED'}[event.event_type];
        if (!r || r.payee?.merchant_id!==intent.merchantId || r.amount?.currency_code!=='USD' || r.amount?.value!==usdValue(intent.depositCents) || (status==='COMPLETED' && r.status!=='COMPLETED')) fail('payment_mismatch');
        this.#applyObservation(intent,{environment:'sandbox',intentId:intent.id,merchantId:intent.merchantId,depositCents:intent.depositCents,orderId,status:status==='COMPLETED'?'COMPLETED':'APPROVED',capture:{id:identifier(r.id),status},approvalUrl:null});
        disposition='processed';
      }
      this.#db.prepare('INSERT INTO commerce_payment_inbox (event_id,payload_hash,disposition,tenant) VALUES (?,?,?,?)').run(event.id,verified.payloadHash,disposition,mapping?.tenant??null);
      return {duplicate:false,disposition};
    });
  }
  deliverKickoff(subject,tenant,intentId) {
    return this.#transaction(()=>{
      this.#member(tenant,subject);
      const intent=this.#intent(tenant,intentId);this.#actor(subject,intent);
      const outbox=this.#db.prepare('SELECT state FROM commerce_kickoff_outbox WHERE tenant=? AND intent_id=?').get(tenant,intentId);
      if (!outbox || !intent.captureId || intent.reviewRequired || outbox.state==='review_required' || !this.#eligible(intent)) fail('kickoff_not_allowed');
      const prior=parse(this.#db.prepare('SELECT payload FROM commerce_projects WHERE tenant=? AND intent_id=?').get(tenant,intentId));
      if (prior) return prior;
      const {proposal}=this.#proposal(tenant,intent.proposalId,intent.proposalRevision);
      const project={id:randomUUID(),tenant,intentId,proposalId:proposal.id,proposalRevision:proposal.revision,proposalDigest:proposal.digest,title:proposal.title,state:'ready',createdAt:new Date(this.#now()).toISOString(),expiresAt:proposal.expiresAt,tasks:[{title:'Review kickoff scope and delivery milestones',state:'todo'}]};
      this.#db.prepare('INSERT INTO commerce_projects VALUES (?,?,?)').run(tenant,intentId,JSON.stringify(project));
      this.#db.prepare("UPDATE commerce_kickoff_outbox SET state='delivered' WHERE tenant=? AND intent_id=?").run(tenant,intentId);
      return project;
    });
  }

  /** PRIVILEGED operator maintenance. Never expose this as a session-authorized HTTP route.
   * Redacts application-held content after its active window plus seven recovery days.
   * Financial/auth records are explicitly outside this content purge; see LIFECYCLE.md.
   */
  purgeContent(tenant,{apply=false,batch=100}={}) {
    tenantId(tenant);
    if(typeof apply!=='boolean'||!Number.isSafeInteger(batch)||batch<1||batch>1000)fail('invalid_maintenance_options');
    return this.#transaction(()=>{
      if(!this.#db.prepare('SELECT 1 FROM commerce_workspaces WHERE tenant=?').get(tenant))fail('not_found');
      const now=this.#now(),cutoff=now-7*24*60*60*1000,purgedAt=new Date(now).toISOString();
      // Each table has its own batch so a large source backlog cannot starve proposal cleanup.
      const due=table=>this.#db.prepare(`SELECT rowid,* FROM ${table} WHERE tenant=? AND json_extract(payload,'$.purgedAt') IS NULL AND julianday(json_extract(payload,'$.expiresAt'))<=julianday(?) ORDER BY rowid LIMIT ?`).all(tenant,new Date(cutoff).toISOString(),batch);
      const sources=due('commerce_sources'),proposals=due('commerce_proposals'),projects=due('commerce_projects');
      const drafts=this.#db.prepare("SELECT rowid,* FROM commerce_draft_runs WHERE tenant=? AND started_at<=? AND payload<>'{}' ORDER BY rowid LIMIT ?").all(tenant,now-35*24*60*60*1000,batch);
      const links=this.#db.prepare("SELECT rowid,* FROM commerce_intents WHERE tenant=? AND json_extract(payload,'$.approvalUrl') IS NOT NULL AND julianday(json_extract(payload,'$.expiresAt'))<=julianday(?) ORDER BY rowid LIMIT ?").all(tenant,new Date(cutoff).toISOString(),batch);
      const counts={sources:sources.length,proposals:proposals.length,projects:projects.length,draftMetadata:drafts.length,buyerLinks:links.length};
      if(apply){
        const update=(table,row,value)=>this.#db.prepare(`UPDATE ${table} SET payload=? WHERE rowid=? AND tenant=?`).run(JSON.stringify(value),row.rowid,tenant);
        for(const row of sources){
          const v=parse(row);update('commerce_sources',row,{tenant,id:v.id,revision:v.revision,contentHash:v.contentHash,metadataHash:v.metadataHash,expiresAt:v.expiresAt,status:'withdrawn',reviewState:'quarantined',sensitivity:v.sensitivity,purgedAt});
        }
        for(const row of proposals){
          const v=parse(row);
          // Keep bounded hashes/ids/money needed to match financial facts; no scope/description text.
          const sources=v.sources.map(r=>({tenant:r.tenant,id:r.id,revision:r.revision,contentHash:r.contentHash,metadataHash:r.metadataHash,expiresAt:r.expiresAt}));
          update('commerce_proposals',row,{schema:v.schema,environment:v.environment,tenant,id:v.id,revision:v.revision,digest:v.digest,policyVersion:v.policyVersion,createdAt:v.createdAt,expiresAt:v.expiresAt,sources,terms:{currency:v.terms.currency,totalCents:v.terms.totalCents,depositCents:v.terms.depositCents,merchantId:v.terms.merchantId},purgedAt});
          this.#db.prepare("UPDATE commerce_proposal_decisions SET reason='' WHERE tenant=? AND proposal_id=? AND proposal_revision=?").run(tenant,v.id,v.revision);
          this.#db.prepare("UPDATE commerce_kickoff_outbox SET state='review_required' WHERE tenant=? AND intent_id IN (SELECT id FROM commerce_intents WHERE tenant=? AND proposal_id=? AND proposal_revision=?)").run(tenant,tenant,v.id,v.revision);
        }
        for(const row of projects){
          const v=parse(row);update('commerce_projects',row,{id:v.id,tenant,intentId:v.intentId,proposalId:v.proposalId,proposalRevision:v.proposalRevision,proposalDigest:v.proposalDigest,createdAt:v.createdAt,expiresAt:v.expiresAt,state:'review_required',purgedAt});
        }
        for(const row of drafts)update('commerce_draft_runs',row,{});
        for(const row of links){const v=parse(row);delete v.approvalUrl;update('commerce_intents',row,v);}
      }
      return {tenant,applied:apply,cutoff:new Date(cutoff).toISOString(),counts,batch,financialRecords:'retained_policy_pending',physicalCompaction:'not_performed'};
    });
  }

  /** PRIVILEGED offline backup. Never expose snapshots to an HTTP caller. */
  exportWorkspace(tenant) {
    tenantId(tenant);
    return this.#transaction(()=>exportWorkspaceSnapshot(this.#db,tenant,this.#now()));
  }
  /** Privileged restore into a configured, empty tenant; never overwrites a live ledger. */
  restoreWorkspace(tenant,snapshot,options={}) {
    tenantId(tenant);
    return this.#transaction(()=>restoreWorkspaceSnapshot(this.#db,tenant,snapshot,this.#now(),options));
  }

  /** Offline operator step after logical purge. Throws if active readers prevent WAL truncation. */
  compactContentStorage() {
    const checkpoint=this.#db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
    if(checkpoint.busy)fail('maintenance_busy');
    this.#db.exec('VACUUM');
    const after=this.#db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
    if(after.busy)fail('maintenance_busy');
    return {physicalCompaction:'completed',externalCopies:'outside_local_database_guarantee'};
  }

}
