
import {Store,Problem} from './core.mjs';
import {accessUser} from './access.mjs';
import {Publication} from './publication.mjs';
import {cardlessAuth,cardlessUser} from './cardless.mjs';
const json=(v,status=200)=>Response.json(v===undefined?{ok:true}:v,{status,headers:{'Cache-Control':'no-store'}});
const fail=(s,msg)=>{throw new Problem(msg,s)};
async function equal(a,b){if(!a||!b)return false;const hash=s=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));const [x,y]=await Promise.all([hash(a),hash(b)]);return new Uint8Array(x).every((v,i)=>v===new Uint8Array(y)[i]);}
async function user(token,env){
 if(env.AUTH_MODE==='passkey')return cardlessUser(token,env);
 if(env.ACCESS_TEAM_DOMAIN)return accessUser(token,env);
 if(!env.SUPABASE_URL||!env.SUPABASE_PUBLIC_KEY||!env.OWNER_ID)fail(503,'認証サービスの初期設定が必要です');
 const r=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:env.SUPABASE_PUBLIC_KEY,Authorization:`Bearer ${token}`}});
 if(!r.ok)fail(401,'ログインし直してください');const u=await r.json();if(u.id!==env.OWNER_ID)fail(403,'管理者専用です');return u;
}
export async function api(req,env){
 const url=new URL(req.url),path=url.pathname,origin=req.headers.get('Origin');
 const allowed=env.UI_ORIGIN;
 const headers={'Access-Control-Allow-Origin':allowed,'Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 try{
 if(origin&&origin!==allowed)fail(403,'許可されていないアクセス元です');
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method==='POST'&&!req.headers.get('Content-Type')?.startsWith('application/json'))fail(415,'JSONが必要です');
 const text=req.method==='POST'?await req.text():'';if(text.length>150000)fail(413,'データが大きすぎます');
 let input={};try{if(text)input=JSON.parse(text)}catch{fail(400,'JSONが不正です')}
 const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');
 const machine=path.startsWith('/api/machine/');
 if(path==='/api/config')return new Response(JSON.stringify({local:!!env.LOCAL,authMode:env.AUTH_MODE||'cloudflare',authReady:!!env.LOCAL||!!(env.AUTH_MODE==='passkey'&&env.SESSION_SECRET&&env.OWNER_KEY_HASH)||!!(env.ACCESS_TEAM_DOMAIN&&env.ACCESS_AUD&&env.OWNER_EMAIL)||!!env.SUPABASE_URL,liveEnabled:env.NOTE_LIVE_ENABLED==='true',vapidPublicKey:env.VAPID_PUBLIC_KEY||null}),{headers:{...headers,'Content-Type':'application/json'}});
 if(path==='/api/login'){
 await accessUser(req.headers.get('Cf-Access-Jwt-Assertion'),env);
 const redirect=new URL(env.UI_REDIRECT_URL);if(redirect.origin!==env.UI_ORIGIN)fail(503,'ログイン先が不正です');
 redirect.hash=new URLSearchParams({access_token:req.headers.get('Cf-Access-Jwt-Assertion')}).toString();
 return new Response(null,{status:302,headers:{Location:redirect.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }
 if(path.startsWith('/api/auth/')&&env.AUTH_MODE==='passkey'&&!env.LOCAL){if(req.method!=='POST')fail(405,'POSTが必要です');if(['/api/auth/key','/api/auth/login-options'].includes(path)){const hour=new Date().toISOString().slice(0,13),ip=req.headers.get('CF-Connecting-IP')||'unknown';const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip+hour));const key=Array.from(new Uint8Array(h)).map(x=>x.toString(16).padStart(2,'0')).join('');const rate=await env.DB.prepare('INSERT INTO auth_rate(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(hour+key).first();if(rate.count>30)fail(429,'しばらく待ってからログインしてください');}return wrap(json(await cardlessAuth(path,input,token,env)));}
 if(path.startsWith('/api/auth/')&&!env.LOCAL){
 if(req.method!=='POST')fail(405,'POSTが必要です');
 if(!env.OWNER_EMAIL||!env.SUPABASE_URL||!env.SUPABASE_PUBLIC_KEY)fail(503,'認証の初期設定が必要です');
 if(input.email?.toLowerCase()!==env.OWNER_EMAIL.toLowerCase())fail(403,'登録した管理者メールを入力してください');
 const verify=path==='/api/auth/verify';if(!verify&&path!=='/api/auth/start')fail(404,'見つかりません');
 const r=await fetch(`${env.SUPABASE_URL}/auth/v1/${verify?'verify':'otp'}`,{method:'POST',headers:{apikey:env.SUPABASE_PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify(verify?{email:input.email,token:input.code,type:'email'}:{email:input.email,create_user:false})});
 if(!r.ok)fail(400,'コードの送信・確認ができません。メール設定・入力・送信間隔を確認してください');
 const result=await r.json();if(verify){await user(result.access_token,env);return wrap(json({access_token:result.access_token,expires_in:result.expires_in}));}return wrap(json({ok:true}));
 }
 if(machine){if(!await equal(token,env.MACHINE_TOKEN))fail(401,'Macの認証が必要です');}
 else if(!env.LOCAL)await user(token,env);
 const store=new Store(env.DB),publication=new Publication(store,{enabled:env.NOTE_LIVE_ENABLED==='true'});let result;
 if(req.method==='GET'&&!machine){
 if(path==='/api/state')result=await store.snapshot();
 else if(/^\/api\/articles\/[^/]+$/.test(path))result=await store.detail(path.split('/').at(-1));
 else fail(404,'見つかりません');
 }else if(req.method==='POST'){
 if(machine){
 if(path==='/api/machine/heartbeat'){await store.run('UPDATE settings SET heartbeat=? WHERE id=1',[new Date().toISOString()]);result={ok:true};}
 else if(path==='/api/machine/claim')result=await store.claim();
 else if(path==='/api/machine/draft-linked')result=await store.linkDraft(input.id,input);
 else if(path==='/api/machine/finish')result=await store.finish(input.id,input);
 else if(/^\/api\/machine\/publication\/(begin|attempt|confirm|uncertain)$/.test(path))result=await publication[path.split('/').at(-1)](input.id,input);
 else if(path==='/api/machine/revision-work'){const articles=await store.all("SELECT * FROM articles WHERE status='revision_requested' ORDER BY updated_at LIMIT 6");result=[];for(const a of articles)result.push({article:a,comments:await store.all('SELECT revision,body,created_at FROM comments WHERE article_id=? ORDER BY id',[a.id])});}
 else if(path==='/api/machine/revise-requested')result=await store.edit(input.id,input,'generator','revision_requested');
 else if(path==='/api/machine/import')result=input.id?await store.edit(input.id,input,'generator'):await store.create(input,'generator');
 else if(path==='/api/machine/notifications')result={events:await store.all('SELECT * FROM notifications WHERE delivered=0 AND attempts<5 ORDER BY id LIMIT 20'),subscriptions:await store.all('SELECT payload FROM subscriptions')};
 else if(path==='/api/machine/notification-result'){
 if(!Number.isInteger(input.id))fail(400,'IDが不正です');
 await store.run('UPDATE notifications SET attempts=attempts+1,delivered=? WHERE id=?',[input.delivered?1:0,input.id]);
 if(Array.isArray(input.expired))for(const endpoint of input.expired.slice(0,100))await store.run('DELETE FROM subscriptions WHERE endpoint=?',[endpoint]);
 }else fail(403,'Macから承認・公開はできません');
 }else if(path==='/api/articles')result=await store.create(input);
 else if(path==='/api/schedule')result=await store.schedule(input);
 else if(path==='/api/pause')result=await store.pause(input.paused);
 else if(path==='/api/subscriptions'){
 const s=input.subscription;
 if(!s?.endpoint||!s.keys?.p256dh||!s.keys?.auth||JSON.stringify(s).length>10000)fail(400,'通知登録が不正です');
 const u=new URL(s.endpoint);if(u.protocol!=='https:'||u.port||u.username||u.password||!['web.push.apple.com','fcm.googleapis.com','updates.push.services.mozilla.com'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))fail(400,'対応外の通知サービスです');
 await store.run('INSERT OR REPLACE INTO subscriptions(endpoint,payload) VALUES(?,?)',[s.endpoint,JSON.stringify(s)]);
 }else if(path==='/api/unsubscribe'){await store.run('DELETE FROM subscriptions WHERE endpoint=?',[input.endpoint]);}
 else {
 const special=path.match(/^\/api\/articles\/([^/]+)\/(authorize-publication|revoke-publication)$/);
 if(special){result=special[2]==='authorize-publication'?await publication.authorize(special[1],input):await publication.revoke(special[1]);return wrap(json(result));}
 const m=path.match(/^\/api\/articles\/([^/]+)\/(edit|decide|comment|cancel|reschedule|recover|reconcile)$/);if(!m)fail(404,'見つかりません');result=await store[m[2]](m[1],input);
 }
 }else fail(405,'対応していない操作です');
 if(result&&Array.isArray(result.articles))result.liveEnabled=env.NOTE_LIVE_ENABLED==='true';
 return wrap(json(result));
 function wrap(response){for(const[k,v]of Object.entries(headers))response.headers.set(k,v);return response;}
 }catch(e){if(!(e instanceof Problem))console.error('API storage error',e.message);const response=json({error:e instanceof Problem?e.message:'処理できませんでした。設定と接続を確認してください'},e.status||500);for(const[k,v]of Object.entries(headers))response.headers.set(k,v);return response;}
}
