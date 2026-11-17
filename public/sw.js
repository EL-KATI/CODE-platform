/**
 * Service Worker — CODE Platform PWA
 * استراتيجية: Cache-First للأصول الثابتة، Network-First للـ API
 */

const CACHE_NAME = 'code-pwa-v1';
const STATIC_CACHE = 'code-static-v1';
const API_CACHE = 'code-api-v1';

// الأصول الأساسية التي تُخزَّن عند التثبيت
const PRECACHE_ASSETS = [
  '/',
  '/assets/css/app.css',
  '/assets/js/app.js',
  '/assets/js/i18n.js',
  '/assets/js/router.js',
  '/assets/js/api.js',
  '/assets/js/store.js',
  '/assets/js/ui.js',
  '/assets/js/html.js',
  '/assets/js/icons.js',
  '/assets/img/logo.svg',
  '/assets/img/icon-192x192.png',
  '/assets/img/icon-512x512.png',
  '/offline.html',
];

// مسارات API التي تُخزَّن مؤقتاً
const CACHEABLE_API = [
  '/api/categories',
  '/api/lessons',
  '/api/series',
];

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      // نحاول تخزين الأصول الأساسية — نتجاهل الفشل الفردي
      return Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          cache.add(url).catch(() => console.warn('[SW] Failed to cache:', url))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // تجاهل طلبات غير HTTP
  if (!url.protocol.startsWith('http')) return;

  // طلبات API — Network-First مع Fallback من الكاش
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(networkFirstAPI(request));
    return;
  }

  // ملفات JS/CSS/الصور — Cache-First
  if (/\.(js|css|png|svg|webp|jpg|jpeg|woff2?)(\?.*)?$/.test(url.pathname)) {
    e.respondWith(cacheFirst(request));
    return;
  }

  // صفحات HTML — Network-First مع Offline Fallback
  if (request.mode === 'navigate') {
    e.respondWith(navigationHandler(request));
    return;
  }

  // الباقي — Network مع Cache Fallback
  e.respondWith(networkWithCacheFallback(request));
});

// ─── استراتيجيات الكاش ────────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503 });
  }
}

async function networkFirstAPI(request) {
  const isCacheable = CACHEABLE_API.some((path) =>
    request.url.includes(path)
  );

  try {
    const response = await fetch(request);
    if (response.ok && isCacheable) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    if (isCacheable) {
      const cached = await caches.match(request);
      if (cached) return cached;
    }
    return new Response(
      JSON.stringify({ error: 'offline', message: 'لا يوجد اتصال بالإنترنت' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function navigationHandler(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    // في حالة عدم الاتصال، أعد الصفحة الرئيسية من الكاش (SPA)
    const cached = await caches.match('/');
    if (cached) return cached;
    // أو صفحة Offline المخصصة
    const offline = await caches.match('/offline.html');
    return offline || new Response('<h1>غير متصل بالإنترنت</h1>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

async function networkWithCacheFallback(request) {
  try {
    return await fetch(request);
  } catch {
    return caches.match(request) || new Response('', { status: 503 });
  }
}

// ─── Background Sync (للمستقبل) ──────────────────────────────────────────────
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-progress') {
    e.waitUntil(syncProgress());
  }
});

async function syncProgress() {
  // مزامنة تقدم المتعلم عند استعادة الاتصال
  const clients = await self.clients.matchAll();
  clients.forEach((client) => client.postMessage({ type: 'SYNC_PROGRESS' }));
}

// ─── Push Notifications (للمستقبل) ───────────────────────────────────────────
self.addEventListener('push', (e) => {
  if (!e.data) return;
  const data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || 'CODE', {
      body: data.body || '',
      icon: '/assets/img/icon-192x192.png',
      badge: '/assets/img/icon-72x72.png',
      dir: 'rtl',
      lang: 'ar',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.openWindow(e.notification.data?.url || '/')
  );
});
