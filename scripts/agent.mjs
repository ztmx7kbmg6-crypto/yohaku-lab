
import {chromium} from '@playwright/test';
import {content} from '../src/core.mjs';
import {prepareNote,publishPrepared} from '../src/note-adapter.mjs';
import {access} from 'node:fs/promises';
import webpush from 'web-push';
import {mkdir,writeFile,open,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
const base=process.env.API_URL||'http://127.0.0.1:4173';
if(!base.startsWith('https://')&&!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('Macの通信先にはHTTPSが必要です');
if(!process.env.MACHINE_TOKEN)throw Error('MACHINE_TOKENを設定してください');
const headers={'Authorization':`Bearer ${process.env.MACHINE_TOKEN}`,'Content-Type':'application/json'};
const call=async(path,data={})=>{const r=await fetch(base+'/api/machine/'+path,{method:'POST',headers,body:JSON.stringify(data),signal:AbortSignal.timeout(20000)});const j=await r.json();if(!r.ok)throw Error(j.error);return j};
const mode=process.env.NOTE_MODE||'fixture';if(!['fixture','note-dry-run','note-live','notify-only'].includes(mode))throw Error('NOTE_MODEが不正です');
if(['note-dry-run','note-live'].includes(mode))await access('.auth/note-profile-ready');
if(mode==='note-live'){const config=await fetch(base+'/api/config').then(r=>r.json());if(process.env.NOTE_LIVE_ENABLED!=='true'||!config.liveEnabled)throw Error('本番投稿は無効です');}
await mkdir('.state',{recursive:true,mode:0o700});
// No stale PID lock takeover: inspect manually after a crash. DB lease also prevents competing agents.
let lock;try{lock=await open('.state/agent.lock','wx',0o600)}catch{throw Error('Mac側の処理が既に起動中です。クラッシュ後はプロセスを確認してロックを除去してください')}
await lock.writeFile(String(process.pid));
async function dryrun(article){
 const {hash,approved_hash,revision,approved_revision}=article;
 const canonical=await content({...article,tags:JSON.parse(article.tags)});if(canonical.hash!==hash)throw Error('原稿ハッシュが一致しません');
 if(hash!==approved_hash||revision!==approved_revision)throw Error('承認した最終版と一致しません');
 const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
 try{
 const context=await browser.newContext();
 // Offline fixture only. No note.com requests, login state, save or publish control.
 await context.route('**/*',route=>route.abort());
 const page=await context.newPage();await page.setContent('<html lang="ja"><head><title>余白ラボ 入力テスト専用</title></head><body><h1>ローカル入力テスト：noteへの通信なし</h1><label>タイトル<input aria-label="タイトル"></label><label>本文<textarea aria-label="本文" rows="25" cols="65"></textarea></label><label>価格<input aria-label="価格"></label><label>有料開始位置<input aria-label="有料開始位置"></label><label>タグ<input aria-label="タグ"></label><p>公開ボタンは実装されていません。</p></body></html>');
 await page.getByLabel('タイトル',{exact:true}).fill(article.title);await page.getByLabel('本文',{exact:true}).fill(article.body);await page.getByLabel('価格',{exact:true}).fill(String(article.price));await page.getByLabel('有料開始位置',{exact:true}).fill(String(article.paywall));await page.getByLabel('タグ',{exact:true}).fill(JSON.parse(article.tags).join(','));
 if(await page.getByLabel('本文',{exact:true}).inputValue()!==article.body)throw Error('本文が一致しません');
 const dir=resolve('artifacts',article.id+'-r'+revision);await mkdir(dir,{recursive:true,mode:0o700});
 await page.screenshot({path:resolve(dir,'dry-run.png'),fullPage:true});await writeFile(resolve(dir,'receipt.json'),JSON.stringify({id:article.id,revision,hash,mode:'offline-fixture',noteContacted:false,published:false,time:new Date().toISOString()},null,2),{mode:0o600});
 }finally{await browser.close()}
}
async function notifications(){
 if(!process.env.VAPID_PRIVATE_KEY||!process.env.VAPID_PUBLIC_KEY||!process.env.VAPID_SUBJECT)return;
 webpush.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
 const {events,subscriptions}=await call('notifications');if(!subscriptions.length)return;
 for(const event of events){let delivered=true;const expired=[];
 for(const {payload}of subscriptions){const sub=JSON.parse(payload),u=new URL(sub.endpoint);if(u.protocol!=='https:'||u.port||u.username||u.password||!['web.push.apple.com','fcm.googleapis.com','updates.push.services.mozilla.com'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h))){delivered=false;continue}
 try{await webpush.sendNotification(sub,JSON.stringify({type:'update'}),{TTL:3600,timeout:10000})}catch(e){if([404,410].includes(e.statusCode))expired.push(sub.endpoint);else delivered=false}}
 await call('notification-result',{id:event.id,delivered,expired});
 }
}
try{
 await notifications();const article=mode==='notify-only'?(await call('heartbeat'),null):await call('claim');
 if(!article){console.log('処理対象なし（停止中・未承認・予約前）');}
 else{
  if(typeof article.id!=='string'||typeof article.lease!=='string')throw Error('処理情報が不正です');
  let context,publishing=false;
  try{
   if(mode==='fixture'){await dryrun(article);await call('finish',{id:article.id,lease:article.lease,status:'prepared'});console.log('入力テスト完了。noteへの通信・公開なし。');}
   else{
    context=await chromium.launchPersistentContext(resolve('.auth/note-profile'),{headless:false,channel:process.env.BROWSER_CHANNEL||'chrome'});
    const page=await context.newPage(),dir=resolve('artifacts',article.id+'-r'+article.revision);await mkdir(dir,{recursive:true,mode:0o700});
    const receipt=await prepareNote(page,article,{onDraft:async noteKey=>{await writeFile(resolve(dir,'note-draft.json'),JSON.stringify({noteKey,id:article.id,revision:article.revision,hash:article.hash}),{mode:0o600});await call('draft-linked',{id:article.id,lease:article.lease,noteKey});}});
    await page.screenshot({path:resolve(dir,'note-before-publish.png'),fullPage:true});await writeFile(resolve(dir,'note-prepared.json'),JSON.stringify(receipt,null,2),{mode:0o600});
    if(mode==='note-live'){publishing=true;const published=await publishPrepared(page,article,receipt,call);console.log('公開結果:',published.url);}
    else{await call('finish',{id:article.id,lease:article.lease,status:'prepared'});console.log('実noteの公開直前まで確認しました。公開していません。');}
   }
  }catch(error){if(publishing)await call('publication/uncertain',{id:article.id,lease:article.lease}).catch(()=>{});else await call('finish',{id:article.id,lease:article.lease,status:'failed',error:error.message});throw error;}
  finally{await context?.close().catch(()=>{})}
 }
}finally{await lock.close();await unlink('.state/agent.lock')}
