import fs from 'node:fs/promises';
const backend=process.env.BACKEND_URL,token=process.env.BUILD_TOKEN,id=process.env.RELEASE_ID||'latest';
const config=JSON.parse(await fs.readFile('site.config.json','utf8'));
await fs.rm('.content',{recursive:true,force:true});await fs.rm('public/media',{recursive:true,force:true});await fs.mkdir('.content',{recursive:true});await fs.mkdir('public/media',{recursive:true});
if(!backend){if(id!=='latest'||config.backendRequired)throw new Error('Backend is required; refusing to overwrite the site with empty content');await fs.copyFile('content/empty.json','.content/release.json');console.log('Initial empty site build');process.exit(0)}
if(!token)throw new Error('Missing build credential');const origin=new URL(backend).origin;if(!origin.startsWith('https://'))throw new Error('Backend must use HTTPS');
const headers={Authorization:`Bearer ${token}`};
async function get(path){const r=await fetch(origin+path,{headers,signal:AbortSignal.timeout(30000),redirect:'error'});if(!r.ok)throw new Error(`Content export failed (${r.status})`);return r;}
const release=await (await get('/build/releases/'+encodeURIComponent(id))).json();
if(id!=='latest'&&release.id!==id)throw new Error('Release mismatch');
if(!Array.isArray(release.posts)||!Array.isArray(release.images))throw new Error('Invalid release manifest');
const mediaMap={};
for(const key of release.images){if(!/^[a-f0-9-]{36}$/.test(key))throw new Error('Invalid image key');const r=await get(`/build/releases/${release.id}/media/${key}`);const data=Buffer.from(await r.arrayBuffer());if(data.length>5*1024*1024)throw new Error('Image too large');const ext={'image/png':'.png','image/jpeg':'.jpg','image/gif':'.gif','image/webp':'.webp'}[r.headers.get('content-type')];if(!ext)throw new Error('Invalid image type');await fs.writeFile('public/media/'+key+ext,data);mediaMap['/media/'+key]='/media/'+key+ext;}
await fs.writeFile('.content/media-map.json',JSON.stringify(mediaMap));
await fs.writeFile('.content/release.json',JSON.stringify(release));console.log(`Fetched ${release.posts.length} articles and ${release.images.length} images.`);
