/** Public-key-only verification of Veloce h1 request-bound tokens. No credentials/files/network. */
import {createPublicKey,verify,KeyObject} from 'node:crypto';
import {CommerceError,sha256} from './proposals.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const operations=new Set(['manifest','health','task.run','task.get','task.result','task.cancel']);
export const hostRequestHash=(method,path,body='')=>sha256(`${method}\n${path}\n${body}`);
export function createHostTokenVerifier({tenant,publicKeys,adapterId='veloce-commerce'}){
 if(typeof tenant!=='string'||!/^[a-z][a-z0-9-]{2,40}$/.test(tenant)||adapterId!=='veloce-commerce'||!Array.isArray(publicKeys)||publicKeys.length<1||publicKeys.length>3)throw new CommerceError('invalid_host_configuration');
 const keys=publicKeys.map(input=>{
  try{
   if(typeof input==='string'&&!/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PUBLIC KEY-----\s*$/.test(input))throw new Error();
   const key=typeof input==='string'?createPublicKey(input):input;
   if(!(key instanceof KeyObject)||key.asymmetricKeyType!=='ed25519'||key.type!=='public')throw new Error();return key;
  }catch{throw new CommerceError('invalid_host_configuration');}
 });
 return ({token,operation,requestSha256,sourceIds=[],now=Math.floor(Date.now()/1000)})=>{
  try{
   if(!operations.has(operation)||typeof requestSha256!=='string'||!/^[a-f0-9]{64}$/.test(requestSha256)||!Number.isSafeInteger(now)||now<0||typeof token!=='string'||token.length>4096||!/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]+$/.test(token))return null;
   const [body,sig]=token.split('.'),signature=Buffer.from(sig,'base64url');
   if(signature.length!==64||signature.toString('base64url')!==sig||!keys.some(key=>verify(null,Buffer.from(body),key,signature)))return null;
   const c=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
   if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!['v','iss','tenant','aud','scope','handles','requestSha256','jti','iat','exp'].includes(k)))return null;
   if(c.v!=='h1'||c.iss!=='veloce-host'||c.tenant!==tenant||c.aud!==adapterId||!Array.isArray(c.scope)||c.scope.length!==1||c.scope[0]!==operation||c.requestSha256!==requestSha256||!UUID.test(c.jti)||!Number.isSafeInteger(c.iat)||!Number.isSafeInteger(c.exp)||c.iat<0||c.exp<=c.iat||c.exp-c.iat>300||c.iat>now+30||c.exp<=now)return null;
   if(c.handles!==undefined&&(!Array.isArray(c.handles)||!c.handles.length||c.handles.length>20||new Set(c.handles).size!==c.handles.length||c.handles.some(id=>typeof id!=='string'||!UUID.test(id))))return null;
   if(!Array.isArray(sourceIds)||sourceIds.some(id=>typeof id!=='string'||!UUID.test(id)||!c.handles?.includes(id)))return null;
   return Object.freeze({...c,scope:Object.freeze([...c.scope]),...(c.handles?{handles:Object.freeze([...c.handles])}:{})});
  }catch{return null;}
 };
}
