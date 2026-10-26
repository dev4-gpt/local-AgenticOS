import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CommerceAuth} from '../src/auth.mjs';
const secret='test-only long password';
test('local accounts authenticate; bearer and CSRF tokens are hashed in durable storage',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'veloce-auth-')),path=join(dir,'test.sqlite');const auth=new CommerceAuth(path);
  try{
    const user=await auth.createUser('Owner-Test',secret),session=await auth.login('OWNER-TEST',secret);
    assert.equal(auth.authenticate(session.sessionToken,session.csrfToken).subject,user.subject);
    assert.throws(()=>auth.authenticate(session.sessionToken,'a'.repeat(64)),e=>e.code==='invalid_csrf');
    const db=new DatabaseSync(path);try{
      const row=db.prepare('SELECT * FROM commerce_sessions').get();assert.notEqual(row.token_hash,session.sessionToken);assert.notEqual(row.csrf_hash,session.csrfToken);
      const stored=db.prepare('SELECT * FROM commerce_users').get();assert.notEqual(stored.verifier,secret);assert.equal(stored.verifier.length,128);
    }finally{db.close();}
    auth.logout(session.sessionToken);assert.throws(()=>auth.authenticate(session.sessionToken),e=>e.code==='sign_in_required');
  }finally{auth.close();rmSync(dir,{recursive:true,force:true});}
});
test('incorrect credentials, nonexistent user and deactivated accounts yield same credential error',async()=>{
  const auth=new CommerceAuth(':memory:');try{
    const user=await auth.createUser('test-user',secret);
    for(const [name,pw] of [['test-user','wrong'],['nonexistent',secret]])await assert.rejects(()=>auth.login(name,pw),e=>e.code==='invalid_credentials');
    const s=await auth.login('test-user',secret);auth.setActive(user.subject,false);
    assert.throws(()=>auth.authenticate(s.sessionToken),e=>e.code==='sign_in_required');
    await assert.rejects(()=>auth.login('test-user',secret),e=>e.code==='invalid_credentials');
  }finally{auth.close();}
});
test('session expires at its boundary and survives only its original lifetime after restart',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'veloce-session-')),path=join(dir,'test.sqlite');let now=1000,auth=new CommerceAuth(path,{clock:()=>now});
  try{
    await auth.createUser('test-user',secret);const s=await auth.login('test-user',secret);auth.close();
    auth=new CommerceAuth(path,{clock:()=>now});assert.ok(auth.authenticate(s.sessionToken).subject);
    now=s.expiresAt;assert.throws(()=>auth.authenticate(s.sessionToken),e=>e.code==='sign_in_required');
  }finally{auth.close();rmSync(dir,{recursive:true,force:true});}
});
test('login attempts are bounded durably without storing usernames or addresses in limit keys',async()=>{
  const auth=new CommerceAuth(':memory:');try{
    for(let n=0;n<8;n++)await assert.rejects(()=>auth.login('missing-user','wrong'),e=>e.code==='invalid_credentials');
    await assert.rejects(()=>auth.login('missing-user','wrong'),e=>e.code==='login_rate_limited');
    await assert.rejects(()=>auth.createUser('test-user','short'),e=>e.code==='password_requirements');
  }finally{auth.close();}
});
