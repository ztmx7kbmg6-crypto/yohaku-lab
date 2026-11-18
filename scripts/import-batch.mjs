import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {content} from '../src/core.mjs';
const path=process.argv[2];if(!path||!path.startsWith('.state/'))throw Error('原稿は非公開の.state/内のJSONを指定してください');
const base=process.env.API_URL;if(!base?.startsWith('https://')||!process.env.MACHINE_TOKEN)throw Error('Macの接続設定が必要です');
const data=JSON.parse(await readFile(path,'utf8'));if(!Array.isArray(data)||data.length!==3||data.filter(a=>a.price===0).length!==1||data.filter(a=>a.price===200).length!==2)throw Error('無料1本・200円2本の3記事が必要です');
for(const a of data){const c=await content(a);if(!c.images.length)throw Error('全記事に画像を最低1枚添付してから取り込んでください');}
await mkdir('.state/imports',{recursive:true,mode:0o700});const date=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'}),receipt='.state/imports/'+date+'.json';
await writeFile(receipt,JSON.stringify({date,complete:false,ids:[]}),{mode:0o600,flag:'wx'});const ids=[];
for(const a of data){const {title,body,price,paywall,tags,images=[],sources=[]}=a;const r=await fetch(base+'/api/machine/import',{method:'POST',headers:{Authorization:'Bearer '+process.env.MACHINE_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({title,body,price,paywall,tags,images,sources})});if(!r.ok)throw Error('取り込み失敗。控えと編集室を確認してください');ids.push((await r.json()).id);await writeFile(receipt,JSON.stringify({date,complete:false,ids}),{mode:0o600})}
await writeFile(receipt,JSON.stringify({date,complete:true,ids}),{mode:0o600});console.log('未承認の3原稿を取り込みました。公開はしていません。');
