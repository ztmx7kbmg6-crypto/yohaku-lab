import {content,storedContent} from './core.mjs';
export const notePolicy={aiTraining:false,translation:false,refunds:true};
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
const lines=text=>text.split(/\n+/).map(x=>x.trim()).filter(Boolean);
async function toggle(page,label,value){const control=page.getByRole('switch',{name:label,exact:true});assert(await control.count()===1,'noteの設定項目が変わりました: '+label);if(await control.getAttribute('aria-checked')!==String(value))await control.click();assert(await control.getAttribute('aria-checked')===String(value),'noteの設定確認に失敗: '+label)}
export function publicationText(article){const a=storedContent(article);return a.body+(a.sources.length?'\n\n参考URL\n\n'+a.sources.map(s=>s.title+'\n'+s.url).join('\n\n'):'')}
export async function prepareNote(page,article,{onDraft=async()=>{},reuseTestNoteKey=null,loadImage}={}){
 const canonical=await content(storedContent(article));assert(canonical.hash===article.hash&&article.hash===article.approved_hash&&article.revision===article.approved_revision,'最終版の承認が一致しません');
 assert(canonical.images.length>0,'記事には画像を最低1枚付けてください');
 const paragraphs=lines(publicationText(article));let boundary=0;
 if(article.price){assert(article.paywall>0&&article.body[article.paywall-1]==='\n','有料部分は段落の先頭から指定してください');boundary=lines(article.body.slice(0,article.paywall)).length;assert(boundary>0&&boundary<paragraphs.length,'有料部分が本文にありません')}
 await page.goto('https://note.com/firm_orchid8992');await page.getByRole('link',{name:'新規投稿',exact:true}).waitFor();
 assert(await page.getByRole('link',{name:'設定',exact:true}).count()===1,'余白ラボでログインしていません');
 if(reuseTestNoteKey){assert(article.id==='qa-only'&&article.title.startsWith('【非公開・接続テスト】')&&/^n[a-z0-9]+$/.test(reuseTestNoteKey),'テスト下書き以外は再利用できません');await page.goto('https://editor.note.com/notes/'+reuseTestNoteKey+'/edit/');await page.getByRole('textbox',{name:'記事タイトル',exact:true}).waitFor();assert(await page.getByRole('textbox',{name:'記事タイトル',exact:true}).inputValue()===article.title,'テスト下書きのタイトルが違います');}else{await page.getByRole('link',{name:'新規投稿',exact:true}).click();await page.getByRole('textbox',{name:'記事タイトル',exact:true}).waitFor();}
 const helper=page.getByRole('dialog');if(await helper.count())await helper.getByRole('button',{name:'閉じる',exact:true}).click();
 await page.getByRole('textbox',{name:'記事タイトル',exact:true}).fill(article.title);const editor=page.getByRole('textbox').nth(1);assert(await editor.locator('img').count()===0,'既存画像のある下書きは自動で上書きしません');await editor.fill(publicationText(article)+'\n');
 assert(typeof loadImage==='function','画像の取得方法が未設定です');const uploads=[];
 for(const image of canonical.images){const data=await loadImage(image.id);const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data.buffer))).map(x=>x.toString(16).padStart(2,'0')).join('');assert(hash===image.id,'承認した画像とファイルが一致しません');assert(['image/png','image/jpeg','image/webp'].includes(data.mime),'画像形式が不正です');uploads.push({name:image.id+(data.mime==='image/png'?'.png':data.mime==='image/jpeg'?'.jpg':'.webp'),mimeType:data.mime,buffer:data.buffer});}
 await editor.press('ControlOrMeta+A');await editor.press('ArrowRight');await page.getByRole('button',{name:'メニューを開く',exact:true}).click();await page.getByRole('button',{name:'画像',exact:true}).click();await page.locator('input[type=file][accept*="image/png"]').setInputFiles(uploads);
 await editor.locator('img').nth(uploads.length-1).waitFor({timeout:60000});await page.waitForFunction(count=>{const editor=document.querySelector('[role="textbox"][contenteditable="true"]');const images=editor?.querySelectorAll('img');return images?.length===count&&Array.from(images).every(i=>i.complete&&i.naturalWidth>0)},uploads.length,{timeout:60000});

 for(const [i,image]of canonical.images.entries()){const caption=[image.caption||image.alt,image.credit,image.sourceUrl].filter(Boolean).join(' / '),field=editor.locator('figure').nth(i).locator('figcaption');await field.fill(caption);assert((await field.innerText()).trim()===caption,'画像の説明を確認できません');}
 const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/text_notes/draft_save'&&r.request().method()==='POST',{timeout:30000});await page.getByRole('button',{name:'下書き保存',exact:true}).click();assert((await saved).ok(),'noteへの下書き保存に失敗しました');await page.getByRole('img',{name:'保存済み',exact:true}).waitFor();
 await page.reload();await page.getByRole('textbox',{name:'記事タイトル',exact:true}).waitFor();assert(await editor.locator('img').count()===uploads.length,'保存後の画像枚数が一致しません');for(const [i,image]of canonical.images.entries())assert((await editor.locator('figure').nth(i).locator('figcaption').innerText()).trim()===[image.caption||image.alt,image.credit,image.sourceUrl].filter(Boolean).join(' / '),'保存後の画像説明が一致しません');
 const match=page.url().match(/^https:\/\/editor\.note\.com\/notes\/(n[a-z0-9]+)\/edit\/?$/);assert(match,'note下書きIDを確認できません');const noteKey=match[1];await onDraft(noteKey);
 assert(await page.getByRole('textbox',{name:'記事タイトル',exact:true}).inputValue()===article.title,'noteのタイトルが原稿と一致しません');
 const inputText=(await editor.locator(':scope > p').allTextContents()).join('\n');assert(JSON.stringify(lines(inputText))===JSON.stringify(paragraphs),'noteの本文が原稿と一致しません');
 await page.getByRole('button',{name:'公開に進む',exact:true}).click();await page.getByRole('combobox',{name:'ハッシュタグを追加する'}).waitFor();
 const tags=JSON.parse(article.tags);assert(tags.every(t=>t&&!t.startsWith('#')),'タグは先頭の#なしで指定してください');
 for(const tag of tags){const field=page.getByRole('combobox',{name:'ハッシュタグを追加する'});await field.fill(tag);await field.press('Enter');assert(await page.getByRole('button',{name:'#'+tag+' 削除',exact:true}).count()===1,'タグ入力を確認できません')}
 if(article.price)await page.locator('label[for="paid"]').click();else await page.getByText('無料',{exact:true}).click();
 if(article.price){const price=page.getByRole('textbox',{name:'300',exact:true});await price.waitFor();await price.fill(String(article.price));assert(await price.inputValue()===String(article.price),'価格が一致しません')}
 await toggle(page,'AI学習対価還元プログラムに参加する',false);await toggle(page,'記事の自動翻訳',false);
 if(article.price){await toggle(page,'購入者の申請がnoteによる審査を通過すると、自動で返金されます。',true);await page.getByRole('button',{name:'有料エリア設定',exact:true}).click();await page.getByRole('heading',{name:article.title,exact:true}).waitFor();
 const actual=await page.getByRole('textbox').getByRole('paragraph').allTextContents();assert(JSON.stringify(actual.map(t=>t.trim()).filter(Boolean))===JSON.stringify(paragraphs),'有料境界画面の本文が一致しません');const controls=page.getByRole('textbox').getByRole('button');assert(await controls.count()>=actual.length,'noteの有料境界UIが変わりました');let seen=0,paidIndex=-1;for(let i=0;i<actual.length;i++){if(actual[i].trim()){if(seen===boundary){paidIndex=i;break;}seen++;}}assert(paidIndex>0,'有料部分の段落を確認できません');const chosen=page.getByRole('textbox').getByRole('paragraph').nth(paidIndex).locator('xpath=preceding::button[1]');assert(['このラインより先を有料にする','ラインをこの場所に変更'].includes(await chosen.innerText()),'有料部分の直前の境界を確認できません');await chosen.click();assert(await chosen.getAttribute('aria-pressed')==='true','有料境界を確認できません');}
 assert(await page.getByRole('button',{name:'投稿する',exact:true}).count()===1,'投稿確認画面に到達できません');
 return {noteKey,hash:article.hash,revision:article.revision,price:article.price,boundary,images:canonical.images.map(i=>i.id),policy:notePolicy,preparedAt:new Date().toISOString()};
}
export async function verifyPublicArticle(browser,url,title){
 assert(/^https:\/\/note\.com\/firm_orchid8992\/n\/n[a-z0-9]+$/.test(url),'公開URLの形式が不正です');
 const anonymous=await browser.newContext({storageState:{cookies:[],origins:[]}});
 try{const p=await anonymous.newPage(),deadline=Date.now()+60000;for(let attempt=0;attempt<10&&Date.now()<deadline;attempt++){const r=await p.goto(url,{timeout:Math.max(1,Math.min(15000,deadline-Date.now())),waitUntil:'domcontentloaded'}),status=r?.status();if(status===200){await p.getByRole('heading',{name:title,exact:true}).waitFor({timeout:20000});assert(new URL(p.url()).origin+new URL(p.url()).pathname===url,'公開記事のURLが一致しません');return true;}assert(status===404,'公開確認が拒否または失敗しました（HTTP '+status+'）。再投稿せず確認してください');if(attempt<9&&Date.now()<deadline)await p.waitForTimeout(Math.min(8000,1000*2**attempt,deadline-Date.now()));}throw Error('公開URLへの反映を確認できません。再投稿せずnote側を確認してください');}finally{await anonymous.close()}
}
export async function publishPrepared(page,article,receipt,call){
 assert(receipt.hash===article.hash&&receipt.revision===article.revision,'確認済みの最終版ではありません');
 const images=storedContent(article).images;assert(images.length>0&&JSON.stringify(receipt.images)===JSON.stringify(images.map(i=>i.id)),'確認済みの画像が一致しません');
 const permit=await call('publication/begin',{id:article.id,lease:article.lease,hash:article.hash,revision:article.revision,noteKey:receipt.noteKey});
 // No retries after consuming a permit, including network failure or an unknown click result.
 try{await call('publication/attempt',{id:article.id,lease:article.lease,nonce:permit.nonce});assert(Date.now()<Date.parse(permit.expiresAt),'公開許可の期限が切れました');try{await page.getByRole('button',{name:'投稿する',exact:true}).click({timeout:5000})}catch{/* A timeout may still mean the click was sent: verify, never click twice. */}
 const browser=page.context().browser();assert(browser,'未ログインでの公開確認を開始できません');await verifyPublicArticle(browser,permit.expectedUrl,article.title);
 await call('publication/confirm',{id:article.id,lease:article.lease,nonce:permit.nonce,url:permit.expectedUrl});return {published:true,url:permit.expectedUrl};
 }catch(error){await call('publication/uncertain',{id:article.id,lease:article.lease}).catch(()=>{});throw error}
}
