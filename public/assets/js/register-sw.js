/**
 * تسجيل Service Worker + Install Prompt (PWA)
 * يُضاف هذا الملف في index.html قبل </body>
 */

(function () {
  // ─── Service Worker ──────────────────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

        // تحديث تلقائي عند وجود نسخة جديدة
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner();
            }
          });
        });

        // مزامنة التقدم عند استعادة الاتصال
        navigator.serviceWorker.addEventListener('message', (e) => {
          if (e.data?.type === 'SYNC_PROGRESS') {
            window.dispatchEvent(new CustomEvent('sw:sync-progress'));
          }
        });

      } catch (err) {
        console.warn('[SW] Registration failed:', err);
      }
    });
  }

  // ─── Install Prompt (Add to Home Screen) ─────────────────────────────────────
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    // أظهر زر التثبيت بعد 30 ثانية إذا لم يثبّت بعد
    if (!isInstalled()) {
      setTimeout(() => showInstallBanner(), 30_000);
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideInstallBanner();
    // يمكن إرسال حدث تحليلي هنا
    console.log('[PWA] App installed successfully');
  });

  // ─── Banner التثبيت ──────────────────────────────────────────────────────────
  function showInstallBanner() {
    if (document.getElementById('pwa-install-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.setAttribute('role', 'banner');
    banner.setAttribute('dir', 'rtl');
    banner.innerHTML = `
      <div class="pwa-banner-inner">
        <img src="/assets/img/icon-72x72.png" alt="" width="40" height="40" class="pwa-banner-icon">
        <div class="pwa-banner-text">
          <strong>ثبّت التطبيق على هاتفك</strong>
          <span>استخدم المنصة بدون إنترنت</span>
        </div>
        <div class="pwa-banner-actions">
          <button id="pwa-install-btn" class="pwa-btn-install">تثبيت</button>
          <button id="pwa-dismiss-btn" class="pwa-btn-dismiss" aria-label="إغلاق">✕</button>
        </div>
      </div>
    `;

    // CSS مدمج في البانر
    const style = document.createElement('style');
    style.textContent = `
      #pwa-install-banner {
        position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;
        background: #1c1917; border-top: 1px solid #292524;
        padding: 12px 16px; box-shadow: 0 -4px 20px rgba(0,0,0,0.4);
        animation: slideUp .3s ease;
      }
      @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      .pwa-banner-inner {
        display: flex; align-items: center; gap: 12px;
        max-width: 480px; margin: 0 auto;
      }
      .pwa-banner-icon { border-radius: 10px; flex-shrink: 0; }
      .pwa-banner-text { flex: 1; color: #e7e5e4; font-family: Tajawal, sans-serif; }
      .pwa-banner-text strong { display: block; font-size: 14px; font-weight: 700; }
      .pwa-banner-text span { font-size: 12px; color: #a8a29e; }
      .pwa-banner-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
      .pwa-btn-install {
        background: #ea580c; color: #fff; border: none; border-radius: 8px;
        padding: 8px 16px; font-family: Tajawal, sans-serif; font-size: 13px;
        font-weight: 700; cursor: pointer; white-space: nowrap;
      }
      .pwa-btn-install:hover { background: #c2410c; }
      .pwa-btn-dismiss {
        background: none; border: none; color: #78716c; cursor: pointer;
        font-size: 16px; padding: 4px 8px; line-height: 1;
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(banner);

    document.getElementById('pwa-install-btn').addEventListener('click', () => {
      hideInstallBanner();
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((r) => {
          if (r.outcome === 'accepted') console.log('[PWA] User accepted install');
          deferredPrompt = null;
        });
      }
    });

    document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
      hideInstallBanner();
      sessionStorage.setItem('pwa-banner-dismissed', '1');
    });
  }

  function hideInstallBanner() {
    document.getElementById('pwa-install-banner')?.remove();
  }

  function showUpdateBanner() {
    // إعلام المستخدم بوجود تحديث
    if (document.getElementById('pwa-update-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'pwa-update-banner';
    banner.setAttribute('dir', 'rtl');
    banner.style.cssText = `
      position:fixed;top:0;left:0;right:0;z-index:9999;
      background:#0369a1;color:#fff;text-align:center;
      padding:10px 16px;font-family:Tajawal,sans-serif;font-size:13px;
      display:flex;align-items:center;justify-content:center;gap:12px;
    `;
    banner.innerHTML = `
      <span>يوجد تحديث جديد للتطبيق</span>
      <button onclick="window.location.reload()" style="
        background:#fff;color:#0369a1;border:none;border-radius:6px;
        padding:4px 12px;font-weight:700;cursor:pointer;font-family:Tajawal,sans-serif;
      ">تحديث الآن</button>
    `;
    document.body.prepend(banner);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  function isInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  // إخفاء البانر إذا كان التطبيق مثبَّتاً مسبقاً
  if (isInstalled()) return;

  // إخفاء البانر إذا رُفض في هذه الجلسة
  if (sessionStorage.getItem('pwa-banner-dismissed')) return;

})();
