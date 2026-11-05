import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {createHandler} from '../backend/index';
import type {Env} from '../backend/types';
import {hash} from '../backend/auth';

test('Owner authentication, private drafts, image storage and atomic publishing',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB');for(const file of ['0001_initial.sql','0002_images.sql'])for(const sql of (await fs.readFile('backend/migrations/'+file,'utf8')).split(';').filter(v=>v.trim()))await db.prepare(sql).run();
  const env={DB:db,ASSETS:{fetch:async()=>new Response('assets')},GITHUB_OWNER_ID:'249475921',GITHUB_REPO:'RhysAlex/rhysalex.github.io',GITHUB_BRANCH:'main',PUBLIC_SITE_URL:'https://rhysalex.github.io',GITHUB_CLIENT_ID:'test-client',GITHUB_CLIENT_SECRET:'test-secret',GITHUB_PUBLISH_TOKEN:'test-publisher',BUILD_TOKEN:'test-build'} as unknown as Env;
  let githubId=249475921,dispatches=0;
  const handler=createHandler(async(url,init)=>{const path=String(url);if(path.includes('login/oauth/access_token'))return Response.json({access_token:'test-oauth-token'});if(path.endsWith('/user'))return Response.json({id:githubId});if(path.endsWith('/dispatches')){dispatches++;return new Response(null,{status:204})}if(path.includes('/runs?'))return Response.json({workflow_runs:[]});throw new Error('Unexpected GitHub endpoint: '+path)});
  const base='https://studio.example';
  const owner='test-session-token';await db.prepare('INSERT INTO sessions(hash,user_id,expires) VALUES(?,?,?)').bind(await hash(owner),'249475921',Date.now()+3600000).run();
  const headers={Cookie:'rhys_session='+owner,Origin:base,'Content-Type':'application/json'};
  const call=(path:string,options:RequestInit={})=>handler.fetch(new Request(base+path,options),env);
  assert.equal((await call('/api/posts')).status,401);
  assert.equal((await call('/api/posts',{headers:{'oai-authenticated-user-id':'249475921'}})).status,401);
  assert.equal((await call('/api/posts',{method:'POST',headers:{...headers,Origin:'https://foreign.example'},body:'{}'})).status,403);
  assert.equal((await call('/api/posts',{method:'POST',headers,body:'{}'})).status,400);
  const login=await call('/auth/github');assert.equal(login.status,302);const authorize=new URL(login.headers.get('location')!);assert.equal(authorize.searchParams.get('code_challenge_method'),'S256');assert.ok(!authorize.searchParams.has('scope'));
  const state=authorize.searchParams.get('state')!,stateCookie=login.headers.get('set-cookie')!.split(';')[0];
  const callback=await call('/auth/callback?code=valid&state='+state,{headers:{Cookie:stateCookie}});assert.equal(callback.status,303);assert.match(callback.headers.get('set-cookie')!,/HttpOnly/);assert.match(callback.headers.get('set-cookie')!,/Secure/);
  assert.equal((await call('/auth/callback?code=valid&state='+state,{headers:{Cookie:stateCookie}})).status,403);
  const second=await call('/auth/github'),secondURL=new URL(second.headers.get('location')!);githubId=12;
  assert.equal((await call('/auth/callback?code=valid&state='+secondURL.searchParams.get('state'),{headers:{Cookie:second.headers.get('set-cookie')!.split(';')[0]}})).status,403);
  const draft={title:'私有草稿',body:'草稿独有内容 secret-draft-content',status:'draft',category:'心得'};
  const privateResult=await call('/api/posts',{method:'POST',headers,body:JSON.stringify(draft)});assert.equal(privateResult.status,200);
  const form=new FormData();form.append('file',new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1cAAAAASUVORK5CYII=','base64')],'image.png',{type:'image/png'}));
  const upload=await call('/api/images',{method:'POST',headers:{Cookie:headers.Cookie,Origin:base},body:form});assert.equal(upload.status,200);const {url:image}=await upload.json() as {url:string};
  assert.equal((await call(image)).status,401);assert.equal((await call(image,{headers})).status,200);
  const post={title:'公开文章',body:`# 正文\n![图](${image})`,status:'published',category:'技术笔记'};
  const save=await call('/api/posts',{method:'POST',headers,body:JSON.stringify(post)});assert.equal(save.status,200);const saved=await save.json() as any;assert.equal(saved.release.state,'pending');assert.equal(dispatches,1);
  const build={Authorization:'Bearer test-build','Content-Type':'application/json'};
  assert.equal((await call('/build/releases/'+saved.release.id)).status,401);
  const snapshot=await (await call('/build/releases/'+saved.release.id,{headers:build})).json() as any;assert.equal(snapshot.posts.length,1);assert.ok(!JSON.stringify(snapshot).includes('secret-draft-content'));assert.equal(snapshot.images.length,1);
  const conflict=await call('/api/posts',{method:'POST',headers,body:JSON.stringify({...post,id:saved.id,title:'不能越过正在发布的版本'})});assert.equal(conflict.status,409);assert.equal((await db.prepare('SELECT title FROM posts WHERE id=?').bind(saved.id).first<any>()).title,'公开文章');
  const missingImage=await call(`/build/releases/${saved.release.id}/media/00000000-0000-4000-8000-000000000000`,{headers:build});assert.equal(missingImage.status,404);
  assert.equal((await call(`/build/releases/${saved.release.id}/media/${image.split('/').at(-1)}`,{headers:build})).status,200);
  assert.equal((await call(`/build/releases/${saved.release.id}/start`,{method:'POST',headers:build,body:JSON.stringify({run_id:'123',attempt:'1'})})).status,200);
  assert.equal((await call(`/build/releases/${saved.release.id}/start`,{method:'POST',headers:build,body:JSON.stringify({run_id:'999',attempt:'1'})})).status,409);
  const noLive=await (await call('/build/releases/latest',{headers:build})).json() as any;assert.equal(noLive.id,'initial');
  assert.equal((await call(`/build/releases/${saved.release.id}/finish`,{method:'POST',headers:build,body:JSON.stringify({run_id:'123',attempt:'1',result:'success'})})).status,200);
  const live=await (await call('/build/releases/latest',{headers:build})).json() as any;assert.equal(live.id,saved.release.id);
  const retract=await call('/api/posts',{method:'POST',headers,body:JSON.stringify({...post,id:saved.id,status:'draft'})});assert.equal(retract.status,200);const withdrawn=await retract.json() as any;
  const withdrawnData=await (await call('/build/releases/'+withdrawn.release.id,{headers:build})).json() as any;assert.equal(withdrawnData.posts.length,0);
  const stillLive=await (await call('/build/releases/latest',{headers:build})).json() as any;assert.equal(stillLive.id,saved.release.id,'Old live version stays available until new deployment succeeds');
  assert.equal((await call('/auth/logout',{method:'POST',headers})).status,303);assert.equal((await call('/api/posts',{headers})).status,401);
 }finally{await mf.dispose()}
});

