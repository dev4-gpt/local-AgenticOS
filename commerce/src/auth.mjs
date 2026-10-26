/** Local standalone authentication. Only provisioning code may create users or change activation. */
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {CommerceError,sha256} from './proposals.mjs';
const derive=promisify(scrypt),fail=code=>{throw new CommerceError(code);};
const policy={N:131072,r:8,p:1,maxmem:192*1024*1024};
const token=()=>randomBytes(32).toString('hex');
function username(value){
  if(typeof value!=='string'||!/^[-A-Za-z0-9._@+]{3,100}$/.test(value))fail('invalid_username');
  return value.toLowerCase();
}
function password(value,creation=false){
  if(typeof value!=='string'||value.length<(creation?12:1)||value.length>1024)fail(creation?'password_requirements':'invalid_credentials');
  return value;
}
export class CommerceAuth {
  #db;#clock;
  constructor(path,{clock=Date.now}={}){
    this.#db=new DatabaseSync(path,{timeout:5000});this.#clock=clock;
    this.#db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS commerce_users (
        id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,salt TEXT NOT NULL,verifier TEXT NOT NULL,active INTEGER NOT NULL CHECK(active IN(0,1))
      ) STRICT;
      CREATE TABLE IF NOT EXISTS commerce_sessions (
        token_hash TEXT PRIMARY KEY,csrf_hash TEXT NOT NULL,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL,
        FOREIGN KEY(user_id) REFERENCES commerce_users(id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS commerce_login_limits (
        bucket TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at INTEGER NOT NULL
      ) STRICT;
    `);
  }
  close(){this.#db.close();}
  async createUser(login,secret){
    const name=username(login);password(secret,true);
    const salt=randomBytes(32).toString('hex'),verifier=await derive(secret,salt,64,policy);
    const id=randomUUID();
    try{this.#db.prepare('INSERT INTO commerce_users VALUES(?,?,?,?,1)').run(id,name,salt,verifier.toString('hex'));}
    catch{fail('user_already_exists');}
    return {subject:id,username:name};
  }
  setActive(subject,active){
    if(typeof active!=='boolean')fail('invalid_input');
    this.#db.exec('BEGIN IMMEDIATE');
    try{
      this.#db.prepare('UPDATE commerce_users SET active=? WHERE id=?').run(active?1:0,subject);
      this.#db.prepare('DELETE FROM commerce_sessions WHERE user_id=?').run(subject);
      this.#db.exec('COMMIT');
    }catch(error){this.#db.exec('ROLLBACK');throw error;}
  }
  #attempt(login,remote){
    const now=this.#clock();
    this.#db.exec('BEGIN IMMEDIATE');
    try{
      this.#db.prepare('DELETE FROM commerce_login_limits WHERE expires_at<=?').run(now);
      for(const [bucket,cap] of [[sha256(`user:${login}`),8],[sha256(`remote:${remote}`),24]]){
        const row=this.#db.prepare('SELECT attempts FROM commerce_login_limits WHERE bucket=?').get(bucket);
        if(row?.attempts>=cap)fail('login_rate_limited');
        this.#db.prepare('INSERT INTO commerce_login_limits VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1').run(bucket,now+15*60*1000);
      }
      this.#db.exec('COMMIT');
    }catch(error){this.#db.exec('ROLLBACK');throw error;}
  }
  async login(login,secret,remote='local'){
    let name;try{name=username(login);}catch{fail('invalid_credentials');}
    password(secret);if(typeof remote!=='string'||remote.length>200)fail('invalid_credentials');
    this.#attempt(name,remote);
    const row=this.#db.prepare('SELECT * FROM commerce_users WHERE username=?').get(name);
    // Perform the same costly derivation even when the account does not exist.
    const computed=await derive(secret,row?.salt??'0'.repeat(64),64,policy);
    const expected=Buffer.from(row?.verifier??'0'.repeat(128),'hex');
    if(!timingSafeEqual(computed,expected)||!row||row.active!==1)fail('invalid_credentials');
    // Recheck activation after asynchronous derivation; a revocation racing login must win.
    const active=this.#db.prepare('SELECT active FROM commerce_users WHERE id=?').get(row.id);
    if(active?.active!==1)fail('invalid_credentials');
    const sessionToken=token(),csrfToken=token(),expiresAt=this.#clock()+60*60*1000;
    this.#db.prepare('DELETE FROM commerce_sessions WHERE expires_at<=?').run(this.#clock());
    this.#db.prepare('INSERT INTO commerce_sessions VALUES(?,?,?,?)').run(sha256(sessionToken),sha256(csrfToken),row.id,expiresAt);
    return {sessionToken,csrfToken,expiresAt,subject:row.id,username:name};
  }
  authenticate(sessionToken,csrfToken){
    if(typeof sessionToken!=='string'||!/^[a-f0-9]{64}$/.test(sessionToken))fail('sign_in_required');
    const row=this.#db.prepare(`SELECT s.*,u.username,u.active FROM commerce_sessions s JOIN commerce_users u ON u.id=s.user_id WHERE token_hash=?`).get(sha256(sessionToken));
    if(!row||row.active!==1||row.expires_at<=this.#clock())fail('sign_in_required');
    if(csrfToken!==undefined){
      if(typeof csrfToken!=='string'||!/^[a-f0-9]{64}$/.test(csrfToken)||!timingSafeEqual(Buffer.from(sha256(csrfToken),'hex'),Buffer.from(row.csrf_hash,'hex')))fail('invalid_csrf');
    }
    return {subject:row.user_id,username:row.username,expiresAt:row.expires_at};
  }
  logout(sessionToken){
    if(typeof sessionToken==='string')this.#db.prepare('DELETE FROM commerce_sessions WHERE token_hash=?').run(sha256(sessionToken));
  }
}
