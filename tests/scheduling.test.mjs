import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {database} from '../src/sqlite.mjs';import {Store} from '../src/core.mjs';import {images,cover,seedMedia} from './media-fixture.mjs';import {planTimes,dateAvailability,MIN_GAP,dayBounds} from '../src/scheduling.mjs';
const date='2027-01-02',clock=new Date('2027-01-01T23:00:00Z');
function fresh(){const db=database(':memory:');db.raw.exec(readFileSync('schema.sql','utf8'));const s=new Store(db);seedMedia(s);return s}
async function ready(s,price=200){const a=await s.create({title:'予約を確認する記事',body:'導入です。\n\n実践です。',price,paywall:price?7:0,tags:[],images,cover});await s.decide(a.id,{decision:'approved',confirm:true,confirmImages:true,confirmCover:true,revision:1,hash:a.hash});return a}
async function markPublished(s,a,at){await s.run("UPDATE articles SET status='published',scheduled_at=?,public_url=? WHERE id=?",[at,'https://note.com/firm_orchid8992/n/n'+a.id.replaceAll('-',''),a.id]);}
test('1本・2本を料金区分ごとの上限内で予約できる',async()=>{for(const prices of [[200],[0],[200,200],[0,200]]){const s=fresh(),a=await Promise.all(prices.map(p=>ready(s,p)));await s.schedule({ids:a.map(x=>x.id),date},clock);const jobs=(await s.snapshot()).articles;assert.equal(jobs.filter(a=>a.status==='scheduled').length,prices.length);assert.equal((await s.snapshot()).settings.paused,1);}});
test('公開済み1本と200円2本で当日3本、満枠なら追加を拒否する',async()=>{const s=fresh(),published=await ready(s,0);await markPublished(s,published,'2027-01-02T03:22:00.000Z');const a=await Promise.all([ready(s),ready(s)]),afterNoon=new Date('2027-01-02T05:58:00Z');await s.schedule({ids:a.map(x=>x.id),date},afterNoon);const rows=(await s.snapshot()).articles.sort((a,b)=>a.scheduled_at.localeCompare(b.scheduled_at));for(let i=1;i<rows.length;i++)assert.ok(Date.parse(rows[i].scheduled_at)-Date.parse(rows[i-1].scheduled_at)>=MIN_GAP);const availability=await s.availability({},afterNoon);assert.equal(availability.days[0].used,3);assert.equal(availability.days[0].maxSelectable,0);const extra=await ready(s);await assert.rejects(()=>s.schedule({ids:[extra.id],date},afterNoon),{status:409});assert.equal((await s.get(extra.id)).status,'approved');});
test('同じ日に1本ずつ追加でき、予約停止で空きが戻る',async()=>{const s=fresh(),a=await Promise.all([ready(s,0),ready(s),ready(s)]);for(const x of a)await s.schedule({ids:[x.id],date},clock);assert.equal((await s.availability({},clock)).days.find(d=>d.date===date).remaining,0);await s.cancel(a[0].id);const day=(await s.availability({},clock)).days.find(d=>d.date===date);assert.equal(day.remaining,1);assert.equal(day.maxSelectable,1);});
test('日付変更も満枠なら拒否し、空き日では時刻を自動決定する',async()=>{const s=fresh(),full=await Promise.all([ready(s,0),ready(s),ready(s)]);await s.schedule({ids:full.map(a=>a.id),date},clock);const a=await ready(s);await s.schedule({ids:[a.id],date:'2027-01-03'},clock);const original=(await s.get(a.id)).scheduled_at;await assert.rejects(()=>s.reschedule(a.id,{date,revision:1},clock),{status:409});assert.equal((await s.get(a.id)).scheduled_at,original);await assert.rejects(()=>s.reschedule(a.id,{at:'2027-01-04T16:00:00+09:00',revision:1},clock),{status:400});await s.reschedule(a.id,{date:'2027-01-04',revision:1},clock);assert.equal(new Date((await s.get(a.id)).scheduled_at).toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'}),'2027-01-04');});
test('同時の2本ずつ予約でも3本超過や部分的な予約を作らない',async()=>{const s=fresh(),a=await Promise.all(Array.from({length:4},()=>ready(s)));const results=await Promise.allSettled([s.schedule({ids:a.slice(0,2).map(a=>a.id),date},clock),s.schedule({ids:a.slice(2).map(a=>a.id),date},clock)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const rows=(await s.snapshot()).articles;assert.equal(rows.filter(a=>a.status==='scheduled').length,2);assert.equal(rows.filter(a=>a.status==='approved').length,2);});
test('JSTの本数を数え、経過した時間枠には予約せず翌日に移さない',()=>{const occupied=[{at:'2027-01-01T15:01:00.000Z'},{at:'2027-01-02T06:00:00.000Z'},{at:'2027-01-02T12:00:00.000Z'}];assert.equal(dateAvailability(date,occupied,clock).used,3);assert.equal(planTimes(date,1,[],new Date('2027-01-02T12:59:30Z')),null);for(let n=0;n<100;n++){const times=planTimes(date,2,[{at:'2027-01-02T03:22:00.000Z'}],new Date('2027-01-02T05:58:00Z'));assert.equal(times.length,2);assert.ok(times[1].ms-times[0].ms>=MIN_GAP);assert.ok(times.every(t=>t.at>=t.windowStart&&t.at<t.windowEnd));}});
test('公開URLの手動記録で予約時刻がない記事も当日の枠に含める',async()=>{const s=fresh(),a=await ready(s,0);await s.run("UPDATE articles SET status='published',scheduled_at=NULL,updated_at=? WHERE id=?",['2027-01-02T03:22:00.000Z',a.id]);const day=(await s.availability({},new Date('2027-01-02T05:58:00Z'))).days[0];assert.equal(day.used,1);assert.equal(day.remaining,2);assert.equal(day.maxSelectable,2);});
test('満枠の日は失敗記事の即時再実行でも4本目にしない',async()=>{const s=fresh(),today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});for(let n=0;n<3;n++){const a=await ready(s);await markPublished(s,a,new Date(today+'T'+String(10+n*4).padStart(2,'0')+':00:00+09:00').toISOString());}const retry=await ready(s);await s.run("UPDATE articles SET status='failed' WHERE id=?",[retry.id]);await s.run('INSERT INTO publication_permissions(article_id,revision,hash,granted_at) VALUES(?,?,?,?)',[retry.id,1,retry.hash,new Date().toISOString()]);await assert.rejects(()=>s.retry(retry.id,{confirm:true,revision:1,hash:retry.hash}),{status:409});assert.equal((await s.get(retry.id)).status,'failed');});
const approvalOf=a=>({revision:a.revision,hash:a.hash,expectedStatus:a.status,expectedUpdatedAt:a.updated_at,confirm:true,confirmImages:true,confirmCover:true,confirmPublication:true});
const localDate=at=>new Date(at).toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});
test('同時に承認しても毎日無料1本・有料2本まで。確認した版のみ許可し、最初の空き時間帯に入れる',async()=>{
 const s=fresh();
 const drafts=await Promise.all([200,200,200,0,0,200].map(price=>s.create({title:'自動予約',body:'本文です。\n\n有料部分。',price,paywall:price?7:0,images,cover})));
 const jobs=await Promise.all(drafts.map(a=>s.approveAndSchedule(a.id,approvalOf(a),clock)));
 for(const day of [date,'2027-01-03']){
  const onDay=jobs.filter(a=>localDate(a.scheduled_at)===day);
  assert.deepEqual(onDay.map(a=>a.price).sort((a,b)=>a-b),[0,200,200]);
  const times=onDay.map(a=>Date.parse(a.scheduled_at)).sort((a,b)=>a-b);
  assert.ok(times[1]-times[0]>=MIN_GAP&&times[2]-times[1]>=MIN_GAP);
 }
 for(const job of jobs){
  assert.equal(job.status,'scheduled');
  assert.equal(job.approved_hash,job.hash);
  const permission=(await s.detail(job.id)).publication;
  assert.equal(permission.hash,job.hash);
  assert.equal(permission.revision,job.revision);
 }
 assert.equal((await s.snapshot()).settings.paused,1);
});
test('明示の公開同意が必要。承認の再送は予定を動かさず、取り消した予約を復活させない',async()=>{
 const s=fresh(),a=await s.create({title:'承認する記事',body:'本文です。',price:0,images,cover});
 const approval=approvalOf(a);
 await assert.rejects(()=>s.approveAndSchedule(a.id,{...approval,confirmPublication:false},clock),{status:400});
 assert.equal((await s.get(a.id)).status,'draft');
 assert.equal((await s.detail(a.id)).publication,null);
 const planned=await s.approveAndSchedule(a.id,approval,clock);
 assert.equal(localDate(planned.scheduled_at),date);
 assert.ok(planned.scheduled_at>=new Date(date+'T10:00:00+09:00').toISOString());
 assert.ok(planned.scheduled_at<new Date(date+'T12:00:00+09:00').toISOString());
 assert.equal((await s.approveAndSchedule(a.id,approval,clock)).scheduled_at,planned.scheduled_at);
 await s.cancel(a.id);
 await assert.rejects(()=>s.approveAndSchedule(a.id,approval,clock),{status:409});
 const canceled=await s.get(a.id);
 assert.equal(canceled.scheduled_at,null);
 assert.equal((await s.availability({},clock)).days.find(d=>d.date===date).freeRemaining,1);
 const edited=await s.edit(a.id,{...a,images,cover,tags:[],sources:[],title:'修正版',revision:a.revision});
 assert.equal((await s.detail(edited.id)).publication,null);
});
test('手動予約と日付変更でも料金別枠を超えない',async()=>{
 const s=fresh(),free=await ready(s,0),other=await ready(s,0);
 await s.schedule({ids:[free.id],date},clock);
 const bounds=dayBounds(date);
 assert.equal((await s.availability({},clock)).days.find(d=>d.date===date).freeRemaining,0);
 await assert.rejects(()=>s.schedule({ids:[other.id],date},clock),{status:409});
 await s.schedule({ids:[other.id],date:'2027-01-03'},clock);
 await assert.rejects(()=>s.reschedule(other.id,{date,revision:1},clock),{status:409});
 assert.equal((await s.reservations()).filter(r=>r.at>=bounds.start&&r.at<bounds.end).length,1);
});
