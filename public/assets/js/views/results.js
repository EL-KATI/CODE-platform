// صفحة النتائج — تعرض الحكم (ناجح/راسب) + تفاصيل الأداء + مراجعة الأسئلة
import { html, raw, loading, toast, errorMessage } from '../ui.js';
import { t, catName } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { renderVisual } from '../scenario.js';

// ── دالة مشتركة: بطاقة مراجعة سؤال واحد (مُصدَّرة لـ mistakes.js) ──
export function reviewItem(q, originalIdx, catMap) {
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

  return html`
    <div class="review-card ${ok ? 'rc-ok' : 'rc-ko'}">
      <div class="review-card-header">
        ${originalIdx != null ? html`<span class="q-number" style="font-size:.85rem">${t('quiz.qn', { n: originalIdx + 1 })}</span>` : ''}
        ${c ? html`<span class="pill" style="font-size:.74rem">${c.icon} ${catName(c)}</span>` : ''}
        <span class="${ok ? 'review-verdict-ok' : 'review-verdict-ko'}">
          ${ok ? '✓' : '✗'}
        </span>
      </div>
      <div class="review-card-body">
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
          }).join('')}`
        : html`
          <p class="q-text" style="font-size:1.05rem" lang="ar" dir="rtl">${q.text}</p>
          <ul class="ans-list">${raw(reviewOptions(q.options, q.correct || [], ans?.selected || []))}</ul>`}
        ${q.explanation ? html`
          <div class="q-explain">
            <span class="q-explain-icon">💡</span>
            <span lang="ar" dir="rtl">${q.explanation}</span>
          </div>` : ''}
      </div>
    </div>`;
}

export async function resultsView(root, { params }) {
  root.innerHTML = loading().s;

  let attempt, cats;
  try {
    [attempt, cats] = await Promise.all([
      api.get(`/attempts/${params.id}`),
      store.getCategories(),
    ]);
  } catch (e) {
    root.innerHTML = html`<div class="page-wrap"><div class="empty-state">${errorMessage(e)}</div></div>`.s;
    return;
  }

  if (!attempt.finishedAt) return navigate(`/quiz/${attempt.id}`, { replace: true });

  const catMap = new Map(cats.map((c) => [c.id, c]));
  const { questions, score, passed, mode } = attempt;
  const total = questions.length;
  const correct = questions.filter((q) => q.answer?.isCorrect === true).length;
  const wrong = questions.filter((q) => q.answer?.isCorrect === false).length;
  const skipped = total - correct - wrong;
  const pct = Math.round((correct / total) * 100);

  // ── حساب النتائج حسب المحور ──────────────────────────────────────
  const byCategory = {};
  for (const q of questions) {
    const cid = q.categoryId;
    if (!byCategory[cid]) byCategory[cid] = { total: 0, correct: 0 };
    byCategory[cid].total++;
    if (q.answer?.isCorrect === true) byCategory[cid].correct++;
  }

  // ── البطاقة الرئيسية (الحكم) ─────────────────────────────────────
  const verdictCls = passed === true ? 'v-pass' : passed === false ? 'v-fail' : 'v-neutral';
  const verdictIcon = passed === true ? '🏆' : passed === false ? '📚' : '📊';
  const verdictLabel = passed === true ? t('results.passed') : passed === false ? t('results.failed') : t('results.done');

  root.innerHTML = html`
    <div class="page-wrap">

      <!-- ✦ بطاقة الحكم الرئيسية -->
      <div class="verdict-card ${verdictCls}">
        <div class="verdict-icon">${verdictIcon}</div>
        <div class="verdict-score-ring">
          <div class="verdict-score-inner">
            <span class="verdict-score-num">${pct}%</span>
            <span class="verdict-score-sub">${correct}/${total}</span>
          </div>
        </div>
        <div class="verdict-label">${verdictLabel}</div>
        ${mode === 'exam' ? html`<div class="verdict-info">${t('results.examMode')}</div>` : ''}
      </div>

      <!-- ✦ ملخص سريع -->
      <div class="results-summary">
        <div class="summary-item summary-ok">
          <span class="summary-num">${correct}</span>
          <span class="summary-lbl">✓ ${t('results.correct')}</span>
        </div>
        <div class="summary-item summary-ko">
          <span class="summary-num">${wrong}</span>
          <span class="summary-lbl">✗ ${t('results.wrong')}</span>
        </div>
        ${skipped > 0 ? html`
        <div class="summary-item summary-skip">
          <span class="summary-num">${skipped}</span>
          <span class="summary-lbl">— ${t('results.skipped')}</span>
        </div>` : ''}
        ${score != null ? html`
        <div class="summary-item summary-score">
          <span class="summary-num">${score}</span>
          <span class="summary-lbl">🎯 ${t('results.score')}</span>
        </div>` : ''}
      </div>

      <!-- ✦ النتائج حسب المحور -->
      <section>
        <h2 class="section-title">${t('results.byCategory')}</h2>
        <div class="cat-results-grid">
          ${cats.filter((c) => byCategory[c.id]).map((c) => {
            const r = byCategory[c.id] || { total: 0, correct: 0 };
            const p = r.total ? Math.round((r.correct / r.total) * 100) : 0;
            const cls = p >= 75 ? 'cat-ok' : p >= 50 ? 'cat-mid' : 'cat-ko';
            return html`
              <div class="cat-result-row ${cls}">
                <div class="cat-result-info">
                  <span class="cat-result-icon">${c.icon}</span>
                  <span class="cat-result-name">${catName(c)}</span>
                  <span class="cat-result-pct">${p}%</span>
                </div>
                <div class="cat-result-track">
                  <div class="cat-result-bar" style="width:${p}%"></div>
                </div>
                <span class="cat-result-detail">${r.correct}/${r.total}</span>
              </div>`;
          }).join('')}
        </div>
      </section>

      <!-- ✦ أزرار الإجراءات -->
      <div class="results-actions">
        <button class="btn btn-secondary" id="retry">🔄 ${t('results.retry')}</button>
        <button class="btn btn-primary" id="new">✨ ${t('results.newSession')}</button>
        <button class="btn btn-ghost" id="dash">🏠 ${t('results.dashboard')}</button>
      </div>

      <!-- ✦ مراجعة الأسئلة -->
      <section id="review-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
          <h2 class="section-title" style="margin:0">${t('results.review')}</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm filter-btn active" data-filter="all">${t('results.showAll')}</button>
            <button class="btn btn-ghost btn-sm filter-btn" data-filter="wrong" style="color:var(--danger)">✗ ${t('results.showWrong')}</button>
            <button class="btn btn-ghost btn-sm filter-btn" data-filter="correct" style="color:var(--success)">✓ ${t('results.showCorrect')}</button>
          </div>
        </div>
        <div id="review-list"></div>
      </section>

    </div>`.s;

  // ── أزرار الإجراءات ───────────────────────────────────────────────
  root.querySelector('#retry').onclick = async () => {
    try {
      const r = await api.post('/attempts', {
        categoryIds: attempt.categoryIds,
        mode: attempt.mode,
        count: total,
      });
      navigate(`/quiz/${r.id}`);
    } catch (e) { toast(errorMessage(e), 'error'); }
  };
  root.querySelector('#new').onclick = () => navigate('/practice');
  root.querySelector('#dash').onclick = () => navigate('/dashboard');

  // ── فلاتر المراجعة ────────────────────────────────────────────────
  let currentFilter = 'all';
  root.querySelectorAll('.filter-btn').forEach((b) => {
    b.onclick = () => {
      currentFilter = b.dataset.filter;
      root.querySelectorAll('.filter-btn').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      renderReview();
    };
  });

  // ── رسم مراجعة الأسئلة ───────────────────────────────────────────
  function renderReview() {
    const list = root.querySelector('#review-list');
    const filtered = questions.filter((q) => {
      if (currentFilter === 'correct') return q.answer?.isCorrect === true;
      if (currentFilter === 'wrong') return q.answer?.isCorrect !== true;
      return true;
    });

    if (!filtered.length) {
      list.innerHTML = html`<div class="empty-state" style="padding:32px">${t('results.noItems')}</div>`.s;
      return;
    }

    list.innerHTML = filtered.map((q) => {
      const originalIdx = questions.indexOf(q);
      return reviewItem(q, originalIdx, catMap);
    }).join('');
  }

  renderReview();
}
