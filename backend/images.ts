import {Env,HttpError} from './types';
const LIMIT=100*1024*1024,CHUNK=512*1024;
export async function putImage(env:Env,id:string,data:Uint8Array,type:string){
 const statements=[env.DB.prepare('INSERT INTO images(id,type,size,created_at) SELECT ?,?,?,? WHERE (SELECT COALESCE(SUM(size),0) FROM images)+?<=?').bind(id,type,data.byteLength,new Date().toISOString(),data.byteLength,LIMIT)];
 for(let offset=0,part=0;offset<data.length;offset+=CHUNK,part++)statements.push(env.DB.prepare('INSERT INTO image_chunks(image_id,part,data) VALUES(?,?,?)').bind(id,part,data.slice(offset,offset+CHUNK).buffer));
 try{await env.DB.batch(statements)}catch(e){if(String(e).includes('FOREIGN KEY'))throw new HttpError(413,'图片空间已达到 100 MB 上限，请联系维护者扩容后再上传。');throw e}
}
export async function getImage(env:Env,id:string){const meta=await env.DB.prepare('SELECT type,size FROM images WHERE id=?').bind(id).first<{type:string;size:number}>();if(!meta)throw new HttpError(404,'图片不存在');const chunks=await env.DB.prepare('SELECT data FROM image_chunks WHERE image_id=? ORDER BY part').bind(id).all<{data:number[]|ArrayBuffer}>();const bytes=new Uint8Array(meta.size);let offset=0;for(const row of chunks.results){const part=new Uint8Array(row.data);bytes.set(part,offset);offset+=part.length}if(offset!==meta.size)throw new HttpError(500,'图片读取不完整');return new Response(bytes,{headers:{'Content-Type':meta.type}})}
