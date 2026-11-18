import {DAILY_LIMIT,FREE_LIMIT,PAID_LIMIT,MIN_GAP,ACTIVE_SQL,TIME_SQL,dayBounds,planTimes,dateAvailability,slotsUsed,fitsDailyQuota} from './scheduling.mjs';

export class Problem extends Error {constructor(message,status=400){super(message);this.status=status;}}
const check=(ok,msg,status=400)=>{if(!ok)throw new Problem(msg,status)};
export const now=()=>new Date().toISOString();
export async function content(input){
 const {title,body,price,paywall=0,tags=[],images=[],sources=[],cover=null}=input;
 check(typeof title==='string'&&title.trim().length>0&&title.length<=200,'タイトルは1〜200文字です');
 check(typeof body==='string'&&body.trim().length>0&&body.length<=100000,'本文は1〜100000文字です');
 check([0,200].includes(price),'価格は無料または200円です');
 check(Number.isInteger(paywall)&&paywall>=0&&paywall<=body.length&&(price===0||paywall>0&&paywall<body.length),'有料部分の開始位置を本文内に指定してください');
 check(Array.isArray(tags)&&tags.length<=10&&tags.every(t=>typeof t==='string'&&t.length<=40),'タグを確認してください');
 check(Array.isArray(images)&&images.every(i=>i&&/^[a-f0-9]{64}$/.test(i.id)&&typeof i.alt==='string'&&i.alt.trim()&&i.alt.length<=500&&['caption','credit','sourceUrl'].every(k=>i[k]===undefined||typeof i[k]==='string'&&i[k].length<=2000)),'画像と代替テキストを確認してください');
 check(Array.isArray(sources)&&sources.every(s=>s&&typeof s.title==='string'&&s.title.trim()&&s.title.length<=300&&safeUrl(s.url)),'参考URLは見出しとHTTPSのURLを指定してください');
 check(images.every(i=>!i.sourceUrl||safeUrl(i.sourceUrl)),'画像の出典URLを確認してください');
 const normalize=i=>({id:i.id,alt:i.alt,caption:i.caption||'',credit:i.credit||'',sourceUrl:i.sourceUrl||''});
 const validImage=i=>i&&/^[a-f0-9]{64}$/.test(i.id)&&typeof i.alt==='string'&&i.alt.trim()&&i.alt.length<=500&&['caption','credit','sourceUrl'].every(k=>i[k]===undefined||typeof i[k]==='string'&&i[k].length<=2000)&&(!i.sourceUrl||safeUrl(i.sourceUrl));
 check(cover===null||validImage(cover),'見出し画像と説明を確認してください');
 check(!cover||!images.some(i=>i.id===cover.id),'見出し画像は本文とは別の画像にしてください');
 const normalized=images.map(normalize),normalizedCover=cover?normalize(cover):null;
 // Preserve hashes of legacy text-only revisions until they are explicitly edited.
 const payload={title,body,price,paywall,tags};if(normalized.length)payload.images=normalized;if(sources.length)payload.sources=sources.map(s=>({title:s.title,url:s.url}));if(normalizedCover)payload.cover=normalizedCover;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload))))).map(x=>x.toString(16).padStart(2,'0')).join('');return {...payload,cover:normalizedCover,images:normalized,sources:sources.map(s=>({title:s.title,url:s.url})),hash};
}
function safeUrl(value){try{const u=new URL(value);return typeof value==='string'&&value.length<=2000&&u.protocol==='https:'&&!u.username&&!u.password}catch{return false}}
export function storedContent(a){const parse=x=>typeof x==='string'?JSON.parse(x):x||[];return {...a,tags:parse(a.tags),images:parse(a.images),sources:parse(a.sources),cover:typeof a.cover==='string'?JSON.parse(a.cover):a.cover||null}}
export class Store {
 constructor(db){this.db=db;}
 stmt(sql,args=[]){return this.db.prepare(sql).bind(...args);}
 async all(sql,args=[]){return (await this.stmt(sql,args).all()).results;}
 async one(sql,args=[]){return this.stmt(sql,args).first();}
 async run(sql,args=[]){return this.stmt(sql,args).run();}
 async get(id){const a=await this.one('SELECT * FROM articles WHERE id=?',[id]);check(a,'記事がありません',404);return a;}
 async checkMedia(c,required=false){check(!required||c.images.length>0,'記事には画像を最低1枚付けてください');check(!required||c.cover,'本文とは別の見出し画像を設定してください');for(const image of [...c.images,...(c.cover?[c.cover]:[])])check(await this.one('SELECT id FROM media WHERE id=?',[image.id]),'画像データが見つかりません。画像を再登録してください');}
 async snapshot(){return {articles:await this.all('SELECT * FROM articles ORDER BY updated_at DESC'),settings:await this.one('SELECT * FROM settings'),audit:await this.all('SELECT * FROM audit ORDER BY id DESC LIMIT 100'),notifications:await this.all('SELECT id,article_id,kind,created_at FROM notifications ORDER BY id DESC LIMIT 30'),liveEnabled:false};}
 async create(input,actor='owner'){
 const c=await content(input),id=crypto.randomUUID();await this.checkMedia(c,actor==='generator');
 await this.run('INSERT INTO articles(id,title,body,price,paywall,tags,images,sources,cover,hash,actor,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[id,c.title,c.body,c.price,c.paywall,JSON.stringify(c.tags),JSON.stringify(c.images),JSON.stringify(c.sources),JSON.stringify(c.cover),c.hash,actor,now()]);return this.get(id);
 }
 async edit(id,input,actor='owner',expectedStatus=null){
 const c=await content(input);await this.checkMedia(c,actor==='generator');
 const rows=await this.all(`UPDATE articles SET title=?,body=?,price=?,paywall=?,tags=?,images=?,sources=?,cover=?,hash=?,revision=revision+1,status='draft',approved_hash=NULL,approved_revision=NULL,scheduled_at=NULL,error=NULL,actor=?,updated_at=? WHERE id=? AND revision=? AND status NOT IN ('preparing','uncertain','published') AND (? IS NULL OR status=?) RETURNING id`,[c.title,c.body,c.price,c.paywall,JSON.stringify(c.tags),JSON.stringify(c.images),JSON.stringify(c.sources),JSON.stringify(c.cover),c.hash,actor,now(),id,input.revision,expectedStatus,expectedStatus]);
 check(rows.length,'別の端末で更新されたか、処理中です。再読み込みしてください',409);return this.get(id);
 }
 async decide(id,input){
 check(['approved','rejected','revision_requested'].includes(input.decision),'不正な操作です');
 check(input.confirm===true||input.decision!=='approved','最終版の明示承認が必要です');
 if(input.decision==='approved'){await this.checkMedia(await content(storedContent(await this.get(id))),true);check(input.confirmImages===true&&input.confirmCover===true,'本文画像と別の見出し画像を含む最終版の確認が必要です。編集室を再読み込みしてください');}
 const rows=await this.all(`UPDATE articles SET status=?,approved_hash=CASE WHEN ?='approved' THEN hash ELSE NULL END,approved_revision=CASE WHEN ?='approved' THEN revision ELSE NULL END,scheduled_at=NULL,actor='owner',updated_at=? WHERE id=? AND revision=? AND hash=? AND status IN('draft','revision_requested','rejected','approved','scheduled','prepared','failed') RETURNING id`,[input.decision,input.decision,input.decision,now(),id,input.revision,input.hash]);
 check(rows.length,'最終版が変わりました。再読み込みして確認してください',409);return this.get(id);
 }
 async reservations(exclude=[]){const ids=Array.isArray(exclude)?exclude:[];return this.all(`SELECT id,price,${TIME_SQL} AS at FROM articles WHERE ${ACTIVE_SQL} ${ids.length?'AND id NOT IN('+ids.map(()=>'?').join(',')+')':''}` ,ids);}
 async availability(input={},clock=new Date()){
  const excluded=input.exclude?await this.get(input.exclude):null;
  if(excluded)check(excluded.status==='scheduled','予約済みの記事だけ予定日を変更できます',409);
  const exclude=excluded?[excluded.id]:[];
  const busy=await this.reservations(exclude),today=clock.toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'}),start=new Date(today+'T00:00:00+09:00');
  return {days:Array.from({length:60},(_,i)=>dateAvailability(new Date(+start+i*86400000).toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'}),busy,clock)),limit:DAILY_LIMIT,price:excluded?.price};
 }
 async reserve(rows,date,expectedStatus,clock=new Date(),automatic=false){
  const bounds=dayBounds(date);
  check(bounds,'日付を指定してください');
  const ids=rows.map(a=>a.id),prices=rows.map(a=>a.price);
  const busy=await this.reservations(ids);
  check(fitsDailyQuota(slotsUsed(bounds,busy),prices),'この日の枠は無料1本・200円2本までです。別の日を選んでください',409);
  const times=planTimes(date,rows.length,busy,clock,undefined,automatic);
  check(times,'選択した本数を予約できる時間枠がありません。別の日か少ない本数を選んでください');
  const targets=rows.map(()=>`(id=? AND revision=? AND hash=? AND status=? ${automatic?'AND updated_at=?':''})`).join(' OR ');
  const placeholders=ids.map(()=>'?').join(',');
  const conflicts=times.map(()=>`((at>=? AND at<?) OR ABS(CAST(ROUND((julianday(at)-2440587.5)*86400000) AS INTEGER)-?)<${MIN_GAP})`).join(' OR ');
  const free=prices.filter(price=>price===0).length;
  // Both the matched article versions and the available slots are checked in the same write.
  const sql=`WITH
    expected AS MATERIALIZED (
      SELECT id FROM articles WHERE (${targets}) ${automatic?'':'AND approved_hash=hash AND approved_revision=revision'}
    ),
    occupied AS MATERIALIZED (
      SELECT price,${TIME_SQL} AS at FROM articles WHERE ${ACTIVE_SQL} AND id NOT IN(${placeholders})
    ),
    day AS MATERIALIZED (SELECT price FROM occupied WHERE at>=? AND at<?),
    guard AS MATERIALIZED (
      SELECT (SELECT COUNT(*) FROM expected)=?
        AND (SELECT COUNT(*) FROM day)+?<=${DAILY_LIMIT}
        AND (SELECT COUNT(*) FROM day WHERE price=0)+?<=${FREE_LIMIT}
        AND (SELECT COUNT(*) FROM day WHERE price=200)+?<=${PAID_LIMIT}
        AND NOT EXISTS(SELECT 1 FROM occupied WHERE ${conflicts}) AS allowed
    )
    UPDATE articles
    SET scheduled_at=CASE id ${ids.map(()=> 'WHEN ? THEN ?').join(' ')} END,
        status='scheduled',error=NULL,actor=?,updated_at=?
        ${automatic?', approved_hash=hash, approved_revision=revision':''}
    WHERE id IN(SELECT id FROM expected) AND (SELECT allowed FROM guard)=1
    RETURNING id`;
  const args=[...rows.flatMap(a=>[a.id,a.revision,a.hash,expectedStatus,...(automatic?[a.updated_at]:[])]),...ids,bounds.start,bounds.end,
   rows.length,rows.length,free,rows.length-free,...times.flatMap(t=>[t.windowStart,t.windowEnd,t.ms]),
   ...rows.flatMap((a,i)=>[a.id,times[i].at]),automatic?'owner-auto':'owner',now()];
  const changed=await this.all(sql,args);
  check(changed.length===rows.length,'承認状態または予定が変わりました。予約は作成されていません。再読み込みしてください',409);
  return automatic?this.get(ids[0]):this.snapshot();
 }
 async approveAndSchedule(id,input,clock=new Date()){
  check(input.confirm===true&&input.confirmImages===true&&input.confirmCover===true&&input.confirmPublication===true,
    '画像を含む最終版を確認し、noteへ公開することに同意してください');
  check(['draft','revision_requested','rejected','approved'].includes(input.expectedStatus),'記事を再読み込みしてください',409);
  for(let attempt=0;attempt<5;attempt++){
   const article=await this.get(id);
   check(article.revision===input.revision&&article.hash===input.hash,'最終版が変わりました。再読み込みして確認してください',409);
   if(article.status==='scheduled'&&article.approved_hash===article.hash&&article.approved_revision===article.revision){
    const grant=await this.one('SELECT article_id FROM publication_permissions WHERE article_id=? AND revision=? AND hash=?',[id,article.revision,article.hash]);
    check(grant,'公開許可が変わりました。記事を再読み込みしてください',409);
    return article;
   }
   check(article.status===input.expectedStatus&&article.updated_at===input.expectedUpdatedAt,'記事の状態が変わりました。再読み込みしてください',409);
   await this.checkMedia(await content(storedContent(article)),true);
   const busy=await this.reservations([id]);
   const today=clock.toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});
   const start=Date.parse(dayBounds(today).start);
   // Every occupied date accounts for at least one row. There is an empty day within this search.
   let date;
   for(let offset=0;offset<=busy.length+1;offset++){
    const candidate=new Date(start+offset*86400000).toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});
    const day=dateAvailability(candidate,busy,clock);
    if(day.maxSelectable&&(article.price===0?day.freeRemaining:day.paidRemaining)){date=candidate;break;}
   }
   check(date,'公開できる空き枠がありません',409);
   try{return await this.reserve([article],date,article.status,clock,true);}
   catch(error){if(!(error instanceof Problem)||![400,409].includes(error.status)||attempt===4)throw error;}
  }
 }
 async schedule(input,clock=new Date()){
  check(dayBounds(input.date),'日付を指定してください');check(Array.isArray(input.ids)&&input.ids.length>=1&&input.ids.length<=3&&new Set(input.ids).size===input.ids.length,'1〜3記事を選んでください');
  const rows=await Promise.all(input.ids.map(id=>this.get(id)));check(rows.every(a=>a.status==='approved'&&a.approved_hash===a.hash&&a.approved_revision===a.revision),'選んだ記事の最終版の承認が必要です',409);
  for(const a of rows)await this.checkMedia(await content(storedContent(a)),true);rows.sort((a,b)=>a.price-b.price||a.id.localeCompare(b.id));return this.reserve(rows,input.date,'approved',clock);
 }
 async reschedule(id,input,clock=new Date()){
  check(dayBounds(input.date),'時刻は自動で決定します。変更する予定日を選んでください');const a=await this.get(id);check(a.status==='scheduled'&&a.revision===input.revision&&a.approved_hash===a.hash&&a.approved_revision===a.revision,'予約または最終版の承認状態が変わりました',409);
  await this.checkMedia(await content(storedContent(a)),true);await this.reserve([a],input.date,'scheduled',clock);return this.get(id);
 }
 async cancel(id){const r=await this.all(`UPDATE articles SET status='approved',scheduled_at=NULL,actor='owner',updated_at=? WHERE id=? AND status='scheduled' RETURNING id`,[now(),id]);check(r.length,'予約を停止できません。処理状態を確認してください',409);return this.get(id);}
 async retryable(id){return !!await this.one(`SELECT a.id FROM articles a JOIN publication_permissions p ON p.article_id=a.id AND p.revision=a.revision AND p.hash=a.hash WHERE a.id=? AND a.status='failed' AND a.approved_hash=a.hash AND a.approved_revision=a.revision AND a.public_url IS NULL AND a.lease IS NULL AND json_array_length(a.images)>0 AND json_extract(a.cover,'$.id') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM note_drafts WHERE article_id=a.id) AND NOT EXISTS(SELECT 1 FROM publication_attempts WHERE article_id=a.id) AND NOT EXISTS(SELECT 1 FROM publication_attempt_history WHERE article_id=a.id)`,[id]);}
 async retry(id,input){
 check(input.confirm===true,'承認した最終版を今すぐ投稿する明示確認が必要です');
 const a=await this.get(id);await this.checkMedia(await content(storedContent(a)),true);
 const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'}),bounds=dayBounds(today);const active=await this.reservations([id]);check(fitsDailyQuota(slotsUsed(bounds,active),[a.price]),'この日の枠は無料1本・200円2本までです。別の日に予約してください',409);
 check(await this.retryable(id),'noteの処理履歴があるか、最終版の承認・公開許可が変わっています。再投稿せず確認してください',409);
 const rows=await this.all(`UPDATE articles SET status='scheduled',scheduled_at=?,error=NULL,actor='owner',updated_at=? WHERE id=? AND revision=? AND hash=? AND status='failed' AND approved_hash=hash AND approved_revision=revision AND public_url IS NULL AND lease IS NULL AND EXISTS(SELECT 1 FROM publication_permissions p WHERE p.article_id=articles.id AND p.hash=articles.hash AND p.revision=articles.revision) AND NOT EXISTS(SELECT 1 FROM note_drafts WHERE article_id=articles.id) AND NOT EXISTS(SELECT 1 FROM publication_attempts WHERE article_id=articles.id) AND NOT EXISTS(SELECT 1 FROM publication_attempt_history WHERE article_id=articles.id) AND (SELECT COUNT(*) FROM articles WHERE ${ACTIVE_SQL} AND ${TIME_SQL}>=? AND ${TIME_SQL}<?)<${DAILY_LIMIT} AND (SELECT COUNT(*) FROM articles AS occupied WHERE ${ACTIVE_SQL} AND ${TIME_SQL}>=? AND ${TIME_SQL}<? AND occupied.price=articles.price)<CASE price WHEN 0 THEN ${FREE_LIMIT} ELSE ${PAID_LIMIT} END RETURNING id`,[now(),now(),id,input.revision,input.hash,bounds.start,bounds.end,bounds.start,bounds.end]);
 check(rows.length===1,'最終版または処理状態が変わりました。再投稿せず確認してください',409);
 await this.run("INSERT INTO audit(article_id,action,actor,revision,hash) VALUES(?,'retry_queued','owner',?,?)",[id,a.revision,a.hash]);return this.get(id);
 }
 async comment(id,input){const a=await this.get(id);check(input.revision===a.revision,'記事が更新されています',409);check(typeof input.body==='string'&&input.body.trim()&&input.body.length<=4000,'コメントは1〜4000文字です');await this.run('INSERT INTO comments(article_id,revision,body) VALUES(?,?,?)',[id,a.revision,input.body]);}
 async detail(id){return {article:await this.get(id),canRetry:await this.retryable(id),publication:await this.one('SELECT revision,hash,granted_at FROM publication_permissions WHERE article_id=?',[id]),noteDraft:await this.one('SELECT * FROM note_drafts WHERE article_id=?',[id]),comments:await this.all('SELECT * FROM comments WHERE article_id=? ORDER BY id',[id]),revisions:await this.all('SELECT * FROM revisions WHERE article_id=? ORDER BY revision DESC',[id])};}
 async pause(value){check(typeof value==='boolean','停止設定が不正です');await this.run('UPDATE settings SET paused=? WHERE id=1',[value?1:0]);}
 async claim(){
 await this.run('UPDATE settings SET heartbeat=? WHERE id=1',[now()]);
 // Expired leases are quarantined, never retried automatically.
 await this.run(`UPDATE articles SET status='uncertain',error='処理が中断されました。note側の状態を確認して復旧してください',actor='agent',updated_at=? WHERE status='preparing' AND lease_until<?`,[now(),now()]);
 const lease=crypto.randomUUID();
 const rows=await this.all(`UPDATE articles SET status='preparing',lease=?,lease_until=?,actor='agent',updated_at=? WHERE id=(SELECT id FROM articles WHERE status='scheduled' AND scheduled_at<=? AND scheduled_at>=? AND approved_hash=hash AND approved_revision=revision AND json_array_length(images)>0 AND json_extract(cover,'$.id') IS NOT NULL AND (SELECT paused FROM settings)=0 ORDER BY scheduled_at LIMIT 1) AND status='scheduled' RETURNING *`,[lease,new Date(Date.now()+300000).toISOString(),now(),now(),new Date(Date.now()-900000).toISOString()]);
 await this.run(`UPDATE articles SET status='failed',error=CASE WHEN (SELECT paused FROM settings)=1 THEN '投稿処理が停止中のまま予定時刻から15分経過しました。承認済み版の再実行または予定の再設定が必要です' ELSE '予定から15分以上経過したため自動処理を停止しました' END,actor='agent',updated_at=? WHERE status='scheduled' AND scheduled_at<?`,[now(),new Date(Date.now()-900000).toISOString()]);
 return rows[0]||null;
 }
 async linkDraft(id,input){
 check(typeof input.noteKey==='string'&&/^n[a-z0-9]+$/.test(input.noteKey),'note下書きIDが不正です');
 const rows=await this.all(`INSERT INTO note_drafts(article_id,revision,hash,note_key,linked_at) SELECT id,revision,hash,?,? FROM articles WHERE id=? AND lease=? AND lease_until>? AND status='preparing' AND approved_hash=hash AND approved_revision=revision ON CONFLICT(article_id) DO UPDATE SET revision=excluded.revision,hash=excluded.hash,note_key=excluded.note_key,linked_at=excluded.linked_at RETURNING article_id`,[input.noteKey,now(),id,input.lease,now()]);check(rows.length,'下書きの処理ロックが失効しています',409);return {linked:true};
 }
 async finish(id,input){
 check(['prepared','failed'].includes(input.status),'本番公開は無効です');
 const r=await this.all(`UPDATE articles SET status=?,error=?,lease=NULL,lease_until=NULL,actor='agent',updated_at=? WHERE id=? AND status='preparing' AND lease=? AND lease_until>? AND hash=approved_hash AND revision=approved_revision RETURNING id`,[input.status,input.status==='failed'?String(input.error||'dry-run失敗').slice(0,2000):null,now(),id,input.lease,now()]);check(r.length,'処理ロックが失効しています',409);
 }
 async reconcile(id,input){
 check(input.confirm===true,'noteで公開済みの確認が必要です');
 check(typeof input.url==='string'&&/^https:\/\/note\.com\/firm_orchid8992\/n\/n[a-zA-Z0-9]+$/.test(input.url),'余白ラボの公開記事URLを入力してください');
 const attempt=await this.one('SELECT note_key,revision,hash FROM publication_attempts WHERE article_id=?',[id]);if(attempt)check(input.url==='https://note.com/firm_orchid8992/n/'+attempt.note_key,'公開操作の対象URLと一致しません。再投稿せず確認してください',409);
 const rows=await this.all(`UPDATE articles SET status='published',public_url=?,lease=NULL,lease_until=NULL,error=NULL,actor='owner-manual',updated_at=? WHERE id=? AND revision=? AND hash=approved_hash AND revision=approved_revision AND status IN('approved','scheduled','prepared','uncertain','failed') AND NOT EXISTS(SELECT 1 FROM articles WHERE public_url=?) RETURNING id`,[input.url,now(),id,input.revision,input.url]);
 check(rows.length,'最終版の承認・状態・URLの重複を確認してください',409);if(attempt)await this.run("UPDATE publication_attempts SET stage='confirmed' WHERE article_id=? AND hash=(SELECT hash FROM articles WHERE id=?) AND revision=(SELECT revision FROM articles WHERE id=?)",[id,id,id]);return this.get(id);
 }
 async recover(id,input){check(input.confirm===true,'note側の確認が必要です');const r=await this.all(`UPDATE articles SET status='draft',approved_hash=NULL,approved_revision=NULL,scheduled_at=NULL,lease=NULL,lease_until=NULL,error=NULL,actor='owner',updated_at=? WHERE id=? AND status IN('uncertain','failed','prepared') RETURNING id`,[now(),id]);check(r.length,'復旧対象ではありません',409);return this.get(id);}
}
