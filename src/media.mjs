import {Problem} from './core.mjs';
export const MAX_IMAGE_BYTES=1000000;
export async function saveMedia(store,input){
 const {mime,data}=input;
 if(!['image/png','image/jpeg','image/webp'].includes(mime)||typeof data!=='string'||data.length>Math.ceil(MAX_IMAGE_BYTES/3)*4||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data))throw new Problem('画像はPNG・JPEG・WebPで1枚1MB以内にしてください');
 const binary=atob(data),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10;
 const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 if(!bytes.length||bytes.length>MAX_IMAGE_BYTES||!(mime==='image/png'&&png||mime==='image/jpeg'&&jpeg||mime==='image/webp'&&webp))throw new Problem('画像ファイルの形式を確認してください');
 const id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 await store.run('INSERT OR IGNORE INTO media(id,mime,data,bytes) VALUES(?,?,?,?)',[id,mime,data,bytes.length]);return {id,mime,bytes:bytes.length};
}
export async function readMedia(store,id){
 if(!/^[a-f0-9]{64}$/.test(id))throw new Problem('画像が見つかりません',404);
 const m=await store.one('SELECT mime,data FROM media WHERE id=?',[id]);if(!m)throw new Problem('画像が見つかりません',404);
 return new Response(Uint8Array.from(atob(m.data),c=>c.charCodeAt(0)),{headers:{'Content-Type':m.mime,'Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'",'X-Content-Type-Options':'nosniff'}});
}
