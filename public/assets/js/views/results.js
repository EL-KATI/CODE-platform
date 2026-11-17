// صفحة النتائج — تعرض الحكم (ناجح/راسب) + تفاصيل الأداء + مراجعة الأسئلة
import { html, raw, loading, toast, errorMessage } from '../ui.js';
import { t, catName } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { questionCardHtml } from './questionCard.js';

// ── بناء اختيارات المترشح من كائن الإجابة ─────────────────────────────────
function buildSelected(q) {
  const ans = q.answer;
  if (!ans) return { selected: [], selectedDouble: null };
  if (q.is_double && Array.isArray(q.sub_questions)) {
    return {
      selected: [],
      selectedDouble: {
        a: ans.selected_double?.a || [],
        b: ans.selected_double?.b || [],
      },
    };
  }
  return { selected: ans.selected || [], selectedDouble: null };
}

// بطاقة مراجعة كاملة بتصميم NARSA الموحّد (مستعملة في «أخطائي»)
export function reviewItem(q, originalIdx, catMap) {
  const ok = q.answer?.isCorrect === true;
  const c = catMap?.get(q.categoryId);
  const { selected, selectedDouble } = buildSelected(q);
  const cardHtml = questionCardHtml(q, {
    selected,
    selectedDouble,
    showAnswer: true,
    isCorrect: q.answer?.isCorrect ?? null,
  });
  return html`
    <div class="review-card ${ok ? 'rc-ok' : 'rc-ko'}">
      <div class="review-card-header">
        ${originalIdx != null ? html`<span class="q-number" style="font-size:.85rem">${t('quiz.qn', { n: originalIdx + 1 })}</span>` : ''}
        ${c ? html`<span class="pill" style="font-size:.74rem">${c.icon} ${catName(c)}</span>` : ''}
        <span class="${ok ? 'review-verdict-ok' : 'review-verdict-ko'}">${ok ? '✓' : '✗'}</span>
      </div>
      <div class="review-card-body">${raw(cardHtml)}</div>
    </div>`;
}

// محتوى التصحيح فقط — مستعمل داخل قائمة النتائج (accordion)
export function reviewBody(q, catMap) {
  const { selected, selectedDouble } = buildSelected(q);
  return raw(questionCardHtml(q, {
    selected,
    selectedDouble,
    showAnswer: true,
    isCorrect: q.answer?.isCorrect ?? null,
  }));
}

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

// ── رسائل التحفيز والتهنئة حسب نقطة الامتحان (40 سؤال) ───────────────────────
function examScoreFeedback(correct, total) {
  if (total < 35) return null; // تُطبَّق فقط على الامتحانات الكاملة (≥35 سؤال)
  if (correct < 32) {
    return {
      tone  : 'low',
      emoji : '💪',
      title : t('results.sf.low.title'),
      body  : t('results.sf.low.body', { n: correct, total }),
    };
  }
  if (correct <= 35) {
    return {
      tone  : 'mid',
      emoji : '🎯',
      title : t('results.sf.mid.title'),
      body  : t('results.sf.mid.body', { n: correct, total }),
    };
  }
  return {
    tone  : 'high',
    emoji : '🏆',
    title : t('results.sf.high.title'),
    body  : t('results.sf.high.body', { n: correct, total }),
  };
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

  // رسالة التحفيز الخاصة بالامتحان (40 سؤال)
  const sf = mode === 'exam' ? examScoreFeedback(correct, total) : null;

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

      ${sf ? html`<section class="score-feedback sf-${sf.tone}" role="status" aria-live="polite">
        <span class="sf-emoji" aria-hidden="true">${sf.emoji}</span>
        <div class="sf-text">
          <strong class="sf-title">${sf.title}</strong>
          <p class="sf-body">${sf.body}</p>
        </div>
      </section>` : ''}

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

      <!-- شريط التلوين الذكي حسب نسبة الخطأ -->
      <section class="card res-error-map">
        <h2 class="dash-h">${t('results.errorMap')}</h2>
        <p class="small muted">${t('results.errorMapDesc')}</p>
        <div class="err-dots-wrap" role="list" aria-label="${t('results.errorMap')}">
          ${questions.map((q, i) => {
            const st = statusOf(q);
            if (st === 'skip') return html`<span class="err-dot skip" title="${t('quiz.qn', { n: i + 1 })} · ${t('results.skipped')}" role="listitem" data-i="${i}"></span>`.s;
            const isCorrect = st === 'ok';
            const er = typeof q.errorRate === 'number' ? q.errorRate : null;
            // الأخضر: أجاب صح
            // الأحمر: أجاب خطأ وخطأ المنصة ≥ 50% (سؤال صعب لكنه أخطأ)
            // البرتقالي: أجاب خطأ وخطأ المنصة < 50%
            let dotCls = 'err-dot';
            if (isCorrect) dotCls += ' ok';
            else if (er === null || er >= 50) dotCls += ' hard';
            else dotCls += ' med';
            const tip = isCorrect
              ? t('results.dotOk')
              : er !== null ? t('results.dotErr', { n: er }) : t('results.dotWrong');
            return html`<span class="${dotCls}" title="${t('quiz.qn', { n: i + 1 })} · ${tip}" role="listitem" data-i="${i}"></span>`.s;
          }).join('')}
        </div>
        <div class="err-legend">
          <span class="err-legend-item"><i class="err-dot ok"></i> ${t('results.legendOk')}</span>
          <span class="err-legend-item"><i class="err-dot med"></i> ${t('results.legendMed')}</span>
          <span class="err-legend-item"><i class="err-dot hard"></i> ${t('results.legendHard')}</span>
        </div>
      </section>

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

  // النقر على نقطة التلوين → يفتح السؤال مباشرة
  root.querySelectorAll('.err-dot[data-i]').forEach((dot) => {
    dot.style.cursor = 'pointer';
    dot.addEventListener('click', () => {
      setFilter('all');
      requestAnimationFrame(() => {
        const idx = Number(dot.dataset.i);
        const details = root.querySelectorAll('#review-list details.acc');
        const target = Array.from(details).find(d => Number(d.dataset.i) === idx);
        if (target) { target.open = true; target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      });
    });
  });

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
