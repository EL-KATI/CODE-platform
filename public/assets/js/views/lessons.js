import { html, raw, loading, toast, errorMessage } from '../ui.js';
import { t, catName } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { renderMarkdown } from '../markdown.js';
import { startAttempt } from './common.js';
import { navigate } from '../router.js';

export async function lessonsView(root) {
  root.innerHTML = loading().s;
  const [lessons, cats] = await Promise.all([api.get('/lessons'), store.getCategories()]);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const done = lessons.filter((l) => l.completed).length;
  // قوائم مجمّعة حسب المحور (نمط إعدادات iOS) مع الحفاظ على ترتيب الدروس
  const groups = [];
  lessons.forEach((l, i) => {
    const key = l.category_id || 0;
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, cat: byId.get(l.category_id) || null, items: [] }; groups.push(g); }
    g.items.push({ ...l, n: i + 1 });
  });
  const pct = lessons.length ? Math.round((100 * done) / lessons.length) : 0;
  root.innerHTML = html`
    <div class="pg pg-narrow">
      <header class="pg-head"><h1>${t('lessons.title')}</h1><p>${t('lessons.subtitle')}</p></header>
      ${store.user && lessons.length ? html`<div class="card lessons-progress">
        <div class="cat-head"><strong>${t('lessons.progress', { d: done, n: lessons.length })}</strong><span class="muted small">${pct}%</span></div>
        <div class="cat-bar bar-good" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${t('lessons.progress', { d: done, n: lessons.length })}"><i style="width:${pct}%"></i></div>
      </div>` : ''}
      ${lessons.length ? groups.map((g) => html`<section>
        ${groups.length > 1 ? html`<h2 class="list-title">${g.cat ? html`${g.cat.icon} ${catName(g.cat)}` : t('lessons.general')}</h2>` : ''}
        <div class="card dash-list">
          ${g.items.map((l) => html`<a class="lesson-row" href="/lessons/${l.slug}">
            <span class="lesson-num ${l.completed ? 'is-done' : ''}" aria-hidden="true">${l.completed ? '✓' : l.n}</span>
            <div class="lesson-body"><strong>${l.title}</strong><span class="muted small">${l.summary}</span></div>
            <span class="lesson-meta muted small">${l.completed ? html`<span class="sr-only">${t('lessons.done')} · </span>` : ''}${t('lessons.minutes', { n: l.minutes })}</span>
            <span class="row-chevron">${raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>')}</span>
          </a>`)}
        </div>
      </section>`) : html`<div class="card empty"><div class="big">📖</div><p>${t('lessons.none')}</p></div>`}
    </div>`.s;
}

export async function lessonView(root, { params }) {
  root.innerHTML = loading().s;
  let l;
  try { l = await api.get(`/lessons/${encodeURIComponent(params.slug)}`); } catch { return navigate('/lessons', { replace: true }); }
  const cats = await store.getCategories();
  const c = cats.find((x) => x.id === l.category_id);
  root.innerHTML = html`
    <div class="pg pg-narrow reader">
      <a class="reader-back" href="/lessons"><span class="row-chevron">${raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>')}</span>${t('lessons.title')}</a>
      <article class="card reader-card">
        <header class="reader-head">
          <div class="row">${c ? html`<span class="pill">${c.icon} ${catName(c)}</span>` : ''}<span class="pill">⏱ ${t('lessons.minutes', { n: l.minutes })}</span></div>
          <h1>${l.title}</h1><p class="muted">${l.summary}</p>
        </header>
        <div class="prose" lang="ar" dir="rtl">${raw(renderMarkdown(l.body))}</div>
        <footer class="reader-actions">
          ${store.user ? html`<button class="btn ${l.completed ? 'btn-secondary' : 'btn-primary'}" id="done-btn" aria-pressed="${l.completed}">${l.completed ? '✓ ' + t('lessons.done') : t('lessons.markDone')}</button>
            ${c ? html`<button class="btn btn-secondary" id="quiz-btn">🎯 ${t('lessons.quiz')}</button>` : ''}`
          : html`<a class="btn btn-primary" href="/register">${t('lessons.signupToTrack')}</a>`}
        </footer>
      </article>
      ${l.prev || l.next ? html`<nav class="reader-nav" aria-label="${t('lessons.title')}">
        ${l.prev ? html`<a class="card reader-nav-link" href="/lessons/${l.prev.slug}"><small>${t('lessons.prev')}</small><strong>${l.prev.title}</strong></a>` : html`<span></span>`}
        ${l.next ? html`<a class="card reader-nav-link is-next" href="/lessons/${l.next.slug}"><small>${t('lessons.next')}</small><strong>${l.next.title}</strong></a>` : html`<span></span>`}
      </nav>` : ''}
    </div>`.s;
  const doneBtn = root.querySelector('#done-btn');
  if (doneBtn) doneBtn.onclick = async () => {
    try {
      if (l.completed) await api.del(`/lessons/${l.id}/complete`); else await api.post(`/lessons/${l.id}/complete`);
      l.completed = !l.completed;
      doneBtn.textContent = l.completed ? '✓ ' + t('lessons.done') : t('lessons.markDone');
      doneBtn.className = `btn ${l.completed ? 'btn-secondary' : 'btn-primary'}`;
      doneBtn.setAttribute('aria-pressed', String(l.completed));
      if (l.completed) toast(t('lessons.completedToast'));
    } catch (e) { toast(errorMessage(e), 'error'); }
  };
  const qb = root.querySelector('#quiz-btn');
  if (qb) qb.onclick = () => startAttempt({ mode: 'category', categoryId: c.id, practice: true, count: 10 }, qb);
}
