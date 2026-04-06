const CACHE_NAME = 'qu-suite-v2';
const ASSETS = [
  './',
  './index.html',
  './app.html',
  './crm.html',
  './dashboard.html',
  './admin.html',
  './404.html',
  './qu-suite-manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : Promise.resolve()))).then(() => self.clients.claim())
  );
});

const ROUTES = {
  dashboard: 'dashboard.html',
  crm: 'crm.html',
  admin: 'admin.html',
  app: 'app.html',
  index: 'index.html',
  hub: 'index.html'
};

function getRouteRequest(request) {
  const url = new URL(request.url);
  const slug = url.pathname.replace(/\/+$/, '').split('/').pop();
  if (!slug || /\.[a-z0-9]+$/i.test(slug)) return request;
  const target = ROUTES[slug];
  if (!target) return request;
  const next = new URL(target, request.url);
  next.search = url.search;
  return new Request(next.href, request);
}

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const routedRequest = getRouteRequest(request);
      try {
        const response = await fetch(routedRequest);
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(routedRequest, copy)).catch(() => {});
          return response;
        }
        const cachedRouted = await caches.match(routedRequest);
        const cachedOriginal = await caches.match(request);
        return cachedRouted || cachedOriginal || caches.match('./index.html') || caches.match('./404.html') || response;
      } catch (err) {
        const cachedRouted = await caches.match(routedRequest);
        const cachedOriginal = await caches.match(request);
        return cachedRouted || cachedOriginal || caches.match('./index.html') || caches.match('./404.html');
      }
    })());
    return;
  }

  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
        }
        return response;
      }).catch(() => cached))
    );
  }
});
