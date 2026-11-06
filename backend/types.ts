export interface Env {
 DB:D1Database; ASSETS:Fetcher;
 GITHUB_OWNER_ID:string; GITHUB_REPO:string; GITHUB_BRANCH:string; PUBLIC_SITE_URL:string;
 GITHUB_APP_ID?:string; GITHUB_APP_PRIVATE_KEY?:string; GITHUB_INSTALLATION_ID?:string;
 GITHUB_CLIENT_ID?:string; GITHUB_CLIENT_SECRET?:string; GITHUB_PUBLISH_TOKEN?:string; BUILD_TOKEN?:string;
}
export type Post={id:string;title:string;summary:string;body:string;category:string;tags:string;status:'draft'|'published';created_at:string;updated_at:string;published_at:string|null;visibility?:string;public_data?:string|null;project_ids?:string[];live?:boolean};
export type Release={id:string;state:'pending'|'building'|'succeeded'|'failed';snapshot:string;created_at:string;updated_at:string;run_id:string|null;attempt:string|null;error:string};
export type GithubFetch=(request:Request|string|URL,init?:RequestInit)=>Promise<Response>;
export class HttpError extends Error{constructor(public status:number,message:string){super(message)}}
export const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export const uuid=(v:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
export async function bodyJSON(request:Request,limit=1500000){
 const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'请求内容为空');let length=0;const chunks:Uint8Array[]=[];
 while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw new HttpError(413,'文件或文章超过大小限制')}chunks.push(value)}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 try{return JSON.parse(new TextDecoder().decode(bytes))}catch{throw new HttpError(400,'内容格式不正确')}
}
export function validatePost(data:any){
 if(typeof data!=='object'||!data)throw new HttpError(400,'文章格式不正确');
 const {id,title,summary='',body,category='技术笔记',tags=[],status='draft',visibility='public',project_ids=[]}=data;
 if(id!==undefined&&(typeof id!=='string'||!uuid(id)))throw new HttpError(400,'文章编号不正确');
 if(typeof title!=='string'||!title.trim()||title.length>120||typeof body!=='string'||!body.trim()||body.length>500000||typeof summary!=='string'||summary.length>300||typeof category!=='string'||!category.trim()||category.length>30||!Array.isArray(tags)||tags.length>20||tags.some(t=>typeof t!=='string'||t.length>30)||!['draft','published'].includes(status)||!['public','private'].includes(visibility)||!Array.isArray(project_ids)||project_ids.length>50||project_ids.some(v=>typeof v!=='string'||!uuid(v)))throw new HttpError(400,'请检查标题、正文、标签、项目与公开权限');
 return {id,title:title.trim(),summary:summary.trim(),body,category:category.trim(),tags:JSON.stringify([...new Set(tags.map(t=>t.trim()).filter(Boolean))]),status:status as 'draft'|'published',visibility:visibility as 'public'|'private',project_ids:[...new Set(project_ids)] as string[]};
}
export function imageKeys(posts:Pick<Post,'body'>[]){return [...new Set(posts.flatMap(p=>[...p.body.matchAll(/\/media\/([a-f0-9-]{36})/g)].map(m=>m[1]).filter(uuid)))];}
