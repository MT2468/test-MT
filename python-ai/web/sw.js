const C='python-ai-definitive-v4',CORE=['./','./index.html','./styles.css','./app.js','./enhancements.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==self.location.origin)return;
  e.respondWith(
    fetch(e.request).then(r=>{
      if(r.ok){const copy=r.clone();caches.open(C).then(c=>c.put(e.request,copy));}
      return r;
    }).catch(()=>caches.match(e.request).then(r=>r||(e.request.mode==='navigate'?caches.match('./index.html'):Response.error())))
  );
});
