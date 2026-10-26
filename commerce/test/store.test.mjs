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
