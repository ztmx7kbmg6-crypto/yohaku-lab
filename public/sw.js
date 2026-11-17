
// Never cache drafts, API responses, or auth sessions. Offline approval is disabled.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{event.waitUntil(self.registration.showNotification('余白ラボ',{body:'編集室に更新があります。記事と予定を確認してください。',icon:'icon-192.png',badge:'icon-192.png',tag:'yohaku-update',data:{url:self.registration.scope}}))});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const list=await clients.matchAll({type:'window',includeUncontrolled:true});const client=list.find(c=>c.url.startsWith(self.registration.scope));if(client)return client.focus();return clients.openWindow(self.registration.scope)})())});
