/** Dedicated local runtime journal. Stores fingerprints/generated results, not request source bodies or host credentials. */
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {lstatSync,existsSync,openSync,closeSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {CommerceError} from './proposals.mjs';
const DAY=86400000,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const fail=code=>{throw new CommerceError(code);};
function privatePath(path){
 if(path===':memory:')return path;
 if(typeof path!=='string'||!path)fail('invalid_runtime_configuration');const full=resolve(path),dir=lstatSync(dirname(full));
 if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)!==0)fail('runtime_directory_not_private');
 if(!existsSync(full))closeSync(openSync(full,'wx',0o600));const file=lstatSync(full);
 if(!file.isFile()||file.isSymbolicLink()||(file.mode&0o077)!==0)fail('runtime_file_not_private');return full;
}
export class CommerceDraftJournal{
 #db;#clock;#durable;
 constructor(path,{clock=Date.now}={}){
  if(typeof clock!=='function')fail('invalid_runtime_configuration');this.#clock=clock;this.#durable=path!==':memory:';this.#db=new DatabaseSync(privatePath(path),{timeout:5000});
  const names=this.#db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name);
  if(names.some(name=>!['commerce_runtime_tasks','commerce_runtime_tokens'].includes(name))){this.#db.close();fail('dedicated_runtime_database_required');}
  this.#db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;
   CREATE TABLE IF NOT EXISTS commerce_runtime_tasks(
    tenant TEXT NOT NULL,id TEXT NOT NULL,request_hash TEXT NOT NULL,idempotency_key TEXT NOT NULL,
    source_ids TEXT NOT NULL CHECK(json_valid(source_ids)),expires_at INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN('running','succeeded','uncertain')),claim TEXT NOT NULL,
    payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(tenant,id),UNIQUE(tenant,idempotency_key)
   ) STRICT;
   CREATE TABLE IF NOT EXISTS commerce_runtime_tokens(jti TEXT PRIMARY KEY,tenant TEXT NOT NULL,expires_at INTEGER NOT NULL) STRICT;`);
 }
 get durable(){return this.#durable;}
 close(){this.#db.close();}
 #now(){const now=this.#clock();if(!Number.isSafeInteger(now)||now<0)fail('invalid_time');return now;}
 #tx(fn){this.#db.exec('BEGIN IMMEDIATE');try{const result=fn();this.#db.exec('COMMIT');return result;}catch(error){this.#db.exec('ROLLBACK');throw error;}}
 #tenant(tenant){if(typeof tenant!=='string'||!/^[a-z][a-z0-9-]{2,40}$/.test(tenant))fail('invalid_tenant');}
 #id(id){if(typeof id!=='string'||!UUID.test(id))fail('invalid_runtime_task');}
 #consume(claims){
  this.#tenant(claims.tenant);this.#id(claims.jti);const expiry=claims.exp*1000,now=this.#now();
  if(!Number.isSafeInteger(expiry)||expiry<=now||expiry>now+330000)fail('invalid_host_token');
  if(this.#db.prepare('SELECT 1 FROM commerce_runtime_tokens WHERE jti=?').get(claims.jti))fail('host_token_replayed');
  this.#db.prepare('INSERT INTO commerce_runtime_tokens VALUES(?,?,?)').run(claims.jti,claims.tenant,expiry);
 }
 #task(tenant,id){this.#tenant(tenant);this.#id(id);const row=this.#db.prepare('SELECT * FROM commerce_runtime_tasks WHERE tenant=? AND id=?').get(tenant,id);if(!row||row.expires_at<=this.#now())fail('not_found');return row;}
 #view(row){return {id:row.id,tenant:row.tenant,status:row.status,expiresAt:new Date(row.expires_at).toISOString(),sourceIds:JSON.parse(row.source_ids),...(row.status==='succeeded'?{result:JSON.parse(row.payload)}:{})};}
 /** Privileged call after signature/body/handles verification. Consumption and claim commit before provider work. */
 claim(claims,{id,idempotencyKey,requestHash,sourceIds,expiresAt}){
  return this.#tx(()=>{
   this.#id(id);this.#tenant(claims.tenant);
   const expiry=Date.parse(expiresAt),now=this.#now();
   if(typeof requestHash!=='string'||!/^[a-f0-9]{64}$/.test(requestHash)||typeof idempotencyKey!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$/.test(idempotencyKey)||!Array.isArray(sourceIds)||!sourceIds.length||sourceIds.length>5||new Set(sourceIds).size!==sourceIds.length||sourceIds.some(id=>typeof id!=='string'||!UUID.test(id))||!Number.isSafeInteger(expiry)||expiry<=now||expiry>now+28*DAY)fail('invalid_runtime_task');
   this.#consume(claims);
   const prior=this.#db.prepare('SELECT * FROM commerce_runtime_tasks WHERE tenant=? AND (id=? OR idempotency_key=?)').all(claims.tenant,id,idempotencyKey);
   if(prior.length){
    if(prior.length!==1||prior[0].id!==id||prior[0].idempotency_key!==idempotencyKey||prior[0].request_hash!==requestHash||prior[0].expires_at!==expiry)fail('runtime_task_conflict');
    if(prior[0].expires_at<=now)fail('not_found');return {admitted:false,task:this.#view(prior[0])};
   }
   const claim=randomUUID();
   this.#db.prepare("INSERT INTO commerce_runtime_tasks VALUES(?,?,?,?,?,?,'running',?,'{}')").run(claims.tenant,id,requestHash,idempotencyKey,JSON.stringify(sourceIds),expiry,claim);
   return {admitted:true,claim,task:{id,tenant:claims.tenant,status:'running',expiresAt}};
  });
 }
 complete(tenant,id,claim,result){
  return this.#tx(()=>{
   const row=this.#task(tenant,id);if(row.claim!==claim||row.status!=='running')fail('runtime_claim_lost');
   const payload=JSON.stringify(result);if(Buffer.byteLength(payload)>128000)fail('invalid_draft');
   this.#db.prepare("UPDATE commerce_runtime_tasks SET status='succeeded',payload=? WHERE tenant=? AND id=? AND claim=? AND status='running'").run(payload,tenant,id,claim);
   return this.#view({...row,status:'succeeded',payload});
  });
 }
 uncertain(tenant,id,claim){this.#tenant(tenant);this.#id(id);this.#db.prepare("UPDATE commerce_runtime_tasks SET status='uncertain' WHERE tenant=? AND id=? AND claim=? AND status='running'").run(tenant,id,claim);}
 /** Authenticate first, inspect stored handle IDs, then consume a fresh single-use read/cancel token. */
 handles(tenant,id){return JSON.parse(this.#task(tenant,id).source_ids);}
 observe(claims,id,{cancel=false}={}){
  return this.#tx(()=>{const row=this.#task(claims.tenant,id);this.#consume(claims);
   if(cancel&&row.status==='running'){this.#db.prepare("UPDATE commerce_runtime_tasks SET status='uncertain' WHERE tenant=? AND id=?").run(claims.tenant,id);row.status='uncertain';}
   return this.#view(row);
  });
 }
 consume(claims){return this.#tx(()=>{this.#consume(claims);return true;});}
 /** Offline operator compaction; does not erase filesystem snapshots or external provider copies. */
 compact(){
  if(this.#db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get().busy)fail('runtime_maintenance_busy');
  this.#db.exec('VACUUM');
  if(this.#db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get().busy)fail('runtime_maintenance_busy');
  return {localCompaction:'completed',externalCopies:'outside_local_database_guarantee'};
 }
 purge(tenant,{apply=false,batch=100}={}){
  this.#tenant(tenant);if(typeof apply!=='boolean'||!Number.isSafeInteger(batch)||batch<1||batch>1000)fail('invalid_maintenance_options');
  return this.#tx(()=>{
   const now=this.#now(),tasks=this.#db.prepare("SELECT id FROM commerce_runtime_tasks WHERE tenant=? AND expires_at<=? AND payload<>'{}' LIMIT ?").all(tenant,now-7*DAY,batch);
   const tokens=this.#db.prepare('SELECT jti FROM commerce_runtime_tokens WHERE tenant=? AND expires_at<=? LIMIT ?').all(tenant,now-DAY,batch);
   if(apply){for(const row of tasks)this.#db.prepare("UPDATE commerce_runtime_tasks SET payload='{}' WHERE tenant=? AND id=?").run(tenant,row.id);for(const row of tokens)this.#db.prepare('DELETE FROM commerce_runtime_tokens WHERE tenant=? AND jti=?').run(tenant,row.jti);}
   return {tenant,applied:apply,tasksRedacted:tasks.length,tokensRemoved:tokens.length,skeletons:'retained_to_prevent_redispatch',externalCopies:'outside_local_database_guarantee'};
  });
 }
}
