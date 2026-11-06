import { html, loading } from '../ui.js';
import { t, catName } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { startAttempt } from './common.js';

export async function practiceView(root) {
  root.innerHTML = loading().s;
  const [cats, series] = await Promise.all([store.getCategories(true), api.get('/series')]);
  root.innerHTML = html`
    <div class="page-head"><div><h1>${t('practice.title')}</h1><p>${t('practice.subtitle')}</p></div></div>

    <h2>${t('practice.byCategory')}</h2>
    <p class="muted small">${t('practice.byCategoryHelp')}</p>
    <div class="grid grid-3">
      ${cats.map((c) => html`<div class="card">
        <div class="row"><span style="font-size:1.5rem" aria-hidden="true">${c.icon}</span><h3 style="margin:0">${catName(c)}</h3></div>
        <p class="small muted" style="margin:8px 0 12px">${t('practice.questions', { n: c.question_count })}</p>
        <div class="row"><button class="btn btn-primary btn-sm" data-cat="${c.id}" data-n="10">${t('practice.quick', { n: 10 })}</button>
        <button class="btn btn-secondary btn-sm" data-cat="${c.id}" data-n="40">${t('practice.full')}</button></div></div>`)}
    </div>

    <h2 style="margin-top:32px">${t('practice.series')}</h2>
    <p class="muted small">${t('practice.seriesHelp')}</p>
    <div class="grid grid-3">
      ${series.map((s, i) => html`<div class="card">
        <div class="row"><span class="pill">${t('practice.seriesN', { n: i + 1 })}</span><span class="spacer"></span>
          ${s.best !== null ? html`<span class="pill ${s.best >= 80 ? 'pill-success' : 'pill-warning'}">${t('practice.best', { v: s.best })}</span>` : ''}</div>
        <h3 style="margin-top:10px">${s.title.replace(/^السلسلة\s*\d+\s*:\s*/, '')}</h3>
        <p class="small muted">${t('practice.questions', { n: s.question_count })}</p>
        <div class="row"><button class="btn btn-secondary btn-sm" data-series="${s.id}" data-practice="1">🎯 ${t('mode.practice')}</button>
        <button class="btn btn-primary btn-sm" data-series="${s.id}" data-practice="0">⏱️ ${t('mode.examConditions')}</button></div></div>`)}
    </div>`.s;

  root.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => startAttempt({ mode: 'category', categoryId: Number(b.dataset.cat), count: Number(b.dataset.n), practice: true }, b)));
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
