// Point d'entrée : en-tête/navigation, thème, langue, déclaration des routes.
import { route, startRouter, setNavigateHook, navigate, render } from './router.js';
import { store } from './store.js';
import { api } from './api.js';
import { t, setLocale, getLocale, applyStaticTranslations } from './i18n.js';
import { html, esc, toast, sound } from './ui.js';

import { homeView } from './views/home.js';
import { loginView, registerView } from './views/auth.js';
import { dashboardView } from './views/dashboard.js';
import { lessonsView, lessonView } from './views/lessons.js';
import { practiceView, examIntroView } from './views/practice.js';
import { quizView } from './views/quiz.js';
import { resultsView } from './views/results.js';
import { mistakesView, historyView } from './views/mistakes.js';
import { profileView } from './views/profile.js';
import { privacyView, notFoundView } from './views/static.js';
import * as admin from './views/admin.js';

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
  const links = u
    ? [['/dashboard', 'nav.dashboard'], ['/lessons', 'nav.lessons'], ['/practice', 'nav.practice'], ['/exam', 'nav.exam'], ['/mistakes', 'nav.mistakes']]
    : [['/', 'nav.home'], ['/lessons', 'nav.lessons'], ['/login', 'nav.login']];
  if (store.isStaff()) links.push(['/admin', 'nav.admin']);
  return links;
}

export function renderShell() {
  const path = location.pathname;
  const isCur = (href) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
  const linkHtml = navLinks().map(([href, key]) => html`<a href="${href}" ${isCur(href) ? html`aria-current="page"` : ''}>${t(key)}</a>`);
  document.getElementById('main-nav').innerHTML = html`${linkHtml}`.s;
  const mobile = document.getElementById('mobile-nav');
  mobile.innerHTML = html`${linkHtml}${store.user ? html`<a href="/profile">${t('nav.profile')}</a>` : html`<a href="/register">${t('nav.register')}</a>`}`.s;
  mobile.classList.remove('open');

  const theme = getTheme() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.getElementById('header-actions').innerHTML = html`
    <button class="icon-btn" id="lang-btn" type="button" lang="${getLocale() === 'ar' ? 'fr' : 'ar'}" aria-label="${t('a11y.language')}">${getLocale() === 'ar' ? 'FR' : 'ع'}</button>
    <button class="icon-btn" id="theme-btn" type="button" aria-label="${t('a11y.theme')}" aria-pressed="${theme === 'dark'}">${theme === 'dark' ? '☀️' : '🌙'}</button>
    <button class="icon-btn" id="sound-btn" type="button" aria-label="${t('a11y.sound')}" aria-pressed="${sound.enabled}">${sound.enabled ? '🔊' : '🔇'}</button>
    ${store.user
      ? html`<a class="icon-btn" href="/profile" title="${store.user.name}"><span aria-hidden="true">👤</span><span class="sr-only">${t('nav.profile')}</span></a>
             <button class="icon-btn" id="logout-btn" type="button">${t('nav.logout')}</button>`
      : html`<a class="icon-btn" href="/register">${t('nav.register')}</a>`}
    <button class="icon-btn menu-toggle" id="menu-btn" type="button" aria-expanded="false" aria-controls="mobile-nav" aria-label="${t('a11y.menu')}">☰</button>`.s;

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

// --- Gardes de navigation ---------------------------------------------------------
setNavigateHook(async ({ route: r, path }) => {
  if (r.opts.auth && !store.user) { navigate(`/login?next=${encodeURIComponent(path + location.search)}`, { replace: true }); return false; }
  if (r.opts.roles && !r.opts.roles.includes(store.user?.role)) { navigate('/dashboard', { replace: true }); return false; }
  if (r.opts.guest && store.user) { navigate('/dashboard', { replace: true }); return false; }
  renderShell();
  app.innerHTML = '';
  window.scrollTo(0, 0);
  // Accessibilité : le focus passe au contenu principal après chaque navigation.
  requestAnimationFrame(() => app.focus({ preventScroll: true }));
  return true;
});

const view = (fn) => (ctx) => fn(app, ctx);
const staff = { auth: true, roles: ['instructor', 'admin'] };
const adminOnly = { auth: true, roles: ['admin'] };

route('/', view(homeView));
route('/login', view(loginView), { guest: true });
route('/register', view(registerView), { guest: true });
route('/dashboard', view(dashboardView), { auth: true });
route('/lessons', view(lessonsView));
route('/lessons/:slug', view(lessonView));
route('/practice', view(practiceView), { auth: true });
route('/exam', view(examIntroView), { auth: true });
route('/quiz/:id', view(quizView), { auth: true });
route('/results/:id', view(resultsView), { auth: true });
route('/mistakes', view(mistakesView), { auth: true });
route('/history', view(historyView), { auth: true });
route('/profile', view(profileView), { auth: true });
route('/privacy', view(privacyView));
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
route('/admin/settings', view(admin.settingsView), adminOnly);
route('/admin/audit', view(admin.auditView), adminOnly);
route('*', view(notFoundView));

(async function boot() {
  let saved = null;
  try { saved = localStorage.getItem('cp_locale'); } catch { /* ignore */ }
  try { await store.loadUser(); } catch { store.user = null; }
  setLocale(saved || store.user?.locale || 'ar');
  applyStaticTranslations();
  await startRouter();
})().catch((e) => {
  console.error(e);
  app.innerHTML = `<div class="empty"><p>${esc(t('err.server_error'))}</p></div>`;
});
