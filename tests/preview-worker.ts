// Local-only browser QA entrypoint. Never used by the production deployment config.
import {createHandler} from '../backend/index';
import {hash,cookie} from '../backend/auth';
import type {Env} from '../backend/types';
const handler=createHandler(async()=>new Response(null,{status:204}));
export default {async fetch(request:Request,env:Env){const url=new URL(request.url);if(url.hostname!=='127.0.0.1'&&url.hostname!=='localhost')return new Response('Local preview only',{status:403});if(url.pathname==='/qa/signin'){const token='local-preview-session';await env.DB.prepare('INSERT OR REPLACE INTO sessions(hash,user_id,expires) VALUES(?,?,?)').bind(await hash(token),env.GITHUB_OWNER_ID,Date.now()+3600000).run();return new Response(null,{status:303,headers:{Location:'/', 'Set-Cookie':cookie(request,'rhys_session',token,3600)}})}return handler.fetch(request,env)}};
