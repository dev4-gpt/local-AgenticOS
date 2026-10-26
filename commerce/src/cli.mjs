import {mkdirSync,existsSync,lstatSync,openSync,closeSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {CommerceStore} from './store.mjs';
import {CommerceAuth} from './auth.mjs';
import {createCommerceServer} from './server.mjs';
import {createPayPalClient} from './paypal.mjs';
import {createOllamaDrafter,createClaudeDrafter} from './drafting.mjs';

function arg(name,fallback){const i=process.argv.indexOf(`--${name}`);return i<0?fallback:process.argv[i+1];}
function privateDatabase(){
  const dir=resolve(arg('data-dir','data'));
  if(!existsSync(dir))mkdirSync(dir,{recursive:true,mode:0o700});
  const info=lstatSync(dir);
  if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)!==0)throw new Error('Use a private data directory with mode 0700.');
  const path=join(dir,'commerce.sqlite');
  if(!existsSync(path))closeSync(openSync(path,'wx',0o600));
  const file=lstatSync(path);if(!file.isFile()||file.isSymbolicLink()||(file.mode&0o077)!==0)throw new Error('The database must be a private regular file with mode 0600.');
  return path;
}
async function hiddenPassword(prompt){
  if(!process.stdin.isTTY)throw new Error('Provision accounts interactively in your own terminal.');
  process.stdout.write(prompt);process.stdin.setRawMode(true);process.stdin.resume();
  return new Promise((resolve,reject)=>{
    let value='';
    function cleanup(){process.stdin.off('data',onData);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');}
    function onData(chunk){for(const char of chunk.toString('utf8')){
      if(char==='\u0003'){cleanup();reject(new Error('Account provisioning cancelled.'));return;}
      if(char==='\r'||char==='\n'){cleanup();resolve(value);return;}
      if(char==='\u007f'||char==='\b')value=value.slice(0,-1);else if(char>=' '&&value.length<1024)value+=char;
    }}process.stdin.on('data',onData);
  });
}
const command=process.argv[2]??'help';
if(command==='help'){
  process.stdout.write('Veloce Commerce (Node 24)\n\ninit --tenant owner-dev --merchant SANDBOX_MERCHANT_ID\nuser --tenant owner-dev --username YOUR_USERNAME --role owner|admin|member\nserve --tenant owner-dev --port 4141\nretention --tenant owner-dev [--apply] [--batch 100] [--compact]\n\nAll commands accept --data-dir PATH (private, mode 0700).\nPasswords are entered privately in your own terminal.\nProvider configuration is documented in README.md; paid services are not enabled.\n');
}else{
  let store,auth;
  try{
    const path=privateDatabase(),tenant=arg('tenant','owner-dev');store=new CommerceStore(path);
    if(command==='init'){
      store.configureWorkspace({tenant,policyVersion:'commerce-v1',merchantId:arg('merchant')});
      process.stdout.write('Workspace initialized. Provision separate author and reviewer accounts next.\n');
    }else if(command==='user'){
      auth=new CommerceAuth(path);
      const username=arg('username'),role=arg('role','member');
      if(!['owner','admin','member'].includes(role))throw new Error('Choose owner, admin or member.');
      const secret=await hiddenPassword('Password (12 or more characters; hidden): '),confirmation=await hiddenPassword('Confirm password (hidden): ');
      if(secret!==confirmation)throw new Error('Passwords did not match.');
      const user=await auth.createUser(username,secret);store.setMember({tenant,subject:user.subject,role});
      process.stdout.write('Local account created. Sign in through the workspace.\n');
    }else if(command==='retention'){
      const apply=process.argv.includes('--apply'),compact=process.argv.includes('--compact');
      if(compact&&!apply)throw new Error('Compaction requires applying the content purge.');
      const report=store.purgeContent(tenant,{apply,batch:Number(arg('batch','100'))});
      if(compact)Object.assign(report,store.compactContentStorage());
      process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
    }else if(command==='serve'){
      auth=new CommerceAuth(path);
      const port=Number(arg('port','4141'));
      if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Choose a port between 1024 and 65535.');
      const origin=`http://127.0.0.1:${port}`;
      // Runtime may read its own configured credentials. No credential value is printed or returned.
      const paypal=process.env.COMMERCE_PAYPAL_ENABLED==='1'?createPayPalClient({clientId:process.env.PAYPAL_CLIENT_ID,clientSecret:process.env.PAYPAL_CLIENT_SECRET,webhookId:process.env.PAYPAL_WEBHOOK_ID}):null;
      const drafter=process.env.COMMERCE_DRAFT_PROVIDER==='claude-cli'?createClaudeDrafter():process.env.COMMERCE_OLLAMA_MODEL?createOllamaDrafter({model:process.env.COMMERCE_OLLAMA_MODEL}):null;
      const server=createCommerceServer({store,auth,tenant,origin,paypal,drafter});
      const liveStore=store,liveAuth=auth;
      server.listen(port,'127.0.0.1',()=>process.stdout.write(`Veloce Commerce: ${origin}\nSandbox-only. Model ${drafter?'configured':'not configured'}; PayPal ${paypal?'configured':'not configured'}.\n`));
      const stop=()=>server.close(()=>{liveStore.close();liveAuth.close();process.exit(0);});process.on('SIGINT',stop);process.on('SIGTERM',stop);
      server.on('error',()=>{process.stderr.write('The local server could not start. Check the port and data directory.\n');liveStore.close();liveAuth.close();process.exit(1);});
      store=null;auth=null; // Server lifecycle owns the captured live instances.
    }else throw new Error('Unknown command. Run node src/cli.mjs help.');
  }catch(error){process.stderr.write(`Setup failed: ${error.code??(error.message?.startsWith('Use a private')||error.message?.startsWith('The database')?error.message:'check the command and local configuration')}\n`);process.exitCode=1;}
  finally{store?.close();auth?.close();}
}
