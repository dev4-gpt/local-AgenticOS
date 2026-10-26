/** Opt-in real existing-model HTTP evaluation using only public requirements and temporary test accounts. */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {CommerceStore} from '../src/store.mjs';
import {CommerceAuth} from '../src/auth.mjs';
import {createCommerceServer} from '../src/server.mjs';
import {createClaudeDrafter} from '../src/drafting.mjs';
import {sha256} from '../src/proposals.mjs';
const outAt=process.argv.indexOf('--out');
if(outAt<0||!process.argv[outAt+1])throw new Error('Provide a private --out path.');
const output=resolve(process.argv[outAt+1]),keep=process.argv.includes('--keep-open');
if(existsSync(output))throw new Error('Evidence output must be a new file; no model call was started.');
const dir=mkdtempSync(join(tmpdir(),'commerce-real-http-')),path=join(dir,'test.sqlite');
const store=new CommerceStore(path),auth=new CommerceAuth(path),tenant='public-evaluation';
const started=Date.now(),observations=[];
const content='Public PayPal AI Hackathon requirements: Build or update an application that integrates the PayPal developer platform using the free sandbox environment along with an AI tool, model or platform of your choice. PayPal integration must be central to the project. Demonstrate a working prototype or proof of concept and document it sufficiently for judges to understand and evaluate it. Provide a functional demo through complete setup and run instructions or a hosted demo URL. Provide a public open-source code repository containing all necessary source, assets and instructions. Include a publicly visible YouTube demonstration video under three minutes. Existing projects must make meaningful progress during the hackathon. Sponsor tools are optional.';
store.configureWorkspace({tenant,policyVersion:'public-evaluation-v1',merchantId:'NO-PAYMENT-EVALUATION'});
let server,closed=false;
async function cleanup(){if(closed)return;closed=true;if(server?.listening)await new Promise(resolve=>server.close(resolve));store.close();auth.close();rmSync(dir,{recursive:true,force:true});}
try{
 const author=await auth.createUser('author-evaluation','Disposable-evaluation-only-2026'),reviewer=await auth.createUser('reviewer-evaluation','Disposable-evaluation-only-2026');
 store.setMember({tenant,subject:author.subject,role:'member'});store.setMember({tenant,subject:reviewer.subject,role:'admin'});
 const realDraft=createClaudeDrafter({executable:'/opt/homebrew/bin/claude',timeoutMs:90_000});
 const drafter=async input=>{const began=Date.now(),result=await realDraft(input);observations.push({provider:result.provider,model:result.model,costStatus:result.costStatus,costMicros:result.costMicros,inputTokens:result.inputTokens,outputTokens:result.outputTokens,elapsedMs:Date.now()-began});return result;};
 server=createCommerceServer({store,auth,tenant,origin:'http://127.0.0.1:0',drafter});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const sessions={};
 async function request(path,value,user){
  const s=sessions[user],response=await fetch(origin+path,{method:value===undefined?'GET':'POST',headers:{...(value===undefined?{}:{'Content-Type':'application/json',Origin:origin}),...(s?{Cookie:s.cookie,'X-CSRF-Token':s.csrf}:{})},...(value===undefined?{}:{body:JSON.stringify(value)})});
  const data=await response.json();return {response,data};
 }
 for(const name of ['author','reviewer']){
  const {response}=await request('/api/login',{username:`${name}-evaluation`,password:'Disposable-evaluation-only-2026'});
  assert.equal(response.status,200);const cookies=response.headers.getSetCookie();sessions[name]={cookie:cookies.map(c=>c.split(';')[0]).join('; '),csrf:cookies.find(c=>c.startsWith('veloce_csrf=')).split(';')[0].split('=')[1]};
 }
 const sourceResult=await request('/api/sources',{title:'Public hackathon requirements · real-model evaluation',content},'author');assert.equal(sourceResult.response.status,201);const source=sourceResult.data.source;
 const reviewed=await request('/api/sources/review',{id:source.id,sensitivity:'ordinary'},'reviewer');assert.equal(reviewed.response.status,200);
 const result=await request('/api/drafts',{sourceIds:[source.id],instruction:'Using only these public requirements, draft a narrowly scoped service proposal for building a hackathon prototype that uses PayPal sandbox and AI. Preserve the local-run OR hosted-demo alternative and optional sponsor tools. Ask about missing product and commercial decisions. Do not invent customers, production readiness, dates, fees or unsupported integrations.',depositCents:100,totalCents:200,termsDescription:'Synthetic evaluation terms only. No offer, customer or payment. PayPal is disabled in this evaluation.'},'author');
 assert.equal(result.response.status,201,JSON.stringify(result.data));const proposal=result.data.proposal;
 const ownReview=await request('/api/proposals/review',{id:proposal.id,revision:proposal.revision,expectedDigest:proposal.digest,evidenceReviewed:true,termsReviewed:true},'author');assert.equal(ownReview.data.error,'not_allowed');
 const persisted=await request('/api/workspace',undefined,'reviewer');assert.equal(persisted.data.proposals[0].digest,proposal.digest);assert.equal(persisted.data.paymentsConfigured,false);
 assert.equal(proposal.terms.depositCents,100);assert.equal(proposal.terms.totalCents,200);assert.equal(proposal.terms.merchantId,'NO-PAYMENT-EVALUATION');
 const evidence={kind:'real-model-authenticated-http-evaluation',scope:'Only public challenge requirements sent to existing Claude subscription. Synthetic accounts and commercial terms; PayPal disabled. Source/commercial review account separation is tested, not two real people.',startedAt:new Date(started).toISOString(),completedAt:new Date().toISOString(),elapsedMs:Date.now()-started,model:observations[0],sourceHash:sha256(content),checks:{authenticatedSourceReview:true,realModelCall:observations.length===1,persistedProposalDigest:true,authorSelfReviewRefused:true,humanSetMoneyPreserved:true,merchantPreserved:true,paymentsDisabled:true},proposal,semanticReview:{status:'pending_manual_review'},commercialReview:{status:'pending_manual_review'}};
 writeFileSync(output,JSON.stringify(evidence,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({status:'draft-persisted-awaiting-semantic-review',model:observations[0],evidencePath:output,...(keep?{origin}:{}),payPalConfigured:false}));
 if(keep){process.on('SIGINT',()=>cleanup().then(()=>process.exit(0)));process.on('SIGTERM',()=>cleanup().then(()=>process.exit(0)));}
 else await cleanup();
}catch(error){await cleanup();throw error;}
