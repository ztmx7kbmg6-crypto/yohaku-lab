import {Problem,now,content,storedContent} from './core.mjs';
const requireThat=(ok,msg,status=409)=>{if(!ok)throw new Problem(msg,status)};
// The only live-publication gate. Disabled unless the deployed environment explicitly enables it.
export class Publication {
 constructor(store,{enabled=false}={}){this.store=store;this.enabled=enabled}
 async authorize(id,input){
 requireThat(input.confirm===true,'この最終版をnoteに公開する明示確認が必要です',400);
 await this.store.checkMedia(await content(storedContent(await this.store.get(id))),true);
 const rows=await this.store.all(`INSERT INTO publication_permissions(article_id,revision,hash,granted_at) SELECT id,revision,hash,? FROM articles WHERE id=? AND revision=? AND hash=? AND approved_hash=hash AND approved_revision=revision AND status IN('approved','scheduled') ON CONFLICT(article_id) DO UPDATE SET revision=excluded.revision,hash=excluded.hash,granted_at=excluded.granted_at RETURNING article_id`,[now(),id,input.revision,input.hash]);
 requireThat(rows.length===1,'承認した最終版が変わっています');
 await this.store.run(`INSERT INTO audit(article_id,action,actor,revision,hash) VALUES(?,'publication_authorized','owner',?,?)`,[id,input.revision,input.hash]);
 return {authorized:true};
 }
 async revoke(id){await this.store.run('DELETE FROM publication_permissions WHERE article_id=?',[id]);await this.store.run(`INSERT INTO audit(article_id,action,actor) VALUES(?,'publication_revoked','owner')`,[id]);return {authorized:false}}
 async begin(id,input){
 requireThat(this.enabled,'実noteの接続検証が未完了のため本番投稿は停止中です',503);
 requireThat(typeof input.noteKey==='string'&&/^n[a-z0-9]+$/.test(input.noteKey),'note下書きIDが不正です',400);
 const final=await content(storedContent(await this.store.get(id)));await this.store.checkMedia(final,true);requireThat(input.coverId===final.cover.id,'承認した本文とは別の見出し画像の設定を確認してください');
 const nonce=crypto.randomUUID(),at=now(),expires=new Date(Date.now()+10000).toISOString();
 const rows=await this.store.all(`INSERT INTO publication_attempts(article_id,revision,hash,note_key,nonce,stage,started_at,expires_at)
 SELECT a.id,a.revision,a.hash,?,?, 'armed',?,? FROM articles a JOIN publication_permissions p ON p.article_id=a.id AND p.revision=a.revision AND p.hash=a.hash JOIN note_drafts d ON d.article_id=a.id AND d.hash=a.hash AND d.revision=a.revision AND d.note_key=?
 WHERE a.id=? AND a.revision=? AND a.hash=? AND a.status='preparing' AND a.lease=? AND a.lease_until>? AND a.approved_hash=a.hash AND a.approved_revision=a.revision AND (SELECT paused FROM settings WHERE id=1)=0
 AND NOT EXISTS(SELECT 1 FROM publication_attempts WHERE article_id=a.id OR hash=a.hash OR note_key=?) RETURNING nonce`,[input.noteKey,nonce,at,expires,input.noteKey,id,input.revision,input.hash,input.lease,at,input.noteKey]);
 requireThat(rows.length===1,'公開承認・停止状態・ロック・重複を確認してください');return {nonce,expiresAt:expires,expectedUrl:'https://note.com/firm_orchid8992/n/'+input.noteKey};
 }
 async attempt(id,input){
 requireThat(this.enabled,'本番投稿は停止中です',503);
 const rows=await this.store.all(`UPDATE publication_attempts SET stage='attempting' WHERE article_id=? AND nonce=? AND stage='armed' AND expires_at>? AND EXISTS(SELECT 1 FROM articles a JOIN publication_permissions p ON p.article_id=a.id AND p.hash=a.hash AND p.revision=a.revision WHERE a.id=? AND a.lease=? AND a.lease_until>? AND a.status='preparing' AND (SELECT paused FROM settings WHERE id=1)=0) RETURNING note_key`,[id,input.nonce,now(),id,input.lease,now()]);
 requireThat(rows.length===1,'公開許可が失効しました。再試行せず状態確認してください');return {noteKey:rows[0].note_key};
 }
 async confirm(id,input){
 requireThat(this.enabled,'本番投稿は停止中です',503);
 const job=await this.store.one(`SELECT * FROM publication_attempts WHERE article_id=? AND nonce=? AND stage='attempting'`,[id,input.nonce]);
 requireThat(job&&input.url==='https://note.com/firm_orchid8992/n/'+job.note_key,'公開URLが対象記事と一致しません');
 const rows=await this.store.all(`UPDATE articles SET status='published',public_url=?,lease=NULL,lease_until=NULL,error=NULL,actor='agent-publish',updated_at=? WHERE id=? AND lease=? AND status='preparing' AND hash=? AND revision=? AND approved_hash=hash AND approved_revision=revision RETURNING id`,[input.url,now(),id,input.lease,job.hash,job.revision]);
 requireThat(rows.length===1,'公開結果は要確認です。再投稿せずURLを照合してください');
 await this.store.run(`UPDATE publication_attempts SET stage='confirmed' WHERE article_id=? AND nonce=?`,[id,input.nonce]);return {published:true,url:input.url};
 }
 async uncertain(id,input){
 const rows=await this.store.all(`UPDATE articles SET status='uncertain',error='公開操作の結果が不明です。自動再試行せずnote側を確認してください',actor='agent-publish',updated_at=? WHERE id=? AND lease=? AND status='preparing' RETURNING id`,[now(),id,input.lease]);
 requireThat(rows.length===1,'対象の処理は既に終了または隔離されています');return {status:'uncertain'};
 }
}
