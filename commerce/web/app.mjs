const $=id=>document.getElementById(id);
let state=null,busy=false;
const selected=new Set();
const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
const messages={
  invalid_credentials:'That username and password did not match.',sign_in_required:'Sign in to continue.',invalid_csrf:'Your session changed. Sign out and sign in again.',
  reviewer_must_differ:'A different authorized account must review this work.',source_not_available:'One of the selected sources is no longer approved or available.',source_changed:'A supporting source changed. Prepare a new proposal and review its terms.',source_expired_or_changed:'A supporting source expired or changed.',
  proposal_changed:'The proposal changed after it was displayed. Refresh before reviewing.',proposal_expired:'This proposal or its review has expired.',
  provider_not_configured:'PayPal sandbox is not connected to this workspace yet.',model_not_configured:'Connect an existing drafting model before creating a proposal.',model_unavailable:'The drafting model is unavailable. Your sources have been preserved.',existing_subscription_required:'Sign in to your existing Claude subscription before drafting. No API-key fallback is used.',
  invalid_citations:'The draft included missing or unknown citations. It was not saved as a proposal.',invalid_draft:'The model did not return a usable proposal. Try narrowing your request.',
  provider_reconciliation_required:'PayPal’s result is uncertain. Check payment status before retrying the same request.',reconciliation_required:'This operation needs reconciliation. Check payment status or retry the original request within its recovery window.',operation_in_progress:'This payment operation is already being processed. Refresh its status shortly.',
  kickoff_not_allowed:'Kickoff is on hold until payment and the supporting evidence are confirmed.',intent_not_executable:'This intent is already paid or held for review.',not_allowed:'Your account cannot perform this action.',draft_in_progress:'Another draft is being prepared. Try again when it finishes.',draft_limit_reached:'This workspace reached its hourly drafting limit. Existing proposals are still available.',
  login_rate_limited:'Too many sign-in attempts. Please wait before trying again.',invalid_amount:'Enter whole USD cents, with a deposit no larger than the total.',unavailable:'The workspace is temporarily unavailable. Your saved work has been preserved.',
  proposal_rejected:'This revision was rejected. Prepare a new draft to address the review.',review_reason_required:'Explain the requested changes in at least five characters.',proposal_already_reviewed:'This revision already has an approval. Its commercial terms cannot be changed in place.',
};
function notice(text,error=false){$('notice').textContent=text;$('notice').className=`notice${error?' error':''}`;}
function node(tag,attrs={},children=[]){
  const e=document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)){if(k==='class')e.className=v;else if(k==='text')e.textContent=v;else if(k==='checked')e.checked=!!v;else if(k==='disabled')e.disabled=!!v;else e.setAttribute(k,v);}
  for(const c of children)e.append(typeof c==='string'?document.createTextNode(c):c);return e;
}
function button(label,action,data={},disabled=false){return node('button',{type:'button','data-action':action,...Object.fromEntries(Object.entries(data).map(([k,v])=>[`data-${k}`,v])),disabled},[label]);}
function field(label,id,tag='input',attrs={}){return [node('label',{for:id},[label]),node(tag,{id,name:id,required:true,...attrs})];}
function empty(title,description){return node('div',{class:'empty'},[node('h3',{},[title]),node('p',{},[description])]);}
const badge=(text,kind='')=>node('span',{class:`badge ${kind}`},[text]);
const csrf=()=>document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('veloce_csrf='))?.slice('veloce_csrf='.length);
async function api(path,value){
  const res=await fetch(path,{method:value===undefined?'GET':'POST',credentials:'same-origin',headers:value===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf()??''},...(value===undefined?{}:{body:JSON.stringify(value)})});
  const data=await res.json();if(!res.ok){const error=new Error(messages[data.error]??'This action could not be completed. Refresh and review the current state.');error.code=data.error;throw error;}return data;
}
async function refresh(){
  try{state=await api('/api/workspace');$('login').classList.add('hidden');$('workspace').classList.remove('hidden');render();}
  catch(error){if(error.code==='sign_in_required'){state=null;document.body.classList.remove('signed-in');$('workspace').classList.add('hidden');$('login').classList.remove('hidden');$('account').replaceChildren();}else notice(error.message,true);}
}
function heading(number,title,description){return node('div',{class:'section-heading'},[node('span',{class:'step-number'},[number]),node('div',{},[node('h2',{},[title]),node('p',{},[description])])]);}
function render(){
  document.body.classList.add('signed-in');
  document.querySelector('.hero .eyebrow').textContent=state.fixtureMode?'BROWSER EVALUATION · FIXTURE-BACKED · NO LIVE PROVIDER CALLS':'KNOWLEDGE. AGREEMENT. MOMENTUM.';
  for(const id of selected)if(!state.sources.some(s=>s.id===id&&s.reviewState==='approved'))selected.delete(id);
  $('account').replaceChildren(node('span',{class:'account-name'},[state.username]),button('Sign out','logout'));
  const nav=node('nav',{class:'journey','aria-label':'Commerce workflow'},['Sources','Proposal','Payment','Kickoff'].map((label,i)=>node('a',{href:i===0?'#sources':i===1?'#proposals':i===2?'#proposals':'#kickoff'},[node('span',{},[`0${i+1}`]),label])));
  const approved=state.sources.filter(s=>s.reviewState==='approved'),paid=state.intents.filter(i=>i.captureId);
  const summary=node('div',{class:'workspace-summary'},[node('div',{},[node('p',{class:'eyebrow'},['YOUR WORKSPACE']),node('h2',{},['One connected commercial workflow.'])]),node('div',{class:'summary-metrics'},[node('span',{},[node('strong',{},[String(approved.length)]),' approved sources']),node('span',{},[node('strong',{},[String(state.proposals.length)]),' proposals']),node('span',{},[node('strong',{},[String(paid.length)]),' confirmed deposits'])]),button('Refresh','refresh')]);
  const sourceList=node('div',{class:'source-list'});
  for(const s of state.sources){
    const card=node('article',{class:'source-card'},[node('div',{class:'card-top'},[badge(s.reviewState==='approved'?'Approved':'Awaiting review',s.reviewState==='approved'?'good':'pending'),node('span',{class:'meta'},[new Date(s.expiresAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})+' expiry'])]),node('h3',{},[s.title??s.id]),node('p',{class:'source-excerpt'},[s.content.slice(0,220)+(s.content.length>220?'…':'')])]);
    const details=node('details',{},[node('summary',{},['Read source']),node('pre',{class:'source-text'},[s.content])]);card.append(details);
    if(s.reviewState==='approved'){
      const check=node('input',{type:'checkbox','data-source':s.id,checked:selected.has(s.id),id:`select-${s.id}`});
      card.append(node('label',{class:'select-source',for:`select-${s.id}`},[check,'Use for drafting']));
    }else if(['owner','admin'].includes(state.role)&&s.submittedBy!==state.subject){card.append(button('Approve as ordinary business material','review-source',{id:s.id}));}
    else card.append(node('p',{class:'meta'},['A different authorized reviewer must approve this source.']));
    if(s.submittedBy===state.subject||['owner','admin'].includes(state.role))card.append(button('Withdraw source','withdraw-source',{id:s.id}));
    sourceList.append(card);
  }
  if(!state.sources.length)sourceList.append(empty('Begin with what you know.','Add your service description, terms, or an authorized client brief. A second account reviews it before AI can use it.'));
  const sourceForm=node('form',{id:'source-form',class:'stack-form'},[node('h3',{},['Add business material']),...field('Source title','source-title','input',{maxlength:'200',placeholder:'e.g. Website service scope'}),...field('Source text','source-content','textarea',{rows:'5',maxlength:'12000',placeholder:'Add material you own or are authorized to use.'}),node('button',{type:'submit'},['Send for review'])]);
  const sources=node('section',{id:'sources',class:'panel'},[heading('01','Start with approved knowledge.','Only reviewed sources can support a proposal.'),sourceList,node('details',{class:'add-source'},[node('summary',{},['+ Add a source']),sourceForm])]);
  const draftForm=node('form',{id:'draft-form',class:'stack-form'},[
    node('p',{class:'eyebrow'},['PREPARE THE AGREEMENT']),node('h2',{},['A clear scope, backed by sources.']),node('p',{},['Select up to five approved sources, then describe the outcome you want.']),
    ...field('What should this proposal achieve?','instruction','textarea',{rows:'4',maxlength:'4000',placeholder:'Describe the client’s request and the deliverable to propose.'}),
    node('div',{class:'two-fields'},[node('div',{},field('Total fee (USD)','total','input',{type:'number',min:'0.01',step:'0.01',placeholder:'1000.00'})),node('div',{},field('Deposit (USD)','deposit','input',{type:'number',min:'0.01',step:'0.01',placeholder:'250.00'}))]),
    ...field('Payment terms','terms','textarea',{rows:'3',maxlength:'1000',placeholder:'State what this deposit covers and the agreed conditions.'}),
    node('p',{class:'fine-print'},['You set the commercial terms. AI drafts the scope; it cannot change the price or recipient.']),
    node('button',{type:'submit',class:'primary',disabled:!state.modelConfigured},['Draft proposal ↗']),
    ...(!state.modelConfigured?[node('p',{class:'connection-state'},['Connect an existing drafting model to enable this step.'])]:[]),
  ]);
  const library=node('div',{class:'library-grid'},[sources,node('aside',{class:'draft-panel'},[draftForm])]);
  const proposals=node('section',{id:'proposals',class:'proposals'},[heading('02 — 03','Make the commitment explicit.','Review the evidence and exact terms before creating a sandbox checkout.')]);
  if(!state.proposals.length)proposals.append(empty('Your next proposal belongs here.','A draft becomes a commercial commitment only after a separate authorized reviewer approves it.'));
  for(const p of state.proposals)proposals.append(proposalCard(p));
  const kickoff=node('section',{id:'kickoff',class:'kickoff'},[heading('04','Start on solid ground.','A confirmed deposit and current evidence unlock the kickoff.')]);
  if(!state.projects.length)kickoff.append(empty('Ready when the agreement is.','After payment is confirmed, create one kickoff linked to the reviewed proposal.'));
  for(const p of state.projects)kickoff.append(node('article',{class:'project-card'},[badge(p.state==='ready'?'Ready to start':'Review required',p.state==='ready'?'good':'pending'),node('h3',{},[p.title]),node('ul',{},p.tasks.map(t=>node('li',{},[t.title]))),node('p',{class:'meta'},['Linked to reviewed proposal · '+new Date(p.createdAt).toLocaleDateString()])]));
  const fixture=state.fixtureMode?node('p',{class:'fixture-ribbon'},['Browser evaluation · fixtures only · no live AI or payment calls']):null;
  $('workspace').replaceChildren(...(fixture?[fixture]:[]),nav,summary,library,proposals,kickoff);
}
function proposalCard(p){
  const approval=state.approvals.find(a=>a.proposalId===p.id&&a.proposalRevision===p.revision),intent=state.intents.find(i=>i.proposalId===p.id&&i.proposalRevision===p.revision),current=p.eligibility==='current';
  const status=p.reviewDecision==='rejected'?'Changes requested':!current?'Evidence needs review':intent?({paid:'Deposit confirmed',paid_review_required:'Paid · review required',payment_review_required:'Payment review required',awaiting_buyer:'Awaiting buyer',buyer_approved:'Buyer approved',payment_pending:'Payment pending',capturing:'Confirming payment',creating_order:'Preparing checkout',reconciling:'Check payment status',cancelled:'Checkout cancelled'}[intent.state]??'Checkout ready'):approval?'Terms approved':'Draft · awaiting review';
  const card=node('article',{class:'proposal-card'},[node('div',{class:'card-top'},[badge(status,intent?.state==='paid'?'good':!current?'warning':'pending'),node('span',{class:'meta'},['Expires '+new Date(p.expiresAt).toLocaleDateString()])]),node('h3',{},[p.title]),node('div',{class:'terms-strip'},[node('div',{},[node('span',{},['TOTAL FEE']),node('strong',{},[money(p.terms.totalCents)])]),node('div',{},[node('span',{},['DEPOSIT']),node('strong',{},[money(p.terms.depositCents)])]),node('div',{},[node('span',{},['PAYMENT TERMS']),node('p',{},[p.terms.description])])]),node('details',{},[node('summary',{},['Read proposed scope and citations']),node('pre',{class:'proposal-body'},[p.body])])]);
  const evidence=node('details',{},[node('summary',{},['Review supporting evidence'])]);
  for(const ref of p.sources){const s=state.sources.find(s=>s.id===ref.id);evidence.append(node('div',{class:'evidence'},[node('strong',{},[s?.title??'Source no longer available']),node('pre',{},[s?.content??'This source has been withdrawn or expired. Prepare a new proposal before taking another commercial action.'])]));}card.append(evidence);
  if(!current)card.append(node('p',{class:'warning-copy'},['Supporting evidence changed or expired. New commercial actions are blocked; an existing payment can still be reconciled.']));
  if(p.reviewDecision==='rejected')card.append(node('p',{class:'warning-copy'},['Reviewer requested changes: '+p.reviewReason]));
  if(!approval&&current&&p.reviewDecision!=='rejected'){
    if(['owner','admin'].includes(state.role)&&p.requestedBy!==state.subject){
      const form=node('form',{'data-review':p.id,'data-revision':p.revision,'data-digest':p.digest,class:'review-form'},[
        node('label',{},[node('input',{type:'checkbox',name:'evidence',required:true}),'I reviewed the cited passages and the scope they support.']),
        node('label',{},[node('input',{type:'checkbox',name:'terms',required:true}),'I reviewed the exact deposit, total fee, recipient and payment terms.']),
        node('p',{class:'meta'},['Sandbox recipient: '+p.terms.merchantId]),node('button',{type:'submit',class:'primary'},['Approve exact proposal']),
      ]);card.append(form);
      card.append(node('details',{},[node('summary',{},['Request a new draft instead']),node('form',{'data-reject':p.id,'data-revision':p.revision,class:'stack-form'},[...field('What should change?',`reason-${p.id}`,'textarea',{rows:'2',maxlength:'1000'}),node('button',{type:'submit'},['Reject this revision'])])]));
    }else card.append(node('p',{class:'meta'},['Sign in with a different authorized reviewer account to approve this proposal.']));
  }
  const actions=node('div',{class:'actions'});
  if(approval&&!intent&&current)actions.append(button('Prepare PayPal checkout','start-checkout',{approval:approval.id},!state.paymentsConfigured));
  if(intent){
    if(intent.approvalUrl&&!intent.captureId&&current)actions.append(node('a',{class:'button primary',href:intent.approvalUrl,target:'_blank',rel:'noopener noreferrer'},['Approve in PayPal sandbox ↗']));
    if(intent.orderId)actions.append(button('Check payment status','reconcile',{id:intent.id}));
    if(current&&['buyer_approved','reconciling'].includes(intent.state)&&intent.orderId&&!intent.captureId)actions.append(button('Confirm sandbox payment','capture',{id:intent.id},!state.paymentsConfigured));
    if(current&&['ready','reconciling'].includes(intent.state)&&!intent.orderId)actions.append(button('Retry original checkout request','create',{id:intent.id},!state.paymentsConfigured));
    if(intent.state==='paid'&&current&&!state.projects.some(project=>project.intentId===intent.id))actions.append(button('Create project kickoff','kickoff',{id:intent.id}));
  }
  if(approval&&!state.paymentsConfigured)actions.append(node('p',{class:'connection-state'},['Connect PayPal sandbox to open checkout.']));
  card.append(actions);return card;
}
async function perform(fn,success){
  if(busy)return;busy=true;document.body.classList.add('working');
  try{await fn();if(success)notice(success);await refresh();}catch(error){notice(error.message,true);await refresh();}finally{busy=false;document.body.classList.remove('working');}
}
document.addEventListener('change',e=>{if(e.target.dataset.source){if(e.target.checked)selected.add(e.target.dataset.source);else selected.delete(e.target.dataset.source);}});
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-action]');if(!b||b.disabled)return;
  const action=b.dataset.action;
  if(action==='refresh'){perform(refresh);return;}
  const paths={'review-source':'/api/sources/review','withdraw-source':'/api/sources/withdraw',reconcile:'/api/payments/reconcile',capture:'/api/payments/capture',create:'/api/payments/create',kickoff:'/api/kickoff',logout:'/api/logout'};
  if(action==='start-checkout'){perform(async()=>{const {intent}=await api('/api/intents',{approvalId:b.dataset.approval});await api('/api/payments/create',{id:intent.id});},'Checkout prepared. Approve it in PayPal sandbox.');return;}
  if(paths[action])perform(()=>api(paths[action],{...(b.dataset.id?{id:b.dataset.id}:{}),...(action==='review-source'?{sensitivity:'ordinary'}:{}),...(['create','capture'].includes(action)?{retryUncertain:true}:{})}),action==='logout'?'Signed out.':action==='withdraw-source'?'Source withdrawn. Dependent proposals must be reviewed again.':action==='kickoff'?'Project kickoff created.':'Workspace updated.');
});
document.addEventListener('submit',e=>{
  e.preventDefault();const form=e.target;
  if(form.id==='login-form'){perform(async()=>{try{await api('/api/login',{username:$('username').value,password:$('password').value});}finally{$('password').value='';}},'Signed in.');return;}
  if(form.id==='source-form'){perform(()=>api('/api/sources',{title:$('source-title').value,content:$('source-content').value}),'Source added to the review queue.');return;}
  if(form.id==='draft-form'){
    const cents=value=>{if(!/^\d+(?:\.\d{1,2})?$/.test(value))throw new Error('Enter USD amounts with no more than two decimal places.');const [whole,fraction='']=value.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));};
    perform(()=>api('/api/drafts',{sourceIds:[...selected],instruction:$('instruction').value,totalCents:cents($('total').value),depositCents:cents($('deposit').value),termsDescription:$('terms').value}),'Draft saved. A different account must review its evidence and commercial terms.');return;
  }
  if(form.dataset.review)perform(()=>api('/api/proposals/review',{id:form.dataset.review,revision:form.dataset.revision,expectedDigest:form.dataset.digest,evidenceReviewed:form.elements.evidence.checked,termsReviewed:form.elements.terms.checked}),'Exact proposal approved.');
  if(form.dataset.reject)perform(()=>api('/api/proposals/reject',{id:form.dataset.reject,revision:form.dataset.revision,reason:form.querySelector('textarea').value}),'Changes requested. This revision cannot be used for checkout.');
});
await refresh();
