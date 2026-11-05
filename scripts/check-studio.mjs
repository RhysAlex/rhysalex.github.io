import assert from 'node:assert/strict';
const origin=new URL(process.argv[2]||'http://127.0.0.1:8787').origin;
const visited=[];
for(const path of ['/','/admin','/admin/','/index.html']){
 const r=await fetch(origin+path,{redirect:'manual',signal:AbortSignal.timeout(20000)});
 assert.equal(r.status,200,`${path} must serve the app without a redirect`);
 assert.match(r.headers.get('content-type')||'',/text\/html/);
 const html=await r.text();assert.ok(html.includes('id="root"'),path+' contains app shell');
 const scripts=[...html.matchAll(/src="([^"]+\.js)"/g)].map(m=>m[1]);assert.ok(scripts.length);
 for(const src of scripts){const asset=await fetch(new URL(src,origin),{redirect:'manual',signal:AbortSignal.timeout(20000)});assert.equal(asset.status,200,src);assert.match(asset.headers.get('content-type')||'',/javascript/)}
 visited.push(path);
}
const head=await fetch(origin+'/',{method:'HEAD',redirect:'manual'});assert.equal(head.status,200);
const me=await fetch(origin+'/api/me',{redirect:'manual'});assert.equal(me.status,200);assert.equal((await me.json()).authenticated,false);
const protectedRoute=await fetch(origin+'/api/posts',{redirect:'manual'});assert.equal(protectedRoute.status,401);
const invalidCookie=await fetch(origin+'/',{headers:{Cookie:'rhys_session=invalid-old-cookie'},redirect:'manual'});assert.equal(invalidCookie.status,200);
console.log(JSON.stringify({origin,appRoutes:visited,assets:'passed',anonymousAccess:'protected',invalidCookie:'no loop'}));
