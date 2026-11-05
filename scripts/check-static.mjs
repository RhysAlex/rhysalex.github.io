import fs from 'node:fs/promises';
import path from 'node:path';
const files=await fs.readdir('dist',{recursive:true});let html=0;
for(const file of files){const name=path.join('dist',file);if(!(await fs.stat(name)).isFile())continue;const data=await fs.readFile(name);if(/\.(html|css|js|json|xml)$/.test(file)){const text=data.toString();if(/chatgpt\.site|signin-with-chatgpt|oai-authenticated|BUILD_TOKEN|GITHUB_CLIENT_SECRET/.test(text))throw new Error('Unexpected platform reference or secret in public build: '+file);if(file.endsWith('.html')){html++;if(text.includes('写作管理'))throw new Error('Admin link leaked to public page');}}
}
if(html<3)throw new Error('Missing public pages');if(files.some(f=>f.startsWith('admin/')))throw new Error('Admin bundle must not be uploaded to Pages');
console.log(`Verified ${html} public pages, no admin bundle or platform dependencies.`);
