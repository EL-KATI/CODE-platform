'use strict';
/**
 * notifications.js — نظام الإشعارات في الهيدر
 * يُستورد في app.js ويُشغَّل بعد renderShell()
 */
import { html, raw } from './html.js';
import { t, getLocale } from './i18n.js';
import { api } from './api.js';

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
