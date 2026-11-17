import {chromium} from '@playwright/test';import {mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {createInterface} from 'node:readline/promises';
await mkdir('.auth',{recursive:true,mode:0o700});
const context=await chromium.launchPersistentContext(resolve('.auth/note-profile'),{channel:'chrome',headless:false});const page=await context.newPage();await page.goto('https://note.com/firm_orchid8992');
console.log('開いた専用Chromeで、余白ラボのnoteアカウントにご自身でログインしてください。パスワードをターミナルやチャットに入力しないでください。');
const io=createInterface({input:process.stdin,output:process.stdout});await io.question('ログインが完了したら、ここでEnterを押してください。');io.close();
await page.goto('https://note.com/firm_orchid8992');await page.getByRole('link',{name:'新規投稿',exact:true}).waitFor();if(await page.getByRole('link',{name:'設定',exact:true}).count()!==1)throw Error('余白ラボのログインを確認できません');
await writeFile('.auth/note-profile-ready','ready\n',{mode:0o600});await context.close();console.log('専用ログインを保存しました。記事の公開はしていません。');
