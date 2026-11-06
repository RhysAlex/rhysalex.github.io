import {contentRoute} from "./content";
import {hasPublisher} from "./github-app";
import {putImage,getImage} from "./images";
import {Env,GithubFetch,HttpError,Post,Release,json,uuid,bodyJSON,validatePost} from './types';
import {authenticated,authRoute,requireOwner,hash} from './auth';
import {dispatch,requirePublishing,releaseStatement,reconcile,latest,publicRelease,manifest} from './publishing';
export function createHandler(send:GithubFetch=fetch){return {
 async fetch(request:Request,env:Env):Promise<Response>{
  try{const response=await route(request,env,send);const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('X-Frame-Options','DENY');headers.set('Cache-Control','no-store');headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");return new Response(response.body,{status:response.status,headers});}
  catch(e){if(e instanceof HttpError)return json({error:e.message},e.status);console.error('Request failed',e instanceof Error?e.message:'unknown');return json({error:'操作未完成，请稍后重试。'},500)}
 }
}}
async function route(request:Request,env:Env,send:GithubFetch):Promise<Response>{
 const url=new URL(request.url),path=url.pathname,method=request.method;
 if(path.startsWith('/auth/'))return authRoute(request,env,send);
 if(path==='/api/me'&&method==='GET')return json({authenticated:await authenticated(request,env),loginReady:!!(env.GITHUB_CLIENT_ID&&env.GITHUB_CLIENT_SECRET),publishReady:!!(hasPublisher(env)&&env.BUILD_TOKEN),publicUrl:env.PUBLIC_SITE_URL});
 if(path.startsWith('/build/'))return buildRoute(request,env);
 if(path.startsWith('/api/')||path.startsWith('/media/'))await requireOwner(request,env);
 const contentResponse=await contentRoute(request,env,send);if(contentResponse)return contentResponse;
 if(path==='/api/releases'&&method==='GET'){await reconcile(env,send);const release=await latest(env);return json(publicRelease(release));}
 if(path==='/api/releases/retry'&&method==='POST'){
  requirePublishing(env);await reconcile(env,send);const last=await latest(env);if(!last||last.state!=='failed')throw new HttpError(409,'当前没有需要重试的失败版本');
  const id=crypto.randomUUID(),now=new Date().toISOString();try{await env.DB.prepare("INSERT INTO releases(id,state,snapshot,created_at,updated_at) VALUES(?,'pending',?,?,?)").bind(id,last.snapshot,now,now).run()}catch{throw new HttpError(409,'已有发布任务正在进行，请稍后重试')}
  await dispatch(env,send,id);return json({release:publicRelease(await latest(env))});
 }
 if(path==='/api/images'&&method==='POST'){
  if(Number(request.headers.get('content-length')||0)>6*1024*1024)throw new HttpError(413,'图片不能超过 5 MB');
  const form=await request.formData(),file=form.get('file');if(!(file instanceof File)||file.size>5*1024*1024)throw new HttpError(400,'请选择 5 MB 以内的图片');
  const bytes=new Uint8Array(await file.arrayBuffer());const type=bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47?'image/png':bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff?'image/jpeg':/^GIF8[79]a$/.test(String.fromCharCode(...bytes.slice(0,6)))?'image/gif':String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'?'image/webp':null;
  if(!type)throw new HttpError(400,'支持 PNG、JPG、GIF 或 WebP 图片');const id=crypto.randomUUID();await putImage(env,id,bytes,type);return json({url:'/media/'+id});
 }
 if(path.startsWith('/media/')&&method==='GET'){const id=path.slice(7);if(!uuid(id))throw new HttpError(404,'图片不存在');return getImage(env,id)}
 if(path.startsWith('/api/'))throw new HttpError(404,'接口不存在');
 if(method!=='GET'&&method!=='HEAD')throw new HttpError(405,'不支持这个操作');
 if(path==='/'||path==='/admin'||path==='/admin/')return env.ASSETS.fetch(new Request(new URL('/index.html',request.url),request));
 return env.ASSETS.fetch(request);
}
async function buildRoute(request:Request,env:Env){
 if(!env.BUILD_TOKEN||await hash(request.headers.get('authorization')||'')!==await hash('Bearer '+env.BUILD_TOKEN))throw new HttpError(401,'未授权');
 const path=new URL(request.url).pathname;const match=path.match(/^\/build\/releases\/(latest|[a-f0-9-]{36})(?:\/(start|finish|media)\/?([a-f0-9-]{36})?)?$/);if(!match)throw new HttpError(404,'发布接口不存在');const [,id,phase,key]=match;
 if(request.method==='GET'&&!phase)return json(await manifest(env,id));
 if(request.method==='GET'&&phase==='media'&&key){const release=await manifest(env,id);if(!release.images.includes(key))throw new HttpError(404,'图片不属于这个发布版本');return getImage(env,key)}
 if(request.method!=='POST'||!['start','finish'].includes(phase))throw new HttpError(405,'不支持这个操作');
 const body=await bodyJSON(request,4096);if(!/^\d+$/.test(String(body.run_id))||!/^\d+$/.test(String(body.attempt)))throw new HttpError(400,'发布任务编号不正确');
 const row=await env.DB.prepare('SELECT * FROM releases WHERE id=?').bind(id).first<Release>();if(!row)throw new HttpError(404,'发布版本不存在');const now=new Date().toISOString();
 if(phase==='start'){
  if(row.state==='pending'&&(!row.run_id||row.run_id===String(body.run_id))){await env.DB.prepare("UPDATE releases SET state='building',run_id=?,attempt=?,error='',updated_at=? WHERE id=? AND state='pending'").bind(String(body.run_id),String(body.attempt),now,id).run();return json({ok:true})}
  if(row.state==='building'&&row.run_id===String(body.run_id)&&row.attempt===String(body.attempt))return json({ok:true});throw new HttpError(409,'这个版本已处理或被另一个任务领取');
 }
 if(row.run_id!==String(body.run_id)||row.attempt!==String(body.attempt))throw new HttpError(409,'任务与发布版本不匹配');
 if(row.state==='succeeded'||row.state==='failed')return json({ok:true});
 const state=body.result==='success'?'succeeded':'failed';await env.DB.prepare('UPDATE releases SET state=?,error=?,updated_at=? WHERE id=?').bind(state,state==='failed'?'网页发布未完成，原有网站继续可用。':'',now,id).run();return json({ok:true});
}
export default createHandler();
