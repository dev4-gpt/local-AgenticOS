/** Privileged, offline workspace recovery. No auth material, providers, network or file access. */
import {randomUUID} from 'node:crypto';
import {CommerceError,createProposal,sha256,usdValue} from './proposals.mjs';
const fail=code=>{throw new CommerceError(code);};
const DAY=86400000;
export const SNAPSHOT_MAX_BYTES=5_000_000;
export const SNAPSHOT_TABLES=Object.freeze({
  commerce_members:['tenant','subject','role','active'],
  commerce_sources:['tenant','id','payload'],
  commerce_proposals:['tenant','id','revision','requester','digest','payload'],
  commerce_approvals:['tenant','id','proposal_id','proposal_revision','consumed','payload'],
  commerce_intents:['tenant','id','approval_id','proposal_id','proposal_revision','create_operation_id','capture_operation_id','payload'],
  commerce_operations:['id','tenant','intent_id','kind','claim','state','started_at','lease_until'],
  commerce_orders:['order_id','tenant','intent_id','merchant_id'],
  commerce_captures:['capture_id','tenant','intent_id','order_id'],
  commerce_payment_inbox:['event_id','payload_hash','disposition','tenant'],
  commerce_kickoff_outbox:['tenant','intent_id','state'],
  commerce_projects:['tenant','intent_id','payload'],
  commerce_draft_runs:['id','tenant','subject','started_at','status','payload'],
  commerce_proposal_decisions:['tenant','proposal_id','proposal_revision','decision','subject','reason'],
  commerce_revoked_approvals:['tenant','approval_id','reason'],
});
const object=value=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('invalid_snapshot');
  return value;
};
const exact=(value,keys)=>{
  object(value);if(Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))fail('invalid_snapshot');
};
const id=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value))fail('invalid_snapshot');return value;};
const hash=value=>{if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail('invalid_snapshot');return value;};
const date=value=>{
  const parsed=typeof value==='string'?Date.parse(value):NaN;
  if(!Number.isSafeInteger(parsed)||parsed<0||new Date(parsed).toISOString()!==value)fail('invalid_snapshot');return parsed;
};
const json=row=>{try{return object(JSON.parse(row.payload));}catch{fail('invalid_snapshot');}};
function lifetime(payload,exportedAt,now,{content=false}={}){
  const created=date(payload.createdAt),expiry=date(payload.expiresAt);
  if(created>exportedAt||expiry<=created||expiry-created>28*DAY)fail('invalid_snapshot_clock');
  if(content&&expiry<=now)fail('restore_content_expired');
}
function sourceShell(source,at){
  return {tenant:source.tenant,id:source.id,revision:source.revision,contentHash:source.contentHash,metadataHash:source.metadataHash,expiresAt:source.expiresAt,status:'withdrawn',reviewState:'quarantined',sensitivity:source.sensitivity,purgedAt:source.purgedAt??at};
}
function proposalShell(p,at){
  return {schema:p.schema,environment:p.environment,tenant:p.tenant,id:p.id,revision:p.revision,digest:p.digest,policyVersion:p.policyVersion,createdAt:p.createdAt,expiresAt:p.expiresAt,sources:p.sources,terms:{currency:p.terms.currency,totalCents:p.terms.totalCents,depositCents:p.terms.depositCents,merchantId:p.terms.merchantId},purgedAt:p.purgedAt??at};
}
function projectShell(p,at){
  return {id:p.id,tenant:p.tenant,intentId:p.intentId,proposalId:p.proposalId,proposalRevision:p.proposalRevision,proposalDigest:p.proposalDigest,createdAt:p.createdAt,expiresAt:p.expiresAt,state:'review_required',purgedAt:p.purgedAt??at};
}

