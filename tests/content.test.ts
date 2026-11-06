import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {createHandler} from '../backend/index';
import {hash} from '../backend/auth';
import type {Env} from '../backend/types';
import {normalizeSnapshot} from '../shared/public-content.mjs';

test('Projects, multiple associations, drafts, field privacy and deletion survive publication',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']});
 try{
  const DB=await mf.getD1Database('DB');for(const file of (await fs.readdir('backend/migrations')).sort())for(const sql of (await fs.readFile('backend/migrations/'+file,'utf8')).split(';').filter(v=>v.trim()))await DB.prepare(sql).run();
  const env={DB,ASSETS:{fetch:async()=>new Response('assets')},GITHUB_OWNER_ID:'249475921',GITHUB_REPO:'RhysAlex/rhysalex.github.io',GITHUB_BRANCH:'main',PUBLIC_SITE_URL:'https://rhysalex.github.io',GITHUB_PUBLISH_TOKEN:'test-token',BUILD_TOKEN:'test-build'} as unknown as Env;
  const handler=createHandler(async(url)=>String(url).endsWith('/dispatches')?new Response(null,{status:204}):Response.json({workflow_runs:[]}));
  const origin='https://studio.example',session='owner-session';await DB.prepare('INSERT INTO sessions(hash,user_id,expires) VALUES(?,?,?)').bind(await hash(session),env.GITHUB_OWNER_ID,Date.now()+3600000).run();
  const headers={Cookie:'rhys_session='+session,Origin:origin,'Content-Type':'application/json'},build={Authorization:'Bearer test-build','Content-Type':'application/json'};
  const request=(path:string,init:RequestInit={})=>handler.fetch(new Request(origin+path,init),env);
  async function post(path:string,body:unknown,status=200){const r=await request(path,{method:'POST',headers,body:JSON.stringify(body)});const data=await r.json() as any;assert.equal(r.status,status,JSON.stringify(data));return data;}
  async function finish(release:any){if(!release)return;const id=release.id;for(const phase of ['start','finish']){const r=await request(`/build/releases/${id}/${phase}`,{method:'POST',headers:build,body:JSON.stringify({run_id:'123',attempt:'1',result:'success'})});assert.equal(r.status,200)}}
  async function snapshot(id='latest'){const r=await request('/build/releases/'+id,{headers:build});assert.equal(r.status,200);return await r.json() as any;}
  for(const path of ['/api/projects','/api/profile','/api/tags'])assert.equal((await request(path)).status,401);
  await post('/api/projects',{title:'Invalid',state:'学习中',start_date:'2026-03-02',end_date:'2026-02-01'},400);
  await post('/api/projects',{title:'Invalid',start_date:'2026-99-99'},400);
  await post('/api/projects',{title:'Invalid',source_url:'javascript:alert(1)'},400);
  const projectA={title:'项目甲',summary:'A summary',body:'## 项目详情 A',tags:['缓存'],tech_stack:['Redis'],state:'学习中',visibility:'public',start_date:'2026-01-01',end_date:'',position:1,action:'publish'};
  const a=await post('/api/projects',projectA);await finish(a.release);
  const projectB={...projectA,title:'隐藏项目秘密名称',summary:'hidden-project-summary',body:'hidden-project-body',tags:['hidden-only-tag'],position:2,visibility:'private'};
  const b=await post('/api/projects',projectB);await finish(b.release);
  const projectC={...projectA,title:'项目丙',position:0,state:'已完成',end_date:'2026-02-01'};
  const c=await post('/api/projects',projectC);await finish(c.release);
  const article={title:'跨项目文章',body:'Public technical content',summary:'Article summary',category:'项目实践',tags:['Redis','实践'],status:'published',visibility:'public',project_ids:[a.id,b.id,c.id]};
  const p=await post('/api/posts',article);await finish(p.release);
  const result=await snapshot();assert.equal(result.posts.length,1);assert.equal(result.projects.length,2);assert.equal(result.projects[0].id,c.id);assert.deepEqual(result.posts[0].project_ids,[a.id,c.id]);assert.ok(!JSON.stringify(result).includes('hidden-project'));assert.ok(!JSON.stringify(result).includes('hidden-only-tag'));assert.ok(!JSON.stringify(result).includes(b.id));
  await post('/api/posts',{...article,id:p.id,title:'尚未发布的标题',status:'draft'});assert.equal((await snapshot()).posts[0].title,'跨项目文章','Saving a draft preserves the approved public copy');
  const hidden=await post('/api/projects',{...projectA,id:a.id,visibility:'private'});const pending=await snapshot(hidden.release.id);assert.equal(pending.posts.length,1);assert.deepEqual(pending.posts[0].project_ids,[c.id]);await finish(hidden.release);assert.equal((await snapshot()).posts[0].title,'跨项目文章');
  await post('/api/posts',{...article,project_ids:['00000000-0000-4000-8000-999999999999']},400);
  const profile={name:{value:'公开姓名',public:true},birthDate:{value:'2000-01-01',public:false},email:{value:'secret@example.invalid',public:false},skills:{value:'Redis / Java',public:true},education:[{school:{value:'公开学校',public:true},major:{value:'隐藏专业',public:false},degree:{value:'本科',public:true}}],experience:[{company:{value:'隐藏公司',public:false},role:{value:'公开职位',public:true}}]};
  const pr=await post('/api/profile',{action:'publish',profile});const exported=await snapshot(pr.release.id);const serialized=JSON.stringify(exported);for(const secret of ['2000-01-01','secret@example.invalid','隐藏专业','隐藏公司'])assert.ok(!serialized.includes(secret),secret+' must never reach build export');assert.equal(exported.profile.name,'公开姓名');assert.equal(exported.profile.education[0].school,'公开学校');await finish(pr.release);
  await post('/api/profile',{action:'save',profile:{...profile,name:{value:'未发布姓名',public:true}}});assert.equal((await snapshot()).profile.name,'公开姓名');
  const privatePost=await post('/api/posts',{...article,id:p.id,visibility:'private'});assert.equal((await snapshot(privatePost.release.id)).posts.length,0);await finish(privatePost.release);
  const republish=await post('/api/posts',{...article,id:p.id});await finish(republish.release);
  const deletion=await request('/api/projects?id='+c.id,{method:'DELETE',headers});assert.equal(deletion.status,200);const deleted=await deletion.json() as any;const after=await snapshot(deleted.release.id);assert.equal(after.posts.length,1);assert.equal(after.posts[0].project_ids.length,0);await finish(deleted.release);
  const ownerPosts=await (await request('/api/posts',{headers})).json() as any[];assert.equal(ownerPosts.length,1);assert.ok(!ownerPosts[0].project_ids.includes(c.id));
  const privacyOff=await post('/api/profile',{action:'publish',profile:{name:{value:'公开姓名',public:false},education:[],experience:[]}});assert.deepEqual((await snapshot(privacyOff.release.id)).profile,{education:[],experience:[]});await finish(privacyOff.release);
  const legacy=normalizeSnapshot([{id:p.id,title:'旧文章',body:'Old body',status:'published',tags:'["old"]'}]);assert.equal(legacy.projects[0].slug,'dianping');assert.deepEqual(legacy.posts[0].tags,['old']);
  const tags=await (await request('/api/tags',{headers})).json() as string[];assert.ok(tags.includes('Redis'));assert.ok(tags.includes('hidden-only-tag'),'Private tags are available only to owner');
 }finally{await mf.dispose()}
});
