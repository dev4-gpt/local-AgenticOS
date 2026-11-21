import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CommerceStore} from '../src/store.mjs';
import {sha256} from '../src/proposals.mjs';
const start=Date.parse('2026-10-26T12:00:00.000Z'),DAY=86400000;
const iso=t=>new Date(t).toISOString();
function fixture(){
 let now=start;
 const origin=new CommerceStore(':memory:',{clock:()=>now}),target=new CommerceStore(':memory:',{clock:()=>now});
 for(const store of [origin,target])store.configureWorkspace({tenant:'owner-dev',policyVersion:'v1',merchantId:'merchant-test'});
 origin.setMember({tenant:'owner-dev',subject:'writer',role:'member'});origin.setMember({tenant:'owner-dev',subject:'reviewer',role:'owner'});
 const source=origin.submitSource('writer','owner-dev',{title:'Fictional brief',content:'Build one service page.'});
 const reviewed=origin.reviewSource('reviewer','owner-dev',source.id,{sensitivity:'ordinary'});
 const proposal=origin.saveProposal('writer',{schema:1,environment:'sandbox',tenant:'owner-dev',id:'proposal',revision:'v1',title:'Service page',body:'One service page.',policyVersion:'v1',sources:[reviewed],terms:{currency:'USD',depositCents:10000,totalCents:20000,merchantId:'merchant-test',description:'Fictional deposit'},createdAt:iso(start),expiresAt:iso(start+3*DAY)});
 const approval=origin.reviewProposal('reviewer','owner-dev',proposal.id,'v1',{expectedDigest:proposal.digest,evidenceReviewed:true,termsReviewed:true,expiresAt:iso(start+DAY)});
 const intent=origin.beginIntent('writer','owner-dev',approval.id);
 return {origin,target,source:reviewed,proposal,approval,intent,setTime:t=>now=t,close(){origin.close();target.close();}};
}
function apply(f,snapshot=f.origin.exportWorkspace('owner-dev')){
 const preview=f.target.restoreWorkspace('owner-dev',snapshot);
 return f.target.restoreWorkspace('owner-dev',snapshot,{apply:true,expectedDigest:preview.snapshotDigest});
}
const rejects=(fn,code)=>assert.throws(fn,e=>e.code===code);
test('restore previews, preserves original dates, disables members and permanently revokes old approval',()=>{
 const f=fixture();try{
  const snapshot=f.origin.exportWorkspace('owner-dev'),preview=f.target.restoreWorkspace('owner-dev',snapshot);
  assert.equal(preview.applied,false);rejects(()=>f.target.workspace('writer','owner-dev'),'not_allowed');
  rejects(()=>f.target.restoreWorkspace('owner-dev',snapshot,{apply:true,expectedDigest:'wrong'}),'snapshot_digest_mismatch');
  apply(f,snapshot);rejects(()=>f.target.workspace('writer','owner-dev'),'not_allowed');
  for(const [subject,role] of [['writer','member'],['reviewer','owner']])f.target.setMember({tenant:'owner-dev',subject,role});
  const state=f.target.workspace('writer','owner-dev');assert.equal(state.sources[0].expiresAt,f.source.expiresAt);assert.equal(state.sources[0].reviewState,'quarantined');
  assert.notEqual(state.sources[0].revision,f.source.revision);assert.equal(state.proposals[0].expiresAt,f.proposal.expiresAt);
  rejects(()=>f.target.beginIntent('writer','owner-dev',f.approval.id),'approval_revoked');
  rejects(()=>f.target.claimOperation('writer','owner-dev',f.intent.id,'create'),'approval_revoked');
  rejects(()=>f.target.restoreWorkspace('owner-dev',snapshot),'restore_target_not_empty');
  assert.equal(state.intents[0].reviewRequired,true);
 }finally{f.close();}
});
test('restore rejects mixed tenants, broken graph, changed content and expired active content',()=>{
 const f=fixture();try{
  const snapshot=f.origin.exportWorkspace('owner-dev');
  for(const change of [
   s=>s.tables.commerce_members[0].tenant='other-dev',
   s=>s.tables.commerce_sources.splice(0,1),
   s=>{const p=JSON.parse(s.tables.commerce_proposals[0].payload);p.body='Changed scope';s.tables.commerce_proposals[0].payload=JSON.stringify(p);},
   s=>s.tables.commerce_intents[0].approval_id='missing',
  ]){const bad=structuredClone(snapshot);change(bad);assert.throws(()=>f.target.restoreWorkspace('owner-dev',bad));}
  f.setTime(start+4*DAY);rejects(()=>f.target.restoreWorkspace('owner-dev',snapshot),'restore_content_expired');
  const fresh=f.origin.exportWorkspace('owner-dev');assert.equal(JSON.parse(fresh.tables.commerce_proposals[0].payload).body,undefined);
  apply(f,fresh);
 }finally{f.close();}
});
test('duplicate-row failure rolls back all restore changes and leaves target usable for corrected restore',()=>{
 const f=fixture();try{
  const bad=f.origin.exportWorkspace('owner-dev');bad.tables.commerce_sources.push({...bad.tables.commerce_sources[0]});
  const digest=sha256(JSON.stringify(bad));assert.throws(()=>f.target.restoreWorkspace('owner-dev',bad,{apply:true,expectedDigest:digest}));
  assert.equal(f.target.exportWorkspace('owner-dev').tables.commerce_members.length,0);
  apply(f);
 }finally{f.close();}
});
test('paid restore retains capture/inbox identity, blocks kickoff and allows verified reconciliation',()=>{
 const f=fixture();try{
  const c=f.origin.claimOperation('writer','owner-dev',f.intent.id,'create');
  const observation={environment:'sandbox',intentId:f.intent.id,merchantId:'merchant-test',depositCents:10000,orderId:'order-test',status:'CREATED'};
  f.origin.completeOperation(c.operationId,c.claim,observation);
  const event={id:'event-test',event_type:'PAYMENT.CAPTURE.COMPLETED',resource:{id:'capture-test',status:'COMPLETED',final_capture:true,payee:{merchant_id:'merchant-test'},amount:{currency_code:'USD',value:'100.00'},supplementary_data:{related_ids:{order_id:'order-test'}}}};
  const raw=JSON.stringify(event),verified={environment:'sandbox',eventId:event.id,eventType:event.event_type,payloadHash:sha256(raw)};
  f.origin.acceptVerifiedWebhook(raw,verified);const project=f.origin.deliverKickoff('writer','owner-dev',f.intent.id);
  const snapshot=f.origin.exportWorkspace('owner-dev');assert.equal(snapshot.tables.commerce_payment_inbox[0].tenant,'owner-dev');
  apply(f,snapshot);f.target.setMember({tenant:'owner-dev',subject:'writer',role:'member'});
  assert.equal(f.target.acceptVerifiedWebhook(raw,verified).duplicate,true);
  const i=f.target.reconcileOrder('writer','owner-dev',f.intent.id,{...observation,status:'COMPLETED',capture:{id:'capture-test',status:'COMPLETED'}});
  assert.equal(i.captureId,'capture-test');assert.equal(i.state,'paid_review_required');
  rejects(()=>f.target.deliverKickoff('writer','owner-dev',i.id),'kickoff_not_allowed');
  assert.equal(f.target.workspace('writer','owner-dev').projects[0].id,project.id);
  assert.equal(f.target.workspace('writer','owner-dev').projects[0].state,'review_required');
 }finally{f.close();}
});

