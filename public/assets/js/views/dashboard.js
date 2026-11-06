import { html, loading, fmtDate } from '../ui.js';
import { t, catName } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { progressBar, ring, modeLabel, scorePill, startAttempt } from './common.js';

export async function dashboardView(root) {
  root.innerHTML = loading().s;
  const d = await api.get('/me/dashboard');
  const u = store.user;
  const r = d.readiness;
  const daysLeft = u.examDate ? Math.ceil((new Date(u.examDate) - new Date()) / 86400000) : null;
  const next = d.lessons.done < d.lessons.total ? { href: '/lessons', label: t('dash.nextLesson') }
    : d.counts.due > 0 ? { action: 'review', label: t('dash.nextReview', { n: d.counts.due }) }
      : { href: '/exam', label: t('dash.nextExam') };

  root.innerHTML = html`
    <div class="page-head">
      <div><h1>${t('dash.hello', { name: u.name })}</h1>
      <p>${daysLeft !== null && daysLeft >= 0 ? t('dash.daysLeft', { n: daysLeft }) : t('dash.subtitle')}</p></div>
      ${next.href ? html`<a class="btn btn-primary" href="${next.href}">${next.label}</a>` : html`<button class="btn btn-primary" id="next-btn">${next.label}</button>`}
    </div>

    <section class="grid grid-2" aria-label="${t('dash.readiness')}">
      <div class="card">
        <div class="row" style="gap:20px;flex-wrap:nowrap">
          ${ring(r.score, t('dash.readiness'), r.ready ? '#10b981' : r.score >= 50 ? '#f59e0b' : '#ef4444')}
          <div>
            <h2 style="margin-bottom:6px">${r.ready ? t('dash.ready') : t('dash.notReady')}</h2>
            <p class="muted small">${t('dash.readinessHelp', { n: d.settings.readinessWindow, m: d.settings.readinessWindow - 1 })}</p>
            <p class="small" style="margin:0">${t('dash.examsPassed', { p: r.examsPassed, n: r.examsTaken })}${r.averageExamScore !== null ? ' · ' + t('dash.avg', { v: r.averageExamScore, n: d.settings.questionCount }) : ''}</p>
          </div>
        </div>
      </div>
      <div class="grid grid-2" style="gap:12px">
        <div class="card stat"><span class="stat-value">${d.lessons.done}/${d.lessons.total}</span><span class="stat-label">${t('dash.lessonsDone')}</span></div>
        <div class="card stat"><span class="stat-value">${d.counts.seen}/${d.counts.questions}</span><span class="stat-label">${t('dash.questionsSeen')}</span></div>
        <div class="card stat"><span class="stat-value">${d.counts.due}</span><span class="stat-label">${t('dash.due')}</span></div>
        <div class="card stat"><span class="stat-value">🔥 ${d.streak}</span><span class="stat-label">${t('dash.streak')}</span></div>
      </div>
    </section>

    <section style="margin-top:24px">
      <div class="page-head"><h2 style="margin:0">${t('dash.byCategory')}</h2><a href="/practice" class="btn btn-ghost btn-sm">${t('dash.trainAll')}</a></div>
      <div class="grid grid-3">
        ${d.categories.map((c) => html`
          <div class="card">
            <div class="row"><span aria-hidden="true" style="font-size:1.4rem">${c.icon}</span><h3 style="margin:0">${catName(c)}</h3></div>
            <div class="row small muted" style="margin:10px 0 6px"><span>${t('dash.mastery')}: <strong>${c.mastery}%</strong></span><span class="spacer"></span><span>${c.accuracy === null ? '—' : t('dash.accuracy', { v: c.accuracy })}</span></div>
            ${progressBar(c.mastery, catName(c))}
            <div class="row" style="margin-top:12px"><span class="small muted">${c.seen}/${c.total} ${t('dash.seen')}</span><span class="spacer"></span>
              <button class="btn btn-secondary btn-sm" data-cat="${c.id}">${t('dash.train')}</button></div>
          </div>`)}
      </div>
    </section>

    <section style="margin-top:24px" class="grid grid-2">
      <div class="card">
        <div class="page-head" style="margin-bottom:8px"><h2 style="margin:0">${t('dash.recent')}</h2><a class="btn btn-ghost btn-sm" href="/history">${t('dash.allHistory')}</a></div>
        ${d.recent.length ? html`<ul style="list-style:none;padding:0;margin:0">${d.recent.map((a) => html`
          <li class="row" style="padding:10px 0;border-bottom:1px solid var(--border)">
            <a href="/results/${a.id}" style="font-weight:700">${modeLabel(a)}</a>
            <span class="small muted">${a.practice ? t('mode.practice') : t('mode.examConditions')}</span>
            <span class="spacer"></span>${scorePill(a)}<span class="small muted">${fmtDate(a.finished_at)}</span></li>`)}</ul>`
        : html`<div class="empty"><div class="big">🚦</div><p>${t('dash.noActivity')}</p></div>`}
      </div>
      <div class="card">
        <h2>${t('dash.quick')}</h2>
        <div class="grid" style="gap:10px">
          <a class="btn btn-primary" href="/exam">⏱️ ${t('dash.mockExam', { n: d.settings.questionCount })}</a>
          <button class="btn btn-secondary" id="review-btn" ${d.counts.due ? '' : 'disabled'}>🧠 ${t('dash.smartReview')} (${d.counts.due})</button>
          <a class="btn btn-secondary" href="/mistakes">❌ ${t('dash.myMistakes')} (${d.counts.mistakes})</a>
          <button class="btn btn-secondary" id="bm-btn" ${d.counts.bookmarks ? '' : 'disabled'}>⭐ ${t('dash.bookmarks')} (${d.counts.bookmarks})</button>
        </div>
      </div>
    </section>`.s;

  root.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => startAttempt({ mode: 'category', categoryId: Number(b.dataset.cat), practice: true }, b)));
  const rv = root.querySelector('#review-btn');
  rv.onclick = () => startAttempt({ mode: 'review', practice: true }, rv);
  const bm = root.querySelector('#bm-btn');
  bm.onclick = () => startAttempt({ mode: 'bookmarks', practice: true }, bm);
  const nb = root.querySelector('#next-btn');
  if (nb) nb.onclick = () => startAttempt({ mode: 'review', practice: true }, nb);
}
