import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {legacyProject} from '../shared/public-content.mjs';
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const p=legacyProject,now=new Date().toISOString();
const fields=['id','slug','title','summary','body','state','start_date','end_date','tags','tech_stack','source_url','position','visibility','public_data','created_at','updated_at'];
const values=[p.id,p.slug,p.title,p.summary,p.body,p.state,p.start_date,p.end_date,JSON.stringify(p.tags),JSON.stringify(p.tech_stack),p.source_url,p.position,p.visibility,JSON.stringify(p),now,now];
await fs.mkdir('.content',{recursive:true});const file='.content/bootstrap-project.sql';await fs.writeFile(file,`INSERT OR IGNORE INTO projects(${fields.join(',')}) VALUES(${values.map(quote).join(',')});`);
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB',process.argv.includes('--remote')?'--remote':'--local','--config','backend/wrangler.jsonc','--file',file],{stdio:'inherit'});process.exitCode=result.status||0;
