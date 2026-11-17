
// Read a single private-repository JSON file using a GitHub App installation token.
import {readFile,mkdir,writeFile} from 'node:fs/promises';import {createSign} from 'node:crypto';import {resolve} from 'node:path';
const {GITHUB_APP_ID,GITHUB_INSTALLATION_ID,GITHUB_APP_KEY_FILE,GITHUB_REPOSITORY,GITHUB_ARTICLE_PATH,MACHINE_TOKEN}=process.env;
if(!GITHUB_APP_ID||!GITHUB_INSTALLATION_ID||!GITHUB_APP_KEY_FILE||!GITHUB_REPOSITORY||!GITHUB_ARTICLE_PATH||!MACHINE_TOKEN)throw Error('GitHub Appの読み取り専用設定が必要です');
if(resolve(GITHUB_APP_KEY_FILE).startsWith(process.cwd()+'/'))throw Error('Appの秘密鍵はリポジトリの外に保管してください');
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),time=Math.floor(Date.now()/1000);
const unsigned=b64({alg:'RS256',typ:'JWT'})+'.'+b64({iat:time-60,exp:time+540,iss:GITHUB_APP_ID});const signer=createSign('RSA-SHA256');signer.update(unsigned);const jwt=unsigned+'.'+signer.sign(await readFile(GITHUB_APP_KEY_FILE),'base64url');
const api=async(path,token,method='GET',data)=>{const response=await fetch('https://api.github.com'+path,{method,headers:{Authorization:`Bearer ${token}`,'User-Agent':'yohaku-lab','Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},...(data?{body:JSON.stringify(data)}:{})});if(!response.ok)throw Error('GitHub連携に失敗しました HTTP '+response.status);return response.json()};
const installation=await api(`/app/installations/${encodeURIComponent(GITHUB_INSTALLATION_ID)}/access_tokens`,jwt,'POST',{repositories:[GITHUB_REPOSITORY.split('/')[1]],permissions:{contents:'read'}});
const file=await api(`/repos/${GITHUB_REPOSITORY.split('/').map(encodeURIComponent).join('/')}/contents/${GITHUB_ARTICLE_PATH.split('/').map(encodeURIComponent).join('/')}`,installation.token);
if(!file.sha||file.encoding!=='base64'||file.size>150000)throw Error('JSONのサイズ・形式が不正です');
await mkdir('.state/github-imports',{recursive:true,mode:0o700});const receiptPath=`.state/github-imports/${file.sha}.json`;
try{await readFile(receiptPath);throw Error('同じ版の原稿は既に取り込み済み、または処理中です。控えとUIを照合してください')}catch(e){if(e.code!=='ENOENT')throw e}
const data=JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));const articles=Array.isArray(data)?data:[data];if(articles.length>3)throw Error('1回3記事までです');
await writeFile(receiptPath,JSON.stringify({sha:file.sha,complete:false}),{flag:'wx',mode:0o600});const ids=[];
const base=process.env.API_URL||'http://127.0.0.1:4173';if(!base.startsWith('https://')&&!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('HTTPSが必要です');
for(const a of articles){const {title,body,price,paywall,tags}=a;const response=await fetch(base+'/api/machine/import',{method:'POST',headers:{Authorization:`Bearer ${MACHINE_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({title,body,price,paywall,tags})});if(!response.ok)throw Error('原稿の取り込みが中断しました。控えとUIを確認してください');ids.push((await response.json()).id);await writeFile(receiptPath,JSON.stringify({sha:file.sha,ids,complete:false}),{mode:0o600})}
await writeFile(receiptPath,JSON.stringify({sha:file.sha,ids,complete:true}),{mode:0o600});console.log('GitHubから未承認の原稿を取り込みました');
