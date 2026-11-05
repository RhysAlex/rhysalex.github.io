import fs from 'node:fs/promises';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
const source=await fs.readFile('.content/release.json','utf8').catch(e=>{if(e.code==='ENOENT')return fs.readFile('content/empty.json','utf8');throw e});
const mediaMap=JSON.parse(await fs.readFile('.content/media-map.json','utf8').catch(()=>'{"unused":null}'));
const release=JSON.parse(source);if(!Array.isArray(release.posts))throw new Error('Invalid release');
const seen=new Set();const posts=[];
for(const p of release.posts){
 if(!/^[a-f0-9-]{36}$/.test(p.id)||seen.has(p.id)||p.status!=='published'||typeof p.title!=='string'||typeof p.body!=='string')throw new Error('Invalid public article');seen.add(p.id);
 const html=renderToStaticMarkup(React.createElement(ReactMarkdown,{remarkPlugins:[remarkGfm],skipHtml:true,components:{img:({src,alt})=>{if(typeof src!=='string'||!/^\/media\/[a-f0-9-]{36}$/.test(src))throw new Error('Please upload article images before publishing');if(!mediaMap[src])throw new Error('Article image is missing from release export');return React.createElement('img',{src:mediaMap[src],alt:alt||'文章配图',loading:'lazy'})},a:({href,children})=>React.createElement('a',{href,rel:'noopener noreferrer'},children)}},p.body));
 posts.push({...p,html});
}
await fs.mkdir('.content',{recursive:true});await fs.writeFile('.content/rendered.json',JSON.stringify({id:release.id,posts}));
await fs.writeFile('public/search.json',JSON.stringify(Object.fromEntries(posts.map(p=>[p.id,[p.title,p.summary,p.category,p.tags,p.body].join(' ')]))));
await fs.writeFile('public/release.json',JSON.stringify({id:release.id}));
const urls=['/','/projects/dianping/',...posts.map(p=>`/articles/${p.id}/`)];await fs.writeFile('public/sitemap.xml','<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(u=>`<url><loc>https://rhysalex.github.io${u}</loc></url>`).join('')+'</urlset>');
console.log(`Prepared ${posts.length} published articles; drafts are excluded.`);
