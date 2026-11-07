// Service Worker — CODE رخصة السياقة
const CACHE = 'code-v15';
const STATIC = [
  '/',
  '/assets/css/app.css',
  '/assets/js/app.js',
  '/assets/img/logo.svg',
  '/assets/img/icon-192x192.png',
  '/assets/img/icon-512x512.png',
  '/manifest.webmanifest',
];

// تثبيت: تخزين الملفات الأساسية
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

// تفعيل: حذف الكاش القديم
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// الطلبات: network-first للـ API، cache-first للملفات الثابتة
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // API: دائماً من الشبكة
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).catch(() => new Response('{"error":"offline"}', {
      headers: { 'Content-Type': 'application/json' }
    })));
    return;
  }

  // صور الأسئلة: cache-first (كبيرة، تتغير نادراً)
  if (url.pathname.startsWith('/assets/img/q')) {
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      }))
    );
    return;
  }

  // باقي الملفات: network-first مع fallback للكاش
  // تجاهل الـ URLs اللي ما كاينيش http/https (chrome-extension, etc.)
  if (!e.request.url.startsWith('http')) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok && e.request.method === 'GET') {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request).then((cached) => cached || caches.match('/')))
  );
});
