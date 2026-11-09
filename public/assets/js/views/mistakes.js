import { html, raw, loading, fmtDate } from '../ui.js';
import { t, catName } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { reviewBody } from './results.js';
import { modeLabel, scorePill, startAttempt } from './common.js';

const CHEVRON_DOWN = raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>');
const CHEVRON = raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>');

export async function mistakesView(root) {
  root.innerHTML = loading().s;
  const [items, cats] = await Promise.all([api.get('/me/mistakes'), store.getCategories()]);
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const nBookmarks = items.filter((q) => q.bookmarked).length;
  root.innerHTML = html`
    <div class="pg pg-narrow">
      <header class="pg-head"><h1>${t('mistakes.title')}</h1><p>${t('mistakes.subtitle')}</p></header>
      <div class="res-actions">
        <button class="btn btn-primary" id="review" ${items.length ? '' : 'disabled'}>🧠 ${t('dash.smartReview')}</button>
        <button class="btn btn-secondary" id="bm" ${nBookmarks ? '' : 'disabled'}>⭐ ${t('dash.bookmarks')} (${nBookmarks})</button>
      </div>
      ${items.length ? html`<div class="card dash-list" id="mistakes-list">
        ${items.map((q, i) => {
          // سؤال محفوظ في المفضلة بدون خطأ حالي يظهر بنجمة بدل علامة الخطأ
          const wrongNow = q.lastWrong !== false;
          const c = catMap.get(q.categoryId);
          return html`<details class="acc" data-i="${i}">
            <summary>
              <span class="acc-mark ${wrongNow ? 'is-ko' : 'is-star'}" aria-hidden="true">${wrongNow ? '✕' : '★'}</span>
              <span class="acc-text"><small>${c ? catName(c) + ' · ' : ''}${t('mistakes.stats', { w: q.wrong, r: q.right })}${q.bookmarked && wrongNow ? ' · ⭐' : ''}</small><strong>${q.text}</strong></span>
              <span class="row-chevron acc-chevron">${CHEVRON_DOWN}</span>
            </summary>
            <div class="acc-body"></div>
          </details>`;
        })}
      </div>` : html`<div class="card empty"><div class="big">🎉</div><p>${t('mistakes.empty')}</p></div>`}
    </div>`.s;

  root.querySelectorAll('details.acc').forEach((d) => d.addEventListener('toggle', () => {
    const body = d.querySelector('.acc-body');
    if (!d.open || body.firstChild) return;
    const q = items[Number(d.dataset.i)];
    // لا نعرف آخر اختيار للمترشح هنا: نعرض الجواب الصحيح والشرح فقط
    q.answer = q.is_double ? { selected: [], selected_double: { a: [], b: [] }, isCorrect: false } : { selected: [], isCorrect: false };
    body.innerHTML = reviewBody(q, catMap).s;
  }));
  root.querySelector('#review').onclick = (e) => startAttempt({ mode: 'review', practice: true }, e.currentTarget);
  root.querySelector('#bm').onclick = (e) => startAttempt({ mode: 'bookmarks', practice: true }, e.currentTarget);
}

export async function historyView(root) {
  root.innerHTML = loading().s;
  const list = await api.get('/attempts?limit=200');
  const done = list.filter((a) => a.finished_at);
  const exams = done.filter((a) => a.mode === 'exam');
  const passedN = exams.filter((a) => a.passed).length;
  root.innerHTML = html`
    <div class="pg pg-narrow">
      <header class="pg-head"><h1>${t('history.title')}</h1><p>${t('history.subtitle')}</p></header>
      ${list.length ? html`
      <div class="res-counts hist-counts">
        <div class="res-count"><strong>${done.length}</strong><small>${t('history.total')}</small></div>
        <div class="res-count"><strong>${exams.length}</strong><small>${t('history.exams')}</small></div>
        <div class="res-count is-ok"><strong>${passedN}</strong><small>${t('history.examsPassed')}</small></div>
      </div>
      <div class="card dash-list">
        ${list.map((a) => html`<a class="recent-row" href="${a.finished_at ? `/results/${a.id}` : `/quiz/${a.id}`}">
          <span class="acc-mark ${!a.finished_at ? '' : a.passed === 1 ? 'is-ok' : a.passed === 0 ? 'is-ko' : 'is-info'}" aria-hidden="true">${!a.finished_at ? '…' : a.passed === 1 ? '✓' : a.passed === 0 ? '✕' : '•'}</span>
          <div><strong>${modeLabel(a)}${a.category_name ? ` — ${a.category_name}` : ''}</strong>
            <span class="muted small">${a.practice ? t('mode.practice') : t('mode.examConditions')} · ${fmtDate(a.finished_at || a.started_at)}</span></div>
          ${a.finished_at ? scorePill(a) : html`<span class="pill">${t('history.resume')}</span>`}
          <span class="row-chevron">${CHEVRON}</span>
        </a>`)}
      </div>` : html`<div class="card empty"><div class="big">📭</div><p>${t('dash.noActivity')}</p></div>`}
    </div>`.s;
}
