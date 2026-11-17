
import {createServer} from 'node:http';
import {readFile,mkdir,chmod} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {database} from './sqlite.mjs';
import {api} from './api.mjs';
import {Store} from './core.mjs';
const dir=resolve('.state');await mkdir(dir,{recursive:true,mode:0o700});await chmod(dir,0o700);
const db=database(resolve(dir,'yohaku.sqlite'));db.raw.exec(await readFile('schema.sql','utf8'));
await chmod(resolve(dir,'yohaku.sqlite'),0o600);
const port=Number(process.env.PORT||4173),base=`http://127.0.0.1:${port}`;
const env={DB:db,LOCAL:true,UI_ORIGIN:base,MACHINE_TOKEN:process.env.MACHINE_TOKEN,VAPID_PUBLIC_KEY:process.env.VAPID_PUBLIC_KEY};
if(process.env.SEED==='1'&&!await new Store(db).one('SELECT id FROM articles LIMIT 1')){
 const body='忙しい毎日に、少しの余白を。\n\n## まずは、ひとつだけ\n\nAIに任せたい作業を、今日ひとつだけ書き出してみませんか。たとえば会議のメモを整理すること。最初から、すべてを自動化する必要はありません。\n\n## 自分の目で確かめる\n\nAIの提案には、間違いが混ざることがあります。出典を確認し、あなた自身の経験を添えて、読者に届く言葉に整えましょう。\n\nこれは動作確認用のサンプルです。販売用の完成原稿ではありません。';
 for(const [title,price]of [['AIと働く、最初の小さな一歩',0],['仕事の余白をつくる、問いかけの設計',200],['続けられる自動化の、小さな仕組み',200]])await new Store(db).create({title,body,price,paywall:price?body.indexOf('## 自分'):0,tags:['AI活用','働き方']},'sample');
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer(async(req,res)=>{
 try{
 if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);return res.end('localhost only');}
 const url=new URL(req.url,base);
 if(url.pathname.startsWith('/api/')){
 const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>200000){res.writeHead(413);return res.end();}chunks.push(c)}
 const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
 const response=await api(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));return res.end(Buffer.from(await response.arrayBuffer()));
 }
 let name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
 const path=resolve('public',name);if(!path.startsWith(resolve('public')+'/')){res.writeHead(403);return res.end();}
 const bytes=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-cache','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'});res.end(bytes);
 }catch{res.writeHead(404);res.end('Not found');}
});server.listen(port,'127.0.0.1',()=>console.log(`余白ラボ ${base} — ローカル専用 / 本番公開は無効`));
