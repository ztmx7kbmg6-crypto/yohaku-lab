
import {test,expect} from '@playwright/test';
test('スマホで最終版承認、編集による失効、コメント、履歴、XSS',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.getByText('公開しないテスト運用')).toBeVisible();
 await page.getByRole('button',{name:'＋ 記事をつくる'}).click({trial:true});
 page.once('dialog',d=>d.accept('テスト用の記事 <img src=x onerror=alert(1)>'));await page.getByRole('button',{name:'＋ 記事をつくる'}).click();
 await expect(page.locator('#editor')).toBeVisible();await page.locator('#edit-body').fill('## 安全な原稿\n\nスマホから本文を読み、確認します。\n\n<script>alert(1)</script>');await page.getByRole('button',{name:'修正を保存'}).click();
 await expect(page.locator('#preview')).toBeVisible();await expect(page.locator('#approve')).toBeDisabled();await expect(page.locator('#preview script')).toHaveCount(0);
 await page.locator('#confirm-final').check();await page.locator('#approve').click();await expect(page.locator('#preview .pill').first()).toContainText('承認済み');
 await page.locator('#comment-body').fill('具体例を追加してください');await page.getByRole('button',{name:'修正を依頼'}).click();await expect(page.locator('#preview .pill').first()).toContainText('修正待ち');await expect(page.locator('#comments')).toContainText('具体例を追加');
 await page.getByRole('button',{name:'編集する',exact:true}).click();await page.locator('#edit-body').fill('## 修正した原稿\n\n具体例を追加しました。');await page.getByRole('button',{name:'修正を保存'}).click();await expect(page.locator('#preview .pill').first()).toContainText('下書き');await expect(page.locator('#revisions details')).toHaveCount(3);await expect(page.locator('#approve')).toBeDisabled();
 await page.screenshot({path:'artifacts/mobile-article.png',fullPage:true});await page.getByRole('button',{name:'記事を閉じる'}).click();await page.screenshot({path:'artifacts/mobile-home.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();expect(errors).toEqual([]);
});
test('デスクトップでも表示できる',async({page})=>{await page.setViewportSize({width:1440,height:1000});await page.goto('/');await expect(page.locator('.card').first()).toBeVisible();await page.screenshot({path:'artifacts/desktop-home.png',fullPage:true})});
