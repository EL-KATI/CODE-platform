// Service Worker: يمسح كاش ES modules في كل زيارة
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
// لا نخزن أي شيء في الكاش — نعبر كل الطلبات للشبكة
self.addEventListener('fetch', (e) => {
  if (/\.(js|css)(\?.*)?$/.test(e.request.url)) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).catch(() => fetch(e.request))
    );
  }
});
