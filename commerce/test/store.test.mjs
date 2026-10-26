import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommerceStore } from '../src/store.mjs';
import { sha256 } from '../src/proposals.mjs';
const now=Date.parse('2026-10-26T12:00:00.000Z');
function setup(path=':memory:') {
  const store=new CommerceStore(path,{clock:()=>now});
  store.configureWorkspace({tenant:'owner-dev',policyVersion:'v1',merchantId:'merchant-test'});
  store.setMember({tenant:'owner-dev',subject:'writer',role:'member'});
  store.setMember({tenant:'owner-dev',subject:'reviewer',role:'admin'});
  store.setMember({tenant:'owner-dev',subject:'other-member',role:'member'});
  const source={tenant:'owner-dev',id:'rates',revision:'v1',content:'Test-only service terms.',contentHash:sha256('Test-only service terms.'),metadataHash:sha256('metadata'),expiresAt:'2026-11-20T12:00:00.000Z',status:'active',reviewState:'approved',sensitivity:'ordinary'};
  store.putSource(source);
  const proposal=store.saveProposal('writer',{
    schema:1,environment:'sandbox',tenant:'owner-dev',id:'proposal-1',revision:'v1',title:'Test scope',body:'Bounded test scope [source:rates]',policyVersion:'v1',sources:[source],
    terms:{currency:'USD',depositCents:10000,totalCents:50000,merchantId:'merchant-test',description:'Test-only deposit'},createdAt:'2026-10-26T12:00:00.000Z',expiresAt:'2026-11-02T12:00:00.000Z',
  });
  const review={expectedDigest:proposal.digest,evidenceReviewed:true,termsReviewed:true,expiresAt:'2026-10-27T12:00:00.000Z'};
  return {store,source,proposal,review};
}
const rejects=(fn,code)=>assert.throws(fn,e=>e.code===code);

