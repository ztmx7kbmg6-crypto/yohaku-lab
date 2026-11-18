import {png,coverPng} from '../media-fixture.mjs';
import {test,expect} from '@playwright/test';

test('2本・1本ずつ自動予約でき、3本埋まった日は選択できない',async({page,request})=>{
 const articles=[];const bodyImage=await(await request.post('/api/media',{data:{mime:'image/png',data:png.toString('base64')}})).json(),coverImage=await(await request.post('/api/media',{data:{mime:'image/png',data:coverPng.toString('base64')}})).json();
 for(const [index,price]of [0,200,200,200].entries()){
  const r=await request.post('/api/articles',{data:{title:`予約画面の検証 ${Date.now()}-${index}`,body:'無料の導入です。\n\nここから実践です。',price,paywall:price?10:0,tags:[],images:[{id:bodyImage.id,alt:'本文図解'}],cover:{id:coverImage.id,alt:'別の見出し画像'}}});expect(r.ok()).toBeTruthy();const a=await r.json();articles.push(a);expect((await request.post(`/api/articles/${a.id}/decide`,{data:{decision:'approved',confirm:true,confirmImages:true,confirmCover:true,revision:a.revision,hash:a.hash}})).ok()).toBeTruthy();
 }
 const day=new Date(Date.now()+86400000).toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});
 try{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.locator('#workspace')).toBeVisible();await page.getByRole('button',{name:'予定',exact:true}).click();await page.locator('#schedule-date').selectOption(day);
  const button=page.getByRole('button',{name:'選んだ記事の時刻を自動で決める',exact:true});await expect(button).toBeDisabled();
  for(const a of articles.slice(1,3))await page.locator(`#schedule-select input[value="${a.id}"]`).check();
  await expect(button).toBeEnabled();const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/schedule')&&r.request().method()==='POST');await button.click();const response=await responsePromise;expect(response.ok()).toBeTruthy();expect(response.request().postDataJSON().ids.sort()).toEqual(articles.slice(1,3).map(a=>a.id).sort());await expect(page.locator('#timeline .timeline-item')).toHaveCount(2);
  await page.locator(`#schedule-select input[value="${articles[0].id}"]`).check();await expect(button).toBeEnabled();await button.click();await expect(page.locator('#timeline .timeline-item')).toHaveCount(3);
  const option=page.locator(`#schedule-date option[value="${day}"]`);await expect(option).toHaveJSProperty('disabled',true);await expect(option).toContainText('満枠');await page.locator(`#schedule-select input[value="${articles[3].id}"]`).check();await expect(button).toBeDisabled();
  const denied=await request.post('/api/schedule',{data:{ids:[articles[3].id],date:day}});expect(denied.status()).toBe(409);expect((await(await request.get('/api/articles/'+articles[3].id)).json()).article.status).toBe('approved');
  await expect(page.locator('#tab-schedule input[type=time]')).toHaveCount(0);await expect(page.locator('#schedule-status')).toContainText('停止中');await page.getByRole('button',{name:'予約投稿を開始',exact:true}).click();await expect(page.locator('#schedule-status')).toContainText('稼働中');
  const row=page.locator('#timeline .timeline-item').filter({hasText:articles[1].title});await row.getByRole('button',{name:'予約を停止',exact:true}).click();await expect(option).toHaveJSProperty('disabled',false);await expect(page.locator('#timeline .timeline-item')).toHaveCount(2);
  const remaining=page.locator('#timeline .timeline-item').filter({hasText:articles[2].title});await remaining.getByRole('button',{name:'日付を変更',exact:true}).click();await expect(page.locator('#reschedule-dialog')).toBeVisible();const nextDay=new Date(Date.now()+2*86400000).toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});await page.locator('#reschedule-date').selectOption(nextDay);await page.getByRole('button',{name:'日付を変更して時刻を自動決定',exact:true}).click();await expect(page.locator('#reschedule-dialog')).not.toBeVisible();
  expect(new Date((await(await request.get('/api/articles/'+articles[2].id)).json()).article.scheduled_at).toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'})).toBe(nextDay);expect(errors).toEqual([]);
 }finally{
  await request.post('/api/pause',{data:{paused:true}});const state=await(await request.get('/api/state')).json();for(const a of state.articles.filter(a=>articles.some(t=>t.id===a.id))){if(a.status==='scheduled')await request.post(`/api/articles/${a.id}/cancel`,{data:{}});await request.post(`/api/articles/${a.id}/decide`,{data:{decision:'rejected',revision:a.revision,hash:a.hash}});}
 }
});
