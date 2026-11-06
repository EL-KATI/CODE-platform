import { html, raw, loading, fmtDate, pct } from '../ui.js';
import { t, catName } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { renderVisual } from '../scenario.js';
import { progressBar, ring, modeLabel, startAttempt, videoBlock } from './common.js';

export function reviewItem(q, i, cats) {
  const correct = new Set(q.correct || []);
  const sel = new Set(q.answer ? q.answer.selected : []);
  const ok = q.answer ? q.answer.isCorrect : false;
  const c = cats.get(q.categoryId);
  return html`<article class="card review-item ${ok ? 'ok' : 'ko'}" data-ok="${ok ? 1 : 0}">
    <div class="row"><span class="pill ${ok ? 'pill-success' : 'pill-danger'}">${i !== null ? `${i + 1} · ` : ''}${ok ? t('quiz.right') : sel.size ? t('results.wrong') : t('results.noAnswer')}</span>
      ${c ? html`<span class="pill">${c.icon} ${catName(c)}</span>` : ''}</div>
    <div class="row" style="align-items:flex-start;margin-top:12px;flex-wrap:wrap">
      ${raw(videoBlock(q).s || '')}
      ${q.image || q.visual ? html`<div class="scene" style="max-width:260px;margin:0">${raw(renderVisual(q))}</div>` : ''}
      <div style="flex:1;min-width:240px">
        <h3 lang="ar" dir="rtl">${q.text}</h3>
        <ul class="answers-list">${q.options.map((o, k) => {
          const n = k + 1;
          const cls = correct.has(n) ? 'c' : sel.has(n) ? 'w' : '';
          return html`<li class="${cls}" lang="ar" dir="rtl">${n}. ${o}${correct.has(n) ? html` <span class="sr-only">(${t('quiz.correctAnswer')})</span>` : ''}${sel.has(n) ? html` <span class="small muted">— ${t('results.yourChoice')}</span>` : ''}</li>`;
        })}</ul>
        ${q.explanation ? html`<p class="small" style="margin:0" lang="ar" dir="rtl"><strong>💡 </strong>${q.explanation}</p>` : ''}
      </div>
    </div></article>`;
}

export async function resultsView(root, { params }) {
  root.innerHTML = loading().s;
  let a;
  try { a = await api.get(`/attempts/${params.id}`); } catch { return navigate('/dashboard', { replace: true }); }
  if (!a.finishedAt) return navigate(`/quiz/${a.id}`, { replace: true });
  const cats = new Map((await store.getCategories()).map((c) => [c.id, c]));
  const p = pct(a.score, a.total);
  const statusCls = a.passed === null ? '' : a.passed ? 'pass' : 'fail';
  const wrong = a.questions.filter((q) => !q.answer?.isCorrect).length;

  root.innerHTML = html`
    <div class="card result-hero ${statusCls}" style="border-width:2px">
      ${ring(p, t('results.score'), a.passed === false ? '#ef4444' : '#10b981')}
      <div style="flex:1;min-width:220px">
        <span class="pill">${modeLabel(a)} · ${a.practice ? t('mode.practice') : t('mode.examConditions')}</span>
        <h1 style="margin-top:10px">${a.passed === null ? t('results.done') : a.passed ? t('results.passed') : t('results.failed')}</h1>
        <p style="font-size:1.2rem;margin:0"><strong>${a.score}/${a.total}</strong>${a.passMark !== null ? html` · <span class="muted">${t('results.passMark', { n: a.passMark })}</span>` : ''}</p>
        <p class="small muted">${fmtDate(a.finishedAt)}</p>
        <div class="row">
          ${a.mode === 'exam' ? html`<button class="btn btn-primary" id="again">${t('results.newExam')}</button>` : ''}
          ${wrong ? html`<button class="btn btn-secondary" id="review">${t('results.reviewMistakes')}</button>` : ''}
          <a class="btn btn-ghost" href="/dashboard">${t('nav.dashboard')}</a>
        </div>
      </div>
    </div>

    <section class="card" style="margin-top:20px">
      <h2>${t('results.byCategory')}</h2>
      <div class="grid grid-3">
        ${a.byCategory.map((b) => {
          const c = cats.get(b.categoryId);
          const v = pct(b.correct, b.total);
          return html`<div><div class="row small"><strong>${c ? `${c.icon} ${catName(c)}` : '—'}</strong><span class="spacer"></span><span>${b.correct}/${b.total}</span></div>${progressBar(v)}</div>`;
        })}
      </div>
    </section>

    <section style="margin-top:24px">
      <div class="page-head"><h2 style="margin:0">${t('results.correction')}</h2>
        <div class="row" role="group" aria-label="${t('results.filter')}">
          <button class="btn btn-sm btn-primary" data-f="all" aria-pressed="true">${t('results.all')} (${a.total})</button>
          <button class="btn btn-sm btn-secondary" data-f="ko" aria-pressed="false">${t('results.onlyWrong')} (${wrong})</button>
        </div></div>
      <div class="stack" id="list">${a.questions.map((q, i) => reviewItem(q, i, cats))}</div>
    </section>`.s;

  root.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => {
    root.querySelectorAll('[data-f]').forEach((x) => { x.className = `btn btn-sm ${x === b ? 'btn-primary' : 'btn-secondary'}`; x.setAttribute('aria-pressed', String(x === b)); });
    root.querySelectorAll('.review-item').forEach((el) => { el.hidden = b.dataset.f === 'ko' && el.dataset.ok === '1'; });
  }));
  const again = root.querySelector('#again');
  if (again) again.onclick = () => startAttempt({ mode: 'exam' }, again);
  const rv = root.querySelector('#review');
  if (rv) rv.onclick = () => startAttempt({ mode: 'review', practice: true }, rv);
}
