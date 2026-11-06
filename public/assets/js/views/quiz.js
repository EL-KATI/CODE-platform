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

  function layout() {
    root.innerHTML = html`
      <div class="quiz-top">
        <h1 style="font-size:1.2rem;margin:0">${a.mode === 'exam' ? t('mode.exam') : modeLabel(a)}</h1>
        <span class="pill ${exam ? 'pill-warning' : 'pill-success'}">${exam ? t('mode.examConditions') : t('mode.practice')}</span>
        <span class="spacer"></span>
        <span class="pill" id="counter" aria-live="polite"></span>
        <button class="btn btn-ghost btn-sm" id="autoread" type="button" aria-pressed="${reading}" title="${t('quiz.autoRead')}"></button>
        <button class="btn btn-secondary btn-sm" id="quit">${exam ? t('quiz.finishNow') : t('quiz.finish')}</button>
      </div>
      <div class="quiz">
        <section class="card" id="qcard" aria-live="off"></section>
        <aside class="card">
          ${exam ? html`<div class="row" style="justify-content:center;margin-bottom:12px"><div class="timer" id="timer" role="timer" aria-label="${t('quiz.timeLeft')}"><span id="timer-v"></span></div></div>` : ''}
          <h2 class="small muted" style="margin-bottom:8px">${t('quiz.questions')}</h2>
          <div class="qnav" id="qnav"></div>
          <p class="small muted" style="margin:14px 0 0">${t('quiz.kbdHelp')} <span class="kbd">1</span>–<span class="kbd">4</span> · <span class="kbd">Enter</span>${exam ? '' : html` · <span class="kbd">←</span><span class="kbd">→</span>`}</p>
        </aside>
      </div>`.s;
    const ar = root.querySelector('#autoread');
    const drawAr = () => { ar.textContent = `${reading ? '🔊' : '🔇'} ${t('quiz.autoRead')}`; ar.setAttribute('aria-pressed', String(reading)); };
    drawAr();
    ar.onclick = () => {
      reading = !reading;
      autoRead.set(reading);
      drawAr();
      toast(reading ? t('quiz.autoReadOn') : t('quiz.autoReadOff'));
      if (reading) speak(speechText(q(), idx + 1), { silent: true }); else stopSpeaking();
    };
    root.querySelector('#quit').onclick = async () => {
      const left = a.questions.length - answeredCount();
      if (left > 0 && !(await confirmDialog(t('quiz.confirmFinish', { n: left }), { okLabel: t('quiz.finish') }))) return;
      finish();
    };
  }

  function renderNav() {
    const nav = root.querySelector('#qnav');
    nav.innerHTML = html`${a.questions.map((x, i) => {
      let cls = '';
      if (x.answer) cls = x.answer.isCorrect === true ? 'ok' : x.answer.isCorrect === false ? 'ko' : 'done';
      if (i === idx) cls += ' cur';
      const label = t('quiz.qn', { n: i + 1 });
      return exam ? html`<span class="${cls}" aria-label="${label}">${i + 1}</span>`
        : html`<button type="button" class="${cls}" data-i="${i}" aria-label="${label}" ${i === idx ? html`aria-current="step"` : ''}>${i + 1}</button>`;
    })}`.s;
    if (!exam) nav.querySelectorAll('button').forEach((b) => (b.onclick = () => go(Number(b.dataset.i))));
    root.querySelector('#counter').textContent = t('quiz.counter', { i: idx + 1, n: a.questions.length });
  }

  function renderQuestion() {
    const cur = q();
    const ans = cur.answer;
    selected = new Set(ans ? ans.selected : []);
    const reveal = !exam && ans && cur.correct;
    const correct = new Set(cur.correct || []);
    const c = cats.get(cur.categoryId);
    const card = root.querySelector('#qcard');
    card.innerHTML = html`
      <div class="row" style="margin-bottom:10px;flex-wrap:wrap;gap:6px">
        ${c ? html`<span class="pill">${c.icon} ${catName(c)}</span>` : ''}
        ${cur.question_type ? html`<span class="pill pill-info" title="${t('admin.questionType')}">${cur.question_type}</span>` : ''}
        ${cur.skill_type ? html`<span class="pill pill-muted" style="font-size:.75rem">${cur.skill_type}</span>` : ''}
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" id="speak" type="button" aria-label="${t('quiz.listen')}">🔊 ${t('quiz.listen')}</button>
        <button class="btn btn-ghost btn-sm" id="bm" type="button" aria-pressed="${!!cur.bookmarked}">${cur.bookmarked ? '★' : '☆'} ${t('quiz.bookmark')}</button>
      </div>
      ${raw(videoBlock(cur).s || '')}
      ${cur.image || cur.visual ? html`<figure class="scene" style="margin:0 0 16px">${raw(renderVisual(cur))}</figure>` : ''}
      ${cur.question_type === '½½'
        ? html`<div class="halfhalf-notice pill pill-info" style="margin-bottom:8px;display:block;text-align:center" lang="ar" dir="rtl">⚡ ${t('quiz.halfhalfHint')}</div>`
        : ''}
      <h2 class="question-text" id="qtext" lang="ar" dir="rtl">${cur.text}</h2>
      <p class="small muted" style="margin-top:-6px">${cur.correct && cur.correct.length > 1 ? t('quiz.multiHint') : ''}</p>
      <div class="options" role="group" aria-labelledby="qtext">
        ${cur.options.map((o, i) => {
          const n = i + 1;
          let cls = '';
          let mark = '';
          if (reveal) {
            if (correct.has(n)) { cls = 'is-correct'; mark = '✓'; } else if (selected.has(n)) { cls = 'is-wrong'; mark = '✗'; }
          }
          return html`<button type="button" class="option ${cls}" data-n="${n}" aria-pressed="${selected.has(n)}" ${ans ? 'disabled' : ''} lang="ar" dir="rtl">
            <span class="num">${n}</span><span>${o}</span>${mark ? html`<span class="mark" aria-hidden="true">${mark}</span>` : ''}
            ${reveal && correct.has(n) ? html`<span class="sr-only">${t('quiz.correctAnswer')}</span>` : ''}</button>`;
        })}
      </div>
      <div id="fb">${reveal ? feedback(cur) : ''}</div>
      <div class="quiz-actions">
        ${ans
          ? html`${!exam && idx > 0 ? html`<button class="btn btn-secondary" id="prev">${t('quiz.prev')}</button>` : ''}
                 <button class="btn btn-primary" id="next">${idx < a.questions.length - 1 ? t('quiz.next') : t('quiz.seeResults')}</button>`
          : html`<button class="btn btn-secondary" id="clear">${t('quiz.clear')}</button>
                 <button class="btn btn-primary" id="validate">${t('quiz.validate')}</button>
                 ${!exam && idx > 0 ? html`<button class="btn btn-ghost" id="prev">${t('quiz.prev')}</button>` : ''}`}
      </div>`.s;

    card.querySelectorAll('.option:not([disabled])').forEach((b) => (b.onclick = () => toggle(Number(b.dataset.n))));
    card.querySelector('#speak').onclick = () => speak(speechText(cur, idx + 1));
    card.querySelector('#bm').onclick = toggleBookmark;
    const v = card.querySelector('#validate'); if (v) v.onclick = validate;
    const cl = card.querySelector('#clear'); if (cl) cl.onclick = () => { selected.clear(); syncOptions(); };
    const nx = card.querySelector('#next'); if (nx) nx.onclick = next;
    const pv = card.querySelector('#prev'); if (pv) pv.onclick = () => go(idx - 1);
    renderNav();
    shownAt = Date.now();
    if (exam && !ans) startTimer();
    // Lecture automatique : seulement pour une nouvelle question pas encore répondue.
    if (reading && !ans) speak(speechText(cur, idx + 1), { silent: true });
  }

  function feedback(cur) {
    const ok = cur.answer.isCorrect;
    return html`<div class="feedback ${ok ? 'ok' : 'ko'}" role="status"><strong>${ok ? '✓ ' + t('quiz.right') : '✗ ' + t('quiz.wrong', { a: (cur.correct || []).join(' + ') })}</strong>
      <span lang="ar" dir="rtl">${cur.explanation || ''}</span></div>`;
  }

  function syncOptions() {
    root.querySelectorAll('.option').forEach((b) => b.setAttribute('aria-pressed', String(selected.has(Number(b.dataset.n)))));
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
    if (!selected.size && !timeout && !exam) { toast(t('quiz.pickOne')); return; }
    busy = true;
    stopTimer();
    stopSpeaking();
    try {
      const res = await api.post(`/attempts/${a.id}/answers`, { questionId: cur.id, selected: [...selected], timeMs: Date.now() - shownAt });
      cur.answer = { selected: [...selected] };
      if (!exam) {
        cur.answer.isCorrect = res.isCorrect;
        cur.correct = res.correct;
        cur.explanation = res.explanation;
        sound.play(res.isCorrect ? 'correct' : 'wrong');
        live.textContent = res.isCorrect ? t('quiz.right') : t('quiz.wrong', { a: res.correct.join(' + ') });
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
      b.textContent = `${cur.bookmarked ? '★' : '☆'} ${t('quiz.bookmark')}`;
      b.setAttribute('aria-pressed', String(cur.bookmarked));
      toast(cur.bookmarked ? t('quiz.bookmarked') : t('quiz.unbookmarked'));
    } catch (e) { toast(errorMessage(e), 'error'); }
  }

  // --- Chronomètre par question -------------------------------------------------------
  function startTimer(from) {
    stopTimer();
    const total = a.secondsPerQuestion;
    remaining = from ?? total;
    const el = root.querySelector('#timer');
    const val = root.querySelector('#timer-v');
    const draw = () => {
      val.textContent = remaining;
      el.style.setProperty('--p', String((100 * remaining) / total));
      el.classList.toggle('low', remaining <= 5);
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

  // --- Clavier ------------------------------------------------------------------------
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
