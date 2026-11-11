/**
 * security.js — حماية الموقع من DevTools والتقاط الشاشة
 * يظهر رسالة تحذير عند أي محاولة
 */

(function () {
  'use strict';

  /* ── رسالة التحذير ───────────────────────────────────────────────── */
  const MSG_AR = 'هذا الإجراء محظور — يُمنع فتح أدوات المطور أو التقاط الشاشة على هذا الموقع.';
  const MSG_FR = 'Action interdite — L\'ouverture des outils de développement ou la capture d\'écran est prohibée sur ce site.';

  function getLang() {
    return document.documentElement.lang === 'fr' ? 'fr' : 'ar';
  }

  /* ── إنشاء Overlay التحذير ───────────────────────────────────────── */
  function showWarning() {
    if (document.getElementById('__sec-overlay')) return;

    const lang = getLang();
    const isRtl = lang !== 'fr';
    const msg   = lang === 'fr' ? MSG_FR : MSG_AR;

    const overlay = document.createElement('div');
    overlay.id = '__sec-overlay';
    overlay.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
    Object.assign(overlay.style, {
      position:       'fixed',
      inset:          '0',
      zIndex:         '2147483647',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      background:     'rgba(0,0,0,.85)',
      backdropFilter: 'blur(8px)',
      color:          '#fff',
      fontFamily:     'system-ui, sans-serif',
      textAlign:      'center',
      padding:        '32px',
      gap:            '20px',
    });

    overlay.innerHTML = `
      <div style="font-size:3.5rem">🚫</div>
      <div style="font-size:1.3rem;font-weight:800;max-width:480px;line-height:1.5">${msg}</div>
      <button id="__sec-close" style="
        margin-top:8px; padding:10px 28px; border-radius:10px;
        border:2px solid rgba(255,255,255,.4); background:rgba(255,255,255,.12);
        color:#fff; font-size:1rem; font-weight:700; cursor:pointer;
      ">${lang === 'fr' ? 'Fermer' : 'إغلاق'}</button>
    `;

    document.body.appendChild(overlay);
    document.getElementById('__sec-close').onclick = removeWarning;
  }

  function removeWarning() {
    const el = document.getElementById('__sec-overlay');
    if (el) el.remove();
  }

  /* ── 1. منع Right-Click ─────────────────────────────────────────── */
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showWarning();
  });

  /* ── 2. منع اختصارات لوحة المفاتيح الخطرة ─────────────────────── */
  const BLOCKED_KEYS = new Set([
    'F12',                               // DevTools
    'F5',                                // Refresh (optional — أُزيل لأنه قد يزعج المستخدم)
  ]);

  document.addEventListener('keydown', (e) => {
    // F12
    if (BLOCKED_KEYS.has(e.key)) {
      e.preventDefault(); showWarning(); return;
    }
    // Ctrl/Cmd + Shift + I / J / C / U / K
    if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
      if (['i', 'I', 'j', 'J', 'c', 'C', 'k', 'K'].includes(e.key)) {
        e.preventDefault(); showWarning(); return;
      }
    }
    // Ctrl/Cmd + U (view source)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
      e.preventDefault(); showWarning(); return;
    }
    // Ctrl + Shift + Delete (clear cache)
    if (e.ctrlKey && e.shiftKey && e.key === 'Delete') {
      e.preventDefault(); return;
    }
    // Print Screen key
    if (e.key === 'PrintScreen') {
      e.preventDefault();
      // Clear clipboard on Chrome
      navigator.clipboard?.writeText?.('').catch(() => {});
      showWarning();
    }
  });

  /* ── 3. كشف فتح DevTools بفارق الأبعاد ─────────────────────────── */
  let _devOpen = false;
  const THRESHOLD = 160;

  function checkDevtools() {
    const widthGap  = window.outerWidth  - window.innerWidth;
    const heightGap = window.outerHeight - window.innerHeight;
    const isOpen    = widthGap > THRESHOLD || heightGap > THRESHOLD;

    if (isOpen && !_devOpen) {
      _devOpen = true;
      showWarning();
    } else if (!isOpen && _devOpen) {
      _devOpen = false;
      removeWarning();
    }
  }

  // Poll every 800ms
  setInterval(checkDevtools, 800);

  /* ── 4. منع Drag & Drop على الصور والأسئلة ─────────────────────── */
  document.addEventListener('dragstart', (e) => {
    if (e.target.tagName === 'IMG') e.preventDefault();
  });

  /* ── 5. منع تحديد النص (على صفحات الامتحان فقط) ───────────────── */
  function applyExamProtection() {
    const path = location.pathname;
    const isExam = path.startsWith('/quiz/') || path.startsWith('/exam');
    if (isExam) {
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';
    } else {
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
    }
  }

  // ربط مع router (يستمع لأحداث navigation)
  window.addEventListener('popstate', applyExamProtection);
  document.addEventListener('DOMContentLoaded', applyExamProtection);
  // دعم SPA navigation عبر custom event
  window.addEventListener('spa:navigate', applyExamProtection);

  /* ── 6. منع Print ───────────────────────────────────────────────── */
  window.addEventListener('beforeprint', (e) => {
    e.preventDefault();
    showWarning();
    // إخفاء المحتوى عند الطباعة
    document.body.style.visibility = 'hidden';
    setTimeout(() => { document.body.style.visibility = ''; }, 1000);
  });

  /* ── 7. الكشف عن blur (screen sharing / recording tools) ─────── */
  // عند انتقال التركيز للخارج أثناء الامتحان نُسجّل فقط (لا نمنع)
  // هذا يمكن استخدامه لاحقاً لتسجيل محاولات الغش
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // يمكن إضافة logging هنا لاحقاً
    }
  });

})();
