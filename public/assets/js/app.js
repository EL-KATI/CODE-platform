// Point d'entrée : en-tête/navigation, thème, langue, déclaration des routes.
import { route, startRouter, setNavigateHook, navigate, render } from './router.js';
import { store } from './store.js';
import { watchIcons, iconSvg } from './icons.js';
import { api } from './api.js';
import { t, setLocale, getLocale, applyStaticTranslations } from './i18n.js';
import { html, raw, esc, toast, sound } from './ui.js';

import { homeView } from './views/home.js';
import { championView } from './views/champion.js';
import { loginView, registerView, verifyOtpView, enrollView } from './views/auth.js';
import { dashboardView } from './views/dashboard.js';
import { lessonsView, lessonView } from './views/lessons.js';
import { practiceView, examIntroView } from './views/practice.js';
import { aiTutorView } from './views/ai-tutor.js';
import { quizView } from './views/quiz.js';
import { resultsView } from './views/results.js';
import { mistakesView, historyView } from './views/mistakes.js';
import { profileView } from './views/profile.js';
import { privacyView, notFoundView } from './views/static.js';
import { mountNotifications } from './notifications.js';
import { mountLiveJoinBtn } from './live.js';
import * as admin from './views/admin.js';
import { bookingsView, adminBookingsView } from './views/bookings.js';
import { schoolStudentsView, schoolInstructorsView, enrollmentsView } from './views/school.js';
import { schoolExamsView, studentExamView } from './views/exams.js';
import { liveSessionView, adminLiveView } from './views/live.js';

const app = document.getElementById('app');

// --- Thème -------------------------------------------------------------------
function getTheme() { try { return localStorage.getItem('cp_theme'); } catch { return null; } }
function applyTheme(v) {
  if (v) document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme;
}
applyTheme(getTheme());

// --- En-tête -----------------------------------------------------------------------
function navLinks() {
  const u = store.user;
  // الأدمن والمؤسسة والمدرب: يتجهون مباشرة للوحة الإدارة
  if (u && (store.isAdmin() || store.isSchool() || store.isInstructor())) return [['/admin', 'nav.admin']];
  // المتعلم: دروس + تمارين + (حجوزات إذا مرتبط بمؤسسة)
  const links = u
    ? [['/dashboard', 'nav.dashboard'], ['/lessons', 'nav.lessons'], ['/practice', 'nav.practice'], ['/exam', 'nav.exam'], ['/mistakes', 'nav.mistakes'], ['/assistant', 'nav.ai'], ...(store.isEnrolled() ? [['/bookings', 'nav.bookings']] : [])]
    : [['/', 'nav.home'], ['/lessons', 'nav.lessons'], ['/login', 'nav.login']];
  return links;
}

// --- القائمة الجانبية لجميع الكوادر (مؤسسة، مدرب، أدمن) -------------------------
const SIDE_ICONS = {
  '/admin': '📊', '/admin/school/enrollments': '📋', '/admin/school/students': '🎓', '/admin/school/instructors': '🧑‍🏫',
  '/admin/bookings': '📅', '/admin/exams': '📝', '/admin/live': '📡',
  '/admin/questions': '❓', '/admin/series': '📚', '/admin/lessons': '🎓',
  '/admin/students': '👥', '/admin/users': '👤', '/admin/audit': '🔍',
  '/admin/import': '📥', '/admin/storage': '☁️',
};
// أيقونة لكل رابط؛ Monitor AI بارز بتنسيق خاص
const NAV_ICON = { '/': 'home', '/dashboard': 'dashboard', '/lessons': 'book-open', '/practice': 'layers', '/exam': 'clock', '/mistakes': 'restore', '/assistant': 'sparkles', '/bookings': 'calendar', '/login': 'log-in', '/admin': 'bar-chart', '/profile': 'user', '/register': 'user-plus', '/champion': 'star' };
// المتعلم والزائر (الرئيسية، الدروس، الدخول، التسجيل): نفس الشريط الجانبي التفاعلي
const isLearnerSide = () => !(store.isAdmin() || store.isSchool() || store.isInstructor());