test('private snapshot files refuse overwrite, loose permissions, symlinks and invalid JSON',async()=>{
 const {mkdtempSync,rmSync,chmodSync,symlinkSync,writeFileSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {writePrivateSnapshot,readPrivateSnapshot}=await import('../src/snapshot-files.mjs');
 const dir=mkdtempSync(join(tmpdir(),'commerce-recovery-file-')),path=join(dir,'backup.json'),f=fixture();
 try{
  const snapshot=f.origin.exportWorkspace('owner-dev'),written=writePrivateSnapshot(path,snapshot);
  assert.deepEqual(readPrivateSnapshot(path),snapshot);assert.equal(written.snapshotDigest,sha256(JSON.stringify(snapshot)));
  assert.throws(()=>writePrivateSnapshot(path,snapshot));
  chmodSync(path,0o644);rejects(()=>readPrivateSnapshot(path),'snapshot_file_not_private');chmodSync(path,0o600);
  symlinkSync(path,join(dir,'link'));assert.throws(()=>readPrivateSnapshot(join(dir,'link')));
  writeFileSync(path,'invalid');rejects(()=>readPrivateSnapshot(path),'invalid_snapshot');
  chmodSync(dir,0o755);rejects(()=>writePrivateSnapshot(join(dir,'other.json'),snapshot),'snapshot_directory_not_private');
 }finally{f.close();rmSync(dir,{recursive:true,force:true});}
});
test('new mapped events export by tenant; unattributed legacy processed events fail closed',async()=>{
 const {DatabaseSync}=await import('node:sqlite');
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=mkdtempSync(join(tmpdir(),'commerce-legacy-inbox-')),path=join(dir,'legacy.sqlite');
 const old=new DatabaseSync(path);old.exec('CREATE TABLE commerce_payment_inbox (event_id TEXT PRIMARY KEY,payload_hash TEXT NOT NULL,disposition TEXT NOT NULL) STRICT;');
 old.prepare('INSERT INTO commerce_payment_inbox VALUES (?,?,?)').run('legacy-event',sha256('fixture'),'processed');old.close();
 const store=new CommerceStore(path);try{
  store.configureWorkspace({tenant:'owner-dev',policyVersion:'v1',merchantId:'merchant-test'});
  rejects(()=>store.exportWorkspace('owner-dev'),'legacy_webhook_tenant_unavailable');
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('CLI export/preview/apply uses private files and omits user/session credentials',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {spawnSync}=await import('node:child_process');
 const root=mkdtempSync(join(tmpdir(),'commerce-recovery-cli-')),original=join(root,'source'),target=join(root,'target'),file=join(root,'snapshot.json');
 const run=(dir,args)=>spawnSync(process.execPath,[new URL('../src/cli.mjs',import.meta.url).pathname,...args,'--data-dir',dir,'--tenant','owner-dev'],{encoding:'utf8',env:{PATH:process.env.PATH},timeout:10000});
 try{
  for(const dir of [original,target]){const result=run(dir,['init','--merchant','merchant-test']);assert.equal(result.status,0,result.stderr);}
  const output=run(original,['export','--output',file]);assert.equal(output.status,0,output.stderr);
  const preview=run(target,['restore','--input',file]);assert.equal(preview.status,0,preview.stderr);const report=JSON.parse(preview.stdout);
  const applied=run(target,['restore','--input',file,'--apply','--expected-digest',report.snapshotDigest]);assert.equal(applied.status,0,applied.stderr);assert.equal(JSON.parse(applied.stdout).authentication,'not_imported');
  assert.equal(run(target,['restore','--input',file]).status,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('revision lineage survives protected restore and malformed parent links are refused; schema-one snapshots remain readable',()=>{
 const f=fixture();try{
  // This fixture already has an approval; use a separate source-only proposal for correction.
  const proposal=f.origin.saveProposal('writer',{...f.proposal,id:'correctable',body:`Original scope [source:${f.source.id}]`});
  f.origin.rejectProposal('reviewer','owner-dev',proposal.id,proposal.revision,'Correct the scope.');
  const next=f.origin.reviseProposal('writer','owner-dev',proposal.id,proposal.revision,{expectedDigest:proposal.digest,title:'Corrected',body:`Corrected scope [source:${f.source.id}]`});
  const snapshot=f.origin.exportWorkspace('owner-dev');assert.equal(snapshot.schema,2);
  const bad=structuredClone(snapshot);bad.tables.commerce_proposals.find(r=>r.revision===next.revision).parent_revision='missing';
  rejects(()=>f.target.restoreWorkspace('owner-dev',bad),'invalid_snapshot_graph');
  apply(f,snapshot);f.target.setMember({tenant:'owner-dev',subject:'writer',role:'member'});
  assert.equal(f.target.workspace('writer','owner-dev').proposals.find(p=>p.revision===next.revision).parentRevision,proposal.revision);
 }finally{f.close();}
 const g=fixture();try{
  const legacy=g.origin.exportWorkspace('owner-dev');legacy.schema=1;
  for(const row of legacy.tables.commerce_proposals)delete row.parent_revision;
  apply(g,legacy);
 }finally{g.close();}
});