/** A digest detects corruption and binds the operator preview; it is not a backup signature. */
export function validateWorkspaceSnapshot(snapshot,tenant,now){
  if(!Number.isSafeInteger(now)||now<0)fail('invalid_time');
  exact(snapshot,['schema','workspace','exportedAt','tables']);
  if(snapshot.schema!==1)fail('unsupported_snapshot');
  exact(snapshot.workspace,['tenant','policy_version','merchant_id']);
  if(snapshot.workspace.tenant!==tenant||typeof tenant!=='string'||!/^[a-z][a-z0-9-]{2,40}$/.test(tenant))fail('snapshot_tenant_mismatch');
  id(snapshot.workspace.policy_version);id(snapshot.workspace.merchant_id);
  const exportedAt=date(snapshot.exportedAt);if(exportedAt>now)fail('invalid_snapshot_clock');
  if(Buffer.byteLength(JSON.stringify(snapshot))>SNAPSHOT_MAX_BYTES)fail('snapshot_too_large');
  exact(snapshot.tables,Object.keys(SNAPSHOT_TABLES));
  for(const [table,columns] of Object.entries(SNAPSHOT_TABLES)){
    const rows=snapshot.tables[table];if(!Array.isArray(rows)||rows.length>5000)fail('snapshot_too_large');
    for(const row of rows){
      exact(row,columns);if(row.tenant!==tenant)fail('snapshot_tenant_mismatch');
      for(const [field,value] of Object.entries(row)){
        if(field==='payload'){if(typeof value!=='string'||value.length>250_000)fail('invalid_snapshot');const p=json(row);if(p.tenant!==undefined&&p.tenant!==tenant)fail('snapshot_tenant_mismatch');}
        else if(['active','consumed'].includes(field)){if(![0,1].includes(value))fail('invalid_snapshot');}
        else if(['started_at','lease_until'].includes(field)){if(!Number.isSafeInteger(value)||value<0)fail('invalid_snapshot');}
        else if(['reason','payload_hash','digest'].includes(field)){if(typeof value!=='string'||value.length>1000)fail('invalid_snapshot');}
        else if(field!=='tenant')id(value);
      }
    }
  }
  const t=snapshot.tables;
  const members=new Map(t.commerce_members.map(r=>[r.subject,r]));
  const sources=new Map(t.commerce_sources.map(r=>[r.id,json(r)]));
  const proposals=new Map(t.commerce_proposals.map(r=>[`${r.id}:${r.revision}`,json(r)]));
  const approvals=new Map(t.commerce_approvals.map(r=>[r.id,json(r)]));
  const intents=new Map(t.commerce_intents.map(r=>[r.id,json(r)]));
  const orders=new Map(t.commerce_orders.map(r=>[r.order_id,r]));
  for(const r of t.commerce_sources){
    const s=json(r);if(s.id!==r.id||s.tenant!==tenant)fail('invalid_snapshot_graph');id(s.revision);hash(s.contentHash);hash(s.metadataHash);date(s.expiresAt);
    if(!['active','withdrawn'].includes(s.status)||!['approved','quarantined'].includes(s.reviewState)||!['ordinary','unknown','sensitive','restricted'].includes(s.sensitivity))fail('invalid_snapshot');
    if(s.purgedAt){date(s.purgedAt);if(Object.hasOwn(s,'content')||Object.hasOwn(s,'title'))fail('invalid_snapshot');}
    else {
      lifetime(s,exportedAt,now,{content:true});
      if(s.status!=='active'||typeof s.content!=='string'||!s.content.trim()||s.content.length>200_000||sha256(s.content)!==s.contentHash)fail('invalid_snapshot');
      if(!members.has(s.submittedBy))fail('invalid_snapshot_graph');
    }
  }
  for(const r of t.commerce_proposals){
    const p=json(r);if(p.tenant!==tenant||p.id!==r.id||p.revision!==r.revision||p.digest!==r.digest||!members.has(r.requester))fail('invalid_snapshot_graph');
    hash(p.digest);id(p.policyVersion);lifetime(p,exportedAt,now,{content:!p.purgedAt});
    if(p.schema!==1||p.environment!=='sandbox'||!Array.isArray(p.sources)||!p.sources.length||p.sources.length>20)fail('invalid_snapshot');
    if(p.terms?.currency!=='USD')fail('invalid_snapshot');usdValue(p.terms.depositCents);usdValue(p.terms.totalCents);id(p.terms.merchantId);
    if(p.terms.depositCents>p.terms.totalCents)fail('invalid_snapshot');
    for(const ref of p.sources){
      exact(ref,['tenant','id','revision','contentHash','metadataHash','expiresAt']);id(ref.id);id(ref.revision);hash(ref.contentHash);hash(ref.metadataHash);date(ref.expiresAt);
      if(ref.tenant!==tenant||!sources.has(ref.id)||date(ref.expiresAt)<date(p.expiresAt))fail('invalid_snapshot_graph');
    }
    if(!p.purgedAt){
      const originalSources=p.sources.map(ref=>({...ref,status:'active',reviewState:'approved',sensitivity:'ordinary'}));
      if(createProposal(p,originalSources,now).digest!==p.digest)fail('invalid_snapshot');
    }else if(Object.hasOwn(p,'body')||Object.hasOwn(p,'title')||Object.hasOwn(p.terms,'description'))fail('invalid_snapshot');
  }
  for(const r of t.commerce_approvals){
    const a=json(r);exact(a,['schema','id','tenant','proposalId','proposalRevision','proposalDigest','requester','reviewer','approvedAt','expiresAt','environment','policyVersion']);
    const p=proposals.get(`${r.proposal_id}:${r.proposal_revision}`);
    if(!p||a.tenant!==tenant||a.id!==r.id||a.proposalId!==p.id||a.proposalRevision!==p.revision||a.proposalDigest!==p.digest||a.environment!=='sandbox'||!members.has(a.requester)||!members.has(a.reviewer)||a.requester===a.reviewer)fail('invalid_snapshot_graph');
    date(a.approvedAt);if(date(a.expiresAt)>date(p.expiresAt)||date(a.expiresAt)<=date(a.approvedAt))fail('invalid_snapshot_clock');
  }
  for(const r of t.commerce_intents){
    const i=json(r),a=approvals.get(r.approval_id),p=proposals.get(`${r.proposal_id}:${r.proposal_revision}`);
    if(!a||!p||i.id!==r.id||i.tenant!==tenant||i.approvalId!==a.id||i.proposalId!==p.id||i.proposalRevision!==p.revision||a.proposalId!==p.id||a.proposalRevision!==p.revision||i.proposalDigest!==p.digest||i.environment!=='sandbox'||i.merchantId!==p.terms.merchantId||i.depositCents!==p.terms.depositCents||i.createOperationId!==r.create_operation_id||i.captureOperationId!==r.capture_operation_id||i.expiresAt!==a.expiresAt)fail('invalid_snapshot_graph');
    id(i.id);id(i.createOperationId);id(i.captureOperationId);date(i.createdAt);date(i.expiresAt);
    if(i.orderId&&!orders.has(i.orderId))fail('invalid_snapshot_graph');
    if(i.captureId&&!t.commerce_captures.some(c=>c.capture_id===i.captureId&&c.intent_id===i.id))fail('invalid_snapshot_graph');
  }
  for(const r of t.commerce_operations){const i=intents.get(r.intent_id);if(!i||!['create','capture'].includes(r.kind)||r.id!==(r.kind==='create'?i.createOperationId:i.captureOperationId)||!['running','reconciling','succeeded'].includes(r.state))fail('invalid_snapshot_graph');}
  for(const r of t.commerce_orders){const i=intents.get(r.intent_id);if(!i||i.orderId!==r.order_id||i.merchantId!==r.merchant_id)fail('invalid_snapshot_graph');}
  for(const r of t.commerce_captures){const i=intents.get(r.intent_id),o=orders.get(r.order_id);if(!i||!o||o.intent_id!==i.id||i.captureId!==r.capture_id||i.orderId!==r.order_id)fail('invalid_snapshot_graph');}
  for(const r of t.commerce_payment_inbox){hash(r.payload_hash);if(!['processed','ignored'].includes(r.disposition))fail('invalid_snapshot');}
  for(const r of t.commerce_kickoff_outbox){if(!intents.has(r.intent_id)||!['pending','delivered','review_required'].includes(r.state))fail('invalid_snapshot_graph');}
  for(const r of t.commerce_projects){
    const p=json(r),i=intents.get(r.intent_id);
    if(!i?.captureId||p.intentId!==i.id||p.tenant!==tenant||p.proposalId!==i.proposalId||p.proposalRevision!==i.proposalRevision||p.proposalDigest!==i.proposalDigest||!t.commerce_kickoff_outbox.some(o=>o.intent_id===i.id))fail('invalid_snapshot_graph');
    const proposal=proposals.get(`${p.proposalId}:${p.proposalRevision}`);
    if(!proposal||p.expiresAt!==proposal.expiresAt)fail('invalid_snapshot_clock');
    id(p.id);lifetime(p,exportedAt,now,{content:!p.purgedAt});
    if(p.purgedAt&&(Object.hasOwn(p,'title')||Object.hasOwn(p,'tasks')))fail('invalid_snapshot');
  }
  for(const r of t.commerce_draft_runs){if(!members.has(r.subject)||!['running','succeeded','failed'].includes(r.status)||r.started_at>exportedAt)fail('invalid_snapshot_graph');}
  for(const r of t.commerce_proposal_decisions){if(!proposals.has(`${r.proposal_id}:${r.proposal_revision}`)||!members.has(r.subject)||!['approved','rejected'].includes(r.decision))fail('invalid_snapshot_graph');}
  for(const r of t.commerce_revoked_approvals){if(!approvals.has(r.approval_id)||r.reason!=='workspace_restore')fail('invalid_snapshot_graph');}
  return {digest:sha256(JSON.stringify(snapshot)),counts:Object.fromEntries(Object.entries(t).map(([table,rows])=>[table,rows.length]))};
}