function renderStaffSide() {
  const u = store.user;
  const isStaff = u && (store.isAdmin() || store.isSchool() || store.isInstructor());
  const learner = isLearnerSide();
  const on = learner || (isStaff && location.pathname.startsWith('/admin'));
  let side = document.getElementById('staff-side');
  document.body.classList.toggle('has-side', on);
  document.body.classList.toggle('learner-side', on && learner);
  if (!on) { if (side) side.remove(); return; }
  if (!side) {
    side = document.createElement('aside');
    side.id = 'staff-side';
    side.className = 'staff-side';
    document.getElementById('app').before(side);
  }
  const path = location.pathname;
  if (learner) {
    // المتعلم: نفس الشريط الجانبي التفاعلي (أيقونات تتمدد عند المرور) بدل أزرار الرأس
    if (!side) {
      side = document.createElement('aside');
      side.id = 'staff-side';
      document.getElementById('app').before(side);
    }
    side.className = 'staff-side learner';
    const isCur = (href) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
    const items = [...navLinks(), u ? ['/profile', 'nav.profile'] : ['/register', 'nav.register']];
    side.setAttribute('aria-label', t('a11y.menu'));
    side.innerHTML = html`<button class="side-toggle" type="button" aria-expanded="false" aria-label="${t('a11y.menu')}">${raw(iconSvg('menu'))}</button><div class="side-title">${u ? (u.name || '') : t('brand.name')}</div>
      <nav>${items.map(([href, key]) => html`<a href="${href}" class="${href === '/assistant' ? 'side-ai' : ''}" title="${t(key)}" ${isCur(href) ? html`aria-current="page"` : ''}><span aria-hidden="true">${raw(iconSvg(NAV_ICON[href] || 'file'))}</span><span>${t(key)}</span></a>`)}</nav>`.s;
    wireSide(side);
    const hdr0 = document.querySelector('.site-header');
    if (hdr0) document.documentElement.style.setProperty('--hdr-h', `${hdr0.offsetHeight}px`);
    return;
  }
  side.className = 'staff-side';
  const tabs = admin.getStaffTabs();
  const cur = (href) => (href === '/admin' ? path === '/admin' : path === href || path.startsWith(href + '/') || (href === '/admin/school/students' && path.startsWith('/admin/students/')));
  const roleLabel = u.role === 'school' ? (u.school_name || u.name) : u.role === 'instructor' ? t('role.instructor') : t('admin.title');
  side.setAttribute('aria-label', t('admin.title'));
  side.innerHTML = html`<button class="side-toggle" type="button" aria-expanded="false" aria-label="${t('a11y.menu')}">${raw(iconSvg('menu'))}</button><div class="side-title">${roleLabel}</div>
    <nav>${tabs.map(([href, key]) => html`<a href="${href}" ${cur(href) ? html`aria-current="page"` : ''}><span aria-hidden="true">${SIDE_ICONS[href] || '•'}</span><span>${t(key)}</span></a>`)}</nav>`.s;
  wireSide(side);
  const hdr = document.querySelector('.site-header');
  if (hdr) document.documentElement.style.setProperty('--hdr-h', `${hdr.offsetHeight}px`);
}

