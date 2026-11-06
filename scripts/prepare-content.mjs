import fs from 'node:fs/promises';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {normalizeSnapshot,legacyProject} from '../shared/public-content.mjs';
const source=JSON.parse(await fs.readFile('.content/release.json','utf8').catch(e=>{if(e.code==='ENOENT')return fs.readFile('content/empty.json','utf8');throw e}));
const mediaMap=JSON.parse(await fs.readFile('.content/media-map.json','utf8').catch(()=>'{}'));
const content=normalizeSnapshot(source.version===2?source:{posts:source.posts||[],projects:source.projects||[legacyProject],profile:source.profile||{}});
function markdown(body){return renderToStaticMarkup(React.createElement(ReactMarkdown,{remarkPlugins:[remarkGfm],skipHtml:true,components:{img:({src,alt})=>{if(typeof src!=='string'||!/^\/media\/[a-f0-9-]{36}$/.test(src)||!mediaMap[src])throw new Error('Please upload images before publishing');return React.createElement('img',{src:mediaMap[src],alt:alt||'配图',loading:'lazy'})},a:({href,children})=>React.createElement('a',{href,rel:'noopener noreferrer'},children)}},body));}
const seen=new Set();const posts=content.posts.map(p=>{if(!/^[a-f0-9-]{36}$/.test(p.id)||seen.has(p.id)||!p.title)throw new Error('Invalid article');seen.add(p.id);return {...p,html:markdown(p.body)}});
const slugs=new Set();const projects=content.projects.map(p=>{if(!/^[a-z0-9-]+$/.test(p.slug)||slugs.has(p.slug))throw new Error('Invalid project slug');slugs.add(p.slug);return {...p,html:markdown(p.body)}});
await fs.mkdir('.content',{recursive:true});await fs.writeFile('.content/rendered.json',JSON.stringify({id:source.id,version:2,posts,projects,profile:content.profile}));
await fs.writeFile('public/search.json',JSON.stringify(Object.fromEntries(posts.map(p=>[p.id,[p.title,p.summary,p.category,p.tags.join(' '),p.body].join(' ')]))));
await fs.writeFile('public/release.json',JSON.stringify({id:source.id}));
const urls=['/','/about/',...projects.map(p=>`/projects/${p.slug}/`),...posts.map(p=>`/articles/${p.id}/`)];await fs.writeFile('public/sitemap.xml','<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(u=>`<url><loc>https://rhysalex.github.io${u}</loc></url>`).join('')+'</urlset>');
console.log(`Prepared ${posts.length} public articles and ${projects.length} public projects; private fields excluded.`);