/** Called inside the store transaction. No partial export or silent row truncation. */
export function exportWorkspaceSnapshot(db,tenant,now){
  const workspace=db.prepare('SELECT * FROM commerce_workspaces WHERE tenant=?').get(tenant);if(!workspace)fail('not_found');
  // Older processed inbox rows cannot safely be assigned to a tenant by guessing.
  if(db.prepare("SELECT 1 FROM commerce_payment_inbox WHERE tenant IS NULL AND disposition='processed' LIMIT 1").get())fail('legacy_webhook_tenant_unavailable');
  const tables={};
  for(const [table,columns] of Object.entries(SNAPSHOT_TABLES)){
    const rows=db.prepare(`SELECT ${columns.join(',')} FROM ${table} WHERE tenant=? ORDER BY rowid LIMIT 5001`).all(tenant);
    if(rows.length>5000)fail('snapshot_too_large');tables[table]=rows.map(row=>({...row}));
  }
  const at=new Date(now).toISOString();
  for(const row of tables.commerce_sources){const s=json(row);if(s.status==='withdrawn'||s.purgedAt||date(s.expiresAt)<=now)row.payload=JSON.stringify(sourceShell(s,at));}
  for(const row of tables.commerce_proposals){const p=json(row);if(p.purgedAt||date(p.expiresAt)<=now)row.payload=JSON.stringify(proposalShell(p,at));}
  for(const row of tables.commerce_projects){const p=json(row);if(p.purgedAt||date(p.expiresAt)<=now)row.payload=JSON.stringify(projectShell(p,at));}
  for(const row of tables.commerce_proposal_decisions){const p=tables.commerce_proposals.find(p=>p.id===row.proposal_id&&p.revision===row.proposal_revision);if(json(p).purgedAt)row.reason='';}
  for(const row of tables.commerce_draft_runs)if(row.started_at+35*DAY<=now)row.payload='{}';
  for(const row of tables.commerce_intents){const i=json(row);delete i.approvalUrl;row.payload=JSON.stringify(i);}
  const snapshot={schema:1,workspace:{...workspace},exportedAt:at,tables};
  validateWorkspaceSnapshot(snapshot,tenant,now);return snapshot;
}

