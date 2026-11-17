
import {Problem} from './core.mjs';
const cache=new Map();
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export async function accessUser(token,env){
 if(!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD||!env.OWNER_EMAIL)throw new Problem('Cloudflare認証の初期設定が必要です',503);
 if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN))throw new Problem('認証ドメインの設定が不正です',503);
 try{
 const parts=token?.split('.');if(parts?.length!==3)throw Error();const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))),payload=JSON.parse(new TextDecoder().decode(decode(parts[1])));
 if(header.alg!=='RS256'||!header.kid)throw Error();
 let keys=cache.get(env.ACCESS_TEAM_DOMAIN);
 if(!keys||keys.expires<Date.now()||!keys.value.some(k=>k.kid===header.kid)){
 const r=await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);if(!r.ok)throw Error();const jwks=await r.json();keys={expires:Date.now()+300000,value:jwks.keys};cache.set(env.ACCESS_TEAM_DOMAIN,keys);
 }
 const jwk=keys.value.find(k=>k.kid===header.kid);if(!jwk)throw Error();
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw Error();
 const time=Date.now()/1000;if(!Number.isFinite(payload.exp)||payload.exp<=time||payload.nbf&&payload.nbf>time||payload.iss!==`https://${env.ACCESS_TEAM_DOMAIN}`||!Array.isArray(payload.aud)||!payload.aud.includes(env.ACCESS_AUD)||payload.email?.toLowerCase()!==env.OWNER_EMAIL.toLowerCase())throw Error();
 return payload;
 }catch{throw new Problem('ログインし直してください',401)}
}
