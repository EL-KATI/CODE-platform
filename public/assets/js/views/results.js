// صفحة النتائج — تعرض الحكم (ناجح/راسب) + تفاصيل الأداء + مراجعة الأسئلة
import { html, raw, loading, toast, errorMessage } from '../ui.js';
import { t, catName } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { renderVisual } from '../scenario.js';

// ── دالة مشتركة: أجزاء مراجعة سؤال واحد ──
function reviewParts(q, catMap) {
  const ok = q.answer?.isCorrect === true;
  const ans = q.answer;
  const isDouble = q.is_double && Array.isArray(q.sub_questions) && q.sub_questions.length === 2;
  const c = catMap?.get(q.categoryId);

  const reviewOptions = (opts, correct, selected) => opts.map((o, i) => {
    const n = i + 1;
    const isCorrect = correct.includes(n);
    const isSelected = (selected || []).includes(n);
    const cls = isCorrect ? 'ans-c' : isSelected && !isCorrect ? 'ans-w' : '';
    return html`<li class="${cls}">
      <span class="ans-num">${n}</span>
      <span>${o}</span>
      ${isCorrect ? html`<span class="ans-mark" aria-label="${t('quiz.correctAnswer')}">✓</span>` : ''}
      ${isSelected && !isCorrect ? html`<span class="ans-mark" style="color:var(--danger)" aria-label="${t('quiz.yourAnswer')}">✗</span>` : ''}
    </li>`;
  }).join('');

  const body = html`
        ${q.image || q.visual ? html`<figure class="scene" style="margin:0 0 16px;border-radius:10px;overflow:hidden">${raw(renderVisual(q))}</figure>` : ''}
        ${isDouble ? html`
          <p class="q-text" style="font-size:1.05rem" lang="ar" dir="rtl">${q.text}</p>
          ${q.sub_questions.map((sq, si) => {
            const selArr = ans?.selected_double?.[si === 0 ? 'a' : 'b'] || [];
            return html`
              <div class="sub-q-block" style="margin-bottom:12px">
                <div class="sub-q-label">
                  <span class="sub-q-dot">${si === 0 ? 'أ' : 'ب'}</span>
                  <span>${sq.text}</span>
                </div>
                <ul class="ans-list">${raw(reviewOptions(sq.options, sq.correct || [], selArr))}</ul>
              </div>`;
          })}`
        : html`
          <p class="q-text" style="font-size:1.05rem" lang="ar" dir="rtl">${q.text}</p>
          <ul class="ans-list">${raw(reviewOptions(q.options, q.correct || [], ans?.selected || []))}</ul>`}
        ${q.explanation ? html`
          <div class="q-explain">
            <span class="q-explain-icon">💡</span>
            <span lang="ar" dir="rtl">${q.explanation}</span>
          </div>` : ''}`;
  return { ok, c, body };
}

// بطاقة مراجعة كاملة (مستعملة في «أخطائي»)
export function reviewItem(q, originalIdx, catMap) {
  const { ok, c, body } = reviewParts(q, catMap);
  return html`
    <div class="review-card ${ok ? 'rc-ok' : 'rc-ko'}">
      <div class="review-card-header">
        ${originalIdx != null ? html`<span class="q-number" style="font-size:.85rem">${t('quiz.qn', { n: originalIdx + 1 })}</span>` : ''}
        ${c ? html`<span class="pill" style="font-size:.74rem">${c.icon} ${catName(c)}</span>` : ''}
        <span class="${ok ? 'review-verdict-ok' : 'review-verdict-ko'}">
          ${ok ? '✓' : '✗'}
        </span>
      </div>
      <div class="review-card-body">${body}</div>
    </div>`;
}

// محتوى التصحيح فقط (الصورة، الاختيارات، الشرح) — مستعمل داخل قائمة النتائج
export const reviewBody = (q, catMap) => reviewParts(q, catMap).body;