// الجداول على الهاتف تتحول إلى بطاقات: كل خانة تحمل اسم عمودها (data-label) ليظهر بجانبها
function labelTables(root = document) {
  root.querySelectorAll('#app table').forEach((tb) => {
    if (tb.closest('.prose, .nrs-overlay, .no-rtable')) return;
    const heads = [...tb.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    if (!heads.length) return;
    tb.classList.add('rtable');
    tb.querySelectorAll('tbody tr').forEach((tr) => {
      [...tr.children].forEach((td, i) => {
        if (td.tagName !== 'TD') return;
        if (!td.hasAttribute('data-label')) td.setAttribute('data-label', td.colSpan > 1 ? '' : (heads[i] || ''));
        td.classList.toggle('td-empty', !td.textContent.trim() && !td.querySelector('button,a,input,select,img,svg'));
      });
    });
  });
}
let ltPending = false;
new MutationObserver(() => {
  if (ltPending) return;
  ltPending = true;
  requestAnimationFrame(() => { ltPending = false; labelTables(); });
}).observe(document.body, { childList: true, subtree: true });

// على الهاتف: شريط أيقونات عمودي ضيق، وزر ☰ أعلاه يفتحه بالأسماء (بدل الشريط الأفقي)
function wireSide(side) {
  side.classList.remove('open');
  const btn = side.querySelector('.side-toggle');
  if (btn) btn.onclick = (e) => {
    e.stopPropagation();
    const open = side.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  };
}
document.addEventListener('click', (e) => {
  const side = document.getElementById('staff-side');
  if (side && side.classList.contains('open') && (!side.contains(e.target) || e.target.closest('a'))) side.classList.remove('open');
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.getElementById('staff-side')?.classList.remove('open'); });

export function renderShell() {
  const path = location.pathname;
  const isCur = (href) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
  const navA = (href, key) => html`<a href="${href}" class="nav-link ${href === '/assistant' ? 'nav-ai' : ''}" ${isCur(href) ? html`aria-current="page"` : ''} title="${t(key)}"><span class="nav-ic" aria-hidden="true">${raw(iconSvg(NAV_ICON[href] || 'file'))}</span><span class="nav-lbl">${t(key)}</span></a>`;
  const linkHtml = navLinks().map(([href, key]) => navA(href, key));
  // المتعلم المسجّل: الروابط في الشريط الجانبي فقط (لا أزرار في الرأس)
  document.getElementById('main-nav').innerHTML = isLearnerSide() ? '' : html`${linkHtml}`.s;
  renderStaffSide();
  // نمط موحّد لكل الواجهات (المترشح، الزائر، المؤسسة، المدرب، الأدمين)
  document.body.classList.add('ui-apple');
  const mobile = document.getElementById('mobile-nav');
  mobile.innerHTML = html`${linkHtml}${store.user ? navA('/profile', 'nav.profile') : navA('/register', 'nav.register')}`.s;
  mobile.classList.remove('open');

  const theme = getTheme() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.getElementById('header-actions').innerHTML = html`
    <button class="icon-btn" id="lang-btn" type="button" lang="${getLocale() === 'ar' ? 'fr' : 'ar'}" aria-label="${t('a11y.language')}">${getLocale() === 'ar' ? 'FR' : 'ع'}</button>
    <button class="icon-btn" id="theme-btn" type="button" aria-label="${t('a11y.theme')}" aria-pressed="${theme === 'dark'}">${theme === 'dark' ? '☀️' : '🌙'}</button>
    <button class="icon-btn" id="sound-btn" type="button" aria-label="${t('a11y.sound')}" aria-pressed="${sound.enabled}">${sound.enabled ? '🔊' : '🔇'}</button>
    ${store.user && !store.isStaff() ? html`<a class="icon-btn ai-quick" href="/assistant" title="${t('nav.ai')}" ${location.pathname === '/assistant' ? html`aria-current="page"` : ''}>${raw(iconSvg('sparkles'))}<span class="sr-only">${t('nav.ai')}</span></a>` : ''}
    ${store.user && !store.isStaff() ? html`<a class="hdr-challenge-btn" href="/champion" title="${t('champ.title')}" ${location.pathname === '/champion' ? html`aria-current="page"` : ''}><span class="hdr-ch-ic" aria-hidden="true">⚡</span><span class="hdr-ch-lbl">${t('champ.title')}</span></a>` : ''}
    ${store.user && store.user.role === 'student' ? html`<span id="live-join-mount"></span>` : ''}
    ${store.user ? html`<span id="notif-mount"></span>` : ''}
    ${store.user
      ? html`<a class="icon-btn" href="/profile" title="${store.user.name}"><span aria-hidden="true">👤</span><span class="sr-only">${t('nav.profile')}</span></a>
             <button class="icon-btn" id="logout-btn" type="button">${t('nav.logout')}</button>`
      : html`<a class="icon-btn" href="/register">${t('nav.register')}</a>`}
    <button class="icon-btn menu-toggle" id="menu-btn" type="button" aria-expanded="false" aria-controls="mobile-nav" aria-label="${t('a11y.menu')}">☰</button>`.s;

  // تركيب نظام الإشعارات للمستخدمين المسجلين فقط
  const notifMount = document.getElementById('notif-mount');
  if (notifMount && store.user) {
    mountNotifications(notifMount);
  }

  // زر الانضمام للحصة الجماعية (للطلاب فقط)
  const liveMount = document.getElementById('live-join-mount');
  if (liveMount && store.user?.role === 'student') {
    mountLiveJoinBtn(liveMount);
  }

  document.getElementById('site-footer').innerHTML = html`
    <div style="max-width:1240px;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:28px;height:28px;background:linear-gradient(145deg,#f97316,#c2410c);border-radius:7px;display:grid;place-items:center;flex:none">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15.5V12l1.6-4.2A1.5 1.5 0 0 1 8 6.8h8a1.5 1.5 0 0 1 1.4 1l1.6 4.2v3.5"/><path d="M4.5 15.5h15"/><circle cx="8" cy="15.5" r="1.6" fill="#fff" stroke="none"/><circle cx="16" cy="15.5" r="1.6" fill="#fff" stroke="none"/></svg>
        </div>
        <span style="font-weight:700;color:var(--text-soft)">${t('brand.name')}</span>
        <span>— ${t('footer.text')}</span>
      </div>
      <div style="display:flex;gap:16px;align-items:center">
        <a href="/privacy" style="color:var(--muted)">${t('footer.privacy')}</a>
        <span style="color:var(--border-strong)">·</span>
        <span>${t('footer.disclaimer')}</span>
        <span style="color:var(--border-strong)">·</span>
        <span>© ${new Date().getFullYear()}</span>
      </div>
    </div>`.s;

  document.getElementById('lang-btn').onclick = async () => {
    const next = getLocale() === 'ar' ? 'fr' : 'ar';
    setLocale(next);
    if (store.user) api.patch('/me', { locale: next }).catch(() => {});
    renderShell();
    await render();
  };
  document.getElementById('theme-btn').onclick = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('cp_theme', next); } catch { /* ignore */ }
    applyTheme(next);
    renderShell();
  };
  document.getElementById('sound-btn').onclick = () => { sound.enabled = !sound.enabled; renderShell(); };
  document.getElementById('menu-btn').onclick = (e) => {
    const open = mobile.classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  };
  const lo = document.getElementById('logout-btn');
  if (lo) lo.onclick = async () => {
    await api.post('/auth/logout');
    store.user = null;
    toast(t('auth.loggedOut'));
    navigate('/');
  };
}

