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
  root.innerHTML = html`
    <div class="page-head"><div><h1>${t('lessons.title')}</h1><p>${t('lessons.subtitle')}</p></div>
      ${store.user ? html`<span class="pill pill-info">${t('lessons.progress', { d: done, n: lessons.length })}</span>` : ''}</div>
    <ol class="grid grid-2" style="list-style:none;padding:0;margin:0">
      ${lessons.map((l, i) => {
        const c = byId.get(l.category_id);
        return html`<li><a class="card card-link" href="/lessons/${l.slug}">
          <div class="row"><span class="pill">${t('lessons.module')} ${i + 1}</span>${c ? html`<span class="pill">${c.icon} ${catName(c)}</span>` : ''}
          <span class="spacer"></span>${l.completed ? html`<span class="pill pill-success">✓ ${t('lessons.done')}</span>` : ''}</div>
          <h3 style="margin-top:10px">${l.title}</h3><p class="muted small" style="margin:0">${l.summary}</p>
          <p class="small muted" style="margin:8px 0 0">⏱ ${t('lessons.minutes', { n: l.minutes })}</p></a></li>`;
      })}
    </ol>`.s;
}

export async function lessonView(root, { params }) {
  root.innerHTML = loading().s;
  let l;
  try { l = await api.get(`/lessons/${encodeURIComponent(params.slug)}`); } catch { return navigate('/lessons', { replace: true }); }
  const cats = await store.getCategories();
  const c = cats.find((x) => x.id === l.category_id);
  root.innerHTML = html`
    <nav aria-label="breadcrumb" class="small" style="margin-bottom:12px"><a href="/lessons">${t('lessons.title')}</a> / <span aria-current="page">${l.title}</span></nav>
    <article class="card">
      <header style="margin-bottom:16px">
        <div class="row">${c ? html`<span class="pill">${c.icon} ${catName(c)}</span>` : ''}<span class="pill">⏱ ${t('lessons.minutes', { n: l.minutes })}</span></div>
        <h1 style="margin-top:10px">${l.title}</h1><p class="muted">${l.summary}</p>
      </header>
      <div class="prose" lang="ar" dir="rtl">${raw(renderMarkdown(l.body))}</div>
      <footer class="row" style="margin-top:28px;border-top:1px solid var(--border);padding-top:18px">
        ${store.user ? html`<button class="btn ${l.completed ? 'btn-secondary' : 'btn-primary'}" id="done-btn" aria-pressed="${l.completed}">${l.completed ? '✓ ' + t('lessons.done') : t('lessons.markDone')}</button>
          ${c ? html`<button class="btn btn-secondary" id="quiz-btn">🎯 ${t('lessons.quiz')}</button>` : ''}`
        : html`<a class="btn btn-primary" href="/register">${t('lessons.signupToTrack')}</a>`}
        <span class="spacer"></span>
        ${l.prev ? html`<a class="btn btn-ghost" href="/lessons/${l.prev.slug}">→ ${l.prev.title}</a>` : ''}
        ${l.next ? html`<a class="btn btn-ghost" href="/lessons/${l.next.slug}">${l.next.title} ←</a>` : ''}
      </footer>
    </article>`.s;
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
