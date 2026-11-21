import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
test('sandbox check with absent credentials reports names and creates no runtime state',()=>{
 const dir=mkdtempSync(join(tmpdir(),'commerce-preflight-'));
 try{
  const result=spawnSync(process.execPath,[new URL('../src/cli.mjs',import.meta.url).pathname,'sandbox-check'],{cwd:dir,env:{PATH:process.env.PATH},encoding:'utf8',timeout:10000});
  assert.equal(result.status,1);assert.deepEqual(JSON.parse(result.stdout),{ready:false,missing:['PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','PAYPAL_WEBHOOK_ID']});
  assert.deepEqual(readdirSync(dir),[]);assert.equal(result.stderr,'');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