// حلقة النتيجة (نفس نمط حلقة الجاهزية في اللوحة)
const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;
function scoreRing(correct, total, tone) {
  const v = total ? correct / total : 0;
  return html`
    <div class="rd-ring rd-${tone} res-ring" role="img" aria-label="${t('results.score')}: ${correct}/${total}">
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <defs><linearGradient id="rd-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="rd-stop-a"/><stop offset="1" class="rd-stop-b"/></linearGradient></defs>
        <circle class="rd-track" cx="64" cy="64" r="${RING_R}"/>
        <circle class="rd-arc" cx="64" cy="64" r="${RING_R}" stroke="url(#rd-grad)" stroke-dasharray="${RING_C.toFixed(1)}" style="--rd-off:${(RING_C * (1 - v)).toFixed(1)};--rd-full:${RING_C.toFixed(1)}"/>
      </svg>
      <div class="rd-ring-label"><strong>${correct}<span>/${total}</span></strong><small>${Math.round(v * 100)}%</small></div>
    </div>`;
}

export async function resultsView(root, { params }) {
  root.innerHTML = loading().s;

  let attempt, cats;
  try {
    [attempt, cats] = await Promise.all([api.get(`/attempts/${params.id}`), store.getCategories()]);
  } catch (e) {
    root.innerHTML = html`<div class="pg pg-narrow"><div class="card empty"><p>${errorMessage(e)}</p></div></div>`.s;
    return;
  }
  if (!attempt.finishedAt) return navigate(`/quiz/${attempt.id}`, { replace: true });

  const catMap = new Map(cats.map((c) => [c.id, c]));
  const { questions, passed, mode, passMark } = attempt;
  const total = questions.length;
  const statusOf = (q) => (q.answer?.isCorrect === true ? 'ok' : q.answer ? 'ko' : 'skip');
  const correct = questions.filter((q) => statusOf(q) === 'ok').length;
  const wrong = questions.filter((q) => statusOf(q) === 'ko').length;
  const skipped = total - correct - wrong;
  const missed = wrong + skipped;

  // الحكم: ناجح / راسب عند وجود عتبة، وإلا حسب النسبة (تمرين بدون عتبة)
  const ratio = total ? correct / total : 0;
  const tone = passed === true ? 'good' : passed === false ? (passMark && correct >= passMark - 4 ? 'mid' : 'low') : ratio >= 0.8 ? 'good' : ratio >= 0.5 ? 'mid' : 'low';
  const title = passed === true ? t('results.passed') : passed === false ? t('results.failed') : t('results.done');
  const cheer = passed === true ? t('results.cheerPass')
    : passed === false ? (tone === 'mid' ? t('results.cheerClose', { n: passMark - correct }) : t('results.cheerFail'))
      : missed === 0 ? t('results.cheerPerfect') : t('results.cheerPractice', { n: missed });

  const byCat = cats.map((c) => {
    const qs = questions.filter((q) => q.categoryId === c.id);
    const ok = qs.filter((q) => statusOf(q) === 'ok').length;
    return { c, total: qs.length, ok, p: qs.length ? Math.round((100 * ok) / qs.length) : 0 };
  }).filter((x) => x.total);

  root.innerHTML = html`
    <div class="pg pg-narrow res">
      <section class="card res-hero res-${tone}">
        ${scoreRing(correct, total, tone)}
        <div class="res-hero-text">
          <span class="dash-eyebrow">${mode === 'exam' ? t('results.examMode') : attempt.seriesTitle || t('results.score')}</span>
          <h1 class="res-title">${title}</h1>
          <p class="res-cheer">${cheer}</p>
          ${passMark ? html`<p class="small muted" style="margin:0">${t('results.passMark', { n: `${passMark}/${total}` })}</p>` : ''}
        </div>
        <div class="res-counts">
          <div class="res-count is-ok"><strong>${correct}</strong><small>${t('results.correct')}</small></div>
          <div class="res-count is-ko"><strong>${wrong}</strong><small>${t('results.wrong')}</small></div>
          <div class="res-count"><strong>${skipped}</strong><small>${t('results.skipped')}</small></div>
        </div>
      </section>

      <div class="res-actions">
        ${missed ? html`<button class="btn btn-primary" id="only-wrong">${t('results.reviewOnlyWrong', { n: missed })}</button>` : ''}
        <button class="btn btn-secondary" id="retry">${t('results.retry')}</button>
        <a class="btn btn-secondary" href="/dashboard">${t('results.dashboard')}</a>
      </div>

      ${byCat.length > 1 ? html`<section>
        <h2 class="dash-h">${t('results.byCategory')}</h2>
        <div class="card dash-list">
          ${byCat.map(({ c, total: n, ok, p }) => html`<div class="cat-row">
            <span class="cat-icon" aria-hidden="true">${c.icon}</span>
            <div class="cat-body">
              <div class="cat-head"><strong>${catName(c)}</strong><span class="muted small">${ok}/${n}</span></div>
              <div class="cat-bar ${p >= 80 ? 'bar-good' : p < 50 ? 'bar-low' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}" aria-label="${catName(c)}"><i style="width:${p}%"></i></div>
            </div>
          </div>`)}
        </div>
      </section>` : ''}

      <section id="review-section">
        <div class="dash-h-row res-review-head">
          <h2 class="dash-h">${t('results.review')}</h2>
          <div class="seg" role="group" aria-label="${t('results.filter')}">
            <button type="button" data-filter="all" aria-pressed="true">${t('results.showAll')}</button>
            <button type="button" data-filter="wrong" aria-pressed="false">${t('results.showWrong')}</button>
            <button type="button" data-filter="correct" aria-pressed="false">${t('results.showCorrect')}</button>
          </div>
        </div>
        <div id="review-list"></div>
      </section>
    </div>`.s;

  // ── قائمة التصحيح: صف لكل سؤال يتوسع لعرض الجواب الصحيح والشرح ──
  const list = root.querySelector('#review-list');
  let filter = 'all';
  const MARK = { ok: '✓', ko: '✕', skip: '–' };
  const LABEL = { ok: t('results.correct'), ko: t('results.wrong'), skip: t('results.skipped') };

  function renderReview() {
    const shown = questions.map((q, i) => ({ q, i, st: statusOf(q) }))
      .filter(({ st }) => filter === 'all' || (filter === 'correct' ? st === 'ok' : st !== 'ok'));
    if (!shown.length) { list.innerHTML = html`<div class="card empty"><p>${t('results.noItems')}</p></div>`.s; return; }
    list.innerHTML = html`<div class="card dash-list">
      ${shown.map(({ q, i, st }) => html`<details class="acc" data-i="${i}">
        <summary>
          <span class="acc-mark is-${st}" aria-hidden="true">${MARK[st]}</span>
          <span class="acc-text"><small>${t('quiz.qn', { n: i + 1 })} · <span class="sr-only">${LABEL[st]} · </span>${catMap.get(q.categoryId) ? catName(catMap.get(q.categoryId)) : ''}</small><strong>${q.text}</strong></span>
          <span class="row-chevron acc-chevron">${raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>')}</span>
        </summary>
        <div class="acc-body"></div>
      </details>`)}
    </div>`.s;
    // المحتوى (والصورة) يُحمَّل عند أول فتح فقط
    list.querySelectorAll('details.acc').forEach((d) => d.addEventListener('toggle', () => {
      const body = d.querySelector('.acc-body');
      if (d.open && !body.firstChild) body.innerHTML = reviewBody(questions[Number(d.dataset.i)], catMap).s;
    }));
  }

  function setFilter(f) {
    filter = f;
    root.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === f)));
    renderReview();
  }
  root.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => setFilter(b.dataset.filter)));

  const ow = root.querySelector('#only-wrong');
  if (ow) ow.onclick = () => {
    setFilter('wrong');
    const first = list.querySelector('details.acc');
    if (first) first.open = true;
    root.querySelector('#review-section').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  };

  // إعادة نفس النوع من الجلسة (نفس السلسلة / المحور / الامتحان)
  const retry = root.querySelector('#retry');
  retry.onclick = async () => {
    retry.disabled = true;
    try {
      const body = { mode: attempt.mode, practice: attempt.practice };
      if (attempt.seriesId) body.seriesId = attempt.seriesId;
      if (attempt.categoryId) body.categoryId = attempt.categoryId;
      const r = await api.post('/attempts', body);
      navigate(`/quiz/${r.id}`);
    } catch (e) { toast(e.code === 'no_questions' ? t('err.no_questions') : errorMessage(e), 'error'); retry.disabled = false; }
  };

  renderReview();
}
