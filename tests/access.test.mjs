import test from 'node:test';import assert from 'node:assert/strict';import {accessUser} from '../src/access.mjs';
test('Cloudflare Access JWTの署名・aud・発行元・期限・管理者を検証',async()=>{
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='test-key';
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({keys:[jwk]});
 const env={ACCESS_TEAM_DOMAIN:'test-yohaku.cloudflareaccess.com',ACCESS_AUD:'test-audience',OWNER_EMAIL:'owner@example.test'},payload={iss:'https://test-yohaku.cloudflareaccess.com',aud:['test-audience'],exp:Date.now()/1000+3600,email:'owner@example.test'};
 const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 async function sign(p){const value=b64({alg:'RS256',kid:'test-key'})+'.'+b64(p);return value+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(value))).toString('base64url')}
 try{assert.equal((await accessUser(await sign(payload),env)).email,payload.email);for(const override of [{aud:['wrong']},{iss:'https://wrong.test'},{exp:1},{email:'attacker@example.test'}])await assert.rejects(()=>sign({...payload,...override}).then(t=>accessUser(t,env)),{status:401});const valid=await sign(payload);const parts=valid.split('.');parts[1]=b64({...payload,email:'attacker@example.test'});await assert.rejects(()=>accessUser(parts.join('.'),env),{status:401});await assert.rejects(()=>accessUser(null,env),{status:401});}finally{globalThis.fetch=original}
});
