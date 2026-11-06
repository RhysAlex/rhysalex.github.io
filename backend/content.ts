import {Env,HttpError,bodyJSON,json,GithubFetch,validatePost,uuid,Post} from './types';
import {dispatch,requirePublishing,releaseStatement,latest,publicRelease,manifest} from './publishing';
import {publicProfile,profileFields,educationFields,experienceFields} from '../shared/public-content.mjs';
export type Project={id:string;slug:string;title:string;summary:string;body:string;state:string;start_date:string;end_date:string;tags:string;tech_stack:string;source_url:string;position:number;visibility:'public'|'private';public_data:string|null;created_at:string;updated_at:string};
const states=['计划中','学习中','已完成','暂停'];
const date=(value:string)=>value===''||/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
function validateDates(start:string,end:string){if(!date(start)||!date(end)||start&&end&&end<start)throw new HttpError(400,'请检查起止日期，结束日期不能早于开始日期')}
function list(value:any,label:string){if(!Array.isArray(value)||value.length>30||value.some(v=>typeof v!=='string'||v.length>50))throw new HttpError(400,label+'格式不正确');return [...new Set(value.map(v=>v.trim()).filter(Boolean))]}
export function validateProject(data:any){
 if(!data||typeof data!=='object')throw new HttpError(400,'项目格式不正确');
 const {title,summary='',body='',state='计划中',start_date='',end_date='',source_url='',visibility='private',position=0,tags=[],tech_stack=[]}=data;
 if(typeof title!=='string'||!title.trim()||title.length>120||typeof summary!=='string'||summary.length>300||typeof body!=='string'||body.length>500000||!states.includes(state)||typeof start_date!=='string'||typeof end_date!=='string'||!['public','private'].includes(visibility)||!Number.isSafeInteger(position)||Math.abs(position)>100000||typeof source_url!=='string'||source_url.length>2000)throw new HttpError(400,'请检查项目名称、状态、简介、日期和公开权限');
 if(source_url){try{if(!['https:','http:'].includes(new URL(source_url).protocol))throw 0}catch{throw new HttpError(400,'源码链接必须是 http 或 https 地址')}}
 validateDates(start_date,end_date);return {title:title.trim(),summary:summary.trim(),body,state,start_date,end_date,source_url,visibility,position,tags:list(tags,'标签'),tech_stack:list(tech_stack,'技术栈')};
}
export function validateProfile(data:any){
 if(!data||typeof data!=='object')throw new HttpError(400,'个人资料格式不正确');
 function cells(record:any,fields:Record<string,string>){const result:Record<string,{value:string;public:boolean}>={};for(const key of Object.keys(fields)){const cell=record?.[key]||{value:'',public:false};if(typeof cell.value!=='string'||cell.value.length>10000||typeof cell.public!=='boolean')throw new HttpError(400,'请检查个人资料字段');result[key]={value:cell.value.trim(),public:cell.public}}return result}
 const result:any=cells(data,profileFields);if(!date(result.birthDate.value))throw new HttpError(400,'出生日期格式不正确');
 for(const [key,fields] of [['education',educationFields],['experience',experienceFields]] as const){if(data[key]!==undefined&&!Array.isArray(data[key])||data[key]?.length>30)throw new HttpError(400,'经历条目过多');result[key]=(data[key]||[]).map((r:any)=>{const row=cells(r,fields);validateDates(row.startDate.value,row.endDate.value);return row})}
 return result;
}
async function commit(env:Env,send:GithubFetch,writes:D1PreparedStatement[],publish:boolean){
 if(publish)requirePublishing(env);const releaseId=publish?crypto.randomUUID():null,now=new Date().toISOString();
 try{await env.DB.batch(releaseId?[...writes,releaseStatement(env,releaseId,now)]:writes)}catch(e){if(String(e).includes('one_active_release')||publish&&String(e).includes('UNIQUE'))throw new HttpError(409,'已有发布任务正在进行，当前修改尚未保存，请稍后再试');throw e}
 if(releaseId)await dispatch(env,send,releaseId);return releaseId?publicRelease(await latest(env)):null;
}
export async function contentRoute(request:Request,env:Env,send:GithubFetch):Promise<Response|null>{
 const url=new URL(request.url),path=url.pathname,method=request.method;
 if(path==='/api/tags'&&method==='GET'){const records=await env.DB.prepare('SELECT tags FROM posts UNION ALL SELECT tags FROM projects').all<{tags:string}>();return json([...new Set(records.results.flatMap(r=>JSON.parse(r.tags)))].sort())}
 if(path==='/api/posts'&&method==='GET'){
  const posts=(await env.DB.prepare('SELECT * FROM posts ORDER BY updated_at DESC').all<Post>()).results;
  const links=(await env.DB.prepare('SELECT post_id,project_id FROM post_projects').all<{post_id:string;project_id:string}>()).results;
  const live=await manifest(env,'latest');return json(posts.map(({public_data,...p})=>({...p,project_ids:links.filter(r=>r.post_id===p.id).map(r=>r.project_id),live:live.posts.some((r:{id:string})=>r.id===p.id)})));
 }
 if(path==='/api/posts'&&method==='POST'){
  const d=validatePost(await bodyJSON(request));const old=d.id?await env.DB.prepare('SELECT * FROM posts WHERE id=?').bind(d.id).first<Post>():null;if(d.id&&!old)throw new HttpError(404,'文章不存在');
  for(const id of d.project_ids)if(!await env.DB.prepare('SELECT id FROM projects WHERE id=?').bind(id).first())throw new HttpError(400,'所选项目不存在，请刷新后重选');
  const id=d.id||crypto.randomUUID(),now=new Date().toISOString(),publish=d.status==='published',published_at=old?.published_at||(publish?now:null);
  const pub=publish?(d.visibility==='public'?JSON.stringify({...d,id,status:'published',published_at,updated_at:now}):null):old?.public_data||null;
  const writes=[env.DB.prepare('INSERT INTO posts(id,title,summary,body,category,tags,status,visibility,public_data,created_at,updated_at,published_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,summary=excluded.summary,body=excluded.body,category=excluded.category,tags=excluded.tags,status=excluded.status,visibility=excluded.visibility,public_data=excluded.public_data,updated_at=excluded.updated_at,published_at=excluded.published_at').bind(id,d.title,d.summary,d.body,d.category,d.tags,d.status,d.visibility,pub,old?.created_at||now,now,published_at),env.DB.prepare('DELETE FROM post_projects WHERE post_id=?').bind(id),...d.project_ids.map(project=>env.DB.prepare('INSERT INTO post_projects(post_id,project_id) VALUES(?,?)').bind(id,project))];
  return json({id,status:d.status,release:await commit(env,send,writes,publish)});
 }
 if(path==='/api/projects'&&method==='GET')return json((await env.DB.prepare('SELECT * FROM projects ORDER BY position,created_at').all<Project>()).results.map(({public_data,...p})=>p));
 if(path==='/api/projects'&&method==='POST'){
  const raw=await bodyJSON(request),d=validateProject(raw);if(raw.id!==undefined&&(typeof raw.id!=='string'||!uuid(raw.id)))throw new HttpError(400,'项目编号不正确');const old=raw.id?await env.DB.prepare('SELECT * FROM projects WHERE id=?').bind(raw.id).first<Project>():null;if(raw.id&&!old)throw new HttpError(404,'项目不存在');
  const id=old?.id||crypto.randomUUID(),slug=old?.slug||id,now=new Date().toISOString(),publish=raw.action==='publish';if(raw.action!==undefined&&!['save','publish'].includes(raw.action))throw new HttpError(400,'保存方式不正确');
  const pub=publish?(d.visibility==='public'?JSON.stringify({...d,id,slug}):null):old?.public_data||null;
  const write=env.DB.prepare('INSERT INTO projects(id,slug,title,summary,body,state,start_date,end_date,tags,tech_stack,source_url,position,visibility,public_data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,summary=excluded.summary,body=excluded.body,state=excluded.state,start_date=excluded.start_date,end_date=excluded.end_date,tags=excluded.tags,tech_stack=excluded.tech_stack,source_url=excluded.source_url,position=excluded.position,visibility=excluded.visibility,public_data=excluded.public_data,updated_at=excluded.updated_at').bind(id,slug,d.title,d.summary,d.body,d.state,d.start_date,d.end_date,JSON.stringify(d.tags),JSON.stringify(d.tech_stack),d.source_url,d.position,d.visibility,pub,old?.created_at||now,now);
  return json({id,slug,release:await commit(env,send,[write],publish)});
 }
 if(['/api/posts','/api/projects'].includes(path)&&method==='DELETE'){
  const id=url.searchParams.get('id')||'';if(!uuid(id))throw new HttpError(400,'内容编号不正确');const table=path==='/api/posts'?'posts':'projects';const old=await env.DB.prepare(`SELECT public_data FROM ${table} WHERE id=?`).bind(id).first<{public_data:string|null}>();if(!old)throw new HttpError(404,'内容不存在');
  return json({ok:true,release:await commit(env,send,[env.DB.prepare(`DELETE FROM ${table} WHERE id=?`).bind(id)],!!old.public_data)});
 }
 if(path==='/api/profile'&&method==='GET'){const row=await env.DB.prepare('SELECT draft_json FROM profile WHERE id=1').first<{draft_json:string}>();return json(row?JSON.parse(row.draft_json):{});}
 if(path==='/api/profile'&&method==='POST'){
  const raw=await bodyJSON(request,500000),draft=validateProfile(raw.profile),publish=raw.action==='publish';if(!['save','publish'].includes(raw.action))throw new HttpError(400,'保存方式不正确');
  const old=await env.DB.prepare('SELECT public_json FROM profile WHERE id=1').first<{public_json:string}>();const pub=publish?JSON.stringify(publicProfile(draft)):old?.public_json||'{}';
  const write=env.DB.prepare('INSERT INTO profile(id,draft_json,public_json,updated_at) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET draft_json=excluded.draft_json,public_json=excluded.public_json,updated_at=excluded.updated_at').bind(JSON.stringify(draft),pub,new Date().toISOString());return json({release:await commit(env,send,[write],publish)});
 }
 return null;
}
