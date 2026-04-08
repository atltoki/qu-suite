const CACHE_NAME = 'qu-suite-v5';
self.addEventListener('install', event => { event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  event.respondWith(fetch(request).catch(async () => {
    if (request.mode === 'navigate') {
      const index = await caches.match('./index.html');
      return index || Response.error();
    }
    return Response.error();
  }));
});
