/** Private operator snapshot files. Never log or send their content through HTTP. */
import {openSync,closeSync,fstatSync,readFileSync,writeFileSync,lstatSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {constants} from 'node:fs';
import {CommerceError,sha256} from './proposals.mjs';
import {SNAPSHOT_MAX_BYTES} from './recovery.mjs';
const fail=code=>{throw new CommerceError(code);};
function parent(path){
 const dir=lstatSync(dirname(path));if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)!==0)fail('snapshot_directory_not_private');
}
export function writePrivateSnapshot(path,snapshot){
 if(typeof path!=='string'||!path)fail('snapshot_path_required');path=resolve(path);parent(path);
 const data=JSON.stringify(snapshot);if(Buffer.byteLength(data)>SNAPSHOT_MAX_BYTES)fail('snapshot_too_large');
 const fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{writeFileSync(fd,data,{encoding:'utf8'});}finally{closeSync(fd);}
 return {snapshotDigest:sha256(data),bytes:Buffer.byteLength(data)};
}
export function readPrivateSnapshot(path){
 if(typeof path!=='string'||!path)fail('snapshot_path_required');path=resolve(path);parent(path);
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const info=fstatSync(fd);if(!info.isFile()||(info.mode&0o077)!==0)fail('snapshot_file_not_private');
  if(info.size>SNAPSHOT_MAX_BYTES)fail('snapshot_too_large');
  const raw=readFileSync(fd,'utf8');if(Buffer.byteLength(raw)>SNAPSHOT_MAX_BYTES)fail('snapshot_too_large');
  try{return JSON.parse(raw);}catch{fail('invalid_snapshot');}
 }finally{closeSync(fd);}
}
