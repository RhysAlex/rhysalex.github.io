import {Env,GithubFetch,HttpError} from './types';
const encode=(data:Uint8Array|string)=>btoa(typeof data==='string'?data:String.fromCharCode(...data)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export function hasPublisher(env:Env){return !!(env.GITHUB_PUBLISH_TOKEN||(env.GITHUB_APP_ID&&env.GITHUB_APP_PRIVATE_KEY&&env.GITHUB_INSTALLATION_ID))}
export async function publisherToken(env:Env,send:GithubFetch){
 if(env.GITHUB_PUBLISH_TOKEN)return env.GITHUB_PUBLISH_TOKEN;
 if(!hasPublisher(env))throw new HttpError(503,'尚未连接 GitHub 自动发布权限');
 const pem=env.GITHUB_APP_PRIVATE_KEY!.replace(/-----[^-]+-----|\s/g,'');const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const now=Math.floor(Date.now()/1000);const payload=encode(JSON.stringify({alg:'RS256',typ:'JWT'}))+'.'+encode(JSON.stringify({iat:now-60,exp:now+540,iss:env.GITHUB_APP_ID}));
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(payload));
 const response=await send(`https://api.github.com/app/installations/${env.GITHUB_INSTALLATION_ID}/access_tokens`,{method:'POST',headers:{Authorization:`Bearer ${payload}.${encode(new Uint8Array(signature))}`,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'RhysAlex-Studio'},body:JSON.stringify({repositories:[env.GITHUB_REPO.split('/')[1]],permissions:{actions:'write',contents:'read'}})});
 const data=await response.json() as {token?:string};if(!response.ok||!data.token)throw new HttpError(503,'GitHub 应用授权暂不可用，请检查安装权限');return data.token;
}