test('approval consumption and intent with stable operation ids survive restart and retry',()=>{
  const dir=mkdtempSync(join(tmpdir(),'veloce-commerce-')),path=join(dir,'test.sqlite');
  let store;
  try {
    const f=setup(path);store=f.store;
    const approval=store.reviewProposal('reviewer','owner-dev',f.proposal.id,'v1',f.review);
    const first=store.beginIntent('writer','owner-dev',approval.id);
    assert.notEqual(first.createOperationId,first.captureOperationId);assert.equal(first.environment,'sandbox');
    store.close();store=new CommerceStore(path,{clock:()=>now});
    assert.deepEqual(store.beginIntent('writer','owner-dev',approval.id),first);
    assert.deepEqual(store.readIntent('writer','owner-dev',first.id),first);
    const second=new CommerceStore(path,{clock:()=>now});
    try {assert.deepEqual(second.beginIntent('writer','owner-dev',approval.id),first);} finally {second.close();}
  } finally {store?.close();rmSync(dir,{recursive:true,force:true});}
});
test('a second approval of one revision cannot create a second payment intent',()=>{
  const {store,proposal,review}=setup();
  try {
    const a=store.reviewProposal('reviewer','owner-dev',proposal.id,'v1',review);
    const b=store.reviewProposal('reviewer','owner-dev',proposal.id,'v1',review);
    store.beginIntent('writer','owner-dev',a.id);
    rejects(()=>store.beginIntent('writer','owner-dev',b.id),'proposal_already_has_intent');
  } finally {store.close();}
});
test('review identity comes from stored membership, not caller-supplied requester/reviewer fields',()=>{
  const {store,proposal,review}=setup();
  try {
    rejects(()=>store.reviewProposal('writer','owner-dev',proposal.id,'v1',{...review,reviewer:{role:'owner'}}),'not_allowed');
    store.setMember({tenant:'owner-dev',subject:'writer',role:'owner'});
    rejects(()=>store.reviewProposal('writer','owner-dev',proposal.id,'v1',review),'reviewer_must_differ');
  } finally {store.close();}
});
test('stored approval cannot be forged or used by an unrelated member',()=>{
  const {store,proposal,review}=setup();
  try {
    rejects(()=>store.beginIntent('writer','owner-dev','fabricated-approval'),'not_found');
    const a=store.reviewProposal('reviewer','owner-dev',proposal.id,'v1',review);
    rejects(()=>store.beginIntent('other-member','owner-dev',a.id),'not_allowed');
    assert.ok(store.beginIntent('writer','owner-dev',a.id).id);
  } finally {store.close();}
});
test('source withdrawal after review blocks intent admission even without invalidation feed',()=>{
  const {store,source,proposal,review}=setup();
  try {
    const a=store.reviewProposal('reviewer','owner-dev',proposal.id,'v1',review);
    store.putSource({...source,status:'withdrawn'});
    rejects(()=>store.beginIntent('writer','owner-dev',a.id),'source_not_available');
  } finally {store.close();}
});
test('source mutation, revoked reviewer, changed merchant and changed policy block admission',()=>{
  for(const change of [
    f=>f.store.putSource({...f.source,revision:'v2'}),
    f=>f.store.setMember({tenant:'owner-dev',subject:'reviewer',role:'admin',active:false}),
    f=>f.store.configureWorkspace({tenant:'owner-dev',policyVersion:'v1',merchantId:'other-merchant'}),
    f=>f.store.configureWorkspace({tenant:'owner-dev',policyVersion:'v2',merchantId:'merchant-test'}),
  ]) {
    const f=setup();try {
      const a=f.store.reviewProposal('reviewer','owner-dev',f.proposal.id,'v1',f.review);change(f);
      assert.throws(()=>f.store.beginIntent('writer','owner-dev',a.id));
    } finally {f.store.close();}
  }
});
test('tenant isolation applies to proposals, approvals and payment intents',()=>{
  const {store,proposal,review}=setup();
  try {
    const a=store.reviewProposal('reviewer','owner-dev',proposal.id,'v1',review);
    const intent=store.beginIntent('writer','owner-dev',a.id);
    store.configureWorkspace({tenant:'other-tenant',policyVersion:'v1',merchantId:'merchant-other'});
    store.setMember({tenant:'other-tenant',subject:'outsider',role:'owner'});
    rejects(()=>store.readProposal('outsider','owner-dev',proposal.id,'v1'),'not_allowed');
    rejects(()=>store.reviewProposal('outsider','owner-dev',proposal.id,'v1',review),'not_allowed');
    rejects(()=>store.beginIntent('outsider','other-tenant',a.id),'not_found');
    rejects(()=>store.readIntent('outsider','other-tenant',intent.id),'not_found');
    rejects(()=>store.readProposal('outsider','other-tenant',proposal.id,'v1'),'not_found');
  } finally {store.close();}
});
test('revision overwrite is refused and returned records are detached from persistence',()=>{
  const {store,proposal}=setup();
  try {
    rejects(()=>store.saveProposal('writer',{...proposal,body:'Changed commitments'}),'revision_conflict');
    const read=store.readProposal('writer','owner-dev',proposal.id,'v1');read.terms.depositCents=1;
    assert.equal(store.readProposal('writer','owner-dev',proposal.id,'v1').terms.depositCents,10000);
  } finally {store.close();}
});
test('expired proposal content is hidden after restart without renewing its clock',()=>{
  const dir=mkdtempSync(join(tmpdir(),'veloce-expiry-')),path=join(dir,'test.sqlite');
  let store;
  try {
    const f=setup(path);store=f.store;store.close();
    store=new CommerceStore(path,{clock:()=>Date.parse(f.proposal.expiresAt)});
    rejects(()=>store.readProposal('writer','owner-dev',f.proposal.id,'v1'),'not_found');
  } finally {store?.close();rmSync(dir,{recursive:true,force:true});}
});
test('reviewer can reject a proposal revision with a reason; rejected work cannot obtain approval',()=>{
  const {store,proposal,review}=setup();try{
    rejects(()=>store.rejectProposal('other-member','owner-dev',proposal.id,'v1','Needs evidence'),'not_allowed');
    rejects(()=>store.rejectProposal('reviewer','owner-dev',proposal.id,'v1','no'),'review_reason_required');
    const result=store.rejectProposal('reviewer','owner-dev',proposal.id,'v1','Narrow the deliverable and resolve the open questions.');
    assert.equal(result.decision,'rejected');
    rejects(()=>store.reviewProposal('reviewer','owner-dev',proposal.id,'v1',review),'proposal_rejected');
    assert.equal(store.workspace('writer','owner-dev').proposals[0].reviewDecision,'rejected');
  }finally{store.close();}
});
test('approved commercial authority cannot be silently overwritten with a rejection',()=>{
  const {store,proposal,review}=setup();try{
    store.reviewProposal('reviewer','owner-dev',proposal.id,'v1',review);
    rejects(()=>store.rejectProposal('reviewer','owner-dev',proposal.id,'v1','Changed my mind'),'proposal_already_reviewed');
  }finally{store.close();}
});

