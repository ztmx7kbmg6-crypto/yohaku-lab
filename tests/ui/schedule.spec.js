import {png,coverPng} from '../media-fixture.mjs';
import {test,expect} from '@playwright/test';

test('選択した無料1本・有料2本の予約時刻が予定一覧に表示される',async({page,request})=>{
 const articles=[];const imageResponse=await request.post('/api/media',{data:{mime:'image/png',data:png.toString('base64')}});expect(imageResponse.ok()).toBeTruthy();const image=await imageResponse.json();const coverResponse=await request.post('/api/media',{data:{mime:'image/png',data:coverPng.toString('base64')}});expect(coverResponse.ok()).toBeTruthy();const coverImage=await coverResponse.json();
 const create=async(price,index)=>{
  const r=await request.post('/api/articles',{data:{title:`予約画面の検証 ${Date.now()}-${index}`,body:'無料の導入です。\n\nここから実践です。',price,paywall:price?10:0,tags:[],images:[{id:image.id,alt:'予約画面を検証する画像'}],cover:{id:coverImage.id,alt:'別の見出し画像'}}});
  expect(r.ok()).toBeTruthy();const a=await r.json();articles.push(a);
  const approve=await request.post(`/api/articles/${a.id}/decide`,{data:{decision:'approved',confirm:true,confirmImages:true,confirmCover:true,revision:a.revision,hash:a.hash}});expect(approve.ok()).toBeTruthy();
 };
 try{
  for(const [i,price]of [0,200,200].entries())await create(price,i);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('#workspace')).toBeVisible();
  await page.getByRole('button',{name:'予定',exact:true}).click();
  await page.locator('#schedule-date').fill(new Date(Date.now()+86400000).toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'}));
  for(const a of articles.slice(0,2))await page.locator(`#schedule-select input[value="${a.id}"]`).check();
  await page.getByRole('button',{name:'選んだ3記事の時刻を決める'}).click();
  await expect(page.locator('#toast')).toContainText('3記事を選んでください');
  await page.locator(`#schedule-select input[value="${articles[2].id}"]`).check();
  const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/schedule')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'選んだ3記事の時刻を決める'}).click();
  const response=await responsePromise;expect(response.ok()).toBeTruthy();
  expect(response.request().postDataJSON().ids.sort()).toEqual(articles.map(a=>a.id).sort());
  await expect(page.locator('#toast')).toContainText('時刻を決定しました');
  for(const a of articles)await expect(page.locator('#timeline')).toContainText(a.title);
  await expect(page.locator('#schedule-select input:checked')).toHaveCount(0);
  const s=await response.json();const scheduled=s.articles.filter(a=>articles.some(t=>t.id===a.id));
  expect(scheduled.every(a=>a.status==='scheduled'&&a.scheduled_at)).toBeTruthy();
  expect(s.settings.paused).toBe(1);await expect(page.locator('#schedule-status')).toContainText('停止中');await page.getByRole('button',{name:'予約投稿を開始',exact:true}).click();await expect(page.locator('#schedule-status')).toContainText('稼働中');expect((await (await request.get('/api/state')).json()).settings.paused).toBe(0);await page.getByRole('button',{name:'記事',exact:true}).click();await page.getByRole('tab',{name:/予約済み/}).click();await expect(page.locator('.card')).toHaveCount(3);for(const a of articles)await expect(page.locator('#article-list')).toContainText(a.title);expect(errors).toEqual([]);
 }finally{
  await request.post('/api/pause',{data:{paused:true}});const response=await request.get('/api/state');const state=await response.json();
  for(const a of state.articles.filter(a=>articles.some(t=>t.id===a.id))){
   if(a.status==='scheduled')await request.post(`/api/articles/${a.id}/cancel`,{data:{}});
   await request.post(`/api/articles/${a.id}/decide`,{data:{decision:'rejected',revision:a.revision,hash:a.hash}});
  }
 }
});
