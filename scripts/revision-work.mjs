import {readFile,mkdir,writeFile} from 'node:fs/promises';import {content} from '../src/core.mjs';
const base=process.env.API_URL;if(!base?.startsWith('https://')||!process.env.MACHINE_TOKEN)throw Error('Mac認証が必要です');
const call=async(path,data={})=>{const r=await fetch(base+'/api/machine/'+path,{method:'POST',headers:{Authorization:'Bearer '+process.env.MACHINE_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(data)});const j=await r.json();if(!r.ok)throw Error(j.error);return j};
await mkdir('.state/revisions',{recursive:true,mode:0o700});
if(process.argv[2]==='export'){const data=await call('revision-work');await writeFile('.state/revisions/work.json',JSON.stringify(data,null,2),{mode:0o600});console.log('修正依頼の件数:',data.length)}
else if(process.argv[2]==='apply'){const path=process.argv[3];if(!path?.startsWith('.state/'))throw Error('非公開の.state/内のファイルを指定してください');const edits=JSON.parse(await readFile(path,'utf8'));if(!Array.isArray(edits)||edits.length>6)throw Error('修正版は6件までです');for(const a of edits){if(typeof a.id!=='string'||!Number.isInteger(a.revision))throw Error('元のIDと版番号が必要です');await content(a)}
for(const a of edits){const receipt='.state/revisions/'+a.id+'-r'+a.revision+'.json';await writeFile(receipt,JSON.stringify({id:a.id,fromRevision:a.revision,complete:false}),{mode:0o600,flag:'wx'});const r=await call('revise-requested',a);await writeFile(receipt,JSON.stringify({id:r.id,newRevision:r.revision,complete:true}),{mode:0o600})}console.log('修正版を未承認で保存しました。公開許可・予約は失効しています。');}
else throw Error('export または apply を指定してください');
