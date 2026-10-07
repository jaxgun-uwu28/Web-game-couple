const VERSION="arcade-shell-e364aff5b1ae";
const CORE=['/','/offline.html','/icons/icon-192.png','/icons/icon-512.png','/icons/maskable-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(CORE)));});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('arcade-shell-')&&k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==self.location.origin||req.headers.get('RSC')||req.headers.has('Next-Router-State-Tree'))return;
 // No API, Supabase, signed media, private data or RSC responses enter the cache.
 if(url.pathname.startsWith('/_next/static/')||url.pathname.startsWith('/fonts/')||url.pathname.startsWith('/icons/')){event.respondWith(caches.open(VERSION).then(async cache=>{const hit=await cache.match(req);if(hit)return hit;const response=await fetch(req);if(response.ok)await cache.put(req,response.clone());return response;}));return;}
 if(req.mode==='navigate'){event.respondWith(fetch(req).then(async response=>{if(response.ok&&url.pathname==='/'&&!url.search){const cache=await caches.open(VERSION);await cache.put('/',response.clone());}return response;}).catch(async()=>await caches.match('/')||await caches.match('/offline.html')));}
});
self.addEventListener('push',event=>{let data={};try{data=event.data?.json()||{};}catch{}event.waitUntil(self.registration.showNotification(String(data.title||'Our Little Arcade').slice(0,90),{body:String(data.body||'Your person left a little something for you.').slice(0,180),icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:data.type||'little-update',data:{url:'/'}}));});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{const existing=clients.find(c=>new URL(c.url).origin===self.location.origin);if(existing)return existing.focus();return self.clients.openWindow('/');}));});

