
import {cp,mkdir,writeFile,rm} from 'node:fs/promises';
const api=process.env.PUBLIC_API_BASE;
if(!api||!api.startsWith('https://'))throw Error('PUBLIC_API_BASE にHTTPSのWorker URLを設定してください');
const origin=new URL(api);if(origin.username||origin.password||origin.search||origin.hash)throw Error('公開API URLに認証情報を含めないでください');
await rm('dist',{recursive:true,force:true});await mkdir('dist');await cp('public','dist',{recursive:true});
await writeFile('dist/config.js',`window.YOHAKU_CONFIG = ${JSON.stringify({apiBase:api.replace(/\/$/,'')})};\n`);
const html=await (await import('node:fs/promises')).readFile('dist/index.html','utf8');
await writeFile('dist/index.html',html.replace('<meta name="viewport"',`<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' ${origin.origin}; object-src 'none'; base-uri 'none'"><meta name="viewport"`));
await writeFile('dist/.nojekyll','');console.log('静的UIのみをdist/に出力しました。原稿・DB・鍵は含みません。');
