import http from 'node:http';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
const backend=process.argv[2];if(!backend||!backend.startsWith('https://'))throw new Error('Pass the deployed backend URL');
const port=8965,local=`http://127.0.0.1:${port}`,state=crypto.randomBytes(32).toString('hex');let app=null,connected=false;
const html=s=>`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>RhysAlex 网站连接</title><body style="font-family:system-ui;background:#fcfaf7;color:#544e48;max-width:720px;margin:70px auto;padding:24px;line-height:1.9">${s}</body></html>`;
const escape=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const manifest={name:'RhysAlex Writing Studio',url:backend,hook_attributes:{url:backend+'/hooks/unused',active:false},redirect_url:local+'/created',callback_urls:[backend+'/auth/callback'],setup_url:local+'/installed',description:'RhysAlex 个人网站写作登录与自动发布，仅用于 rhysalex.github.io。',public:false,default_permissions:{actions:'write',contents:'read'},default_events:[],request_oauth_on_install:false};
const githubHeaders={Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'RhysAlex-Setup'};
function jwt(){const now=Math.floor(Date.now()/1000),head=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url'),body=Buffer.from(JSON.stringify({iat:now-60,exp:now+540,iss:String(app.id)})).toString('base64url');const data=head+'.'+body;return data+'.'+crypto.sign('RSA-SHA256',Buffer.from(data),app.pem).toString('base64url')}
async function install(){
 if(!app)throw new Error('请先创建网站专用应用');if(connected)return;
 const response=await fetch('https://api.github.com/repos/RhysAlex/rhysalex.github.io/installation',{headers:{...githubHeaders,Authorization:'Bearer '+jwt()}});const installation=await response.json();if(!response.ok||String(installation.account?.id)!=='249475921')throw new Error('尚未检测到这个应用安装到 RhysAlex/rhysalex.github.io，请完成安装后刷新。');
 const values={GITHUB_APP_ID:String(app.id),GITHUB_CLIENT_ID:app.client_id,GITHUB_CLIENT_SECRET:app.client_secret,GITHUB_APP_PRIVATE_KEY:crypto.createPrivateKey(app.pem).export({type:'pkcs8',format:'pem'}),GITHUB_INSTALLATION_ID:String(installation.id)};
 await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','secret','bulk','--config','backend/wrangler.jsonc'],{stdio:['pipe','inherit','inherit']});child.stdin.end(JSON.stringify(values));child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('后台密钥保存失败，请刷新重试')))});
 connected=true;app=null;console.log('GITHUB_APP_CONNECTED');
}
const server=http.createServer(async(req,res)=>{try{
 if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)){res.writeHead(403).end();return}
 const u=new URL(req.url,local);res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
 if(u.pathname==='/')res.end(html(`<h1>连接你的写作后台</h1><p>创建一个由你拥有的 GitHub 应用，用于登录写作后台和自动发布。</p><ul><li>只安装到 <strong>RhysAlex/rhysalex.github.io</strong>。</li><li>权限：读取仓库内容，运行和查看 Actions 发布任务。</li><li>凭证会直接保存到你的 Cloudflare 后台，不展示在聊天中，也不写入源码。</li></ul><p><strong>先在同一个浏览器中<a href="https://github.com/login" target="_blank" rel="noopener">登录 GitHub</a>，登录后回到此页，再点击下面的创建按钮。</strong>不要复制按钮目标网址单独打开，创建需要随按钮提交配置表单。</p><form method="post" target="_top" enctype="application/x-www-form-urlencoded" action="https://github.com/settings/apps/new?state=${state}"><input type="hidden" name="manifest" value="${escape(JSON.stringify(manifest))}"><button style="padding:14px 24px;background:#edc9a7;border:0;border-radius:8px;font-size:16px">前往 GitHub 创建并确认</button></form><p>下一页创建应用后，请选择“Only select repositories”，勾选 rhysalex.github.io，再确认安装。</p>`));
 else if(u.pathname==='/created'){
  if(u.searchParams.get('state')!==state||!u.searchParams.get('code'))throw new Error('连接状态不正确，请从初始页面重试');if(app||connected)throw new Error('应用已创建，请继续完成安装');
  const r=await fetch('https://api.github.com/app-manifests/'+encodeURIComponent(u.searchParams.get('code'))+'/conversions',{method:'POST',headers:githubHeaders});const data=await r.json();if(!r.ok||String(data.owner?.id)!=='249475921'||!data.pem)throw new Error('未能创建当前账号的应用');app=data;
  console.log('GitHub app created; awaiting repository installation.');res.end(html(`<h1>应用已创建</h1><p>接下来只给这个网站仓库授权。</p><a href="https://github.com/apps/${encodeURIComponent(app.slug)}/installations/new">安装到 rhysalex.github.io →</a><p>请选择 Only select repositories，再选 rhysalex.github.io。</p><p>安装后若没有自动返回，可以点击<a href="/installed">检查连接</a>。</p>`));
 }else if(u.pathname==='/installed'){await install();res.end(html('<h1>连接完成</h1><p>GitHub 登录和自动发布权限已安全保存，可以返回对话继续。</p>'))}
 else res.writeHead(404).end('Not found');
 }catch(e){console.error('Setup needs attention:',e.message);res.statusCode=400;res.end(html('<h1>暂未完成</h1><p>'+escape(e.message)+'</p>'))}});
server.listen(port,'127.0.0.1',()=>console.log('Setup page: '+local));
setTimeout(()=>server.close(),3600000).unref();
