
import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';
import {Problem,Store,now} from './core.mjs';
const b64=b=>btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const digest=async text=>b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))));
async function sign(data,secret){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(data))))}
export async function session(env){const text=b64(new TextEncoder().encode(JSON.stringify({sub:'owner',exp:Math.floor(Date.now()/1000)+1800,nonce:crypto.randomUUID()})));return {access_token:text+'.'+await sign(text,env.SESSION_SECRET),expires_in:1800}}
export async function cardlessUser(token,env){
 if(!env.SESSION_SECRET)throw new Problem('管理者認証の設定が必要です',503);
 try{const [text,sig,...rest]=token.split('.');if(rest.length||!sig)throw Error();const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);if(!await crypto.subtle.verify('HMAC',key,bytes(sig),new TextEncoder().encode(text)))throw Error();const p=JSON.parse(new TextDecoder().decode(bytes(text)));if(p.sub!=='owner'||p.exp<=Date.now()/1000)throw Error();return p}catch{throw new Problem('ログインし直してください',401)}
}
export async function cardlessAuth(path,input,token,env){
 const store=new Store(env.DB),rpID=new URL(env.UI_ORIGIN).hostname,expectedOrigin=env.UI_ORIGIN;
 if(path==='/api/auth/key'){
  // A 256-bit recovery credential. Only its digest is stored on the server.
  const supplied=typeof input.key==='string'&&input.key.length<=300?await digest(input.key.trim()):'';
  if(!env.OWNER_KEY_HASH||supplied!==env.OWNER_KEY_HASH)throw new Problem('管理者キーを確認してください',401);
  return session(env);
 }
 if(path==='/api/auth/register-options'){
  await cardlessUser(token,env);
  const keys=await store.all('SELECT id,transports FROM passkeys');
  const options=await generateRegistrationOptions({rpName:'余白ラボ 編集室',rpID,userName:'余白ラボ 管理者',userID:new TextEncoder().encode('yohaku-owner'),attestationType:'none',excludeCredentials:keys.map(k=>({id:k.id,transports:JSON.parse(k.transports)})),authenticatorSelection:{residentKey:'required',userVerification:'required'}});
  const id=crypto.randomUUID();await store.run('INSERT INTO auth_challenges VALUES(?,?,?,?)',[id,options.challenge,'register',new Date(Date.now()+300000).toISOString()]);return {id,options};
 }
 if(path==='/api/auth/login-options'){
  const options=await generateAuthenticationOptions({rpID,userVerification:'required'}),id=crypto.randomUUID();
  await store.run('DELETE FROM auth_challenges WHERE expires_at<?',[now()]);
  await store.run('INSERT INTO auth_challenges VALUES(?,?,?,?)',[id,options.challenge,'login',new Date(Date.now()+300000).toISOString()]);return {id,options};
 }
 if(path==='/api/auth/register-verify')await cardlessUser(token,env);
 if(!['/api/auth/register-verify','/api/auth/login-verify'].includes(path))throw new Problem('見つかりません',404);
 const kind=path.includes('register-')?'register':'login';
 const rows=await store.all('DELETE FROM auth_challenges WHERE id=? AND kind=? AND expires_at>? RETURNING challenge',[input.id,kind,now()]);
 if(!rows.length)throw new Problem('認証の有効期限が切れました',401);
 try{
  if(kind==='register'){
   const v=await verifyRegistrationResponse({response:input.response,expectedChallenge:rows[0].challenge,expectedOrigin,expectedRPID:rpID,requireUserVerification:true});
   if(!v.verified||!v.registrationInfo)throw Error();const c=v.registrationInfo.credential;
   await store.run('INSERT INTO passkeys VALUES(?,?,?,?)',[c.id,b64(c.publicKey),c.counter,JSON.stringify(c.transports||[])]);return {registered:true};
  }
  const credential=await store.one('SELECT * FROM passkeys WHERE id=?',[input.response?.id||'']);if(!credential)throw Error();
  const v=await verifyAuthenticationResponse({response:input.response,expectedChallenge:rows[0].challenge,expectedOrigin,expectedRPID:rpID,requireUserVerification:true,credential:{id:credential.id,publicKey:bytes(credential.public_key),counter:credential.counter,transports:JSON.parse(credential.transports)}});
  if(!v.verified)throw Error();await store.run('UPDATE passkeys SET counter=? WHERE id=? AND counter=?',[v.authenticationInfo.newCounter,credential.id,credential.counter]);return session(env);
 }catch{throw new Problem('パスキーを確認できませんでした',401)}
}
