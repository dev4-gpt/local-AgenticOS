/** Webhook-only loopback ingress. HTTPS forwarding must be configured separately by the operator. */
import {createServer} from 'node:http';
import {CommerceError} from './proposals.mjs';
import {createPaymentService} from './payments.mjs';
export function createWebhookReceiver({store,paypal,maxConcurrent=4}){
 if(!store||!paypal||!Number.isSafeInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>16)throw new CommerceError('invalid_receiver_configuration');
 const payments=createPaymentService(store,paypal);let active=0;
 const server=createServer({maxHeaderSize:16_384},async(request,response)=>{
  response.setHeader('Cache-Control','no-store');response.setHeader('Content-Type','application/json');response.setHeader('X-Content-Type-Options','nosniff');
  const send=(status,error)=>{response.writeHead(status);response.end(JSON.stringify(error?{ok:false,error}:{ok:true}));};
  // Reject every other surface, including health, assets, login, redirects and query variants.
  if(request.url!=='/api/paypal/webhook'){request.resume();send(404,'not_found');return;}
  if(request.method!=='POST'){request.resume();send(405,'method_not_allowed');return;}
  if(request.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json'){request.resume();send(415,'invalid_content_type');return;}
  if(active>=maxConcurrent){request.resume();response.setHeader('Retry-After','10');send(503,'receiver_busy');return;}
  const declared=Number(request.headers['content-length']);if(Number.isFinite(declared)&&declared>128_000){request.resume();send(413,'payload_too_large');return;}
  active++;
  try{
   const headers=new Headers();
   for(const field of ['auth-algo','cert-url','transmission-id','transmission-sig','transmission-time']){
    const value=request.headers[`paypal-${field}`];if(typeof value!=='string')throw new CommerceError('invalid_webhook');headers.set(`paypal-${field}`,value);
   }
   const chunks=[];let size=0;
   for await(const chunk of request){size+=chunk.length;if(size>128_000)throw new CommerceError('payload_too_large');chunks.push(chunk);}
   await payments.webhook(Buffer.concat(chunks).toString('utf8'),headers);send(200);
  }catch(error){
   const code=error instanceof CommerceError?error.code:'provider_unavailable';
   const invalid=['invalid_webhook','invalid_webhook_signature','payment_mismatch','event_identity_conflict'];
   send(code==='payload_too_large'?413:invalid.includes(code)?400:503,invalid.includes(code)||code==='payload_too_large'?code:'verification_unavailable');
  }finally{active--;}
 });
 server.requestTimeout=15_000;server.headersTimeout=10_000;server.keepAliveTimeout=1000;
 return server;
}
