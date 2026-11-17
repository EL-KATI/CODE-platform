/**
 * questionCard.js — مكوّن عرض السؤال الموحّد (NARSA)
 *
 * يُستخدم في جميع الواجهات:
 *  - quiz.js          : رسم لوحة النص والوسائط أثناء الامتحان/التمرين
 *  - results.js       : مراجعة الأسئلة بعد الانتهاء
 *  - mistakes.js      : قائمة الأخطاء
 *  - admin.js         : معاينة الأسئلة في لوحة الإدارة
 *  - school.js        : معاينة الأسئلة في واجهة المدرسة
 *
 * الأوضاع المدعومة:
 *  - preview          : معاينة عادية — يظهر السؤال بالخيارات بدون تمييز صح/خطأ
 *  - answer           : يُظهر الإجابة الصحيحة ملوّنة (أخضر/أحمر) + نتيجة + شرح
 *  - review           : وضع المراجعة بعد الامتحان — يُظهر اختيار المتدرب + الصحيح
 */

import { renderVisual } from '../scenario.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const norm = (arr) =>
  (arr || []).map((c) =>
    typeof c === 'string' && c.startsWith('opt_')
      ? Number(c.replace('opt_', ''))
      : Number(c)
  ).filter(Boolean);

const optText = (o) => ((o && typeof o === 'object') ? (o.text || '') : String(o ?? ''));

/** سطر خيار بتصميم NARSA: [رقم] [خط] [نص] */
function optHtml(n, text, state = '') {
  return `<div class="nrs-opt ${state}">
    <span class="nrs-opt-n">${n}</span>
    <div class="nrs-opt-dots" aria-hidden="true"></div>
    <span class="nrs-opt-text">${esc(text)}</span>
  </div>`;
}

/** فيديو السؤال إن وُجد */
function videoBlock(q) {
  if (!q) return null;
  const url = q.video_file || q.videoFile || q.video_url || q.videoUrl;
  if (!url) return null;
  return `<video src="${esc(url)}" controls playsinline style="width:100%;height:100%;object-fit:cover"></video>`;
}

/**
 * يُولّد HTML كامل لبطاقة السؤال بتصميم NARSA الموحّد.
 *
 * @param {object} q         — كائن السؤال
 * @param {object} [opts]
 * @param {number[]}  [opts.selected]      — الاختيارات المُحدَّدة (وضع quiz أو review)
 * @param {object}    [opts.selectedDouble] — { a: number[], b: number[] } للسؤال المزدوج
 * @param {boolean}   [opts.showAnswer]    — إظهار الإجابة الصحيحة بالألوان
 * @param {boolean|null} [opts.isCorrect]  — نتيجة الإجابة (true/false/null)
 * @param {boolean}   [opts.showMeta]      — إظهار #id والفئة (للمعاينة الإدارية)
 * @returns {string}  — HTML string جاهز للإدراج
 */
