'use strict';
/**
 * notifications.js — نظام الإشعارات في الهيدر + Web Push
 * يُستورد في app.js ويُشغَّل بعد renderShell()
 */
import { html, raw } from './html.js';
import { t, getLocale } from './i18n.js';
import { api } from './api.js';

// ─── Web Push ─────────────────────────────────────────────────────────────────

/**
 * طلب إذن الإشعارات والاشتراك في Push
 * @returns {Promise<'granted'|'denied'|'unsupported'|'error'>}
 */
export async function requestPushPermission() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported';
  }

  // اطلب الإذن
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  try {
    // احصل على مفتاح VAPID العام
    const { publicKey } = await api.get('/push/vapid-public-key');
    if (!publicKey) return 'error';

    // احصل على Service Worker registration
    const reg = await navigator.serviceWorker.ready;

    // اشترك في Push
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    // أرسل الاشتراك للخادم
    await api.post('/push/subscribe', sub.toJSON());

    return 'granted';
  } catch (err) {
    console.warn('[Push] Subscribe failed:', err);
    return 'error';
  }
}

/**
 * إلغاء الاشتراك في Push
 */
export async function unsubscribePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await api.delete('/push/subscribe', { endpoint: sub.endpoint });
    await sub.unsubscribe();
  } catch (err) {
    console.warn('[Push] Unsubscribe failed:', err);
  }
}

/**
 * هل الإشعارات مفعّلة حالياً؟
 */
export async function isPushSubscribed() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub && Notification.permission === 'granted';
  } catch {
    return false;
  }
}

/**
 * عرض بانر "فعّل الإشعارات" بعد 5 ثواني (يظهر مرة واحدة فقط)
 */
