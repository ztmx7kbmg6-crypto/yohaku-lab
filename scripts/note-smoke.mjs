import {chromium} from '@playwright/test';import {content} from '../src/core.mjs';import {prepareNote} from '../src/note-adapter.mjs';import {mkdir,writeFile,readFile} from 'node:fs/promises';import {resolve} from 'node:path';
const intro='これは常駐処理の接続確認用です。公開・販売しません。\n\n無料部分の表示確認です。',body=intro+'\n\nここから有料部分の表示確認です。';
const c=await content({title:'【非公開・接続テスト】常駐処理の最終確認',body,price:200,paywall:intro.length+2,tags:['接続テスト']});
// Synthetic QA fixture only. No backend approval, publication permission, or publish call is made.
const fixture={...c,id:'qa-only',revision:1,approved_revision:1,approved_hash:c.hash,tags:JSON.stringify(c.tags)};
await mkdir('artifacts/note-smoke',{recursive:true,mode:0o700});
const context=await chromium.launchPersistentContext(resolve('.auth/note-profile'),{channel:'chrome',headless:false});const page=await context.newPage();
try{let reuseTestNoteKey=null;try{const old=JSON.parse(await readFile('artifacts/note-smoke/draft.json','utf8'));if(old.fixture)reuseTestNoteKey=old.noteKey}catch{}const receipt=await prepareNote(page,fixture,{reuseTestNoteKey,onDraft:async key=>writeFile('artifacts/note-smoke/draft.json',JSON.stringify({noteKey:key,fixture:true,published:false}),{mode:0o600})});await page.screenshot({path:'artifacts/note-smoke/ready.png',fullPage:true});await writeFile('artifacts/note-smoke/receipt.json',JSON.stringify({...receipt,fixture:true,published:false},null,2),{mode:0o600});console.log('実noteアダプタdry-run: PASS / 公開なし');}
catch(e){await page.screenshot({path:'artifacts/note-smoke/failure.png',fullPage:true}).catch(()=>{});console.error('実noteアダプタdry-run:',e.message);console.error('検証用画面URL',context.pages().map(p=>{const u=new URL(p.url());return u.origin+u.pathname}));throw e}
finally{await context.close()}