/** Called inside the store transaction. Existing data is never rolled back to a backup. */
export function restoreWorkspaceSnapshot(db,tenant,snapshot,now,{apply=false,expectedDigest}={}){
  if(typeof apply!=='boolean')fail('invalid_maintenance_options');
  const report=validateWorkspaceSnapshot(snapshot,tenant,now);
  if(apply&&expectedDigest!==report.digest)fail('snapshot_digest_mismatch');
  const workspace=db.prepare('SELECT * FROM commerce_workspaces WHERE tenant=?').get(tenant);if(!workspace)fail('not_found');
  if(workspace.policy_version!==snapshot.workspace.policy_version||workspace.merchant_id!==snapshot.workspace.merchant_id)fail('snapshot_workspace_mismatch');
  for(const table of [...Object.keys(SNAPSHOT_TABLES),'commerce_workspace_restores'])if(db.prepare(`SELECT 1 FROM ${table} WHERE tenant=? LIMIT 1`).get(tenant))fail('restore_target_not_empty');
  if(apply){
    for(const [table,columns] of Object.entries(SNAPSHOT_TABLES)){
      if(table==='commerce_revoked_approvals')continue; // Every restored approval is revoked, regardless of its old state.
      const insert=db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`);
      for(const original of snapshot.tables[table]){
        const row={...original};
        if(table==='commerce_members')row.active=0;
        if(table==='commerce_sources'){
          const s=json(row);if(!s.purgedAt){s.revision=randomUUID();s.reviewState='quarantined';s.sensitivity='unknown';delete s.reviewedBy;}row.payload=JSON.stringify(s);
        }
        if(table==='commerce_approvals')row.consumed=1;
        if(table==='commerce_intents'){const i=json(row);i.reviewRequired=true;i.state=i.captureId?'paid_review_required':'evidence_review_required';delete i.approvalUrl;row.payload=JSON.stringify(i);}
        if(table==='commerce_operations'){row.state='reconciling';row.lease_until=0;row.claim=randomUUID();}
        if(table==='commerce_kickoff_outbox')row.state='review_required';
        if(table==='commerce_projects'){const p=json(row);p.state='review_required';row.payload=JSON.stringify(p);}
        if(table==='commerce_draft_runs'&&row.status==='running')row.status='failed';
        insert.run(...columns.map(column=>row[column]));
      }
    }
    const revoke=db.prepare("INSERT INTO commerce_revoked_approvals VALUES (?,?,'workspace_restore')");
    for(const row of snapshot.tables.commerce_approvals)revoke.run(tenant,row.id);
    db.prepare('INSERT INTO commerce_workspace_restores VALUES (?,?,?)').run(tenant,report.digest,new Date(now).toISOString());
  }
  return {tenant,applied:apply,snapshotDigest:report.digest,counts:report.counts,members:'disabled',sources:'quarantined_with_original_expiry',approvals:'revoked',payments:'reconcile_only',projects:'review_required',authentication:'not_imported'};
}
