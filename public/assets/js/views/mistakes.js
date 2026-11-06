import { html, loading, fmtDate } from '../ui.js';
import { t } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { reviewItem } from './results.js';
import { modeLabel, scorePill, startAttempt } from './common.js';

export async function mistakesView(root) {
  root.innerHTML = loading().s;
  const [items, cats] = await Promise.all([api.get('/me/mistakes'), store.getCategories()]);
  const catMap = new Map(cats.map((c) => [c.id, c]));
  root.innerHTML = html`
    <div class="page-head"><div><h1>${t('mistakes.title')}</h1><p>${t('mistakes.subtitle')}</p></div>
      <div class="row"><button class="btn btn-primary" id="review" ${items.length ? '' : 'disabled'}>🧠 ${t('dash.smartReview')}</button>
      <button class="btn btn-secondary" id="bm">⭐ ${t('dash.bookmarks')}</button></div></div>
    ${items.length ? html`<div class="stack">${items.map((q) => {
      q.answer = { selected: [], isCorrect: false };
      return html`<div>${reviewItem(q, null, catMap)}<div class="row small muted" style="padding:6px 4px">${t('mistakes.stats', { w: q.wrong, r: q.right })}${q.bookmarked ? ' · ⭐' : ''}</div></div>`;
    })}</div>` : html`<div class="card empty"><div class="big">🎉</div><p>${t('mistakes.empty')}</p></div>`}`.s;
  root.querySelector('#review').onclick = (e) => startAttempt({ mode: 'review', practice: true }, e.currentTarget);
  root.querySelector('#bm').onclick = (e) => startAttempt({ mode: 'bookmarks', practice: true }, e.currentTarget);
}

export async function historyView(root) {
  root.innerHTML = loading().s;
  const list = await api.get('/attempts?limit=200');
  root.innerHTML = html`
    <div class="page-head"><div><h1>${t('history.title')}</h1><p>${t('history.subtitle')}</p></div></div>
    ${list.length ? html`<div class="table-wrap"><table>
      <thead><tr><th scope="col">${t('history.date')}</th><th scope="col">${t('history.type')}</th><th scope="col">${t('history.mode')}</th><th scope="col">${t('history.score')}</th><th scope="col"><span class="sr-only">${t('common.actions')}</span></th></tr></thead>
      <tbody>${list.map((a) => html`<tr>
        <td>${fmtDate(a.finished_at || a.started_at)}</td>
        <td>${modeLabel(a)}${a.category_name ? ` — ${a.category_name}` : ''}</td>
        <td>${a.practice ? t('mode.practice') : t('mode.examConditions')}</td>
        <td>${scorePill(a)}</td>
        <td>${a.finished_at ? html`<a href="/results/${a.id}">${t('history.view')}</a>` : html`<a href="/quiz/${a.id}">${t('history.resume')}</a>`}</td></tr>`)}</tbody></table></div>`
    : html`<div class="card empty"><div class="big">📭</div><p>${t('dash.noActivity')}</p></div>`}`.s;
}
