import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import fs from 'node:fs/promises';
const repo='RhysAlex/rhysalex.github.io',url='https://rhysalex-studio.rhysalex.workers.dev';
async function run(cmd,args,input){return new Promise((resolve,reject)=>{const child=spawn(cmd,args,{stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.stdin.end(input);child.on('error',reject);child.on('exit',code=>code===0?resolve(out):reject(new Error(err||`${cmd} failed`)))})}
await run('gh',['api','user','--jq','.login']).then(login=>{if(login.trim()!=='RhysAlex')throw new Error('Please use the RhysAlex account')});
const token=randomBytes(32).toString('base64url');
await run('gh',['secret','set','BUILD_TOKEN','--repo',repo],token);
await run(process.execPath,['node_modules/wrangler/bin/wrangler.js','secret','bulk','--config','backend/wrangler.jsonc'],JSON.stringify({BUILD_TOKEN:token}));
await run('gh',['variable','set','BACKEND_URL','--repo',repo,'--body',url]);
const config=JSON.parse(await fs.readFile('site.config.json','utf8'));config.backendRequired=true;await fs.writeFile('site.config.json',JSON.stringify(config,null,2)+'\n');
console.log('Publishing credentials saved securely; backend required for future website builds.');
