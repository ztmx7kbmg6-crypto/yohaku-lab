import {content} from './core.mjs';
export const notePolicy={aiTraining:false,translation:false,refunds:true};
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
const lines=text=>text.split(/\n+/).map(x=>x.trim()).filter(Boolean);
async function toggle(page,label,value){const control=page.getByRole('switch',{name:label,exact:true});assert(await control.count()===1,'noteの設定項目が変わりました: '+label);if(await control.getAttribute('aria-checked')!==String(value))await control.click();assert(await control.getAttribute('aria-checked')===String(value),'noteの設定確認に失敗: '+label)}
export async function prepareNote(page,article,{onDraft=async()=>{},reuseTestNoteKey=null}={}){
 const canonical=await content({...article,tags:JSON.parse(article.tags)});assert(canonical.hash===article.hash&&article.hash===article.approved_hash&&article.revision===article.approved_revision,'最終版の承認が一致しません');
 const paragraphs=lines(article.body);let boundary=0;
 if(article.price){assert(article.paywall>0&&article.body[article.paywall-1]==='\n','有料部分は段落の先頭から指定してください');boundary=lines(article.body.slice(0,article.paywall)).length;assert(boundary>0&&boundary<paragraphs.length,'有料部分が本文にありません')}
 await page.goto('https://note.com/firm_orchid8992');await page.getByRole('link',{name:'新規投稿',exact:true}).waitFor();
 assert(await page.getByRole('link',{name:'設定',exact:true}).count()===1,'余白ラボでログインしていません');
 if(reuseTestNoteKey){assert(article.id==='qa-only'&&article.title.startsWith('【非公開・接続テスト】')&&/^n[a-z0-9]+$/.test(reuseTestNoteKey),'テスト下書き以外は再利用できません');await page.goto('https://editor.note.com/notes/'+reuseTestNoteKey+'/edit/');await page.getByRole('textbox',{name:'記事タイトル',exact:true}).waitFor();assert(await page.getByRole('textbox',{name:'記事タイトル',exact:true}).inputValue()===article.title,'テスト下書きのタイトルが違います');}else{await page.getByRole('link',{name:'新規投稿',exact:true}).click();await page.getByRole('textbox',{name:'記事タイトル',exact:true}).waitFor();}
 const helper=page.getByRole('dialog');if(await helper.count())await helper.getByRole('button',{name:'閉じる',exact:true}).click();
 await page.getByRole('textbox',{name:'記事タイトル',exact:true}).fill(article.title);await page.getByRole('textbox').nth(1).fill(article.body);
 await page.getByRole('button',{name:'下書き保存',exact:true}).click();await page.getByRole('img',{name:'保存済み',exact:true}).waitFor();
 const match=page.url().match(/^https:\/\/editor\.note\.com\/notes\/(n[a-z0-9]+)\/edit\/?$/);assert(match,'note下書きIDを確認できません');const noteKey=match[1];await onDraft(noteKey);
 assert(await page.getByRole('textbox',{name:'記事タイトル',exact:true}).inputValue()===article.title,'noteのタイトルが原稿と一致しません');
 const inputText=await page.getByRole('textbox').nth(1).innerText();assert(JSON.stringify(lines(inputText))===JSON.stringify(paragraphs),'noteの本文が原稿と一致しません');
 await page.getByRole('button',{name:'公開に進む',exact:true}).click();await page.getByRole('combobox',{name:'ハッシュタグを追加する'}).waitFor();
 const tags=JSON.parse(article.tags);assert(tags.every(t=>t&&!t.startsWith('#')),'タグは先頭の#なしで指定してください');
 for(const tag of tags){const field=page.getByRole('combobox',{name:'ハッシュタグを追加する'});await field.fill(tag);await field.press('Enter');assert(await page.getByRole('button',{name:'#'+tag+' 削除',exact:true}).count()===1,'タグ入力を確認できません')}
 if(article.price)await page.locator('label[for="paid"]').click();else await page.getByText('無料',{exact:true}).click();
 if(article.price){const price=page.getByRole('textbox',{name:'300',exact:true});await price.waitFor();await price.fill(String(article.price));assert(await price.inputValue()===String(article.price),'価格が一致しません')}
 await toggle(page,'AI学習対価還元プログラムに参加する',false);await toggle(page,'記事の自動翻訳',false);
 if(article.price){await toggle(page,'購入者の申請がnoteによる審査を通過すると、自動で返金されます。',true);await page.getByRole('button',{name:'有料エリア設定',exact:true}).click();await page.getByRole('heading',{name:article.title,exact:true}).waitFor();
 const actual=await page.getByRole('textbox').getByRole('paragraph').allTextContents();assert(JSON.stringify(actual.map(t=>t.trim()).filter(Boolean))===JSON.stringify(paragraphs),'有料境界画面の本文が一致しません');const controls=page.getByRole('textbox').getByRole('button');assert(await controls.count()===actual.length,'noteの有料境界UIが変わりました');let seen=0,paidIndex=-1;for(let i=0;i<actual.length;i++){if(actual[i].trim()){if(seen===boundary){paidIndex=i;break;}seen++;}}assert(paidIndex>0,'有料部分の段落を確認できません');const chosen=controls.nth(paidIndex-1);await chosen.click();assert(await chosen.getAttribute('aria-pressed')==='true','有料境界を確認できません');}
 assert(await page.getByRole('button',{name:'投稿する',exact:true}).count()===1,'投稿確認画面に到達できません');
 return {noteKey,hash:article.hash,revision:article.revision,price:article.price,boundary,policy:notePolicy,preparedAt:new Date().toISOString()};
}
export async function verifyPublicArticle(browser,url,title){
 assert(/^https:\/\/note\.com\/firm_orchid8992\/n\/n[a-z0-9]+$/.test(url),'公開URLの形式が不正です');
 const anonymous=await browser.newContext({storageState:{cookies:[],origins:[]}});
 try{const p=await anonymous.newPage(),r=await p.goto(url,{timeout:30000});assert(r?.status()===200,'未ログインで公開記事を確認できません');await p.getByRole('heading',{name:title,exact:true}).waitFor({timeout:20000});assert(new URL(p.url()).origin+new URL(p.url()).pathname===url,'公開記事のURLが一致しません');return true;}finally{await anonymous.close()}
}
export async function publishPrepared(page,article,receipt,call){
 assert(receipt.hash===article.hash&&receipt.revision===article.revision,'確認済みの最終版ではありません');
 const permit=await call('publication/begin',{id:article.id,lease:article.lease,hash:article.hash,revision:article.revision,noteKey:receipt.noteKey});
 // No retries after consuming a permit, including network failure or an unknown click result.
 try{await call('publication/attempt',{id:article.id,lease:article.lease,nonce:permit.nonce});assert(Date.now()<Date.parse(permit.expiresAt),'公開許可の期限が切れました');try{await page.getByRole('button',{name:'投稿する',exact:true}).click({timeout:5000})}catch{/* A timeout may still mean the click was sent: verify, never click twice. */}
 const browser=page.context().browser();assert(browser,'未ログインでの公開確認を開始できません');await verifyPublicArticle(browser,permit.expectedUrl,article.title);
 await call('publication/confirm',{id:article.id,lease:article.lease,nonce:permit.nonce,url:permit.expectedUrl});return {published:true,url:permit.expectedUrl};
 }catch(error){await call('publication/uncertain',{id:article.id,lease:article.lease}).catch(()=>{});throw error}
}
