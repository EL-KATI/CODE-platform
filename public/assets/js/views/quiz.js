// واجهة الامتحان — تصميم NARSA الرسمي
// لوحة زرقاء يسار | شاشة وسائط + نص يمين | شريط سفلي
import { html, raw, loading, toast, errorMessage, sound, speak, stopSpeaking, autoRead, confirmDialog } from '../ui.js';
import { t, catName } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { renderVisual } from '../scenario.js';
import { modeLabel, videoBlock, speechText } from './common.js';

export async function quizView(appRoot, { params }) {
  appRoot.innerHTML = loading().s;
  let a;
  try { a = await api.get(`/attempts/${params.id}`); } catch { return navigate('/dashboard', { replace: true }); }
  if (a.finishedAt) return navigate(`/results/${a.id}`, { replace: true });
  const cats = new Map((await store.getCategories()).map((c) => [c.id, c]));
  const live = document.getElementById('live');

  // ── نافذة ملء الشاشة ──
  appRoot.innerHTML = '';
  const overlay = document.createElement('div');
  overlay.className = 'nrs-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  document.body.appendChild(overlay);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const exam = !a.practice;
  let idx = Math.max(0, a.questions.findIndex((q) => !q.answer));
  if (a.questions.every((q) => q.answer)) idx = a.questions.length - 1;
  let selected = new Set();
  let busy = false;
  let timer = null;
  let remaining = 0;
  let shownAt = Date.now();
  let finished = false;
  let reading = autoRead.get();

  const q = () => a.questions[idx];
  const answeredCount = () => a.questions.filter((x) => x.answer).length;
  const norm = (arr) => (arr || []).map((c) => (typeof c === 'string' && c.startsWith('opt_') ? Number(c.replace('opt_', '')) : Number(c))).filter(Boolean);

  // ── الهيكل الرئيسي: نمط NARSA ──────────────────────────────────────
  function layout() {
    overlay.innerHTML = `
      <div class="nrs-window">

        <!-- ══ الشاشة الرئيسية (يمين/فوق) ══ -->
        <div class="nrs-main">
          <!-- منطقة الوسائط: صورة أو فيديو -->
          <div class="nrs-media" id="nrs-media"></div>

          <!-- شريط النص الأسود (السؤال والخيارات) -->
          <div class="nrs-text-panel" id="nrs-text-panel"></div>
        </div>

        <!-- ══ اللوحة الجانبية الزرقاء (يسار) ══ -->
        <aside class="nrs-side">

          <!-- مؤشرات الأسئلة (مربعات الأعلى) -->
          <div class="nrs-indicators" id="nrs-indicators"></div>

          <!-- زر تصحيح -->
          <button class="nrs-btn-correct" id="btn-correct" type="button">تصحيح</button>

          <!-- أزرار الاختيار 1-4 -->
          <div class="nrs-choices" id="nrs-choices"></div>

          <!-- زر موافق -->
          <button class="nrs-btn-ok" id="btn-ok" type="button">موافق</button>

          <!-- زر إغلاق خفي -->
          <button class="nrs-btn-close" id="nrs-close" type="button" title="${t('quiz.close')}">✕</button>
        </aside>

        <!-- ══ الشريط السفلي ══ -->
        <footer class="nrs-footer">
          <div class="nrs-footer-item">
            <span class="nrs-footer-label">صنف التكوين</span>
            <span class="nrs-footer-val" id="nrs-cat">${a.licenseCategory || store.user?.license_cat || 'B'}</span>
          </div>
          <div class="nrs-footer-item nrs-vol">
            <span class="nrs-footer-label">Volume</span>
            <div class="nrs-vol-dots" id="nrs-vol">
              <button class="nrs-vol-dot" data-v="0" title="صامت">○</button>
              <button class="nrs-vol-dot" data-v="1" title="منخفض">○</button>
              <button class="nrs-vol-dot on" data-v="2" title="عالٍ">●</button>
            </div>
          </div>
          <div class="nrs-footer-item">
            <span class="nrs-footer-label">سؤال</span>
            <span class="nrs-footer-val" id="nrs-counter">1/${a.questions.length}</span>
          </div>
          <div class="nrs-footer-item ${exam ? 'nrs-timer-wrap' : ''}">
            <span class="nrs-footer-label">الوقت المتبقي</span>
            <span class="nrs-footer-val nrs-timer-val" id="nrs-timer">30</span>
          </div>
        </footer>
      </div>`;

    // أحداث الأزرار الثابتة
    overlay.querySelector('#nrs-close').onclick = async () => {
      if (exam && !finished && !(await confirmDialog(t('quiz.closeConfirm'), { okLabel: t('quiz.close') }))) return;
      navigate(exam ? '/exam' : '/practice');
    };

    overlay.querySelector('#btn-ok').onclick = () => {
      if (q().answer) next(); else validate();
    };

    overlay.querySelector('#btn-correct').onclick = async () => {
      if (exam) {
        const left = a.questions.length - answeredCount();
        if (left > 0 && !(await confirmDialog(t('quiz.confirmFinish', { n: left }), { okLabel: t('quiz.finish') }))) return;
        finish();
      } else {
        // في وضع التدريب: انتقل للأسئلة المجابة
        const first = a.questions.findIndex((x) => x.answer);
        if (first !== -1) go(first);
      }
    };

    // أزرار الصوت
    overlay.querySelectorAll('.nrs-vol-dot').forEach((b) => {
      b.onclick = () => {
        overlay.querySelectorAll('.nrs-vol-dot').forEach((d) => { d.textContent = '○'; d.classList.remove('on'); });
        b.textContent = '●'; b.classList.add('on');
        const v = Number(b.dataset.v);
        sound.setVolume?.(v / 2);
        if (v > 0 && reading) speak(speechText(q(), idx + 1), { silent: true });
      };
    });
  }

  // ── رسم مؤشرات الأسئلة (مربعات الأعلى) ──────────────────────────
  function renderIndicators() {
    const el = overlay.querySelector('#nrs-indicators');
    if (!el) return;
    el.innerHTML = a.questions.map((qst, i) => {
      let cls = 'nrs-ind';
      if (i === idx) cls += ' nrs-ind-cur';
      else if (qst.answer) {
        const ok = qst.answer.isCorrect;
        cls += ok === false ? ' nrs-ind-wrong' : ok === true ? ' nrs-ind-ok' : ' nrs-ind-done';
      }
      return `<button class="${cls}" data-i="${i}" title="سؤال ${i + 1}">${i + 1}</button>`;
    }).join('');
    el.querySelectorAll('.nrs-ind').forEach((b) => {
      b.onclick = () => { if (!exam || q().answer) go(Number(b.dataset.i)); };
    });
  }

  // ── رسم أزرار الاختيار (اليسار) ──────────────────────────────────
  function renderChoices() {
    const el = overlay.querySelector('#nrs-choices');
    if (!el) return;
    const cur = q();
    const ans = cur.answer;
    const isDouble = cur.is_double && Array.isArray(cur.sub_questions) && cur.sub_questions.length === 2;

    if (isDouble) {
      // 4 أزرار: 1,2 للسؤال أ / 3,4 للسؤال ب
      const selA = selected.a || new Set();
      const selB = selected.b || new Set();
      const corrA = new Set(norm(cur.sub_questions[0].correct));
      const corrB = new Set(norm(cur.sub_questions[1].correct));
      el.innerHTML = [
        { n: 1, pre: 'a', set: selA, corr: corrA },
        { n: 2, pre: 'a', set: selA, corr: corrA },
        { n: 3, pre: 'b', set: selB, corr: corrB },
        { n: 4, pre: 'b', set: selB, corr: corrB },
      ].map(({ n, pre, set, corr }) => {
        const localN = pre === 'a' ? n : n - 2;
        const pressed = set.has(localN);
        let cls = 'nrs-choice-btn';
        if (ans) {
          if (corr.has(localN)) cls += ' choice-correct';
          else if (set.has(localN)) cls += ' choice-wrong';
        } else if (pressed) cls += ' choice-on';
        const sep = n === 3 ? ' nrs-choice-sep' : '';
        return `<button class="${cls}${sep}" data-prefix="${pre}" data-n="${localN}" data-abs="${n}" ${ans ? 'disabled' : ''}><span class="nrs-choice-num">${n}</span><span class="nrs-choice-sq"></span></button>`;
      }).join('');
    } else {
      const correct = new Set(norm(cur.correct));
      const count = cur.options?.length || 4;
      el.innerHTML = Array.from({ length: count }, (_, i) => {
        const n = i + 1;
        const pressed = selected.has(n);
        let cls = 'nrs-choice-btn';
        if (ans) {
          if (correct.has(n)) cls += ' choice-correct';
          else if (pressed) cls += ' choice-wrong';
        } else if (pressed) cls += ' choice-on';
        return `<button class="${cls}" data-n="${n}" ${ans ? 'disabled' : ''}><span class="nrs-choice-num">${n}</span><span class="nrs-choice-sq"></span></button>`;
      }).join('');
    }

    el.querySelectorAll('.nrs-choice-btn:not([disabled])').forEach((b) => {
      b.onclick = () => {
        const n = Number(b.dataset.n);
        const pre = b.dataset.prefix;
        if (pre) {
          const set = pre === 'a' ? selected.a : selected.b;
          if (set.has(n)) set.delete(n); else set.add(n);
          sound.play('click');
          syncChoices();
        } else {
          toggle(n);
        }
      };
    });
  }

  function syncChoices() {
    const cur = q();
    const isDouble = cur.is_double && Array.isArray(cur.sub_questions);
    overlay.querySelectorAll('.nrs-choice-btn:not([disabled])').forEach((b) => {
      const n = Number(b.dataset.n);
      const pre = b.dataset.prefix;
      let pressed;
      if (pre) {
        const set = pre === 'a' ? selected.a : selected.b;
        pressed = set.has(n);
      } else {
        pressed = selected.has(n);
      }
      b.classList.toggle('choice-on', pressed);
    });
    renderTextPanel(); // تحديث ☐/☑ في النص
  }

  // ── منطقة الوسائط ─────────────────────────────────────────────────
  function renderMedia() {
    const el = overlay.querySelector('#nrs-media');
    if (!el) return;
    const cur = q();
    const vidHtml = videoBlock(cur).s;
    if (vidHtml) {
      el.innerHTML = vidHtml;
      el.classList.add('has-video');
    } else if (cur.image || cur.visual) {
      el.innerHTML = `<div class="nrs-img-wrap">${renderVisual(cur)}</div>`;
      el.classList.remove('has-video');
    } else {
      el.innerHTML = `<div class="nrs-no-media"><span>🚗</span></div>`;
      el.classList.remove('has-video');
    }
  }

  // ── لوحة النص (الشريط الأسود) ────────────────────────────────────
  function renderTextPanel() {
    const el = overlay.querySelector('#nrs-text-panel');
    if (!el) return;
    const cur = q();
    const ans = cur.answer;
    const isDouble = cur.is_double && Array.isArray(cur.sub_questions) && cur.sub_questions.length === 2;
    const reveal = !exam && ans;

    if (isDouble) {
      const sq = cur.sub_questions;
      const corrA = new Set(norm(sq[0].correct));
      const corrB = new Set(norm(sq[1].correct));
      const selA = selected.a || new Set();
      const selB = selected.b || new Set();

      // نص السؤال الرئيسي
      let html2 = `<div class="nrs-q-main" dir="rtl">${esc(cur.text)}</div>`;

      // نعم / لا للأسئلة المزدوجة بناءً على options الفعلية
      const optLabels = (opts) => opts.map((o, i) => {
        const text = (o && typeof o === 'object') ? (o.text || '') : o;
        return text;
      });

      const labelsA = optLabels(sq[0].options);
      const labelsB = optLabels(sq[1].options);

      // حالة أ
      html2 += `<div class="nrs-sub-block" dir="rtl">`;
      html2 += `<div class="nrs-sub-label">-${esc(sq[0].text)}</div>`;
      html2 += `<div class="nrs-sub-opts">`;
      labelsA.forEach((lbl, i) => {
        const n = i + 1;
        const on = selA.has(n);
        const ok = reveal && corrA.has(n);
        const wrong = reveal && on && !corrA.has(n);
        html2 += `<span class="nrs-sub-opt ${ok ? 'sub-ok' : wrong ? 'sub-wrong' : on ? 'sub-on' : ''}">${n}- ${esc(lbl)}</span>`;
      });
      html2 += `</div></div>`;

      // حالة ب
      html2 += `<div class="nrs-sub-block" dir="rtl">`;
      html2 += `<div class="nrs-sub-label">-${esc(sq[1].text)}</div>`;
      html2 += `<div class="nrs-sub-opts">`;
      labelsB.forEach((lbl, i) => {
        const n = i + 1;
        const on = selB.has(n);
        const ok = reveal && corrB.has(n);
        const wrong = reveal && on && !corrB.has(n);
        html2 += `<span class="nrs-sub-opt ${ok ? 'sub-ok' : wrong ? 'sub-wrong' : on ? 'sub-on' : ''}">${n}- ${esc(lbl)}</span>`;
      });
      html2 += `</div></div>`;

      // تغذية راجعة
      if (reveal && ans) {
        const ok = ans.isCorrect;
        html2 += `<div class="nrs-feedback ${ok ? 'nrs-fb-ok' : 'nrs-fb-ko'}">${ok ? '✓ صحيح' : '✗ خطأ'}${cur.explanation ? ' — ' + esc(cur.explanation) : ''}</div>`;
      }

      el.innerHTML = html2;

    } else {
      const correct = new Set(norm(cur.correct));
      const opts = cur.options || [];
      let html2 = `<div class="nrs-q-main" dir="rtl">${esc(cur.text)}</div>`;
      html2 += `<div class="nrs-opts-list" dir="rtl">`;
      opts.forEach((o, i) => {
        const n = i + 1;
        const text = (o && typeof o === 'object') ? (o.text || '') : o;
        const on = selected.has(n);
        const ok = !exam && ans && correct.has(n);
        const wrong = !exam && ans && on && !correct.has(n);
        html2 += `<div class="nrs-opt ${ok ? 'sub-ok' : wrong ? 'sub-wrong' : on ? 'sub-on' : ''}">
          <span class="nrs-opt-n">${n}</span>
          <span class="nrs-opt-text">${esc(text)}</span>
        </div>`;
      });
      html2 += `</div>`;

      if (!exam && ans) {
        const ok = ans.isCorrect;
        html2 += `<div class="nrs-feedback ${ok ? 'nrs-fb-ok' : 'nrs-fb-ko'}">${ok ? '✓ إجابة صحيحة' : '✗ إجابة خاطئة — الصحيح: ' + [...correct].join(', ')}${cur.explanation ? '<br><small>' + esc(cur.explanation) + '</small>' : ''}</div>`;
      }

      el.innerHTML = html2;
    }
  }

  // ── تحديث الشريط السفلي ───────────────────────────────────────────
  function renderFooter() {
    const ctr = overlay.querySelector('#nrs-counter');
    if (ctr) ctr.textContent = `${idx + 1}/${a.questions.length}`;
  }

  // ── رسم السؤال كامل ──────────────────────────────────────────────
  function renderQuestion() {
    const cur = q();
    const ans = cur.answer;
    const isDouble = cur.is_double && Array.isArray(cur.sub_questions) && cur.sub_questions.length === 2;

    if (isDouble) {
      const saved = ans?.selected_double || { a: [], b: [] };
      selected = { a: new Set(saved.a), b: new Set(saved.b) };
    } else {
      selected = new Set(ans ? ans.selected : []);
    }

    renderMedia();
    renderTextPanel();
    renderChoices();
    renderIndicators();
    renderFooter();

    // تحديث حالة زر موافق
    const okBtn = overlay.querySelector('#btn-ok');
    if (okBtn) okBtn.textContent = ans ? (idx < a.questions.length - 1 ? 'التالي →' : '🏁 النتائج') : 'موافق';

    shownAt = Date.now();
    if (exam && !ans) startTimer();
    if (reading && !ans) speak(speechText(cur, idx + 1), { silent: true });
  }

  // ── مساعدات ──────────────────────────────────────────────────────
  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function toggle(n) {
    if (q().answer || n > (q().options?.length || 4)) return;
    if (selected.has(n)) selected.delete(n); else selected.add(n);
    sound.play('click');
    syncChoices();
    renderTextPanel();
  }

  async function validate({ timeout = false } = {}) {
    const cur = q();
    if (busy || cur.answer) return;
    const isDouble = cur.is_double && Array.isArray(cur.sub_questions) && cur.sub_questions.length === 2;
    const hasAnswer = isDouble ? (selected.a.size > 0 || selected.b.size > 0) : selected.size > 0;
    if (!hasAnswer && !timeout && !exam) { toast(t('quiz.pickOne')); return; }
    busy = true;
    stopTimer();
    stopSpeaking();
    try {
      const payload = isDouble
        ? { questionId: cur.id, selected: [], selected_double: { a: [...selected.a], b: [...selected.b] }, timeMs: Date.now() - shownAt }
        : { questionId: cur.id, selected: [...selected], timeMs: Date.now() - shownAt };
      const res = await api.post(`/attempts/${a.id}/answers`, payload);
      cur.answer = isDouble
        ? { selected: [], selected_double: { a: [...selected.a], b: [...selected.b] } }
        : { selected: [...selected] };
      if (!exam) {
        cur.answer.isCorrect = res.isCorrect;
        cur.correct = res.correct;
        cur.explanation = res.explanation;
        sound.play(res.isCorrect ? 'correct' : 'wrong');
        live.textContent = res.isCorrect ? t('quiz.right') : t('quiz.wrong', { a: (res.correct || []).join(' + ') });
        renderQuestion();
      } else {
        if (timeout) toast(t('quiz.timeUp'));
        next();
      }
    } catch (e) {
      if (e.code === 'already_answered' || e.code === 'attempt_finished') return navigate(`/quiz/${a.id}`, { replace: true });
      toast(errorMessage(e), 'error');
      if (exam) startTimer(remaining);
    } finally { busy = false; }
  }

  function next() {
    if (exam && !q().answer) return;
    const firstOpen = a.questions.findIndex((x, i) => i > idx && !x.answer);
    if (idx < a.questions.length - 1) return go(exam ? (firstOpen === -1 ? idx + 1 : firstOpen) : idx + 1);
    const pending = a.questions.findIndex((x) => !x.answer);
    if (pending !== -1 && !exam) return go(pending);
    finish();
  }

  function go(i) {
    if (i < 0 || i >= a.questions.length) return;
    if (exam && i < idx) return;
    if (exam && i !== idx && !q().answer) { toast(t('quiz.mustAnswer'), 'warning'); return; }
    stopTimer();
    stopSpeaking();
    idx = i;
    renderQuestion();
  }

  async function finish() {
    if (finished) return;
    finished = true;
    stopTimer();
    try {
      const res = await api.post(`/attempts/${a.id}/finish`);
      sound.play(res.passed === false ? 'wrong' : 'success');
      navigate(`/results/${a.id}`, { replace: true });
    } catch (e) { finished = false; toast(errorMessage(e), 'error'); }
  }

  // ── المؤقت ────────────────────────────────────────────────────────
  function startTimer(from) {
    stopTimer();
    const total = a.secondsPerQuestion || 30;
    remaining = from ?? total;
    const el = overlay.querySelector('#nrs-timer');
    const draw = () => {
      if (!el) return;
      el.textContent = remaining;
      el.classList.toggle('timer-low', remaining <= 5);
      el.classList.toggle('timer-warn', remaining <= 10 && remaining > 5);
    };
    draw();
    timer = setInterval(() => {
      remaining--;
      if (remaining <= 5 && remaining > 0) sound.play('tick');
      if (remaining === 10) live.textContent = t('quiz.tenSeconds');
      if (remaining <= 0) { remaining = 0; draw(); validate({ timeout: true }); return; }
      draw();
    }, 1000);
  }
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }

  // ── لوحة المفاتيح ─────────────────────────────────────────────────
  function onKey(e) {
    if (e.target.closest('input, textarea, select, dialog')) return;
    if (/^[1-4]$/.test(e.key)) { e.preventDefault(); toggle(Number(e.key)); }
    else if (e.key === 'Enter') { e.preventDefault(); q().answer ? next() : validate(); }
    else if (!exam && e.key === 'ArrowRight') go(idx + 1);
    else if (!exam && e.key === 'ArrowLeft') go(idx - 1);
  }
  const beforeUnload = (e) => { if (exam && !finished) { e.preventDefault(); e.returnValue = ''; } };

  layout();
  renderQuestion();
  document.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', beforeUnload);
  return () => {
    stopTimer();
    overlay.remove();
    document.body.style.overflow = prevOverflow;
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('beforeunload', beforeUnload);
    stopSpeaking();
  };
}
