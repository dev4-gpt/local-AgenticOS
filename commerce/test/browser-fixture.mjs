/** Browser test fixture only. Disposable accounts/state; no model or payment calls. */
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CommerceStore} from '../src/store.mjs';
import {CommerceAuth} from '../src/auth.mjs';
import {createCommerceServer} from '../src/server.mjs';
import {sha256} from '../src/proposals.mjs';
const dir=mkdtempSync(join(tmpdir(),'veloce-browser-fixture-')),path=join(dir,'test.sqlite');
let offset=0;const clock=()=>Date.now()+offset;
const store=new CommerceStore(path,{clock}),auth=new CommerceAuth(path),now=Date.now();
store.configureWorkspace({tenant:'browser-fixture',policyVersion:'fixture-v1',merchantId:'FIXTUREMERCHANT'});
const author=await auth.createUser('author-fixture','Fixture-only-password-2026'),reviewer=await auth.createUser('reviewer-fixture','Fixture-only-password-2026');
store.setMember({tenant:'browser-fixture',subject:author.subject,role:'member'});store.setMember({tenant:'browser-fixture',subject:reviewer.subject,role:'admin'});
const content='Browser evaluation material only: prepare a one-page service brief from approved copy. A reviewer confirms scope before payment. This is fixture data, not a customer record.';
const source={tenant:'browser-fixture',id:'fixture-service',revision:'v1',title:'Service scope · browser fixture',content,contentHash:sha256(content),metadataHash:sha256('browser fixture'),status:'active',reviewState:'approved',sensitivity:'ordinary',submittedBy:author.subject,reviewedBy:reviewer.subject,expiresAt:new Date(now+24*60*60*1000).toISOString()};
store.putSource(source);
const proposal=store.saveProposal(author.subject,{schema:1,environment:'sandbox',tenant:'browser-fixture',id:'fixture-proposal',revision:'v1',title:'A service brief, ready for review',body:'## Requirements\n- Prepare a one-page brief from approved copy. [source:fixture-service]\n\n## Deliverables\n- A reviewable service brief. [source:fixture-service]\n\n## Questions\n- Who confirms the delivery date?\n\n## Source register\n- [source:fixture-service]\n\nBrowser fixture only. No live AI generation.',terms:{currency:'USD',depositCents:25000,totalCents:100000,merchantId:'FIXTUREMERCHANT',description:'Fixture deposit for a reviewed service brief. No actual offer or payment.'},policyVersion:'fixture-v1',sources:[source],createdAt:new Date(now).toISOString(),expiresAt:new Date(now+12*60*60*1000).toISOString()});
if(process.argv.includes('--expired-approval')){
  const approval=store.reviewProposal(reviewer.subject,'browser-fixture',proposal.id,proposal.revision,{expectedDigest:proposal.digest,evidenceReviewed:true,termsReviewed:true,expiresAt:new Date(now+60_000).toISOString()});
  const intent=store.beginIntent(author.subject,'browser-fixture',approval.id),claim=store.claimOperation(author.subject,'browser-fixture',intent.id,'create');
  store.completeOperation(claim.operationId,claim.claim,{environment:'sandbox',intentId:intent.id,merchantId:'FIXTUREMERCHANT',depositCents:25000,orderId:'FIXTUREORDER',status:'CREATED',approvalUrl:'https://www.sandbox.paypal.com/checkoutnow?token=FIXTUREORDER'});
  offset=61_000;
}
const server=createCommerceServer({store,auth,tenant:'browser-fixture',origin:'http://127.0.0.1:4142',fixtureMode:true,clock});
server.listen(4142,'127.0.0.1',()=>console.log('Fixture-only browser evaluation: http://127.0.0.1:4142. No live AI or PayPal calls.'));
function stop(){server.close(()=>{store.close();auth.close();rmSync(dir,{recursive:true,force:true});process.exit(0);});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
