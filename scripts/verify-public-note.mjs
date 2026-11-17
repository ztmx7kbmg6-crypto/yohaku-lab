import {chromium} from '@playwright/test';import {verifyPublicArticle} from '../src/note-adapter.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{await verifyPublicArticle(browser,'https://note.com/firm_orchid8992/n/nd400462382e9','はじめてのnote【自己紹介】｜余白ラボ');console.log('既存の公開済み自己紹介記事: 未ログインでのURL・タイトル確認に成功。内容の変更なし。')}finally{await browser.close()}
