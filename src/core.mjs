
export class Problem extends Error {constructor(message,status=400){super(message);this.status=status;}}
const check=(ok,msg,status=400)=>{if(!ok)throw new Problem(msg,status)};
export const now=()=>new Date().toISOString();
export async function content(input){
 const {title,body,price,paywall=0,tags=[],images=[],sources=[]}=input;
 check(typeof title==='string'&&title.trim().length>0&&title.length<=200,'タイトルは1〜200文字です');
 check(typeof body==='string'&&body.trim().length>0&&body.length<=100000,'本文は1〜100000文字です');
 check([0,200].includes(price),'価格は無料または200円です');
 check(Number.isInteger(paywall)&&paywall>=0&&paywall<=body.length&&(price===0||paywall>0&&paywall<body.length),'有料部分の開始位置を本文内に指定してください');
 check(Array.isArray(tags)&&tags.length<=10&&tags.every(t=>typeof t==='string'&&t.length<=40),'タグを確認してください');
 check(Array.isArray(images)&&images.every(i=>i&&/^[a-f0-9]{64}$/.test(i.id)&&typeof i.alt==='string'&&i.alt.trim()&&i.alt.length<=500&&['caption','credit','sourceUrl'].every(k=>i[k]===undefined||typeof i[k]==='string'&&i[k].length<=2000)),'画像と代替テキストを確認してください');
 check(Array.isArray(sources)&&sources.every(s=>s&&typeof s.title==='string'&&s.title.trim()&&s.title.length<=300&&safeUrl(s.url)),'参考URLは見出しとHTTPSのURLを指定してください');
 check(images.every(i=>!i.sourceUrl||safeUrl(i.sourceUrl)),'画像の出典URLを確認してください');
 const normalized=images.map(i=>({id:i.id,alt:i.alt,caption:i.caption||'',credit:i.credit||'',sourceUrl:i.sourceUrl||''}));
 // Preserve hashes of legacy text-only revisions until they are explicitly edited.
 const payload={title,body,price,paywall,tags};if(normalized.length)payload.images=normalized;if(sources.length)payload.sources=sources.map(s=>({title:s.title,url:s.url}));
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload))))).map(x=>x.toString(16).padStart(2,'0')).join('');return {...payload,images:normalized,sources:sources.map(s=>({title:s.title,url:s.url})),hash};
}
function safeUrl(value){try{const u=new URL(value);return typeof value==='string'&&value.length<=2000&&u.protocol==='https:'&&!u.username&&!u.password}catch{return false}}
export function storedContent(a){const parse=x=>typeof x==='string'?JSON.parse(x):x||[];return {...a,tags:parse(a.tags),images:parse(a.images),sources:parse(a.sources)}}
export class Store {
 constructor(db){this.db=db;}
 stmt(sql,args=[]){return this.db.prepare(sql).bind(...args);}
 async all(sql,args=[]){return (await this.stmt(sql,args).all()).results;}
 async one(sql,args=[]){return this.stmt(sql,args).first();}
 async run(sql,args=[]){return this.stmt(sql,args).run();}
 async get(id){const a=await this.one('SELECT * FROM articles WHERE id=?',[id]);check(a,'記事がありません',404);return a;}
 async checkMedia(c,required=false){check(!required||c.images.length>0,'記事には画像を最低1枚付けてください');for(const image of c.images)check(await this.one('SELECT id FROM media WHERE id=?',[image.id]),'画像データが見つかりません。画像を再登録してください');}
 async snapshot(){return {articles:await this.all('SELECT * FROM articles ORDER BY updated_at DESC'),settings:await this.one('SELECT * FROM settings'),audit:await this.all('SELECT * FROM audit ORDER BY id DESC LIMIT 100'),notifications:await this.all('SELECT id,article_id,kind,created_at FROM notifications ORDER BY id DESC LIMIT 30'),liveEnabled:false};}
 async create(input,actor='owner'){
 const c=await content(input),id=crypto.randomUUID();await this.checkMedia(c,actor==='generator');
 await this.run('INSERT INTO articles(id,title,body,price,paywall,tags,images,sources,hash,actor,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[id,c.title,c.body,c.price,c.paywall,JSON.stringify(c.tags),JSON.stringify(c.images),JSON.stringify(c.sources),c.hash,actor,now()]);return this.get(id);
 }
 async edit(id,input,actor='owner',expectedStatus=null){
 const c=await content(input);await this.checkMedia(c,actor==='generator');
 const rows=await this.all(`UPDATE articles SET title=?,body=?,price=?,paywall=?,tags=?,images=?,sources=?,hash=?,revision=revision+1,status='draft',approved_hash=NULL,approved_revision=NULL,scheduled_at=NULL,error=NULL,actor=?,updated_at=? WHERE id=? AND revision=? AND status NOT IN ('preparing','uncertain','published') AND (? IS NULL OR status=?) RETURNING id`,[c.title,c.body,c.price,c.paywall,JSON.stringify(c.tags),JSON.stringify(c.images),JSON.stringify(c.sources),c.hash,actor,now(),id,input.revision,expectedStatus,expectedStatus]);
 check(rows.length,'別の端末で更新されたか、処理中です。再読み込みしてください',409);return this.get(id);
 }
 async decide(id,input){
 check(['approved','rejected','revision_requested'].includes(input.decision),'不正な操作です');
 check(input.confirm===true||input.decision!=='approved','最終版の明示承認が必要です');
 if(input.decision==='approved'){await this.checkMedia(await content(storedContent(await this.get(id))),true);check(input.confirmImages===true,'画像を含む最終版の確認が必要です。編集室を再読み込みしてください');}
 const rows=await this.all(`UPDATE articles SET status=?,approved_hash=CASE WHEN ?='approved' THEN hash ELSE NULL END,approved_revision=CASE WHEN ?='approved' THEN revision ELSE NULL END,scheduled_at=NULL,actor='owner',updated_at=? WHERE id=? AND revision=? AND hash=? AND status IN('draft','revision_requested','rejected','approved','scheduled','prepared','failed') RETURNING id`,[input.decision,input.decision,input.decision,now(),id,input.revision,input.hash]);
 check(rows.length,'最終版が変わりました。再読み込みして確認してください',409);return this.get(id);
 }
 async schedule(input,clock=new Date()){
 check(/^\d{4}-\d{2}-\d{2}$/.test(input.date),'日付を指定してください');
 check(Array.isArray(input.ids)&&input.ids.length===3&&new Set(input.ids).size===3,'3記事を選んでください');
 const rows=await Promise.all(input.ids.map(id=>this.get(id)));
 check(rows.every(a=>a.status==='approved'&&a.approved_hash===a.hash),'最終版の承認済み記事が3本必要です',409);
 for(const a of rows)await this.checkMedia(await content(storedContent(a)),true);
 check(rows.filter(a=>a.price===0).length===1,'無料1本・200円2本を選んでください');
 rows.sort((a,b)=>a.price-b.price||a.id.localeCompare(b.id));
 const windows=[[10,12],[15,18],[19,22]],times=[]; for (const [start,end] of windows){
 const base=new Date(`${input.date}T${String(start).padStart(2,'0')}:00:00+09:00`);
 check(Number.isFinite(+base)&&base.toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'})===input.date,'日付が不正です');
 const earliest=Math.max(+base,+clock+60000,times.length?+times.at(-1)+7200000:0),latest=+base+(end-start)*3600000;
 check(earliest<latest,'当日の時間枠が過ぎています。翌日以降を指定してください');
 const n=crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;times.push(new Date(earliest+n*(latest-earliest)));}
 check(times.every((t,i)=>!i||t-times[i-1]>=7200000),'2時間の間隔を確保できません。翌日を指定してください');
 // A single SQL statement is the commit boundary: if any revision changed, nothing is scheduled.
 const clauses=rows.map(()=>'(id=? AND revision=? AND hash=? AND status=\'approved\')').join(' OR ');
 const conditions=rows.flatMap(a=>[a.id,a.revision,a.hash]);
 const dayStart=new Date(input.date+'T00:00:00+09:00').toISOString(),dayEnd=new Date(new Date(dayStart).getTime()+86400000).toISOString();
 const changed=await this.all(`UPDATE articles SET scheduled_at=CASE id ${rows.map(()=> 'WHEN ? THEN ?').join(' ')} END,status='scheduled',actor='owner',updated_at=? WHERE id IN(?,?,?) AND (SELECT COUNT(*) FROM articles WHERE ${clauses})=3 AND NOT EXISTS(SELECT 1 FROM articles WHERE scheduled_at>=? AND scheduled_at<? AND status IN('scheduled','preparing','prepared','published')) RETURNING id`,[...rows.flatMap((a,i)=>[a.id,times[i].toISOString()]),now(),...rows.map(a=>a.id),...conditions,dayStart,dayEnd]);
 check(changed.length===3,'承認状態が変わりました。予約は作成されませんでした',409);return this.snapshot();
 }
 async reschedule(id,input){
 const t=new Date(input.at);check(Number.isFinite(+t)&&t>new Date(),'未来の日時を指定してください');
 const hour=Number(t.toLocaleString('en-US',{timeZone:'Asia/Tokyo',hour:'numeric',hour12:false}));check(hour>=10&&hour<22,'JST 10〜22時を指定してください');
 const r=await this.all(`UPDATE articles SET scheduled_at=?,actor='owner',updated_at=? WHERE id=? AND revision=? AND status='scheduled' AND approved_hash=hash AND NOT EXISTS(SELECT 1 FROM articles WHERE id<>? AND status IN('scheduled','preparing','prepared') AND ABS(julianday(scheduled_at)-julianday(?))*24<2) RETURNING id`,[t.toISOString(),now(),id,input.revision,id,t.toISOString()]);check(r.length,'予約変更できません。承認・間隔を確認してください',409);return this.get(id);
 }
 async cancel(id){const r=await this.all(`UPDATE articles SET status='approved',scheduled_at=NULL,actor='owner',updated_at=? WHERE id=? AND status='scheduled' RETURNING id`,[now(),id]);check(r.length,'予約を停止できません。処理状態を確認してください',409);return this.get(id);}
 async retryable(id){return !!await this.one(`SELECT a.id FROM articles a JOIN publication_permissions p ON p.article_id=a.id AND p.revision=a.revision AND p.hash=a.hash WHERE a.id=? AND a.status='failed' AND a.approved_hash=a.hash AND a.approved_revision=a.revision AND a.public_url IS NULL AND a.lease IS NULL AND json_array_length(a.images)>0 AND NOT EXISTS(SELECT 1 FROM note_drafts WHERE article_id=a.id) AND NOT EXISTS(SELECT 1 FROM publication_attempts WHERE article_id=a.id) AND NOT EXISTS(SELECT 1 FROM publication_attempt_history WHERE article_id=a.id)`,[id]);}
 async retry(id,input){
 check(input.confirm===true,'承認した最終版を今すぐ投稿する明示確認が必要です');
 const a=await this.get(id);await this.checkMedia(await content(storedContent(a)),true);
 check(await this.retryable(id),'noteの処理履歴があるか、最終版の承認・公開許可が変わっています。再投稿せず確認してください',409);
 const rows=await this.all(`UPDATE articles SET status='scheduled',scheduled_at=?,error=NULL,actor='owner',updated_at=? WHERE id=? AND revision=? AND hash=? AND status='failed' AND approved_hash=hash AND approved_revision=revision AND public_url IS NULL AND lease IS NULL AND EXISTS(SELECT 1 FROM publication_permissions p WHERE p.article_id=articles.id AND p.hash=articles.hash AND p.revision=articles.revision) AND NOT EXISTS(SELECT 1 FROM note_drafts WHERE article_id=articles.id) AND NOT EXISTS(SELECT 1 FROM publication_attempts WHERE article_id=articles.id) AND NOT EXISTS(SELECT 1 FROM publication_attempt_history WHERE article_id=articles.id) RETURNING id`,[now(),now(),id,input.revision,input.hash]);
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
 const rows=await this.all(`UPDATE articles SET status='preparing',lease=?,lease_until=?,actor='agent',updated_at=? WHERE id=(SELECT id FROM articles WHERE status='scheduled' AND scheduled_at<=? AND scheduled_at>=? AND approved_hash=hash AND approved_revision=revision AND json_array_length(images)>0 AND (SELECT paused FROM settings)=0 ORDER BY scheduled_at LIMIT 1) AND status='scheduled' RETURNING *`,[lease,new Date(Date.now()+300000).toISOString(),now(),now(),new Date(Date.now()-900000).toISOString()]);
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