test('author corrects a rejected draft as an immutable revision with unchanged evidence, terms and expiry',()=>{
 const {store,proposal,review}=setup();try{
  store.rejectProposal('reviewer','owner-dev',proposal.id,'v1','Correct the scope boundary.');
  const next=store.reviseProposal('writer','owner-dev',proposal.id,'v1',{expectedDigest:proposal.digest,title:'Corrected scope',body:'Corrected bounded scope [source:rates]'});
  assert.notEqual(next.revision,proposal.revision);assert.notEqual(next.digest,proposal.digest);
  assert.deepEqual(next.terms,proposal.terms);assert.deepEqual(next.sources,proposal.sources);assert.equal(next.createdAt,proposal.createdAt);assert.equal(next.expiresAt,proposal.expiresAt);
  assert.equal(store.readProposal('writer','owner-dev',proposal.id,'v1').body,proposal.body);
  const state=store.workspace('writer','owner-dev');assert.equal(state.proposals.find(p=>p.revision==='v1').eligibility,'proposal_superseded');assert.equal(state.proposals.find(p=>p.revision===next.revision).parentRevision,'v1');
  assert.equal(state.proposals.find(p=>p.revision===next.revision).reviewDecision,'pending');
  rejects(()=>store.reviewProposal('reviewer','owner-dev',next.id,next.revision,{...review,expectedDigest:proposal.digest}),'proposal_changed');
  const approval=store.reviewProposal('reviewer','owner-dev',next.id,next.revision,{...review,expectedDigest:next.digest});
  assert.equal(approval.proposalDigest,next.digest);assert.equal(store.beginIntent('writer','owner-dev',approval.id).proposalRevision,next.revision);
 }finally{store.close();}
});
test('revision refuses unreviewed or approved work, different authors, stale digest, changed sources and citation loss',()=>{
 const f=setup();try{
  const args={expectedDigest:f.proposal.digest,title:'Correction',body:'Corrected scope [source:rates]'};
  rejects(()=>f.store.reviseProposal('writer','owner-dev',f.proposal.id,'v1',args),'revision_requires_rejection');
  f.store.rejectProposal('reviewer','owner-dev',f.proposal.id,'v1','Correct the source claims.');
  rejects(()=>f.store.reviseProposal('other-member','owner-dev',f.proposal.id,'v1',args),'not_allowed');
  rejects(()=>f.store.reviseProposal('reviewer','owner-dev',f.proposal.id,'v1',args),'not_allowed');
  rejects(()=>f.store.reviseProposal('writer','owner-dev',f.proposal.id,'v1',{...args,expectedDigest:'a'.repeat(64)}),'proposal_changed');
  for(const body of ['No citations','Unsupported [source:invented]'])rejects(()=>f.store.reviseProposal('writer','owner-dev',f.proposal.id,'v1',{...args,body}),'invalid_citations');
  rejects(()=>f.store.reviseProposal('writer','owner-dev',f.proposal.id,'v1',{...args,title:f.proposal.title,body:f.proposal.body}),'revision_unchanged');
  f.store.putSource({...f.source,status:'withdrawn'});rejects(()=>f.store.reviseProposal('writer','owner-dev',f.proposal.id,'v1',args),'source_not_available');
 }finally{f.store.close();}
 const g=setup();try{
  g.store.reviewProposal('reviewer','owner-dev',g.proposal.id,'v1',g.review);
  rejects(()=>g.store.reviseProposal('writer','owner-dev',g.proposal.id,'v1',{expectedDigest:g.proposal.digest,title:'New scope',body:'New scope [source:rates]'}),'revision_requires_rejection');
 }finally{g.store.close();}
});
test('one rejected revision can produce only one successor, including across store connections',()=>{
 const dir=mkdtempSync(join(tmpdir(),'commerce-revision-')),path=join(dir,'test.sqlite');let first,second;
 try{
  const f=setup(path);first=f.store;second=new CommerceStore(path,{clock:()=>now});first.rejectProposal('reviewer','owner-dev',f.proposal.id,'v1','Correct the scope.');
  const args={expectedDigest:f.proposal.digest,title:'Revised scope',body:'Revised scope [source:rates]'};
  first.reviseProposal('writer','owner-dev',f.proposal.id,'v1',args);
  rejects(()=>second.reviseProposal('writer','owner-dev',f.proposal.id,'v1',args),'proposal_superseded');
 }finally{second?.close();first?.close();rmSync(dir,{recursive:true,force:true});}
});