// --- جلسة واحدة لكل حساب -----------------------------------------------------------
// إذا دخل نفس الحساب من جهاز آخر، يُخرَج هذا الجهاز مع رسالة واضحة
let kicked = false;
window.addEventListener('session-replaced', (e) => {
  if (kicked) return;
  kicked = true;
  const wasIn = !!store.user || e.detail?.boot;
  store.user = null;
  if (!wasIn) { kicked = false; return; }
  toast(t('err.session_replaced'), 'error');
  if (!e.detail?.boot) { renderShell(); navigate('/login', { replace: true }); }
  setTimeout(() => { kicked = false; }, 3000);
});
// فحص خفيف كل 30 ثانية (وعند الرجوع للتبويب) حتى يُكتشف الدخول من جهاز آخر بسرعة
const checkSession = () => {
  if (!store.user || document.visibilityState !== 'visible') return;
  api.get('/auth/me').then((r) => { if (r.reason === 'session_replaced') window.dispatchEvent(new CustomEvent('session-replaced')); }).catch(() => {});
};
setInterval(checkSession, 30_000);
document.addEventListener('visibilitychange', checkSession);

// --- Gardes de navigation ---------------------------------------------------------
// الوجهة الافتراضية حسب الدور
function defaultRoute() {
  if (!store.user) return '/';
  if (['admin', 'school', 'instructor'].includes(store.user.role)) return '/admin';
  return '/dashboard';
}

setNavigateHook(async ({ route: r, path }) => {
  if (r.opts.auth && !store.user) { navigate(`/login?next=${encodeURIComponent(path + location.search)}`, { replace: true }); return false; }
  if (r.opts.roles && !r.opts.roles.includes(store.user?.role)) {
    navigate(defaultRoute(), { replace: true }); return false;
  }
  if (r.opts.guest && store.user) { navigate(defaultRoute(), { replace: true }); return false; }
  renderShell();
  app.innerHTML = '';
  window.scrollTo(0, 0);
  requestAnimationFrame(() => app.focus({ preventScroll: true }));
  return true;
});

