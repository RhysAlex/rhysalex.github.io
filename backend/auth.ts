import {Env,GithubFetch,HttpError} from './types';
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export const random=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
export async function hash(value:string){return b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))))}
export function cookieValue(request:Request,name:string){return (request.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)||'';}
export function cookie(request:Request,name:string,value:string,maxAge:number){return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(request.url).protocol==='https:'?'; Secure':''}`}
export async function authenticated(request:Request,env:Env){const token=cookieValue(request,'rhys_session');if(!token)return false;const row=await env.DB.prepare('SELECT user_id FROM sessions WHERE hash=? AND expires>?').bind(await hash(token),Date.now()).first<{user_id:string}>();return row?.user_id===env.GITHUB_OWNER_ID;}
export function sameOrigin(request:Request){if(request.headers.get('origin')!==new URL(request.url).origin)throw new HttpError(403,'请求来源不正确，请刷新页面后重试');}
export async function requireOwner(request:Request,env:Env){if(!['GET','HEAD'].includes(request.method))sameOrigin(request);if(!await authenticated(request,env))throw new HttpError(401,'请先使用站长 GitHub 账号登录');}
export async function authRoute(request:Request,env:Env,githubFetch:GithubFetch){
 const url=new URL(request.url);const callback=url.origin+'/auth/callback';
 if(url.pathname==='/auth/logout'&&request.method==='POST'){sameOrigin(request);const token=cookieValue(request,'rhys_session');if(token)await env.DB.prepare('DELETE FROM sessions WHERE hash=?').bind(await hash(token)).run();return new Response(null,{status:303,headers:{Location:'/', 'Set-Cookie':cookie(request,'rhys_session','',0)}})}
 if(url.pathname==='/auth/github'&&request.method==='GET'){
  if(!env.GITHUB_CLIENT_ID||!env.GITHUB_CLIENT_SECRET)throw new HttpError(503,'后台登录尚未配置完成');
  const state=random(),verifier=random();await env.DB.batch([env.DB.prepare('DELETE FROM oauth_states WHERE expires<?').bind(Date.now()),env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(Date.now()),env.DB.prepare('INSERT INTO oauth_states(hash,verifier,expires) VALUES(?,?,?)').bind(await hash(state),verifier,Date.now()+600000)]);
  const login=new URL('https://github.com/login/oauth/authorize');login.search=new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,redirect_uri:callback,state,code_challenge:await hash(verifier),code_challenge_method:'S256',allow_signup:'false'}).toString();
  return new Response(null,{status:302,headers:{Location:login.href,'Set-Cookie':cookie(request,'rhys_oauth',state,600)}});
 }
 if(url.pathname==='/auth/callback'&&request.method==='GET'){
  const state=url.searchParams.get('state'),code=url.searchParams.get('code');if(!state||!code||state!==cookieValue(request,'rhys_oauth'))throw new HttpError(403,'登录验证已失效，请重新登录');
  const saved=await env.DB.prepare('DELETE FROM oauth_states WHERE hash=? AND expires>? RETURNING verifier').bind(await hash(state),Date.now()).first<{verifier:string}>();if(!saved)throw new HttpError(403,'登录链接已使用或过期');
  const tokenResponse=await githubFetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code,redirect_uri:callback,code_verifier:saved.verifier})});
  const token=await tokenResponse.json() as {access_token?:string};if(!tokenResponse.ok||!token.access_token)throw new HttpError(403,'GitHub 登录失败，请重试');
  const me=await githubFetch('https://api.github.com/user',{headers:{Authorization:`Bearer ${token.access_token}`,'User-Agent':'RhysAlex-Studio',Accept:'application/vnd.github+json'}});const user=await me.json() as {id?:number};
  if(!me.ok||String(user.id)!==env.GITHUB_OWNER_ID)throw new HttpError(403,'这个账号没有写作管理权限，请使用站长账号');
  const session=random();await env.DB.prepare('INSERT INTO sessions(hash,user_id,expires) VALUES(?,?,?)').bind(await hash(session),String(user.id),Date.now()+8*3600000).run();
  const headers=new Headers({Location:'/','Cache-Control':'no-store'});headers.append('Set-Cookie',cookie(request,'rhys_session',session,8*3600));headers.append('Set-Cookie',cookie(request,'rhys_oauth','',0));return new Response(null,{status:303,headers});
 }
 throw new HttpError(404,'页面不存在');
}
