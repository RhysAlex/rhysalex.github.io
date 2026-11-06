export const profileFields={name:'姓名',nickname:'昵称',birthDate:'出生日期',location:'所在地',introduction:'个人简介',skills:'技能',email:'邮箱',github:'GitHub',website:'个人链接'};
export const educationFields={school:'学校',major:'专业',degree:'学历',startDate:'开始日期',endDate:'结束日期'};
export const experienceFields={company:'公司／组织',role:'职位',startDate:'开始日期',endDate:'结束日期',description:'经历描述'};
export const legacyProject={id:'00000000-0000-4000-8000-000000000001',slug:'dianping',title:'点评项目',summary:'整理业务流程、缓存设计与项目实践。',body:'',state:'学习中',start_date:'',end_date:'',tags:[],tech_stack:['Java','Spring Boot','Redis','MySQL'],source_url:'',position:0,visibility:'public'};
const strings=value=>Array.isArray(value)?value.filter(v=>typeof v==='string'):typeof value==='string'?(()=>{try{return strings(JSON.parse(value))}catch{return []}})():[];
const text=value=>typeof value==='string'?value:'';
function cleanRecord(record,fields){return Object.fromEntries(Object.keys(fields).filter(k=>typeof record?.[k]==='string'&&record[k].trim()).map(k=>[k,record[k]]))}
export function publicProfile(draft){
 const cells=(record,fields)=>Object.fromEntries(Object.keys(fields).filter(k=>record?.[k]?.public===true&&typeof record[k].value==='string'&&record[k].value.trim()).map(k=>[k,record[k].value]));
 return {...cells(draft,profileFields),education:(draft?.education||[]).map(r=>cells(r,educationFields)).filter(r=>Object.keys(r).length),experience:(draft?.experience||[]).map(r=>cells(r,experienceFields)).filter(r=>Object.keys(r).length)};
}
export function normalizeSnapshot(raw){
 const legacy=Array.isArray(raw);const source=legacy?{posts:raw,projects:[legacyProject],profile:{}}:raw||{};
 const projects=(source.projects||[]).filter(p=>p.visibility==='public').map(p=>({id:text(p.id),slug:text(p.slug),title:text(p.title),summary:text(p.summary),body:text(p.body),state:text(p.state),start_date:text(p.start_date),end_date:text(p.end_date),tags:strings(p.tags),tech_stack:strings(p.tech_stack),source_url:text(p.source_url),position:Number(p.position)||0,visibility:'public'})).sort((a,b)=>a.position-b.position||a.title.localeCompare(b.title));
 const ids=new Set(projects.map(p=>p.id));
 const posts=(source.posts||[]).filter(p=>p.status==='published'&&p.visibility!=='private').map(p=>({id:text(p.id),title:text(p.title),summary:text(p.summary),body:text(p.body),category:text(p.category),tags:strings(p.tags),status:'published',visibility:'public',project_ids:strings(p.project_ids).filter(id=>ids.has(id)),published_at:text(p.published_at),updated_at:text(p.updated_at)})).sort((a,b)=>b.published_at.localeCompare(a.published_at));
 const profile={...cleanRecord(source.profile,profileFields),education:(source.profile?.education||[]).map(r=>cleanRecord(r,educationFields)).filter(r=>Object.keys(r).length),experience:(source.profile?.experience||[]).map(r=>cleanRecord(r,experienceFields)).filter(r=>Object.keys(r).length)};
 return {version:2,posts,projects,profile};
}
