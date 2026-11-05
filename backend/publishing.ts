import {hasPublisher,publisherToken} from "./github-app";
import {Env,Release,GithubFetch,HttpError,Post,imageKeys} from './types';
export const snapshotSQL="SELECT COALESCE(json_group_array(json_object('id',id,'title',title,'summary',summary,'body',body,'category',category,'tags',tags,'status',status,'published_at',published_at,'updated_at',updated_at)), '[]') FROM (SELECT * FROM posts WHERE status='published' ORDER BY published_at DESC)";
export function releaseStatement(env:Env,id:string,now:string){return env.DB.prepare(`INSERT INTO releases(id,state,snapshot,created_at,updated_at) VALUES(?,'pending',(${snapshotSQL}),?,?)`).bind(id,now,now)}
export async function github(env:Env,send:GithubFetch,path:string,options:RequestInit={}){
 const token=await publisherToken(env,send);
 return send('https://api.github.com/repos/'+env.GITHUB_REPO+path,{...options,headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'RhysAlex-Studio','X-GitHub-Api-Version':'2026-03-10',...options.headers},signal:AbortSignal.timeout(15000)});
}
export function requirePublishing(env:Env){if(!hasPublisher(env)||!env.BUILD_TOKEN)throw new HttpError(503,'自动发布尚未配置完成；你仍可以保存草稿。')}
export async function dispatch(env:Env,send:GithubFetch,id:string){
 try{const r=await github(env,send,'/actions/workflows/pages.yml/dispatches',{method:'POST',body:JSON.stringify({ref:env.GITHUB_BRANCH,inputs:{release_id:id}})});if(!r.ok)throw new Error(`GitHub 返回 ${r.status}`)}catch(e){
  // A timeout can happen after GitHub accepted the request. Keep it pending;
  // reconciliation finds its run before allowing a second publication.
  const message=e instanceof Error&&e.message.startsWith('GitHub 返回')?e.message:'发布请求暂未确认，后台会继续核对任务状态';
  if(message.startsWith('GitHub 返回'))await env.DB.prepare("UPDATE releases SET state='failed',error=?,updated_at=? WHERE id=? AND state='pending'").bind(message,new Date().toISOString(),id).run();
  else await env.DB.prepare('UPDATE releases SET error=? WHERE id=?').bind(message,id).run();
 }
}
export async function latest(env:Env){return env.DB.prepare('SELECT * FROM releases ORDER BY created_at DESC LIMIT 1').first<Release>()}
export async function reconcile(env:Env,send:GithubFetch){
 const active=await env.DB.prepare("SELECT * FROM releases WHERE state IN ('pending','building') LIMIT 1").first<Release>();if(!active)return;
 try{
  let run:any;
  if(active.run_id){const r=await github(env,send,'/actions/runs/'+active.run_id);if(r.ok)run=await r.json();}
  else{const r=await github(env,send,'/actions/workflows/pages.yml/runs?event=workflow_dispatch&per_page=30');if(!r.ok)return;const d=await r.json() as {workflow_runs?:any[]};run=d.workflow_runs?.find(v=>v.display_title===`release/${active.id}`)}
  if(run?.id){await env.DB.prepare('UPDATE releases SET run_id=COALESCE(run_id,?) WHERE id=?').bind(String(run.id),active.id).run();
   if(run.status==='completed')await env.DB.prepare("UPDATE releases SET state=?,error=?,updated_at=? WHERE id=? AND state IN ('pending','building')").bind(run.conclusion==='success'?'succeeded':'failed',run.conclusion==='success'?'':`GitHub 发布任务结束：${run.conclusion}`,new Date().toISOString(),active.id).run();
  }else if(Date.now()-Date.parse(active.created_at)>15*60000){await env.DB.prepare("UPDATE releases SET state='failed',error='未找到发布任务，请重试',updated_at=? WHERE id=? AND state='pending'").bind(new Date().toISOString(),active.id).run();}
 }catch{/* Keep the current state when GitHub is temporarily unavailable. */}
}
export function publicRelease(row:Release|null){if(!row)return null;const {snapshot,...rest}=row;return rest;}
export async function manifest(env:Env,id:string){
 const row=id==='latest'?await env.DB.prepare("SELECT * FROM releases WHERE state='succeeded' ORDER BY created_at DESC LIMIT 1").first<Release>():await env.DB.prepare('SELECT * FROM releases WHERE id=?').bind(id).first<Release>();
 if(!row){if(id==='latest')return {id:'initial',posts:[] as Post[],images:[] as string[]};throw new HttpError(404,'发布版本不存在')}
 const posts=JSON.parse(row.snapshot) as Post[];return {id:row.id,posts,images:imageKeys(posts)};
}