test('GitHub App publisher signs a short-lived token restricted to the website repository',async()=>{
 const {publisherToken}=await import('../backend/github-app');
 const key=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const der=Buffer.from(await crypto.subtle.exportKey('pkcs8',key.privateKey));
 const pem='-----BEGIN PRIVATE KEY-----\n'+der.toString('base64').match(/.{1,64}/g)!.join('\n')+'\n-----END PRIVATE KEY-----';
 const env={GITHUB_APP_ID:'123',GITHUB_APP_PRIVATE_KEY:pem,GITHUB_INSTALLATION_ID:'456',GITHUB_REPO:'RhysAlex/rhysalex.github.io'} as Env;
 const result=await publisherToken(env,async(url,init)=>{
  assert.equal(String(url),'https://api.github.com/app/installations/456/access_tokens');
  const auth=(init!.headers as Record<string,string>).Authorization.slice(7);const [head,payload,sig]=auth.split('.');
  const decoded=JSON.parse(Buffer.from(payload,'base64url').toString());assert.equal(decoded.iss,'123');assert.ok(decoded.exp-Math.floor(Date.now()/1000)<=540);
  assert.ok(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key.publicKey,Buffer.from(sig,'base64url'),new TextEncoder().encode(head+'.'+payload)));
  assert.deepEqual(JSON.parse(init!.body as string),{repositories:['rhysalex.github.io'],permissions:{actions:'write',contents:'read'}});
  return Response.json({token:'short-lived-test-token'});
 });assert.equal(result,'short-lived-test-token');
});
