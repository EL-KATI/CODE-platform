import { html, loading } from '../ui.js';
import { t, catName } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { startAttempt } from './common.js';

// ألوان أيقونات المحاور (نفس لوحة ألوان الإجراءات السريعة)
const CAT_TONE = { road: 'blue', traffic: 'orange', driver: 'purple', vehicle: 'green', offences: 'red' };

export async function practiceView(root) {
  root.innerHTML = loading().s;
  const [series, cats] = await Promise.all([api.get('/series'), store.getCategories()]);
  const usable = cats.filter((c) => c.question_count > 0);
  root.innerHTML = html`
    <div class="pg">
      <header class="pg-head"><h1>${t('practice.title')}</h1><p>${t('practice.subtitle')}</p></header>

      <section>
        <h2 class="dash-h">${t('practice.byCategory')}</h2>
        <p class="pg-help">${t('practice.byCategoryHelp')}</p>
        <div class="cat-grid">
          ${usable.map((c) => html`<button type="button" class="cat-tile tone-${CAT_TONE[c.slug] || 'blue'}" data-cat="${c.id}">
            <span class="cat-tile-icon" aria-hidden="true">${c.icon}</span>
            <strong>${catName(c)}</strong>
            <small>${t('practice.questions', { n: c.question_count })}</small>
          </button>`)}
        </div>
      </section>

      <section>
        <h2 class="dash-h">${t('practice.series')}</h2>
        <p class="pg-help">${t('practice.seriesHelp')}</p>
        ${series.length ? html`<div class="card dash-list">
          ${series.map((s, i) => html`<div class="series-row">
            <span class="series-num" aria-hidden="true">${i + 1}</span>
            <div class="series-body">
              <strong>${s.title.replace(/^السلسلة\s*\d+\s*:\s*/, '')}</strong>
              <span class="muted small">${t('practice.questions', { n: s.question_count })}${s.best === null ? '' : ' · ' + t('practice.best', { v: s.best + '%' })}</span>
              ${s.best === null ? '' : html`<div class="cat-bar ${s.best >= 80 ? 'bar-good' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s.best}" aria-label="${t('practice.best', { v: s.best + '%' })}"><i style="width:${s.best}%"></i></div>`}
            </div>
            <div class="series-actions">
              <button class="btn btn-secondary btn-sm" data-series="${s.id}" data-practice="1">${t('mode.practice')}</button>
              <button class="btn btn-primary btn-sm" data-series="${s.id}" data-practice="0">${t('mode.examConditions')}</button>
            </div>
          </div>`)}
        </div>` : html`<div class="card empty"><div class="big">📚</div><p>${t('practice.noSeries')}</p></div>`}
      </section>
    </div>`.s;

  root.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => startAttempt({ mode: 'category', categoryId: Number(b.dataset.cat), practice: true }, b)));
  root.querySelectorAll('[data-series]').forEach((b) => (b.onclick = () => startAttempt({ mode: 'series', seriesId: Number(b.dataset.series), practice: b.dataset.practice === '1' }, b)));
}

export async function examIntroView(root) {
  const s = await store.getSettings(true);
  root.innerHTML = html`
    <div class="card" style="max-width:760px;margin:0 auto">
      <span class="pill pill-info">${t('exam.badge')}</span>
      <h1 style="margin-top:12px">${t('exam.title')}</h1>
      <p class="muted">${t('exam.subtitle')}</p>
      <div class="grid grid-3" style="margin:20px 0">
        <div class="card stat"><span class="stat-value">${s.questionCount}</span><span class="stat-label">${t('exam.questions')}</span></div>
        <div class="card stat"><span class="stat-value">${s.passMark}/${s.questionCount}</span><span class="stat-label">${t('exam.passMark')}</span></div>
        <div class="card stat"><span class="stat-value">${s.secondsPerQuestion}s</span><span class="stat-label">${t('exam.perQuestion')}</span></div>
      </div>
      <h2>${t('exam.rules')}</h2>
      <ul>${[1, 2, 3, 4, 5].map((n) => html`<li>${t(`exam.rule${n}`)}</li>`)}</ul>
      <p class="small muted">${t('exam.keyboard')} <span class="kbd">1</span> <span class="kbd">2</span> <span class="kbd">3</span> <span class="kbd">4</span> · <span class="kbd">Enter</span></p>
      <button class="btn btn-primary btn-lg" id="start">${t('exam.start')}</button>
    </div>`.s;
  const b = root.querySelector('#start');
  b.onclick = () => startAttempt({ mode: 'exam' }, b);
}
