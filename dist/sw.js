'use strict';
// No caching of account pages, API responses, credentials or personal records.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let payload={};try{payload=event.data?.json()||{};}catch{}
  event.waitUntil(self.registration.showNotification('Oasis · um momento para você',{
    body:'Você tem um cuidado agendado. Abra a Oasis para conferir.',icon:'/logo-oasis.png',badge:'/logo-oasis.png',
    tag:typeof payload.tag==='string'?payload.tag.slice(0,180):'oasis-reminder',renotify:false,data:{url:'/#lembretes'},
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();event.waitUntil((async()=>{
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of clients){if(new URL(client.url).origin===self.location.origin){await client.navigate('/#lembretes');return client.focus();}}
    return self.clients.openWindow('/#lembretes');
  })());
});
