import {test,expect} from '@playwright/test';

test('選択した無料1本・有料2本の予約時刻が予定一覧に表示される',async({page,request})=>{
 const articles=[];
 const create=async(price,index)=>{
  const r=await request.post('/api/articles',{data:{title:`予約画面の検証 ${Date.now()}-${index}`,body:'無料の導入です。\n\nここから実践です。',price,paywall:price?10:0,tags:[]}});
  expect(r.ok()).toBeTruthy();const a=await r.json();articles.push(a);
  const approve=await request.post(`/api/articles/${a.id}/decide`,{data:{decision:'approved',confirm:true,revision:a.revision,hash:a.hash}});expect(approve.ok()).toBeTruthy();
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
  expect(s.settings.paused).toBe(1);expect(errors).toEqual([]);
 }finally{
  const response=await request.get('/api/state');const state=await response.json();
  for(const a of state.articles.filter(a=>articles.some(t=>t.id===a.id))){
   if(a.status==='scheduled')await request.post(`/api/articles/${a.id}/cancel`,{data:{}});
   await request.post(`/api/articles/${a.id}/decide`,{data:{decision:'rejected',revision:a.revision,hash:a.hash}});
  }
 }
});