export function questionCardHtml(q, {
  selected = [],
  selectedDouble = null,
  showAnswer = false,
  isCorrect = null,
  showMeta = false,
} = {}) {
  const selSet = new Set(selected);
  const isDouble = q.is_double && Array.isArray(q.sub_questions) && q.sub_questions.length === 2;

  // ── الوسائط (صورة / فيديو / فراغ) ────────────────────────────────
  const vidEl = videoBlock(q);
  let mediaHtml;
  if (vidEl) {
    mediaHtml = `<div class="qcard-media has-video">${vidEl}</div>`;
  } else if (q.image || q.visual) {
    mediaHtml = `<div class="qcard-media"><div class="nrs-img-wrap">${renderVisual(q)}</div></div>`;
  } else {
    mediaHtml = `<div class="qcard-media qcard-media--empty"><span aria-hidden="true">🚗</span></div>`;
  }

  // ── لوحة النص (الصندوق الأسود NARSA) ─────────────────────────────
  let textHtml = '';

  const getState = (isSelected, isCorrectOpt) => {
    if (!showAnswer) return isSelected ? 'sub-on' : '';
    if (isCorrectOpt) return 'sub-ok';
    if (isSelected) return 'sub-wrong';
    return '';
  };

  if (isDouble) {
    // السؤال المزدوج: سطر رئيسي + جزأين
    const flat = (x) => String(x || '').replace(/[\s؟?:.-]+/g, '');
    let mainText = String(q.text || '').split('\n')[0].trim();
    if (flat(mainText) === flat(q.sub_questions[0].text)) mainText = '';

    if (mainText) textHtml += `<div class="nrs-q-main" dir="rtl">${esc(mainText)}</div>`;
    textHtml += '<div class="nrs-block" dir="rtl">';

    const correctAll = [];
    q.sub_questions.forEach((sq, si) => {
      const corr = new Set(norm(sq.correct));
      const labels = (sq.options || []).map(optText);
      const inline = labels.every((l) => l.length <= 14);
      // اختيارات المزدوج: من selectedDouble أو selected flat
      const setsHere = selectedDouble
        ? new Set(selectedDouble[si === 0 ? 'a' : 'b'] || [])
        : new Set();

      textHtml += `<div class="nrs-sub-label" dir="rtl">${esc(sq.text)}</div>`;
      textHtml += `<div class="${inline ? 'nrs-opts-row' : 'nrs-opts-list'}">`;
      labels.forEach((lbl, i) => {
        const absN = i + 1 + si * 2;
        const localN = i + 1;
        const isSel = selSet.has(absN) || setsHere.has(localN);
        const isCorr = corr.has(localN);
        textHtml += optHtml(absN, lbl, getState(isSel, isCorr));
      });
      textHtml += '</div>';
      corr.forEach((n) => correctAll.push(n + si * 2));
    });
    textHtml += '</div>';

    if (showAnswer && isCorrect !== null) {
      const nums = correctAll.sort((a, b) => a - b).join('، ');
      textHtml += `<div class="nrs-fb ${isCorrect ? 'is-ok' : 'is-ko'}">
        ${isCorrect ? '✓ إجابة صحيحة' : `✗ إجابة خاطئة${nums ? ` — الجواب الصحيح: ${nums}` : ''}`}
      </div>`;
      if (q.explanation) textHtml += `<div class="nrs-fb-text">${esc(q.explanation)}</div>`;
    }
  } else {
    // السؤال العادي
    const correct = new Set(norm(q.correct));
    textHtml += `<div class="nrs-q-main" dir="rtl">${esc(q.text || '')}</div>`;
    textHtml += '<div class="nrs-block" dir="rtl"><div class="nrs-opts-list">';
    (q.options || []).forEach((o, i) => {
      const n = i + 1;
      const isSel = selSet.has(n);
      const isCorr = correct.has(n);
      textHtml += optHtml(n, optText(o), getState(isSel, isCorr));
    });
    textHtml += '</div></div>';

    if (showAnswer && isCorrect !== null) {
      const nums = [...correct].sort((a, b) => a - b).join('، ');
      textHtml += `<div class="nrs-fb ${isCorrect ? 'is-ok' : 'is-ko'}">
        ${isCorrect ? '✓ إجابة صحيحة' : `✗ إجابة خاطئة${nums ? ` — الجواب الصحيح: ${nums}` : ''}`}
      </div>`;
      if (q.explanation) textHtml += `<div class="nrs-fb-text">${esc(q.explanation)}</div>`;
    }
  }

  // ── البيانات الوصفية (للمعاينة الإدارية) ──────────────────────────
  const metaHtml = showMeta && q.id
    ? `<div class="qcard-meta">
        <span class="qcard-id">#${q.id}</span>
        ${q.category_name ? `<span class="qcard-cat">${esc(q.category_name)}</span>` : ''}
        ${q.is_double ? '<span class="qcard-badge">مزدوج</span>' : ''}
      </div>`
    : '';

  // شرح الإجابة (يظهر فقط في المعاينة الإدارية، ليس في وضع answer حيث يظهر داخل اللوحة السوداء)
  const explanationHtml = (showMeta && !showAnswer && q.explanation)
    ? `<div class="qcard-explanation" dir="rtl">💡 ${esc(q.explanation)}</div>`
    : '';

  return `<div class="qcard${showAnswer && isCorrect !== null ? ' has-result' : ''}">
    ${metaHtml}
    <div class="qcard-body${q.image || q.visual || videoBlock(q) ? ' has-media' : ''}">
      ${mediaHtml}
      <div class="nrs-text-panel${showAnswer && isCorrect !== null ? ' has-result' : ''}">${textHtml}</div>
    </div>
    ${explanationHtml}
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// دوال مساعدة لربط quiz.js بالمكوّن الموحّد
// ─────────────────────────────────────────────────────────────────────────────

/**
 * يرسم وسائط السؤال (صورة/فيديو) في عنصر DOM معطى.
 * يستبدل renderMedia() في quiz.js
 */
export function renderMediaInto(el, q) {
  if (!el) return;
  const vidEl = videoBlock(q);
  if (vidEl) {
    el.innerHTML = vidEl;
    el.classList.add('has-video');
  } else if (q.image || q.visual) {
    el.innerHTML = `<div class="nrs-img-wrap">${renderVisual(q)}</div>`;
    el.classList.remove('has-video');
  } else {
    el.innerHTML = `<div class="nrs-no-media"><span>🚗</span></div>`;
    el.classList.remove('has-video');
  }
}

/**
 * يرسم لوحة النص (الصندوق الأسود) في عنصر DOM معطى.
 * يستبدل renderTextPanel() في quiz.js
 *
 * @param {HTMLElement} el          — عنصر #nrs-text-panel
 * @param {object}      q           — السؤال الحالي
 * @param {boolean}     exam        — وضع الامتحان (بلا تصحيح فوري)
 * @param {Set|{a:Set,b:Set}} sel   — الاختيارات المحدّدة حالياً
 * @param {function}    onTranslate — callback لشريط الترجمة (اختياري)
 */
export function renderTextPanelInto(el, q, { exam = false, selected = null, onTranslate = null } = {}) {
  if (!el) return;
  const ans = q.answer;
  const isDouble = q.is_double && Array.isArray(q.sub_questions) && q.sub_questions.length === 2;
  const reveal = !exam && ans;

  el.classList.toggle('has-result', !!reveal);

  // بناء الاختيارات المحدّدة بشكل موحّد
  let selFlat = [];
  let selDbl = null;
  if (isDouble) {
    const sets = selected && typeof selected === 'object' && !selected.has
      ? selected  // { a: Set, b: Set }
      : { a: new Set(), b: new Set() };
    selDbl = { a: [...(sets.a || [])], b: [...(sets.b || [])] };
  } else {
    selFlat = selected ? [...selected] : [];
  }

  const isCorrect = reveal ? (ans.isCorrect ?? null) : null;

  // توليد HTML باستخدام المكوّن الموحّد
  const html = questionCardHtml(q, {
    selected: selFlat,
    selectedDouble: selDbl,
    showAnswer: !!reveal,
    isCorrect,
  });

  // استخراج محتوى اللوحة السوداء فقط (nrs-q-main + nrs-block + nrs-fb)
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const textPanel = temp.querySelector('.nrs-text-panel');
  el.innerHTML = textPanel ? textPanel.innerHTML : temp.querySelector('.qcard-body')?.innerHTML || html;

  // شريط الترجمة (اختياري)
  if (onTranslate) onTranslate(el, q.text || '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal المعاينة (للاستخدام في admin.js / school.js)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * يفتح modal معاينة سؤال واحد بتصميم NARSA الموحّد.
 */
export function showQuestionCard(q) {
  const existing = document.getElementById('qcard-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'qcard-modal';
  overlay.className = 'qcard-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `معاينة السؤال #${q.id || ''}`);

  overlay.innerHTML = `
    <div class="qcard-modal-wrap">
      <div class="qcard-modal-head">
        <span class="qcard-modal-title">معاينة السؤال${q.id ? ` #${q.id}` : ''}</span>
        <button class="qcard-modal-close" id="qcard-close" aria-label="إغلاق">✕</button>
      </div>
      <div class="qcard-modal-body">
        ${questionCardHtml(q, { showAnswer: true, showMeta: true })}
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('#qcard-close').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  const onKey = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
}

/**
 * يفتح modal معاينة سلسلة أسئلة بتصميم NARSA الموحّد.
 */
export function showSeriesCard(title, questions, total) {
  const existing = document.getElementById('qcard-modal');
  if (existing) existing.remove();

  const esc2 = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const overlay = document.createElement('div');
  overlay.id = 'qcard-modal';
  overlay.className = 'qcard-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const cardsHtml = questions.map((q) => questionCardHtml(q, { showAnswer: true, showMeta: true })).join('');
  const footer = total > questions.length
    ? `<p class="qcard-series-more">... و${total - questions.length} سؤال آخر</p>`
    : '';

  overlay.innerHTML = `
    <div class="qcard-modal-wrap qcard-modal-wrap--wide">
      <div class="qcard-modal-head">
        <span class="qcard-modal-title">${esc2(title)}</span>
        <button class="qcard-modal-close" id="qcard-close" aria-label="إغلاق">✕</button>
      </div>
      <div class="qcard-modal-body">
        ${cardsHtml}
        ${footer}
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('#qcard-close').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  const onKey = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
}
