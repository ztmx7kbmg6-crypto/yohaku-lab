import {chromium} from '@playwright/test';import {resolve} from 'node:path';
const ctx=await chromium.launchPersistentContext(resolve('.auth/note-profile'),{channel:'chrome',headless:true});const page=await ctx.newPage();
const short=url=>{const u=new URL(url);return u.origin+u.pathname};
page.on('response',r=>{if(r.status()>=400)console.log('HTTP',r.status(),short(r.url()))});page.on('requestfailed',r=>console.log('REQUEST_FAILED',short(r.url()),r.failure()?.errorText));page.on('pageerror',e=>console.log('PAGE_ERROR',e.message));
try{await page.goto('https://editor.note.com/notes/n4d945ab488ce/edit/');try{await page.getByRole('textbox',{name:'記事タイトル',exact:true}).waitFor({timeout:20000});console.log('既存テスト下書きの編集画面: 読み込み成功')}catch{console.log('既存テスト下書きの編集画面: 読み込み未完了')}console.log('画面URL',short(page.url()));await page.screenshot({path:'artifacts/note-smoke/read-only-diagnose.png',fullPage:true})}finally{await ctx.close()}
