import { html } from '../ui.js';
import { t } from '../i18n.js';
import { store } from '../store.js';
import { navigate } from '../router.js';

export async function homeView(root) {
  if (store.user) return navigate('/dashboard', { replace: true });
  const s = await store.getSettings();
  const features = [
    ['📚', 'home.f.lessons'], ['🎯', 'home.f.practice'], ['⏱️', 'home.f.exam'],
    ['🧠', 'home.f.review'], ['📊', 'home.f.progress'], ['♿', 'home.f.access'],
  ];
  root.innerHTML = html`
    <section class="hero">
      <span class="pill">${t('home.badge')}</span>
      <h1 style="margin-top:14px">${t('home.title')}</h1>
      <p>${t('home.subtitle', { n: s.questionCount, pass: s.passMark })}</p>
      <div class="row" style="margin-top:20px">
        <a class="btn btn-primary btn-lg" href="/register">${t('home.cta')}</a>
        <a class="btn btn-secondary btn-lg" href="/lessons">${t('home.ctaLessons')}</a>
      </div>
    </section>
    <h2 style="margin:32px 0 16px">${t('home.method')}</h2>
    <ol class="grid grid-4" style="list-style:none;padding:0;margin:0">
      ${[1, 2, 3, 4].map((n) => html`<li class="card"><span class="pill pill-info">${t('home.step')} ${n}</span><h3 style="margin-top:10px">${t(`home.s${n}.t`)}</h3><p class="muted small">${t(`home.s${n}.d`)}</p></li>`)}
    </ol>
    <h2 style="margin:32px 0 16px">${t('home.features')}</h2>
    <div class="grid grid-3">
      ${features.map(([icon, k]) => html`<div class="card"><div class="feature-icon" aria-hidden="true">${icon}</div><h3>${t(k + '.t')}</h3><p class="muted small" style="margin:0">${t(k + '.d')}</p></div>`)}
    </div>`.s;
}