export function offerPushPermission() {
  if (!('Notification' in window) || !('PushManager' in window)) return;
  if (Notification.permission !== 'default') return;
  if (localStorage.getItem('push-offer-dismissed')) return;

  setTimeout(() => {
    if (document.getElementById('push-offer-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'push-offer-banner';
    banner.setAttribute('dir', 'rtl');
    banner.innerHTML = `
      <div style="
        position:fixed;bottom:72px;left:16px;right:16px;z-index:9998;
        background:#1c1917;border:1px solid #292524;border-radius:16px;
        padding:14px 16px;box-shadow:0 8px 32px rgba(0,0,0,.5);
        display:flex;align-items:center;gap:12px;
        font-family:Tajawal,sans-serif;
        animation:slideInUp .3s ease;
        max-width:420px;margin:0 auto;
      ">
        <span style="font-size:28px;flex-shrink:0">🔔</span>
        <div style="flex:1;color:#e7e5e4">
          <div style="font-weight:700;font-size:14px;margin-bottom:2px">فعّل إشعارات التذكير</div>
          <div style="font-size:12px;color:#a8a29e">ذكّرك بالمذاكرة اليومية وأخبرك بنتائج الامتحانات</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
          <button id="push-offer-yes" style="
            background:#ea580c;color:#fff;border:none;border-radius:8px;
            padding:6px 14px;font-family:Tajawal,sans-serif;font-size:13px;
            font-weight:700;cursor:pointer;white-space:nowrap;
          ">تفعيل</button>
          <button id="push-offer-no" style="
            background:none;border:none;color:#78716c;cursor:pointer;
            font-size:12px;font-family:Tajawal,sans-serif;padding:2px;
          ">لاحقاً</button>
        </div>
      </div>`;

    document.body.appendChild(banner);

    document.getElementById('push-offer-yes').onclick = async () => {
      banner.remove();
      const result = await requestPushPermission();
      if (result === 'granted') {
        showToast('✅ تم تفعيل الإشعارات');
      }
    };

    document.getElementById('push-offer-no').onclick = () => {
      banner.remove();
      localStorage.setItem('push-offer-dismissed', '1');
    };
  }, 5000);
}

function showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:#16a34a;color:#fff;padding:10px 20px;border-radius:10px;
    font-family:Tajawal,sans-serif;font-size:14px;z-index:99999;
    box-shadow:0 4px 16px rgba(0,0,0,.3);
  `;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  return new Uint8Array([...raw].map((c) => c.charCodeAt(0)));
}

// ─── أيقونات حسب النوع ───────────────────────────────────────────────────────
const TYPE_ICON = {
  challenge : '⚡',
  result    : '🏅',
  success   : '✅',
  warning   : '⚠️',
  admin     : '📢',
  info      : '🔔',
};

// ─── تنسيق الوقت النسبي ─────────────────────────────────────────────────────
function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)  return getLocale() === 'fr' ? "À l'instant" : 'الآن';
  if (min < 60) return getLocale() === 'fr' ? `Il y a ${min} min` : `منذ ${min} دقيقة`;
  const h = Math.floor(min / 60);
  if (h < 24)   return getLocale() === 'fr' ? `Il y a ${h}h` : `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  return getLocale() === 'fr' ? `Il y a ${d}j` : `منذ ${d} يوم`;
}

// ─── الحالة ───────────────────────────────────────────────────────────────────
let _items  = [];
let _unread = 0;
let _open   = false;
let _loaded = false;
let _wrap   = null;    // DOM element

// ─── API calls ────────────────────────────────────────────────────────────────
async function fetchNotifications() {
  try {
    const data = await api.get('/notifications');
    _items  = data.notifications || [];
    _unread = data.unread || 0;
    _loaded = true;
  } catch {
    _items  = [];
    _unread = 0;
  }
}

async function markRead(id) {
  try {
    await api.patch(`/notifications/${id}/read`);
    const item = _items.find(n => n.id === id);
    if (item && !item.read) { item.read = 1; _unread = Math.max(0, _unread - 1); }
  } catch { /* ignore */ }
}

async function markAllRead() {
  try {
    await api.patch('/notifications/read-all');
    _items.forEach(n => { n.read = 1; });
    _unread = 0;
  } catch { /* ignore */ }
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderBell(container) {
  const locale = getLocale();
  container.innerHTML = html`
    <div class="notif-wrap" id="notif-wrap">
      <button class="notif-bell-btn icon-btn" id="notif-bell" type="button" aria-label="${t('notif.label')}">
        🔔
        ${_unread > 0 ? html`<span class="notif-badge" aria-live="polite">${_unread > 9 ? '9+' : _unread}</span>` : ''}
      </button>
      <div class="notif-dropdown ${_open ? 'open' : ''}" id="notif-dropdown" role="dialog" aria-label="${t('notif.title')}">
        <div class="notif-dd-header">
          <span class="notif-dd-title">${t('notif.title')}</span>
          ${_unread > 0 ? html`<button class="notif-read-all-btn" id="notif-read-all">${t('notif.readAll')}</button>` : ''}
        </div>
        <div class="notif-list" id="notif-list">
          ${_loaded && _items.length === 0
            ? html`<div class="notif-empty">${t('notif.empty')}</div>`
            : _items.map(n => {
                const title = locale === 'fr' && n.title_fr ? n.title_fr : n.title_ar;
                const body  = locale === 'fr' && n.body_fr  ? n.body_fr  : n.body_ar;
                const icon  = TYPE_ICON[n.type] || '🔔';
                return html`
                  <div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}" data-link="${n.link || ''}" role="button" tabindex="0">
                    <div class="notif-icon type-${n.type}">${raw(icon)}</div>
                    <div class="notif-content">
                      <div class="notif-title">${title}</div>
                      <div class="notif-body">${body}</div>
                      <div class="notif-time">${relativeTime(n.created_at)}</div>
                    </div>
                    ${n.read ? '' : html`<div class="notif-unread-dot" aria-hidden="true"></div>`}
                  </div>`;
              }).join('')}
        </div>
      </div>
    </div>`.s;

  _wrap = container.querySelector('#notif-wrap');
  bindEvents(container);
}

function bindEvents(container) {
  // زر الجرس — toggle dropdown
  container.querySelector('#notif-bell').onclick = async (e) => {
    e.stopPropagation();
    _open = !_open;
    if (_open && !_loaded) {
      await fetchNotifications();
      renderBell(container);
      return;
    }
    renderBell(container);
  };

  // تعليم الكل كمقروء
  const readAllBtn = container.querySelector('#notif-read-all');
  if (readAllBtn) readAllBtn.onclick = async (e) => {
    e.stopPropagation();
    await markAllRead();
    renderBell(container);
  };

  // كل إشعار — نقر
  container.querySelectorAll('.notif-item').forEach(el => {
    const handler = async (e) => {
      const id   = Number(el.dataset.id);
      const link = el.dataset.link;
      if (!el.classList.contains('unread') === false) {
        await markRead(id);
        el.classList.remove('unread');
        el.querySelector('.notif-unread-dot')?.remove();
        // تحديث الـ badge
        const badge = container.querySelector('.notif-badge');
        if (badge) {
          const n = Math.max(0, _unread);
          badge.textContent = n > 9 ? '9+' : n;
          if (n === 0) badge.remove();
        }
      }
      if (link) window.location.href = link;
    };
    el.onclick = handler;
    el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') handler(e); };
  });
}

// إغلاق عند النقر خارجاً
document.addEventListener('click', (e) => {
  if (_open && _wrap && !_wrap.contains(e.target)) {
    _open = false;
    const dd = document.querySelector('#notif-dropdown');
    if (dd) dd.classList.remove('open');
  }
});

// ─── mount ────────────────────────────────────────────────────────────────────
/**
 * يُستدعى من app.js بعد renderShell()
 * @param {HTMLElement} container — العنصر الذي سيحتوي الجرس
 */
export async function mountNotifications(container) {
  _open   = false;
  _loaded = false;
  renderBell(container);
  // جلب العدد فوراً (بشكل صامت)
  await fetchNotifications();
  renderBell(container);

  // تحديث دوري كل 60 ثانية
  clearInterval(mountNotifications._timer);
  mountNotifications._timer = setInterval(async () => {
    await fetchNotifications();
    // تحديث الـ badge فقط بدون إعادة رسم كاملة
    const badge = document.querySelector('.notif-badge');
    const bell  = document.querySelector('#notif-bell');
    if (!bell) { clearInterval(mountNotifications._timer); return; }
    if (_unread > 0) {
      if (badge) { badge.textContent = _unread > 9 ? '9+' : _unread; }
      else {
        const b = document.createElement('span');
        b.className = 'notif-badge';
        b.textContent = _unread > 9 ? '9+' : _unread;
        bell.appendChild(b);
      }
    } else {
      badge?.remove();
    }
  }, 60000);
}
