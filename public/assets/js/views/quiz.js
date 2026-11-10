// واجهة الامتحان — تصميم NARSA الرسمي
// لوحة زرقاء يسار | شاشة وسائط + نص يمين | شريط سفلي
import { html, raw, loading, toast, errorMessage, sound, speak, stopSpeaking, autoRead, confirmDialog } from '../ui.js';
import { t, catName } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { renderVisual } from '../scenario.js';
import { modeLabel, videoBlock, speechText } from './common.js';

const svg = (d, w = 2.2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>'),
  vol: svg('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  mute: svg('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>', 2.8),
  check: svg('<path d="M4.5 12.5l5 5L19.5 7"/>', 2.8),
  next: svg('<path d="M15 5l-7 7 7 7"/>', 2.8),
};

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

        <!-- ══ الشريط العلوي (الهاتف واللوحة فقط) ══ -->
        <header class="nrs-topbar">
          <button class="nrs-tb-btn" id="tb-home" type="button" aria-label="${t('quiz.close')}">${IC.home}</button>
          <div class="nrs-tb-pills">
            <span class="nrs-tb-pill nrs-tb-timer" id="tb-timer" ${exam ? '' : 'hidden'}>${a.secondsPerQuestion || 30}<small>s</small></span>
            <span class="nrs-tb-pill nrs-tb-title">${esc(modeLabel(a))}</span>
            <span class="nrs-tb-pill nrs-tb-count" id="tb-counter">1/${a.questions.length}</span>
          </div>
          <button class="nrs-tb-btn" id="tb-read" type="button" aria-pressed="${reading}" aria-label="${t('quiz.readAloud')}">${reading ? IC.vol : IC.mute}</button>
          <div class="nrs-tb-progress" aria-hidden="true"><i id="tb-progress"></i></div>
        </header>

        <!-- ══ الشاشة الرئيسية (يمين/فوق) ══ -->
        <div class="nrs-main">
          <!-- منطقة الوسائط: صورة أو فيديو -->
          <div class="nrs-media" id="nrs-media"></div>

          <!-- شريط النص الأسود (السؤال والخيارات) -->
          <div class="nrs-text-panel" id="nrs-text-panel"></div>
        </div>

        <!-- ══ اللوحة الجانبية الزرقاء (يسار) ══ -->
        <aside class="nrs-side">

          <!-- مؤشرات الإجابات: 4 خانات -->
          <div class="nrs-indicators" id="nrs-indicators" aria-hidden="true"></div>

          <!-- اللوحة البنفسجية: تصحيح + أزرار 1-4 + موافق -->
          <div class="nrs-panel">
            <button class="nrs-btn-clear" id="btn-clear" type="button" aria-label="مسح الاختيار">${IC.x}</button>
            <button class="nrs-btn-correct" id="btn-correct" type="button">تصحيح</button>
            <div class="nrs-choices" id="nrs-choices"></div>
            <button class="nrs-btn-ok" id="btn-ok" type="button"><span class="ok-ic" aria-hidden="true">${IC.check}</span><span class="ok-lbl">موافق</span></button>
          </div>

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
            <span class="nrs-footer-val nrs-timer-val" id="nrs-timer">${exam ? (a.secondsPerQuestion || 30) : '—'}</span>
          </div>
        </footer>
      </div>`;

    // أحداث الأزرار الثابتة
    overlay.querySelector('#nrs-close').onclick = async () => {
      if (exam && !finished && !(await confirmDialog(t('quiz.closeConfirm'), { okLabel: t('quiz.close') }))) return;
      navigate(exam ? '/exam' : '/practice');
    };

    overlay.querySelector('#tb-home').onclick = () => overlay.querySelector('#nrs-close').click();
    overlay.querySelector('#tb-read').onclick = (e) => {
      reading = !reading;
      autoRead.set(reading);
      e.currentTarget.innerHTML = reading ? IC.vol : IC.mute;
      e.currentTarget.setAttribute('aria-pressed', String(reading));
      if (reading) speak(speechText(q(), idx + 1), { silent: true }); else stopSpeaking();
    };
    // ✕ : مسح الاختيار الحالي (قبل التأكيد)
    overlay.querySelector('#btn-clear').onclick = () => {
      const cur = q();
      if (cur.answer) return;
      selected = cur.is_double && Array.isArray(cur.sub_questions) && cur.sub_questions.length === 2 ? { a: new Set(), b: new Set() } : new Set();
      sound.play('click');
      syncChoices();
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
        // في وضع التمرين: كشف الجواب الصحيح والشرح مباشرة، حتى بدون اختيار (يُحتسب خطأً)
        if (!q().answer) validate({ reveal: true });
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

  // ── مؤشرات الإجابات (الخانات الأربع أعلى اللوحة الجانبية) ──────────
  // شرطة حمراء = الاختيار غير محدد، الرقم = الاختيار محدد. بعد التصحيح في التمرين: أخضر = صحيح، أحمر = خطأ.
  function renderIndicators() {
    const el = overlay.querySelector('#nrs-indicators');
    if (!el) return;
    const cur = q();
    const ans = cur.answer;
    const reveal = !exam && ans;
    const isDouble = cur.is_double && Array.isArray(cur.sub_questions) && cur.sub_questions.length === 2;
    const slots = [1, 2, 3, 4].map((n) => {
      if (isDouble) {
        const part = n <= 2 ? 0 : 1;
        const local = n <= 2 ? n : n - 2;
        const set = (part === 0 ? selected.a : selected.b) || new Set();
        return { n, on: set.has(local), ok: norm(cur.sub_questions[part].correct).includes(local) };
      }
      return { n, on: selected.has(n), ok: norm(cur.correct).includes(n) };
    });
    el.innerHTML = slots.map(({ n, on, ok }) => {
      let cls = 'nrs-ind';
      if (on) cls += ' nrs-ind-on';
      if (reveal && ok) cls += ' nrs-ind-ok';
      else if (reveal && on) cls += ' nrs-ind-wrong';
      return `<span class="${cls}">${on || (reveal && ok) ? n : ''}</span>`;
    }).join('');
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
      // دائماً 4 أزرار (1-4) كما في الامتحان الرسمي، حتى إذا كان للسؤال خياران أو ثلاثة فقط
      el.innerHTML = Array.from({ length: 4 }, (_, i) => {
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
    renderIndicators();
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

  // ── التصحيح في وضع التمرين: سطر بسيط داخل اللوحة السوداء + شرح القاعدة ──
  function feedbackHtml(ok, correctNums, explanation) {
    const nums = [...correctNums].sort((x, y) => x - y).join('، ');
    return `<div class="nrs-fb ${ok ? 'is-ok' : 'is-ko'}">${ok ? '✓ إجابة صحيحة' : `✗ إجابة خاطئة${nums ? ` — الجواب الصحيح: ${nums}` : ''}`}</div>${explanation ? `<div class="nrs-fb-text">${esc(explanation)}</div>` : ''}`;
  }

  // سطر اختيار: -النص (أزرق) ......... الرقم
  function optHtml(n, text, state) {
    return `<div class="nrs-opt ${state}"><span class="nrs-opt-text">-${esc(text)}</span><span class="nrs-opt-dots" aria-hidden="true"></span><span class="nrs-opt-n">${n}</span></div>`;
  }
  const optText = (o) => ((o && typeof o === 'object') ? (o.text || '') : String(o ?? ''));

  // ── لوحة النص (الصندوق الأسود) ────────────────────────────────────
  function renderTextPanel() {
    const el = overlay.querySelector('#nrs-text-panel');
    if (!el) return;
    const cur = q();
    const ans = cur.answer;
    const isDouble = cur.is_double && Array.isArray(cur.sub_questions) && cur.sub_questions.length === 2;
    const reveal = !exam && ans;
    // بعد التصحيح الصندوق الأسود يكبر قليلاً ليظهر السؤال والشرح معاً
    el.classList.toggle('has-result', !!reveal);
    const state = (on, isCorrect) => (reveal && isCorrect ? 'sub-ok' : reveal && on ? 'sub-wrong' : on ? 'sub-on' : '');

    // السؤال المزدوج: نعرض السطر الأول فقط من النص (الأسطر التالية في الأسئلة القديمة تكرر الجزأين)،
    // ونحذفه إذا كان هو نفسه عنوان الجزء الأول.
    const flat = (x) => String(x || '').replace(/[\s؟?:.-]+/g, '');
    let main = cur.text;
    if (isDouble) {
      main = String(cur.text || '').split('\n')[0].trim();
      if (flat(main) === flat(cur.sub_questions[0].text)) main = '';
    }
    let out = `${main ? `<div class="nrs-q-main" dir="rtl">${esc(main)}</div>` : ''}<div class="nrs-block" dir="rtl">`;
    if (isDouble) {
      const sets = [selected.a || new Set(), selected.b || new Set()];
      const corrAll = [];
      cur.sub_questions.forEach((sq, si) => {
        const corr = new Set(norm(sq.correct));
        const labels = (sq.options || []).map(optText);
        // اختيارات قصيرة (نعم / لا) جنباً إلى جنب كما في الامتحان؛ الطويلة كل واحدة في سطر
        const inline = labels.every((l) => l.length <= 14);
        out += `<div class="nrs-sub-label">-${esc(sq.text)}</div><div class="${inline ? 'nrs-opts-row' : 'nrs-opts-list'}">`;
        labels.forEach((lbl, i) => { out += optHtml(i + 1 + si * 2, lbl, state(sets[si].has(i + 1), corr.has(i + 1))); });
        out += '</div>';
        corr.forEach((n) => corrAll.push(n + si * 2));
      });
      if (reveal) out += feedbackHtml(ans.isCorrect, corrAll, cur.explanation);
    } else {
      const correct = new Set(norm(cur.correct));
      out += '<div class="nrs-opts-list">';
      (cur.options || []).forEach((o, i) => { out += optHtml(i + 1, optText(o), state(selected.has(i + 1), correct.has(i + 1))); });
      out += '</div>';
      if (reveal) out += feedbackHtml(ans.isCorrect, [...correct], cur.explanation);
    }
    el.innerHTML = `${out}</div>`;
  }

  // ── تحديث الشريط السفلي ───────────────────────────────────────────
  function renderFooter() {
    const ctr = overlay.querySelector('#nrs-counter');
    if (ctr) ctr.textContent = `${idx + 1}/${a.questions.length}`;
    const tc = overlay.querySelector('#tb-counter');
    if (tc) tc.textContent = `${idx + 1}/${a.questions.length}`;
    const pg = overlay.querySelector('#tb-progress');
    if (pg) pg.style.width = `${(100 * (idx + 1)) / a.questions.length}%`;
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
    if (okBtn) {
      okBtn.querySelector('.ok-lbl').textContent = ans ? (idx < a.questions.length - 1 ? 'التالي' : 'النتائج') : 'موافق';
      okBtn.querySelector('.ok-ic').innerHTML = ans ? IC.next : IC.check;
      okBtn.classList.toggle('is-next', !!ans);
    }
    const clr = overlay.querySelector('#btn-clear');
    if (clr) clr.disabled = !!ans;

    // بعد التصحيح: ننزلو فاللوحة السوداء باش يبان الشرح بلا تمرير يدوي
    if (!exam && ans) { const panel = overlay.querySelector('#nrs-text-panel'); const fb = overlay.querySelector('.nrs-fb'); if (panel && fb) panel.scrollTop = Math.max(0, fb.offsetTop - panel.offsetTop - 8); }
    const corrBtn = overlay.querySelector('#btn-correct');
    if (corrBtn && !exam) corrBtn.disabled = !!ans;

    shownAt = Date.now();
    if (exam && !ans) startTimer();
    if (reading && !ans) speak(speechText(cur, idx + 1), { silent: true });
  }

  // ── مساعدات ──────────────────────────────────────────────────────
  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function toggle(n) {
    const cur = q();
    if (cur.answer) return;
    if (cur.is_double && Array.isArray(cur.sub_questions) && cur.sub_questions.length === 2) {
      const set = n <= 2 ? selected.a : selected.b;
      const local = n <= 2 ? n : n - 2;
      if (set.has(local)) set.delete(local); else set.add(local);
      sound.play('click');
      syncChoices();
      return;
    }
    if (n > (cur.options?.length || 4)) return;
    if (selected.has(n)) selected.delete(n); else selected.add(n);
    sound.play('click');
    syncChoices();
    renderTextPanel();
  }

  async function validate({ timeout = false, reveal = false } = {}) {
    const cur = q();
    if (busy || cur.answer) return;
    const isDouble = cur.is_double && Array.isArray(cur.sub_questions) && cur.sub_questions.length === 2;
    const hasAnswer = isDouble ? (selected.a.size > 0 || selected.b.size > 0) : selected.size > 0;
    if (!hasAnswer && !timeout && !reveal && !exam) { toast(t('quiz.pickOne')); return; }
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
        // السؤال المزدوج: الجواب الصحيح لكل جزء (بدونه كانت الاختيارات الصحيحة تُلوَّن كخاطئة)
        if (isDouble && Array.isArray(res.subCorrect)) cur.sub_questions.forEach((sq, i) => { sq.correct = res.subCorrect[i]; });
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
    const tb = overlay.querySelector('#tb-timer');
    const draw = () => {
      if (tb) {
        tb.innerHTML = `${remaining}<small>s</small>`;
        tb.classList.toggle('timer-low', remaining <= 5);
        tb.classList.toggle('timer-warn', remaining <= 10 && remaining > 5);
      }
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
