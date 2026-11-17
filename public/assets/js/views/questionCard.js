/**
 * questionCard.js — مكوّن عرض السؤال الموحّد
 *
 * يُستخدم في:
 *  - معاينة الأسئلة في لوحة الأدمن / المدرسة (showQuestionCard)
 *  - تحرير السؤال (معاينة مباشرة)
 *
 * نفس تصميم NARSA المستخدم في quiz.js:
 *  - صورة/وسائط فوق
 *  - لوحة سوداء بالنص والخيارات تحت
 *  - ألوان صح/خطأ بالأخضر والأحمر
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

/**
 * يُولّد HTML كامل لبطاقة السؤال بتصميم NARSA.
 *
 * @param {object} q         — كائن السؤال
 * @param {object} [opts]
 * @param {number[]} [opts.selected]       — الاختيارات المحددة حالياً (للمعاينة التفاعلية)
 * @param {boolean} [opts.showAnswer]      — إظهار الإجابة الصحيحة بالألوان
 * @param {boolean} [opts.isCorrect]       — نتيجة الإجابة (للتمرين)
 * @returns {string}
 */
export function questionCardHtml(q, { selected = [], showAnswer = false, isCorrect = null } = {}) {
  const selSet = new Set(selected);
  const isDouble = q.is_double && Array.isArray(q.sub_questions) && q.sub_questions.length === 2;

  // ── الوسائط ──────────────────────────────────────────────────────
  let mediaHtml;
  const vidEl = videoBlock(q);
  if (vidEl) {
    mediaHtml = `<div class="qcard-media has-video">${vidEl}</div>`;
  } else if (q.image || q.visual) {
    mediaHtml = `<div class="qcard-media"><div class="nrs-img-wrap">${renderVisual(q)}</div></div>`;
  } else {
    mediaHtml = `<div class="qcard-media qcard-media--empty"><span aria-hidden="true">🚗</span></div>`;
  }

  // ── لوحة النص (سوداء) ────────────────────────────────────────────
  let textHtml = '';

  if (isDouble) {
    const flat = (x) => String(x || '').replace(/[\s؟?:.-]+/g, '');
    let mainText = String(q.text || '').split('\n')[0].trim();
    if (flat(mainText) === flat(q.sub_questions[0].text)) mainText = '';

    if (mainText) textHtml += `<div class="nrs-q-main" dir="rtl">${esc(mainText)}</div>`;
    textHtml += '<div class="nrs-block" dir="rtl">';

    q.sub_questions.forEach((sq, si) => {
      const corr = new Set(norm(sq.correct));
      const labels = (sq.options || []).map(optText);
      const inline = labels.every((l) => l.length <= 14);
      textHtml += `<div class="nrs-sub-label" dir="rtl">${esc(sq.text)}</div>`;
      textHtml += `<div class="${inline ? 'nrs-opts-row' : 'nrs-opts-list'}">`;
      labels.forEach((lbl, i) => {
        const absN = i + 1 + si * 2;
        const localN = i + 1;
        const isSel = selSet.has(absN);
        let state = '';
        if (showAnswer) {
          if (corr.has(localN)) state = 'sub-ok';
          else if (isSel) state = 'sub-wrong';
        } else if (isSel) state = 'sub-on';
        textHtml += optHtml(absN, lbl, state);
      });
      textHtml += '</div>';
    });
    textHtml += '</div>';
  } else {
    const correct = new Set(norm(q.correct));
    textHtml += `<div class="nrs-q-main" dir="rtl">${esc(q.text || '')}</div>`;
    textHtml += '<div class="nrs-block" dir="rtl"><div class="nrs-opts-list">';
    (q.options || []).forEach((o, i) => {
      const n = i + 1;
      const isSel = selSet.has(n);
      let state = '';
      if (showAnswer) {
        if (correct.has(n)) state = 'sub-ok';
        else if (isSel) state = 'sub-wrong';
      } else if (isSel) state = 'sub-on';
      textHtml += optHtml(n, optText(o), state);
    });
    textHtml += '</div></div>';
  }

  // سطر التصحيح (بعد الإجابة في وضع التمرين)
  if (showAnswer && isCorrect !== null) {
    const correctNums = isDouble
      ? q.sub_questions.flatMap((sq, si) => norm(sq.correct).map((n) => n + si * 2))
      : norm(q.correct);
    const nums = correctNums.sort((a, b) => a - b).join('، ');
    textHtml += `<div class="nrs-fb ${isCorrect ? 'is-ok' : 'is-ko'}">
      ${isCorrect ? '✓ إجابة صحيحة' : `✗ إجابة خاطئة${nums ? ` — الجواب الصحيح: ${nums}` : ''}`}
    </div>`;
    if (q.explanation) {
      textHtml += `<div class="nrs-fb-text">${esc(q.explanation)}</div>`;
    }
  }

  // ── البطاقة الكاملة ──────────────────────────────────────────────
  const metaHtml = q.id
    ? `<div class="qcard-meta">
        <span class="qcard-id">#${q.id}</span>
        ${q.category_name ? `<span class="qcard-cat">${esc(q.category_name)}</span>` : ''}
        ${q.is_double ? '<span class="qcard-badge">مزدوج</span>' : ''}
      </div>`
    : '';

  return `<div class="qcard">
    ${metaHtml}
    <div class="qcard-body">
      ${mediaHtml}
      <div class="nrs-text-panel${showAnswer && isCorrect !== null ? ' has-result' : ''}">${textHtml}</div>
    </div>
    ${q.explanation && !showAnswer ? `<div class="qcard-explanation" dir="rtl">💡 ${esc(q.explanation)}</div>` : ''}
  </div>`;
}

/** إنشاء فيديو إن وجد (مستخلص من common.js) */
function videoBlock(q) {
  if (!q) return null;
  const url = q.video_file || q.videoFile || q.video_url || q.videoUrl;
  if (!url) return null;
  return `<video src="${esc(url)}" controls playsinline style="width:100%;height:100%;object-fit:cover"></video>`;
}

/**
 * يفتح modal معاينة السؤال بتصميم NARSA الموحد.
 * يستبدل openPreviewModal + showQuestionPreview في admin.js
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
        ${questionCardHtml(q, { showAnswer: true })}
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('#qcard-close').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  // إغلاق بـ Escape
  const onKey = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
}

/**
 * يفتح modal معاينة سلسلة أسئلة بتصميم NARSA الموحد.
 * يستبدل showSeriesPreview في admin.js
 */
export function showSeriesCard(title, questions, total) {
  const existing = document.getElementById('qcard-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'qcard-modal';
  overlay.className = 'qcard-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const cardsHtml = questions.map((q) => questionCardHtml(q, { showAnswer: true })).join('');
  const footer = total > questions.length
    ? `<p class="qcard-series-more">... و${total - questions.length} سؤال آخر</p>`
    : '';

  overlay.innerHTML = `
    <div class="qcard-modal-wrap qcard-modal-wrap--wide">
      <div class="qcard-modal-head">
        <span class="qcard-modal-title">${esc(title)}</span>
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
