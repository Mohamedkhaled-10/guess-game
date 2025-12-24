// service-worker.js — بسيط: cache-first for app shell, network-first for dynamic data
const CACHE_NAME = 'gta-shell-v1';
const ASSETS = [
  '/', '/index.html', '/styles.css', '/game.js'
  // أضف هنا أي صور محلية أو ملفات assets تود وضعها في الكاش
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // For API calls (firebase) fallback to network-first
  if (url.origin !== location.origin && url.href.includes('firebase')) {
    e.respondWith(fetch(e.request).catch(() => caches.match('/offline.html')));
    return;
  }
  // otherwise cache-first for app shell
  e.respondWith(
    caches.match(e.request).then(resp => resp || fetch(e.request).then(fetchResp => {
      return caches.open(CACHE_NAME).then(cache => {
        // cache only GET requests to same origin
        if (e.request.method === 'GET' && url.origin === location.origin) {
          cache.put(e.request, fetchResp.clone());
        }
        return fetchResp;
      });
    })).catch(() => caches.match('/offline.html'))
  );
});
