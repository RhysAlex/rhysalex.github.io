import {useState,useEffect} from 'react';
import Editor from './Editor';
import Projects from './Projects';
import Profile from './Profile';
import type {Release} from '../../backend/types';
export default function Studio({publicUrl,publishReady}:{publicUrl:string;publishReady:boolean}){
 const[tab,setTab]=useState('articles'),[release,setRelease]=useState<Omit<Release,'snapshot'>|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){const response=await fetch('/api/releases');if(response.ok)setRelease(await response.json() as Omit<Release,'snapshot'>|null)}
 useEffect(()=>{refresh();const timer=setInterval(refresh,12000);return()=>clearInterval(timer)},[]);
 async function retry(){setBusy(true);try{const r=await fetch('/api/releases/retry',{method:'POST'});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error||'重试失败');await refresh()}catch(e){setMessage(e instanceof Error?e.message:'重试失败')}finally{setBusy(false)}}
 function switchTab(next:string){if(next===tab)return;if(!window.dispatchEvent(new Event('studio:before-switch',{cancelable:true})))return;setTab(next);setMessage('')}
 return <><nav className="studio-tabs" aria-label="后台管理栏目">{[['articles','文章管理'],['projects','项目管理'],['profile','个人资料']].map(([key,label])=><button key={key} aria-pressed={tab===key} className={tab===key?'active':''} onClick={()=>switchTab(key)}>{label}</button>)}</nav>{release&&<section className="release-banner" aria-live="polite"><div><strong>{release.state==='succeeded'?'网站已更新':release.state==='failed'?'本次发布未完成':release.state==='building'?'正在生成并发布网页…':'正在等待发布…'}</strong><p>{release.state==='succeeded'?'公开网站已更新为这个版本。':release.state==='failed'?(release.error||'请重试这个版本。'):'内容已保存，部署完成后才对访客生效。'}</p></div>{release.state==='failed'&&<button className="secondary" disabled={busy} onClick={retry}>重试此版本</button>}{release.state==='succeeded'&&<a className="text-button" href={publicUrl} target="_blank" rel="noopener">查看网站 ↗</a>}</section>}{message&&<p className="notice" role="status">{message}</p>}{tab==='articles'?<Editor publicUrl={publicUrl} publishReady={publishReady} onChanged={refresh}/>:tab==='projects'?<Projects publicUrl={publicUrl} publishReady={publishReady} onChanged={refresh}/>:<Profile publishReady={publishReady} onChanged={refresh}/>}</>;
}
