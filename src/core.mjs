
export class Problem extends Error {constructor(message,status=400){super(message);this.status=status;}}
const check=(ok,msg,status=400)=>{if(!ok)throw new Problem(msg,status)};
export const now=()=>new Date().toISOString();
export async function content(input){
 const {title,body,price,paywall=0,tags=[]}=input;
 check(typeof title==='string'&&title.trim().length>0&&title.length<=200,'タイトルは1〜200文字です');
 check(typeof body==='string'&&body.trim().length>0&&body.length<=100000,'本文は1〜100000文字です');
 check([0,200].includes(price),'価格は無料または200円です');
 check(Number.isInteger(paywall)&&paywall>=0&&paywall<=body.length&&(price===0||paywall>0&&paywall<body.length),'有料部分の開始位置を本文内に指定してください');
 check(Array.isArray(tags)&&tags.length<=10&&tags.every(t=>typeof t==='string'&&t.length<=40),'タグを確認してください');
 const value={title,body,price,paywall,tags};
 value.hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(x=>x.toString(16).padStart(2,'0')).join('');return value;
}
export class Store {
 constructor(db){this.db=db;}
 stmt(sql,args=[]){return this.db.prepare(sql).bind(...args);}
 async all(sql,args=[]){return (await this.stmt(sql,args).all()).results;}
 async one(sql,args=[]){return this.stmt(sql,args).first();}
 async run(sql,args=[]){return this.stmt(sql,args).run();}
 async get(id){const a=await this.one('SELECT * FROM articles WHERE id=?',[id]);check(a,'記事がありません',404);return a;}
 async snapshot(){return {articles:await this.all('SELECT * FROM articles ORDER BY updated_at DESC'),settings:await this.one('SELECT * FROM settings'),audit:await this.all('SELECT * FROM audit ORDER BY id DESC LIMIT 100'),notifications:await this.all('SELECT id,article_id,kind,created_at FROM notifications ORDER BY id DESC LIMIT 30'),liveEnabled:false};}
 async create(input,actor='owner'){
 const c=await content(input),id=crypto.randomUUID();
 await this.run('INSERT INTO articles(id,title,body,price,paywall,tags,hash,actor,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',[id,c.title,c.body,c.price,c.paywall,JSON.stringify(c.tags),c.hash,actor,now()]);return this.get(id);
 }
 async edit(id,input,actor='owner'){
 const c=await content(input);
 const rows=await this.all(`UPDATE articles SET title=?,body=?,price=?,paywall=?,tags=?,hash=?,revision=revision+1,status='draft',approved_hash=NULL,approved_revision=NULL,scheduled_at=NULL,error=NULL,actor=?,updated_at=? WHERE id=? AND revision=? AND status NOT IN ('preparing','uncertain','published') RETURNING id`,[c.title,c.body,c.price,c.paywall,JSON.stringify(c.tags),c.hash,actor,now(),id,input.revision]);
 check(rows.length,'別の端末で更新されたか、処理中です。再読み込みしてください',409);return this.get(id);
 }
 async decide(id,input){
 check(['approved','rejected','revision_requested'].includes(input.decision),'不正な操作です');
 check(input.confirm===true||input.decision!=='approved','最終版の明示承認が必要です');
 const rows=await this.all(`UPDATE articles SET status=?,approved_hash=CASE WHEN ?='approved' THEN hash ELSE NULL END,approved_revision=CASE WHEN ?='approved' THEN revision ELSE NULL END,scheduled_at=NULL,actor='owner',updated_at=? WHERE id=? AND revision=? AND hash=? AND status IN('draft','revision_requested','rejected','approved','scheduled','prepared','failed') RETURNING id`,[input.decision,input.decision,input.decision,now(),id,input.revision,input.hash]);
 check(rows.length,'最終版が変わりました。再読み込みして確認してください',409);return this.get(id);
 }
 async schedule(input,clock=new Date()){
 check(/^\d{4}-\d{2}-\d{2}$/.test(input.date),'日付を指定してください');
 check(Array.isArray(input.ids)&&input.ids.length===3&&new Set(input.ids).size===3,'3記事を選んでください');
 const rows=await Promise.all(input.ids.map(id=>this.get(id)));
 check(rows.every(a=>a.status==='approved'&&a.approved_hash===a.hash),'最終版の承認済み記事が3本必要です',409);
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
 async comment(id,input){const a=await this.get(id);check(input.revision===a.revision,'記事が更新されています',409);check(typeof input.body==='string'&&input.body.trim()&&input.body.length<=4000,'コメントは1〜4000文字です');await this.run('INSERT INTO comments(article_id,revision,body) VALUES(?,?,?)',[id,a.revision,input.body]);}
 async detail(id){return {article:await this.get(id),comments:await this.all('SELECT * FROM comments WHERE article_id=? ORDER BY id',[id]),revisions:await this.all('SELECT * FROM revisions WHERE article_id=? ORDER BY revision DESC',[id])};}
 async pause(value){check(typeof value==='boolean','停止設定が不正です');await this.run('UPDATE settings SET paused=? WHERE id=1',[value?1:0]);}
 async claim(){
 await this.run('UPDATE settings SET heartbeat=? WHERE id=1',[now()]);
 // Expired leases are quarantined, never retried automatically.
 await this.run(`UPDATE articles SET status='uncertain',error='処理が中断されました。note側の状態を確認して復旧してください',actor='agent',updated_at=? WHERE status='preparing' AND lease_until<?`,[now(),now()]);
 const lease=crypto.randomUUID();
 const rows=await this.all(`UPDATE articles SET status='preparing',lease=?,lease_until=?,actor='agent',updated_at=? WHERE id=(SELECT id FROM articles WHERE status='scheduled' AND scheduled_at<=? AND scheduled_at>=? AND approved_hash=hash AND approved_revision=revision AND (SELECT paused FROM settings)=0 ORDER BY scheduled_at LIMIT 1) AND status='scheduled' RETURNING *`,[lease,new Date(Date.now()+300000).toISOString(),now(),now(),new Date(Date.now()-900000).toISOString()]);
 await this.run(`UPDATE articles SET status='failed',error='予定から15分以上経過したため自動処理を停止しました',actor='agent',updated_at=? WHERE status='scheduled' AND scheduled_at<?`,[now(),new Date(Date.now()-900000).toISOString()]);
 return rows[0]||null;
 }
 async finish(id,input){
 check(['prepared','failed'].includes(input.status),'本番公開は無効です');
 const r=await this.all(`UPDATE articles SET status=?,error=?,lease=NULL,lease_until=NULL,actor='agent',updated_at=? WHERE id=? AND status='preparing' AND lease=? AND lease_until>? AND hash=approved_hash AND revision=approved_revision RETURNING id`,[input.status,input.status==='failed'?String(input.error||'dry-run失敗').slice(0,2000):null,now(),id,input.lease,now()]);check(r.length,'処理ロックが失効しています',409);
 }
 async reconcile(id,input){
 check(input.confirm===true,'noteで公開済みの確認が必要です');
 check(typeof input.url==='string'&&/^https:\/\/note\.com\/firm_orchid8992\/n\/n[a-zA-Z0-9]+$/.test(input.url),'余白ラボの公開記事URLを入力してください');
 const rows=await this.all(`UPDATE articles SET status='published',public_url=?,lease=NULL,lease_until=NULL,error=NULL,actor='owner-manual',updated_at=? WHERE id=? AND revision=? AND hash=approved_hash AND revision=approved_revision AND status IN('approved','scheduled','prepared','uncertain','failed') AND NOT EXISTS(SELECT 1 FROM articles WHERE public_url=?) RETURNING id`,[input.url,now(),id,input.revision,input.url]);
 check(rows.length,'最終版の承認・状態・URLの重複を確認してください',409);return this.get(id);
 }
 async recover(id,input){check(input.confirm===true,'note側の確認が必要です');const r=await this.all(`UPDATE articles SET status='draft',approved_hash=NULL,approved_revision=NULL,scheduled_at=NULL,lease=NULL,lease_until=NULL,error=NULL,actor='owner',updated_at=? WHERE id=? AND status IN('uncertain','failed','prepared') RETURNING id`,[now(),id]);check(r.length,'復旧対象ではありません',409);return this.get(id);}
}