const view = (fn) => (ctx) => fn(app, ctx);
const staff    = { auth: true, roles: ['instructor', 'admin', 'school'] };
const adminOnly = { auth: true, roles: ['admin'] };
const schoolOrAdmin = { auth: true, roles: ['admin', 'school'] };
// صفحات المتعلم فقط
const learner  = { auth: true, roles: ['student'] };

route('/', view(homeView));
route('/login', view(loginView), { guest: true });
route('/register', view(registerView), { guest: true });
route('/verify-otp', view(verifyOtpView));
route('/enroll', view(enrollView), { auth: true, roles: ['student'] });
route('/dashboard', view(dashboardView), learner);
route('/lessons', view(lessonsView));
route('/lessons/:slug', view(lessonView));
route('/practice', view(practiceView), learner);
route('/exam', view(examIntroView), learner);
route('/quiz/:id', view(quizView), learner);
route('/results/:id', view(resultsView), learner);
route('/mistakes', view(mistakesView), learner);
route('/assistant', view(aiTutorView), learner);
route('/history', view(historyView), learner);
route('/profile', view(profileView), { auth: true });
route('/privacy', view(privacyView));
route('/champion', view(championView));
// الحجز: للمتعلمين المنتسبين لمدرسة قيادة فقط (school_id != null)
route('/bookings', (ctx) => {
  if (!store.user) return navigate('/login?next=/bookings', { replace: true });
  if (!store.isEnrolled()) return navigate('/dashboard', { replace: true });
  return bookingsView(app, ctx);
});
route('/admin', view(admin.statsView), staff);
route('/admin/questions', view(admin.questionsView), staff);
route('/admin/questions/:id', view(admin.questionEditView), staff);
route('/admin/series', view(admin.seriesView), staff);
route('/admin/series/:id', view(admin.seriesEditView), staff);
route('/admin/lessons', view(admin.lessonsAdminView), staff);
route('/admin/lessons/:id', view(admin.lessonEditView), staff);
route('/admin/students', view(admin.studentsView), staff);
route('/admin/students/:id', view(admin.studentView), staff);
route('/admin/users', view(admin.usersView), adminOnly);
route('/admin/audit', view(admin.auditView), adminOnly);
route('/admin/import', view(admin.importView), adminOnly);
route('/admin/storage', view(admin.storageView), adminOnly);
const adminBookings = view(adminBookingsView);
// الأدمين لا يدير حجوزات التدريب (للمؤسسة والمدرب فقط)
route('/admin/bookings', (ctx) => (store.user?.role === 'admin' ? navigate('/admin', { replace: true }) : adminBookings(ctx)), staff);
route('/admin/school/enrollments', view(enrollmentsView), { auth: true, roles: ['admin', 'school'] });
route('/admin/school/students', view(schoolStudentsView), { auth: true, roles: ['admin', 'school'] });
route('/admin/school/instructors', view(schoolInstructorsView), { auth: true, roles: ['school'] });
route('/admin/exams', view(schoolExamsView), { auth: true, roles: ['admin', 'school'] });
route('/my-exams', view(studentExamView), { auth: true, roles: ['student'] });
route('/live/:id', view(liveSessionView), learner);
route('/admin/live', view(adminLiveView), { auth: true, roles: ['admin', 'school', 'instructor'] });
route('*', view(notFoundView));

(async function boot() {
  let saved = null;
  try { saved = localStorage.getItem('cp_locale'); } catch { /* ignore */ }
  try { await store.loadUser(); } catch { store.user = null; }
  setLocale(saved || store.user?.locale || 'ar');
  applyStaticTranslations();
  watchIcons(document.body); // أيقونات خطية بدل الإيموجي في كل الواجهات
  await startRouter();
})().catch((e) => {
  console.error(e);
  app.innerHTML = `<div class="empty"><p>${esc(t('err.server_error'))}</p></div>`;
});
