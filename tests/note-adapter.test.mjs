import {images} from './media-fixture.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {content} from '../src/core.mjs';import {prepareNote,publishPrepared} from '../src/note-adapter.mjs';
const body='無料の説明です。\n\n有料の手順です。';
async function article(price=0,paywall=0){const c=await content({title:'安全確認',body,price,paywall,tags:[],images});return {...c,tags:'[]',revision:1,approved_revision:1,approved_hash:c.hash,id:'a',lease:'lease'}}
test('未承認の原稿ではnoteに接続しない',async()=>{let visits=0;const a=await article();a.approved_hash=null;await assert.rejects(()=>prepareNote({goto(){visits++}},a),/承認/);assert.equal(visits,0)});
test('段落途中の有料境界をnote側で黙って丸めない',async()=>{let visits=0;const a=await article(200,2);await assert.rejects(()=>prepareNote({goto(){visits++}},a),/段落/);assert.equal(visits,0)});
test('公開直前に期限が切れたらクリックせず隔離する',async()=>{const a=await article(),calls=[];let clicked=false;const page={getByRole(){return {click(){clicked=true}}}};await assert.rejects(()=>publishPrepared(page,a,{hash:a.hash,revision:1,images:images.map(i=>i.id),noteKey:'nabc'},async(path)=>{calls.push(path);return {nonce:'test',expiresAt:'2000-01-01T00:00:00Z'}}),/期限/);assert.equal(clicked,false);assert.deepEqual(calls,['publication/begin','publication/attempt','publication/uncertain'])});
test('確認した版と異なる場合は公開許可を要求しない',async()=>{const a=await article();let requested=false;await assert.rejects(()=>publishPrepared({},a,{hash:'wrong',revision:1},()=>{requested=true}),/最終版/);assert.equal(requested,false)});
