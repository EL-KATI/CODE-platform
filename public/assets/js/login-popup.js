'use strict';
/**
 * login-popup.js — إشعارات منبثقة ترحيبية عند دخول الطالب
 *
 * ثلاثة سيناريوهات:
 *  1. طالب جديد (أول دخول / أقل من 3 محاولات) → رسالة ترحيبية تشجيعية
 *  2. طالب مستمر (≥3 محاولات) → رسالة بالمستوى والتقدم
 *  3. حصة جماعية نشطة → تنبيه فوري للانضمام (الأولوية القصوى)
 *
 * يُخزَّن آخر وقت عرض في localStorage لتجنب الإزعاج المتكرر.
 */
import { html, raw }   from './ui.js';
import { t }           from './i18n.js';
import { api }         from './api.js';
import { store }       from './store.js';
import { navigate }    from './router.js';

// ─── ثابت: مهلة عدم التكرار (ساعة واحدة) ────────────────────────────────────
const COOLDOWN_MS  = 60 * 60 * 1000;
const STORAGE_KEY  = 'cp_welcome_popup_ts';

// ─── هل مرّ وقت كافٍ منذ آخر عرض؟ ──────────────────────────────────────────
function cooldownPassed() {
  try {
    const last = Number(localStorage.getItem(STORAGE_KEY) || 0);
    return Date.now() - last > COOLDOWN_MS;
  } catch { return true; }
}
function markShown() {
  try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch {}
}

// ─── إنشاء بطاقة الـ Popup وإضافتها للصفحة ──────────────────────────────────
function createPopupEl() {
  const el = document.createElement('div');
  el.id        = 'welcome-popup';
  el.className = 'welcome-popup welcome-popup--hidden';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);
  return el;
}

function showPopup(el, { emoji, title, body, cta, ctaHref, tone }) {
  el.className = `welcome-popup tone-${tone || 'info'}`;
  el.innerHTML = html`
    <button class="wp-close" type="button" aria-label="إغلاق">✕</button>
    <div class="wp-content">
      <span class="wp-emoji" aria-hidden="true">${emoji}</span>
      <div class="wp-text">
        <strong class="wp-title">${title}</strong>
        <p class="wp-body">${body}</p>
        ${cta ? html`<button class="btn btn-primary wp-cta" type="button">${cta}</button>` : ''}
      </div>
    </div>`.s;

  // زر الإغلاق
  el.querySelector('.wp-close').onclick = () => dismissPopup(el);

  // زر الـ CTA
  if (cta && ctaHref) {
    el.querySelector('.wp-cta').onclick = () => {
      dismissPopup(el);
      navigate(ctaHref);
    };
  }

  // إغلاق تلقائي بعد 8 ثوانٍ (إلا إذا كانت حصة مباشرة)
  if (tone !== 'live') {
    setTimeout(() => dismissPopup(el), 8000);
  }
}

function dismissPopup(el) {
  el.classList.add('welcome-popup--out');
  setTimeout(() => el.remove(), 400);
}

// ─── تحديد نوع الرسالة ───────────────────────────────────────────────────────
async function resolvePopupData(user) {
  // 1. هل هناك حصة جماعية نشطة؟ (الأولوية القصوى)
  if (user.role === 'student') {
    try {
      const { session } = await api.get('/live/active');
      if (session && (session.status === 'live' || session.status === 'waiting')) {
        return {
          tone    : 'live',
          emoji   : '📡',
          title   : t('results.sf.welcome.live'),
          body    : t('results.sf.welcome.live.body'),
          cta     : t('live.joinNow'),
          ctaHref : `/live/${session.id}`,
        };
      }
    } catch {}
  }

  // 2. تحديد مستوى التقدم من سجل المحاولات
  // GET /api/attempts يُعيد مصفوفة مباشرة
  let attemptCount = 0;
  try {
    const list = await api.get('/attempts?limit=200');
    // يُعيد مصفوفة مباشرة
    const arr = Array.isArray(list) ? list : [];
    // نحسب فقط المحاولات المكتملة (finished_at من الـ backend)
    attemptCount = arr.filter(a => a.finished_at || a.finishedAt).length;
  } catch {}

  // 3. رسالة الطالب المبتدئ (أقل من 3 محاولات)
  if (attemptCount < 3) {
    const name = user.name?.split(' ')[0] || '';
    return {
      tone    : 'welcome',
      emoji   : '👋',
      title   : `${t('results.sf.welcome.new')} ${name}`.trim(),
      body    : t('results.sf.welcome.new.body'),
      cta     : t('nav.practice'),
      ctaHref : '/practice',
    };
  }

  // 4. رسالة الطالب المستمر
  return {
    tone    : 'progress',
    emoji   : '🌟',
    title   : t('results.sf.welcome.progress'),
    body    : t('results.sf.welcome.progress.body', { n: attemptCount }),
    cta     : t('nav.exam'),
    ctaHref : '/exam',
  };
}

// ─── نقطة الدخول الرئيسية ─────────────────────────────────────────────────────
let _mounted = false;

export async function mountLoginPopup() {
  const user = store.user;
  if (!user || user.role !== 'student') return; // للطلاب فقط
  if (!cooldownPassed()) return;                // لا تُزعج كل مرة
  if (_mounted) return;
  _mounted = true;

  // تأخير بسيط لإعطاء الصفحة وقت للتحميل
  await new Promise(r => setTimeout(r, 1200));

  try {
    const data = await resolvePopupData(user);
    const el   = createPopupEl();
    markShown();
    showPopup(el, data);
  } catch {
    _mounted = false;
  }
}

// إعادة ضبط عند الخروج (لعرض الترحيب مجدداً بعد login جديد)
export function resetLoginPopup() {
  _mounted = false;
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}
