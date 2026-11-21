/** Loopback standalone HTTP app. Veloce's hosted binding is intentionally separate. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {CommerceError,usdValue} from './proposals.mjs';
import {createPaymentService} from './payments.mjs';
const fail=code=>{throw new CommerceError(code);};
const web=new URL('../web/',import.meta.url);
const files=new Map([['/',['index.html','text/html; charset=utf-8']],['/app.mjs',['app.mjs','text/javascript; charset=utf-8']],['/styles.css',['styles.css','text/css; charset=utf-8']]]);
const statusFor=code=>({sign_in_required:401,invalid_credentials:401,not_allowed:403,invalid_csrf:403,invalid_origin:403,not_found:404,login_rate_limited:429,draft_limit_reached:429,model_not_configured:503,provider_not_configured:503,model_unavailable:503,provider_unavailable:503}[code]??409);
function cookies(header=''){
  const result={};for(const item of header.split(';')){
    const at=item.indexOf('=');if(at<1)continue;const key=item.slice(0,at).trim();
    if(Object.hasOwn(result,key))fail('sign_in_required');result[key]=item.slice(at+1).trim();
  }return result;
}
async function body(request,max=40_000){
  const chunks=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>max)fail('payload_too_large');chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');
}
function jsonBody(raw){let value;try{value=JSON.parse(raw);}catch{fail('invalid_input');}if(!value||typeof value!=='object'||Array.isArray(value))fail('invalid_input');return value;}

export function createCommerceServer({store,auth,tenant,origin,paypal=null,drafter=null,clock=Date.now,fixtureMode=false}){
  let configured=new URL(origin);
  if(configured.protocol!=='http:'||configured.hostname!=='127.0.0.1'||configured.pathname!=='/'||configured.search||configured.hash)fail('invalid_server_configuration');
  const payments=paypal?createPaymentService(store,paypal):null;
  const server=createServer(async(request,response)=>{
    const send=(status,data)=>{response.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});response.end(JSON.stringify(data));};
    response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','no-referrer');response.setHeader('X-Frame-Options','DENY');
    response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try{
      if(request.headers.host!==configured.host)fail('invalid_origin');
      const url=new URL(request.url,origin),path=url.pathname;
      if(request.method==='GET'&&files.has(path)){
        const [name,type]=files.get(path);response.writeHead(200,{'Content-Type':type});response.end(await readFile(new URL(name,web)));return;
      }
      if(request.method==='GET'&&path==='/api/health'){send(200,{ok:true,environment:'sandbox',paymentsConfigured:!!payments,modelConfigured:!!drafter});return;}
      if(request.method==='POST'&&path==='/api/paypal/webhook'){
        if(!payments)fail('provider_not_configured');
        const raw=await body(request,128_000),headers=new Headers();
        for(const key of ['auth-algo','cert-url','transmission-id','transmission-sig','transmission-time'])if(typeof request.headers[`paypal-${key}`]==='string')headers.set(`paypal-${key}`,request.headers[`paypal-${key}`]);
        send(200,{ok:true,...await payments.webhook(raw,headers)});return;
      }
      if(!['GET','POST'].includes(request.method)){send(405,{ok:false,error:'method_not_allowed'});return;}
      if(request.method==='POST'&&request.headers.origin!==configured.origin)fail('invalid_origin');
      if(request.method==='POST'&&request.headers['content-type']?.split(';')[0]!=='application/json')fail('invalid_input');
      if(path==='/api/login'&&request.method==='POST'){
        const value=jsonBody(await body(request,8000)),session=await auth.login(value.username,value.password,request.socket.remoteAddress??'local');
        response.setHeader('Set-Cookie',[
          `veloce_session=${session.sessionToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`,
          `veloce_csrf=${session.csrfToken}; SameSite=Strict; Path=/; Max-Age=3600`,
        ]);send(200,{ok:true,username:session.username});return;
      }
      if(request.method==='POST'&&typeof request.headers['x-csrf-token']!=='string')fail('invalid_csrf');
      const cookie=cookies(request.headers.cookie),session=auth.authenticate(cookie.veloce_session,request.method==='POST'?request.headers['x-csrf-token']:undefined);
      const subject=session.subject;
      // Authenticated session alone does not establish membership in the server-selected workspace.
      if(request.method==='GET'&&path==='/api/workspace'){
        send(200,{ok:true,...store.workspace(subject,tenant),username:session.username,paymentsConfigured:!!payments,modelConfigured:!!drafter,fixtureMode:fixtureMode===true});return;
      }
      if(request.method!=='POST'){send(404,{ok:false,error:'not_found'});return;}
      const value=jsonBody(await body(request));
      if(path==='/api/logout'){
        auth.logout(cookie.veloce_session);response.setHeader('Set-Cookie',['veloce_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0','veloce_csrf=; SameSite=Strict; Path=/; Max-Age=0']);send(200,{ok:true});return;
      }
      // Reject spoofed context even though individual methods use trusted server values.
      for(const field of ['tenant','subject','requester','reviewer','role','merchantId','environment'])if(Object.hasOwn(value,field))fail('invalid_input');
      if(path==='/api/sources'){send(201,{ok:true,source:store.submitSource(subject,tenant,value)});return;}
      if(path==='/api/sources/review'){send(200,{ok:true,source:store.reviewSource(subject,tenant,value.id,{sensitivity:value.sensitivity})});return;}
      if(path==='/api/sources/withdraw'){send(200,{ok:true,...store.withdrawSource(subject,tenant,value.id)});return;}
      if(path==='/api/drafts'){
        if(!drafter)fail('model_not_configured');usdValue(value.depositCents);usdValue(value.totalCents);
        const sources=store.selectedSources(subject,tenant,value.sourceIds),config=store.workspace(subject,tenant),now=clock();
        const runId=store.reserveDraft(subject,tenant);
        try{
          const result=await drafter({tenant,sources,instruction:value.instruction,now});
          const expiresAt=new Date(Math.min(now+3*24*60*60*1000,...sources.map(s=>Date.parse(s.expiresAt)))).toISOString();
          const proposal=store.saveProposal(subject,{schema:1,environment:'sandbox',tenant,id:randomUUID(),revision:'v1',title:result.draft.title,body:result.body,terms:{currency:'USD',depositCents:value.depositCents,totalCents:value.totalCents,merchantId:config.merchantId,description:value.termsDescription},policyVersion:config.policyVersion,sources,createdAt:new Date(now).toISOString(),expiresAt});
          store.finishDraft(subject,tenant,runId,'succeeded',{...result,proposalId:proposal.id});send(201,{ok:true,proposal});
        }catch(error){store.finishDraft(subject,tenant,runId,'failed');throw error;}return;
      }
      if(path==='/api/proposals/revise'){
        store.workspace(subject,tenant); // Establish membership before inspecting revision fields.
        if(Object.keys(value).sort().join('|')!==['id','revision','expectedDigest','title','body'].sort().join('|'))fail('invalid_input');
        send(201,{ok:true,proposal:store.reviseProposal(subject,tenant,value.id,value.revision,value)});return;
      }
      if(path==='/api/proposals/review'){
        const now=clock(),proposal=store.readProposal(subject,tenant,value.id,value.revision);
        send(200,{ok:true,approval:store.reviewProposal(subject,tenant,value.id,value.revision,{expectedDigest:value.expectedDigest,evidenceReviewed:value.evidenceReviewed,termsReviewed:value.termsReviewed,expiresAt:new Date(Math.min(now+24*60*60*1000,Date.parse(proposal.expiresAt))).toISOString()})});return;
      }
      if(path==='/api/proposals/reject'){send(200,{ok:true,...store.rejectProposal(subject,tenant,value.id,value.revision,value.reason)});return;}
      if(path==='/api/intents'){send(201,{ok:true,intent:store.beginIntent(subject,tenant,value.approvalId)});return;}
      if(['/api/payments/create','/api/payments/capture','/api/payments/reconcile'].includes(path)){
        if(!payments)fail('provider_not_configured');
        const method=path.endsWith('/create')?'createOrder':path.endsWith('/capture')?'captureOrder':'reconcile';
        const options={retryUncertain:value.retryUncertain===true};
        send(200,{ok:true,intent:await payments[method](subject,tenant,value.id,options)});return;
      }
      if(path==='/api/kickoff'){send(200,{ok:true,project:store.deliverKickoff(subject,tenant,value.id)});return;}
      send(404,{ok:false,error:'not_found'});
    }catch(error){
      const code=error instanceof CommerceError?error.code:'unavailable';
      if(!response.headersSent)send(code==='unavailable'?503:statusFor(code),{ok:false,error:code});else response.end();
    }
  });
  server.on('listening',()=>{if(configured.port==='0')configured=new URL(`http://127.0.0.1:${server.address().port}`);});
  return server;
}
