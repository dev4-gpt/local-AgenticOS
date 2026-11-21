/** Replay retained public real-model output to evaluate human correction, with no provider calls. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {CommerceStore} from '../src/store.mjs';
import {CommerceAuth} from '../src/auth.mjs';
import {createCommerceServer} from '../src/server.mjs';
import {sha256} from '../src/proposals.mjs';
function arg(name){const i=process.argv.indexOf('--'+name);if(i<0||!process.argv[i+1])throw new Error('Provide --from and --out paths.');return resolve(process.argv[i+1]);}
const input=arg('from'),output=arg('out');if(existsSync(output))throw new Error('Use a new evidence output file.');
const raw=readFileSync(input,'utf8'),record=JSON.parse(raw);
const content='Public PayPal AI Hackathon requirements: Build or update an application that integrates the PayPal developer platform using the free sandbox environment along with an AI tool, model or platform of your choice. PayPal integration must be central to the project. Demonstrate a working prototype or proof of concept and document it sufficiently for judges to understand and evaluate it. Provide a functional demo through complete setup and run instructions or a hosted demo URL. Provide a public open-source code repository containing all necessary source, assets and instructions. Include a publicly visible YouTube demonstration video under three minutes. Existing projects must make meaningful progress during the hackathon. Sponsor tools are optional.';
assert.equal(record.kind,'real-model-authenticated-http-evaluation');assert.equal(record.sourceHash,sha256(content));
assert.equal(record.proposal.sources.length,1);assert.equal(record.proposal.terms.merchantId,'NO-PAYMENT-EVALUATION');
const dir=mkdtempSync(join(tmpdir(),'commerce-correction-eval-')),store=new CommerceStore(join(dir,'test.sqlite')),auth=new CommerceAuth(join(dir,'test.sqlite'));
let server,author,closed=false;
async function stop(){
 if(closed)return;closed=true;
 if(server?.listening)await new Promise(resolve=>server.close(resolve));
 if(author){const workspace=store.workspace(author.subject,record.proposal.tenant);writeFileSync(output,JSON.stringify({kind:'recorded-model-human-correction-evaluation',scope:'Recorded real-model output, public source and synthetic accounts/terms. No live model/payment calls. Agent operated both separate accounts; not two people.',recordedModel:record.model.model,originalArtifactSha256:sha256(raw),originalProposalDigest:record.proposal.digest,completedAt:new Date().toISOString(),workspace},null,2)+'\n',{mode:0o600,flag:'wx'});}
 store.close();auth.close();rmSync(dir,{recursive:true,force:true});
}
try{
 const tenant=record.proposal.tenant;store.configureWorkspace({tenant,policyVersion:record.proposal.policyVersion,merchantId:'NO-PAYMENT-EVALUATION'});
 author=await auth.createUser('author-correction','Disposable-correction-only-2026');const reviewer=await auth.createUser('reviewer-correction','Disposable-correction-only-2026');
 store.setMember({tenant,subject:author.subject,role:'member'});store.setMember({tenant,subject:reviewer.subject,role:'admin'});
 const ref=record.proposal.sources[0];
 assert.equal(ref.metadataHash,sha256(JSON.stringify({title:'Public hackathon requirements · real-model evaluation',type:'source'})));
 store.putSource({...ref,title:'Public hackathon requirements · real-model evaluation',type:'source',content,status:'active',reviewState:'approved',sensitivity:'ordinary',submittedBy:author.subject,reviewedBy:reviewer.subject,createdAt:new Date(Date.parse(ref.expiresAt)-28*86400000).toISOString()});
 const proposal=store.saveProposal(author.subject,record.proposal);assert.equal(proposal.digest,record.proposal.digest);
 store.rejectProposal(reviewer.subject,tenant,proposal.id,proposal.revision,'Correct the hosting-access assumption: selecting hosted delivery does not establish public access is required.');
 server=createCommerceServer({store,auth,tenant,origin:'http://127.0.0.1:0',fixtureMode:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));console.log(JSON.stringify({origin:`http://127.0.0.1:${server.address().port}`,recordedModel:record.model.model,liveProviderCalls:false,output}));
 process.on('SIGINT',()=>stop().then(()=>process.exit(0)));process.on('SIGTERM',()=>stop().then(()=>process.exit(0)));
}catch(error){await stop();throw error;}
