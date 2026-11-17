
// Optional API-based nightly drafting. Does not use a ChatGPT subscription or grant approval.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const date=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});
if(!process.env.OPENAI_API_KEY||!process.env.MACHINE_TOKEN)throw Error('API用の鍵とMacの認証設定が必要です（ChatGPT契約とは別料金）');
const base=process.env.API_URL||'http://127.0.0.1:4173';if(!base.startsWith('https://')&&!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('HTTPSが必要です');
await mkdir('.state',{recursive:true,mode:0o700});const path=`.state/generation-${date}.json`;
let receipt;try{receipt=JSON.parse(await readFile(path,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
if(receipt?.complete){console.log('今日の原稿は取り込み済みです');process.exit(0)}
if(receipt&&!receipt.complete)throw Error('前回の処理が中断しています。二重取り込みを避けるため、UIと控えを照合して手動復旧してください');
await writeFile(path,JSON.stringify({date,complete:false,stage:'started'}),{mode:0o600,flag:'wx'});
const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',max_output_tokens:8000,input:'余白ラボの日本語記事を3本、無料1本・200円2本。AIの実用的な仕事活用。体験や売上の捏造、未検証のニュース、架空の出典は禁止。具体的な手順と検証方法を含める。各本文は1000〜1800文字を目安。有料記事は無料導入と有料の実践編を分ける。JSON配列だけ返す。各要素は title, freeBody, paidBody, price (0/200), tags (文字列配列)。無料はpaidBodyを空にする。公開・承認を指示しない。'})});
if(!response.ok)throw Error('原稿生成APIが失敗しました。控えを確認してください');const result=await response.json();
const text=result.output.filter(x=>x.type==='message').flatMap(x=>x.content).filter(x=>x.type==='output_text').map(x=>x.text).join('');
const articles=JSON.parse(text.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
if(!Array.isArray(articles)||articles.length!==3||articles.filter(a=>a.price===0).length!==1||articles.filter(a=>a.price===200).length!==2)throw Error('3本の構成が不正です');
await writeFile(path,JSON.stringify({date,complete:false,stage:'generated',articles},null,2),{mode:0o600});
const ids=[];for(const a of articles){if(typeof a.freeBody!=='string'||typeof a.paidBody!=='string'||(a.price===200&&!a.paidBody.trim()))throw Error('本文が不正です');const body=a.freeBody+(a.paidBody?'\n\n'+a.paidBody:'');const r=await fetch(base+'/api/machine/import',{method:'POST',headers:{Authorization:`Bearer ${process.env.MACHINE_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({title:a.title,body,price:a.price,paywall:a.price?a.freeBody.length+2:0,tags:a.tags})});if(!r.ok)throw Error('取り込み失敗。控えとUIを照合してください');ids.push((await r.json()).id);await writeFile(path,JSON.stringify({date,complete:false,stage:'importing',articles,ids},null,2),{mode:0o600})}
await writeFile(path,JSON.stringify({date,complete:true,ids},null,2),{mode:0o600});console.log('未承認の原稿を3本取り込みました。事実・品質の確認が必要です。');
