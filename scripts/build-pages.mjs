
import {cp,mkdir,writeFile,rm} from 'node:fs/promises';
const api=process.env.PUBLIC_API_BASE;
if(!api||!api.startsWith('https://'))throw Error('PUBLIC_API_BASE にHTTPSのWorker URLを設定してください');
const origin=new URL(api);if(origin.username||origin.password||origin.search||origin.hash)throw Error('公開API URLに認証情報を含めないでください');
await rm('dist',{recursive:true,force:true});await mkdir('dist');await cp('public','dist',{recursive:true});
await writeFile('dist/config.js',`window.YOHAKU_CONFIG = ${JSON.stringify({apiBase:api.replace(/\/$/,'')})};\n`);
await writeFile('dist/.nojekyll','');console.log('静的UIのみをdist/に出力しました。原稿・DB・鍵は含みません。');
