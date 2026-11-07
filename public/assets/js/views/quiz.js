// Simulateur : examen blanc (chronométré, sans retour, correction à la fin)
// ou entraînement (correction immédiate avec explication, navigation libre).
import { html, raw, loading, toast, errorMessage, sound, speak, stopSpeaking, autoRead, confirmDialog } from '../ui.js';
import { t, catName } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { renderVisual } from '../scenario.js';
import { modeLabel, videoBlock, speechText } from './common.js';

export async function quizView(root, { params }) {
  root.innerHTML = loading().s;
  let a;
  try { a = await api.get(`/attempts/${params.id}`); } catch { return navigate('/dashboard', { replace: true }); }
  if (a.finishedAt) return navigate(`/results/${a.id}`, { replace: true });
  const cats = new Map((await store.getCategories()).map((c) => [c.id, c]));
  const live = document.getElementById('live');

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

  // ── الهيكل الرئيسي ────────────────────────────────────────────────
  function layout() {
    root.innerHTML = html`
      <!-- شريط أعلى القيز -->
      <div class="quiz-header">
        <div class="quiz-title">
          <span>${a.mode === 'exam' ? '📋' : '✏️'}</span>
          <span>${a.mode === 'exam' ? t('mode.exam') : modeLabel(a)}</span>
        </div>
        <span class="${exam ? 'quiz-mode-badge exam-mode' : 'quiz-mode-badge'}">
          ${exam ? '⏱ ' + t('mode.examConditions') : '✍️ ' + t('mode.practice')}
        </span>
        <div style="flex:1"></div>
        <!-- عداد التقدم -->
        <div class="quiz-progress-wrap" style="margin:0;width:140px">
          <div class="quiz-progress-info">
            <span id="counter" aria-live="polite"></span>
            <span id="answered-count" style="color:var(--primary)"></span>
          </div>
          <div class="quiz-progress-bar"><span id="progress-fill"></span></div>
        </div>
        <!-- أزرار أدوات -->
        <button class="btn btn-ghost btn-sm" id="autoread" type="button" aria-pressed="${reading}" title="${t('quiz.autoRead')}"></button>
        <button class="btn btn-secondary btn-sm" id="quit" style="border-color:var(--danger-mid);color:var(--danger)">
          ${exam ? '🏁 ' + t('quiz.finishNow') : '✓ ' + t('quiz.finish')}
        </button>
      </div>

      <!-- المحتوى الرئيسي -->
      <div class="quiz-layout">
        <!-- بطاقة السؤال -->
        <div id="qcard" class="qcard" aria-live="off"></div>

        <!-- الشريط الجانبي -->
        <aside class="quiz-sidebar">
          ${exam ? html`
            <div class="q-timer-wrap">
              <div style="position:relative">
                <div class="q-timer" id="timer" role="timer" aria-label="${t('quiz.timeLeft')}">
                  <span class="q-timer-val" id="timer-v">—</span>
                </div>
                <span class="q-timer-label">${t('quiz.timeLeft')}</span>
              </div>
            </div>` : ''}
          <h3>${t('quiz.questions')}</h3>
          <div class="q-nav-grid" id="qnav"></div>
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
            <p class="small muted" style="margin:0;line-height:1.7">
              <span class="kbd">1</span>–<span class="kbd">4</span> ${t('quiz.kbdHelp')}
              ${!exam ? html` · <span class="kbd">←</span><span class="kbd">→</span>` : ''}
            </p>
          </div>
        </aside>
      </div>`.s;

    // ربط أزرار الأدوات
    const ar = root.querySelector('#autoread');
    const drawAr = () => {
      ar.textContent = `${reading ? '🔊' : '🔇'} ${t('quiz.autoRead')}`;
      ar.setAttribute('aria-pressed', String(reading));
    };
    drawAr();
    ar.onclick = () => {
      reading = !reading; autoRead.set(reading); drawAr();
      toast(reading ? t('quiz.autoReadOn') : t('quiz.autoReadOff'));
      if (reading) speak(speechText(q(), idx + 1), { silent: true }); else stopSpeaking();
    };
    root.querySelector('#quit').onclick = async () => {
      const left = a.questions.length - answeredCount();
      if (left > 0 && !(await confirmDialog(t('quiz.confirmFinish', { n: left }), { okLabel: t('quiz.finish') }))) return;
      finish();
    };
  }

  // ── شريط التنقل بين الأسئلة ───────────────────────────────────────
  function renderNav() {
    const nav = root.querySelector('#qnav');
    nav.innerHTML = html`${a.questions.map((x, i) => {
      let cls = '';
      if (x.answer) cls = x.answer.isCorrect === true ? 'nav-ok' : x.answer.isCorrect === false ? 'nav-ko' : 'nav-done';
      if (i === idx) cls += ' nav-cur';
      const label = t('quiz.qn', { n: i + 1 });
      return exam
        ? html`<span class="${cls}" aria-label="${label}">${i + 1}</span>`
        : html`<button type="button" class="${cls}" data-i="${i}" aria-label="${label}" ${i === idx ? html`aria-current="step"` : ''}>${i + 1}</button>`;
    })}`.s;
    if (!exam) nav.querySelectorAll('button').forEach((b) => (b.onclick = () => go(Number(b.dataset.i))));

    // تحديث العداد والشريط
    const answered = answeredCount();
    const counter = root.querySelector('#counter');
    const fill = root.querySelector('#progress-fill');
    const ac = root.querySelector('#answered-count');
    if (counter) counter.textContent = t('quiz.counter', { i: idx + 1, n: a.questions.length });
    if (ac) ac.textContent = `${answered}/${a.questions.length}`;
    if (fill) fill.style.width = `${(answered / a.questions.length) * 100}%`;
  }

  // ── رسم مجموعة خيارات ─────────────────────────────────────────────
  function renderOptions(opts, correctSet, selSet, reveal, answered, prefix = '') {
    return opts.map((o, i) => {
      const n = i + 1;
      const text = (o && typeof o === 'object') ? (o.text || '') : o;
      let cls = '';
      let mark = '';
      if (reveal) {
        if (correctSet.has(n)) { cls = 'opt-correct'; mark = '✓'; }
        else if (selSet.has(n)) { cls = 'opt-wrong'; mark = '✗'; }
      }
      return html`
        <button type="button" class="q-option ${cls}" data-prefix="${prefix}" data-n="${n}"
          aria-pressed="${selSet.has(n)}" ${answered ? 'disabled' : ''} lang="ar" dir="rtl">
          <span class="q-option-num">${n}</span>
          <span class="q-option-text">${text}</span>
          ${mark ? html`<span class="q-option-mark" aria-hidden="true">${mark}</span>` : ''}
          ${reveal && correctSet.has(n) ? html`<span class="sr-only">${t('quiz.correctAnswer')}</span>` : ''}
        </button>`;
    }).join('');
  }

  // ── رسم السؤال ────────────────────────────────────────────────────
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

    const reveal = !exam && ans;
    const c = cats.get(cur.categoryId);
    const card = root.querySelector('#qcard');

    // رأس البطاقة (فئة + أدوات)
    const header = html`
      <div class="qcard-header">
        ${c ? html`<span class="pill" style="font-size:.8rem">${c.icon} ${catName(c)}</span>` : ''}
        ${isDouble ? html`<span class="pill pill-info" style="font-size:.78rem">⚡ ${t('quiz.double')}</span>` : ''}
        ${cur.skill_type ? html`<span class="pill" style="font-size:.74rem;opacity:.8">${cur.skill_type}</span>` : ''}
        <div style="flex:1"></div>
        <button class="btn btn-ghost btn-sm" id="speak" type="button" aria-label="${t('quiz.listen')}">🔊</button>
        <button class="btn btn-ghost btn-sm" id="bm" type="button" aria-pressed="${!!cur.bookmarked}"
          title="${t('quiz.bookmark')}">${cur.bookmarked ? '★' : '☆'}</button>
      </div>`;

    // المنطقة المرئية (صورة / مشهد)
    const visual = html`
      ${raw(videoBlock(cur).s || '')}
      ${cur.image || cur.visual ? html`<figure class="scene" style="margin:0 0 20px;border-radius:12px;overflow:hidden">${raw(renderVisual(cur))}</figure>` : ''}`;

    // رقم السؤال
    const qNum = html`<div class="q-number">${t('quiz.qn', { n: idx + 1 })}</div>`;

    if (isDouble) {
      const sq = cur.sub_questions;
      const normC = (arr) => (arr || []).map((c) =>
        typeof c === 'string' && c.startsWith('opt_') ? Number(c.replace('opt_', '')) : Number(c)
      ).filter(Boolean);
      const corrA = new Set(normC(sq[0].correct));
      const corrB = new Set(normC(sq[1].correct));
      const selA = selected.a;
      const selB = selected.b;

      const subOkA = reveal && corrA.size && [...corrA].every((n) => selA.has(n)) && selA.size === corrA.size;
      const subOkB = reveal && corrB.size && [...corrB].every((n) => selB.has(n)) && selB.size === corrB.size;

      card.innerHTML = html`
        ${header}
        <div class="qcard-body">
          ${visual}
          ${qNum}
          <p class="q-hint">⚡ ${t('quiz.doubleHint')}</p>
          <p class="q-text" lang="ar" dir="rtl">${cur.text}</p>

          <!-- السؤال الفرعي أ -->
          <div class="sub-q-block">
            <div class="sub-q-label">
              <span class="sub-q-dot">أ</span>
              <span>${t('quiz.subQ1')}</span>
            </div>
            <p class="sub-q-text" lang="ar" dir="rtl" id="sq1text">${sq[0].text}</p>
            <div class="sub-q-options" role="group" aria-labelledby="sq1text">
              ${raw(renderOptions(sq[0].options, corrA, selA, reveal, !!ans, 'a'))}
            </div>
            ${reveal ? html`<div style="padding:0 12px 12px"><div class="q-feedback ${subOkA ? 'fb-ok' : 'fb-ko'}" style="margin:0"><div class="q-feedback-title">${subOkA ? '✓' : '✗'} ${t('quiz.correctAnswer')}: ${[...corrA].join(', ')}</div></div></div>` : ''}
          </div>

          <!-- السؤال الفرعي ب -->
          <div class="sub-q-block">
            <div class="sub-q-label">
              <span class="sub-q-dot">ب</span>
              <span>${t('quiz.subQ2')}</span>
            </div>
            <p class="sub-q-text" lang="ar" dir="rtl" id="sq2text">${sq[1].text}</p>
            <div class="sub-q-options" role="group" aria-labelledby="sq2text">
              ${raw(renderOptions(sq[1].options, corrB, selB, reveal, !!ans, 'b'))}
            </div>
            ${reveal ? html`<div style="padding:0 12px 12px"><div class="q-feedback ${subOkB ? 'fb-ok' : 'fb-ko'}" style="margin:0"><div class="q-feedback-title">${subOkB ? '✓' : '✗'} ${t('quiz.correctAnswer')}: ${[...corrB].join(', ')}</div></div></div>` : ''}
          </div>

          <!-- الشرح والتغذية الراجعة الكلية -->
          <div id="fb">${reveal && ans ? feedbackDouble(cur) : ''}</div>

          <!-- أزرار الإجراءات -->
          <div class="q-actions">
            ${ans
              ? html`
                ${!exam && idx > 0 ? html`<button class="btn btn-secondary" id="prev">← ${t('quiz.prev')}</button>` : ''}
                <div class="spacer"></div>
                <button class="btn btn-primary" id="next">
                  ${idx < a.questions.length - 1 ? t('quiz.next') + ' →' : '🏁 ' + t('quiz.seeResults')}
                </button>`
              : html`
                <button class="btn btn-secondary btn-sm" id="clear" style="color:var(--muted)">↺ ${t('quiz.clear')}</button>
                <div class="spacer"></div>
                ${!exam && idx > 0 ? html`<button class="btn btn-ghost" id="prev">← ${t('quiz.prev')}</button>` : ''}
                <button class="btn btn-primary" id="validate">✓ ${t('quiz.validate')}</button>`}
          </div>
        </div>`.s;

      card.querySelectorAll('.q-option:not([disabled])').forEach((b) => {
        b.onclick = () => {
          const pre = b.dataset.prefix;
          const n = Number(b.dataset.n);
          const set = pre === 'a' ? selected.a : selected.b;
          if (set.has(n)) set.delete(n); else set.add(n);
          syncDoubleOptions();
        };
      });

    } else {
      // ── سؤال منفرد ────────────────────────────────────────────────
      // تطبيع correct: ["opt_1","opt_2"] → [1,2]  أو  [1,2] → [1,2]
      const normalizeCorrect = (arr) => (arr || []).map((c) =>
        typeof c === 'string' && c.startsWith('opt_') ? Number(c.replace('opt_', '')) : Number(c)
      ).filter(Boolean);
      const correct = new Set(normalizeCorrect(cur.correct));
      const multiAnswer = cur.correct && cur.correct.length > 1;

      card.innerHTML = html`
        ${header}
        <div class="qcard-body">
          ${visual}
          ${qNum}
          ${multiAnswer && !ans ? html`<div class="q-hint">📌 ${t('quiz.multiHint')}</div>` : ''}
          <h2 class="q-text" id="qtext" lang="ar" dir="rtl">${cur.text}</h2>

          <div class="q-options" role="group" aria-labelledby="qtext">
            ${raw(renderOptions(cur.options, correct, selected, reveal, !!ans, ''))}
          </div>

          <!-- التغذية الراجعة بعد الإجابة -->
          <div id="fb">${reveal ? feedback(cur) : ''}</div>

          <!-- أزرار الإجراءات -->
          <div class="q-actions">
            ${ans
              ? html`
                ${!exam && idx > 0 ? html`<button class="btn btn-secondary" id="prev">← ${t('quiz.prev')}</button>` : ''}
                <div class="spacer"></div>
                <button class="btn btn-primary" id="next">
                  ${idx < a.questions.length - 1 ? t('quiz.next') + ' →' : '🏁 ' + t('quiz.seeResults')}
                </button>`
              : html`
                <button class="btn btn-secondary btn-sm" id="clear" style="color:var(--muted)">↺ ${t('quiz.clear')}</button>
                <div class="spacer"></div>
                ${!exam && idx > 0 ? html`<button class="btn btn-ghost" id="prev">← ${t('quiz.prev')}</button>` : ''}
                <button class="btn btn-primary" id="validate">✓ ${t('quiz.validate')}</button>`}
          </div>
        </div>`.s;

      card.querySelectorAll('.q-option:not([disabled])').forEach((b) => (b.onclick = () => toggle(Number(b.dataset.n))));
    }

    // ربط الأزرار المشتركة
    card.querySelector('#speak').onclick = () => speak(speechText(cur, idx + 1));
    card.querySelector('#bm').onclick = toggleBookmark;
    const v = card.querySelector('#validate'); if (v) v.onclick = validate;
    const cl = card.querySelector('#clear');
    if (cl) cl.onclick = () => {
      if (cur.is_double) { selected.a.clear(); selected.b.clear(); syncDoubleOptions(); }
      else { selected.clear(); syncOptions(); }
    };
    const nx = card.querySelector('#next'); if (nx) nx.onclick = next;
    const pv = card.querySelector('#prev'); if (pv) pv.onclick = () => go(idx - 1);

    renderNav();
    shownAt = Date.now();
    if (exam && !ans) startTimer();
    if (reading && !ans) speak(speechText(cur, idx + 1), { silent: true });
  }

  function syncDoubleOptions() {
    const card = root.querySelector('#qcard');
    card.querySelectorAll('.q-option[data-prefix="a"]').forEach((b) => b.setAttribute('aria-pressed', String(selected.a.has(Number(b.dataset.n)))));
    card.querySelectorAll('.q-option[data-prefix="b"]').forEach((b) => b.setAttribute('aria-pressed', String(selected.b.has(Number(b.dataset.n)))));
  }

  // ── التغذية الراجعة ───────────────────────────────────────────────
  function feedback(cur) {
    const ok = cur.answer.isCorrect;
    return html`
      <div class="q-feedback ${ok ? 'fb-ok' : 'fb-ko'}" role="status">
        <div class="q-feedback-title">
          <span>${ok ? '✓' : '✗'}</span>
          <span>${ok ? t('quiz.right') : t('quiz.wrong', { a: (cur.correct || []).join(' + ') })}</span>
        </div>
        ${cur.explanation ? html`<div class="q-explain" style="margin-top:8px;background:transparent;border:0;padding:0">
          <span class="q-explain-icon">💡</span>
          <span class="q-feedback-explain" lang="ar" dir="rtl">${cur.explanation}</span>
        </div>` : ''}
      </div>`;
  }

  function feedbackDouble(cur) {
    const ok = cur.answer.isCorrect;
    return html`
      <div class="q-feedback ${ok ? 'fb-ok' : 'fb-ko'}" role="status">
        <div class="q-feedback-title">
          <span>${ok ? '✓' : '✗'}</span>
          <span>${ok ? t('quiz.right') : t('quiz.wrong', { a: '' })}</span>
        </div>
        ${cur.explanation ? html`<div class="q-explain" style="margin-top:8px;background:transparent;border:0;padding:0">
          <span class="q-explain-icon">💡</span>
          <span class="q-feedback-explain" lang="ar" dir="rtl">${cur.explanation}</span>
        </div>` : ''}
      </div>`;
  }

  function syncOptions() {
    root.querySelectorAll('.q-option').forEach((b) => b.setAttribute('aria-pressed', String(selected.has(Number(b.dataset.n)))));
  }

  function toggle(n) {
    if (q().answer || n > q().options.length) return;
    if (selected.has(n)) selected.delete(n); else selected.add(n);
    sound.play('click');
    syncOptions();
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
        root.querySelector('#next')?.focus();
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
    const firstOpen = a.questions.findIndex((x, i) => i > idx && !x.answer);
    if (idx < a.questions.length - 1) return go(exam ? (firstOpen === -1 ? idx + 1 : firstOpen) : idx + 1);
    const pending = a.questions.findIndex((x) => !x.answer);
    if (pending !== -1 && !exam) return go(pending);
    finish();
  }

  function go(i) {
    if (i < 0 || i >= a.questions.length) return;
    if (exam && i < idx) return;
    stopTimer();
    stopSpeaking();
    idx = i;
    renderQuestion();
    root.querySelector('#qtext')?.focus?.();
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

  async function toggleBookmark() {
    const cur = q();
    try {
      const r = await api.put(`/questions/${cur.id}/bookmark`, { bookmarked: !cur.bookmarked });
      cur.bookmarked = r.bookmarked;
      const b = root.querySelector('#bm');
      b.textContent = cur.bookmarked ? '★' : '☆';
      b.setAttribute('aria-pressed', String(cur.bookmarked));
      toast(cur.bookmarked ? t('quiz.bookmarked') : t('quiz.unbookmarked'));
    } catch (e) { toast(errorMessage(e), 'error'); }
  }

  // ── المؤقت ────────────────────────────────────────────────────────
  function startTimer(from) {
    stopTimer();
    const total = a.secondsPerQuestion;
    remaining = from ?? total;
    const el = root.querySelector('#timer');
    const val = root.querySelector('#timer-v');
    const draw = () => {
      val.textContent = remaining;
      el.style.setProperty('--p', String((100 * remaining) / total));
      el.classList.toggle('timer-low', remaining <= 5);
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
    else if (e.key === 'Enter' && !e.target.closest('button')) { e.preventDefault(); q().answer ? next() : validate(); }
    else if (!exam && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const forward = (document.dir === 'rtl') === (e.key === 'ArrowLeft');
      go(idx + (forward ? 1 : -1));
    }
  }
  const beforeUnload = (e) => { if (exam && !finished) { e.preventDefault(); e.returnValue = ''; } };

  layout();
  renderQuestion();
  document.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', beforeUnload);
  return () => {
    stopTimer();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('beforeunload', beforeUnload);
    stopSpeaking();
  };
}
