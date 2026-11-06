import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {normalizeSnapshot} from '../shared/public-content.mjs';

test('Generated Pages contains only public projects, article links, tags and allowed profile fields',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rhys-static-'));const root=process.cwd();
 try{
  for(const name of ['src','shared'])await fs.cp(path.join(root,name),path.join(temp,name),{recursive:true});
  for(const name of ['astro.config.mjs','package.json'])await fs.copyFile(path.join(root,name),path.join(temp,name));
  await fs.mkdir(path.join(temp,'scripts'));await fs.copyFile(path.join(root,'scripts/prepare-content.mjs'),path.join(temp,'scripts/prepare-content.mjs'));
  await fs.mkdir(path.join(temp,'public'));await fs.mkdir(path.join(temp,'.content'));await fs.symlink(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');
  const publicId='00000000-0000-4000-8000-000000000111',hiddenId='00000000-0000-4000-8000-000000000222',postId='00000000-0000-4000-8000-000000000333';
  const raw={version:2,projects:[{id:publicId,slug:'public-project',title:'Public project title',body:'Project details',tags:['public-project-tag'],tech_stack:['Redis'],visibility:'public',state:'学习中'},{id:hiddenId,slug:'PRIVATE-PROJECT-SLUG',title:'PRIVATE-PROJECT-TITLE',body:'PRIVATE-PROJECT-BODY',tags:['PRIVATE-PROJECT-TAG'],visibility:'private'}],posts:[{id:postId,title:'Public article title',body:'Public article body',summary:'Article summary',category:'学习',tags:['public-article-tag'],project_ids:[publicId,hiddenId],status:'published',visibility:'public',published_at:'2026-01-01'},{id:'00000000-0000-4000-8000-000000000444',title:'PRIVATE-ARTICLE-TITLE',body:'PRIVATE-ARTICLE-BODY',tags:['PRIVATE-ARTICLE-TAG'],status:'published',visibility:'private'}],profile:{name:'Public display name',birthDate:{value:'PRIVATE-BIRTHDAY',public:false},education:[{school:'Public school',major:{value:'PRIVATE-MAJOR',public:false}}]}};
  await fs.writeFile(path.join(temp,'.content/release.json'),JSON.stringify({id:'test-release',...normalizeSnapshot(raw)}));
  execFileSync(process.execPath,[path.join(temp,'scripts/prepare-content.mjs')],{cwd:temp,stdio:'pipe'});
  execFileSync(process.execPath,[path.join(root,'node_modules/astro/bin/astro.mjs'),'build'],{cwd:temp,stdio:'pipe',env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1'}});
  const files=await fs.readdir(path.join(temp,'dist'),{recursive:true});let output='';for(const file of files){const full=path.join(temp,'dist',file);if((await fs.stat(full)).isFile()&&/\.(html|json|xml)$/.test(file))output+=await fs.readFile(full,'utf8')}
  assert.ok(!output.includes('PRIVATE-'),'No private content may appear anywhere in generated HTML, JSON, sitemap or metadata');assert.ok(!output.includes(hiddenId),'Private project IDs are also removed');
  const home=await fs.readFile(path.join(temp,'dist/index.html'),'utf8');assert.ok(home.includes('public-project-tag'));assert.ok(home.includes('public-article-tag'));assert.equal((home.match(/Public article title/g)||[]).length,1);
  const project=await fs.readFile(path.join(temp,'dist/projects/public-project/index.html'),'utf8');assert.ok(project.includes('Public article title'));assert.ok(project.includes('Project details'));
  const article=await fs.readFile(path.join(temp,`dist/articles/${postId}/index.html`),'utf8');assert.ok(article.includes('Public project title'));assert.ok(article.includes('public-article-tag'));
  const about=await fs.readFile(path.join(temp,'dist/about/index.html'),'utf8');assert.ok(about.includes('Public display name'));assert.ok(about.includes('Public school'));assert.ok(home.includes('关于我'));
 }finally{await fs.rm(temp,{recursive:true,force:true})}
});
