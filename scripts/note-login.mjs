import {chromium} from '@playwright/test';import {mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {createInterface} from 'node:readline/promises';
await mkdir('.auth',{recursive:true,mode:0o700});
const context=await chromium.launchPersistentContext(resolve('.auth/note-profile'),{channel:'chrome',headless:false});const page=await context.newPage();let io;
async function verified(){await page.goto('https://note.com/firm_orchid8992');try{await page.getByRole('link',{name:'設定',exact:true}).waitFor({timeout:12000});return await page.getByRole('link',{name:'新規投稿',exact:true}).count()===1}catch{return false}}
try{
 let ready=await verified();
 if(!ready){console.log('専用Chromeで余白ラボにご自身でログインしてください。パスワードはChromeにだけ入力してください。');io=createInterface({input:process.stdin,output:process.stdout});
 while(!ready){console.log('ログインの完了は自動で検出します。検出されないときだけEnterを押してください。');await Promise.race([page.getByRole('button',{name:'メニュー',exact:true}).getByRole('img',{name:'余白ラボ',exact:true}).waitFor({timeout:0}),io.question('').catch(()=>new Promise(()=>{}))]);ready=await verified();if(!ready)console.log('余白ラボのログインをまだ確認できません。Chromeのログイン状態を確認してください。');}}
 await writeFile('.auth/note-profile-ready','ready\n',{mode:0o600});console.log('専用noteログインを確認して保存しました。公開はしていません。');
}finally{io?.close();await context.close()}
