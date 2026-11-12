'use strict';
/**
 * live.js — واجهة الحصص الجماعية (Real-time via SSE)
 *
 * mountLiveJoinBtn(container) — زر الانضمام في الهيدر
 * liveSessionView(el, ctx)    — صفحة الحصة للطالب (SSE)
 * adminLiveView(el, ctx)      — لوحة تحكم المؤسسة (SSE + leaderboard)
 */
import { api } from './api.js';
import { html, raw, esc, toast } from './ui.js';
import { t } from './i18n.js';
import { store } from './store.js';
import { navigate } from './router.js';

// ── أيقونات SVG (نفس quiz.js) ────────────────────────────────────────────────
const _svg = (d, w = 2.2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  check: _svg('<path d="M4.5 12.5l5 5L19.5 7"/>', 2.8),
  next:  _svg('<path d="M15 5l-7 7 7 7"/>', 2.8),
  x:     _svg('<path d="M6 6l12 12M18 6L6 18"/>', 2.8),
};

// ── مساعدات (نفس quiz.js) ─────────────────────────────────────────────────────
/** يُحوّل مصفوفة الإجابات إلى أرقام 1-based */
const norm = (arr) => (arr || []).map(c =>
  (typeof c === 'string' && c.startsWith('opt_')) ? Number(c.replace('opt_', '')) : Number(c)
).filter(Boolean);

/** نص الخيار سواء كان object أو string */
const optText = (o) => ((o && typeof o === 'object') ? (o.text || '') : String(o ?? ''));

// ══════════════════════════════════════════════════════════════════════════════
// زر الانضمام في الهيدر (polling خفيف 30s — مجرد وجود حصة لا يحتاج SSE)
// ══════════════════════════════════════════════════════════════════════════════
let _liveTimer = null;

export function mountLiveJoinBtn(container) {
  _renderJoinBtn(container);
  if (_liveTimer) clearInterval(_liveTimer);
  _liveTimer = setInterval(() => _renderJoinBtn(container), 30_000);
}

async function _renderJoinBtn(container) {
  try {
    const { session } = await api.get('/live/active');
    if (!session || session.status === 'ended') { container.innerHTML = ''; return; }
    const isLive = session.status === 'live';
    container.innerHTML = html`
      <button class="live-join-btn ${isLive ? 'is-live' : 'is-waiting'}" id="live-join-trigger" aria-live="polite">
        <span class="live-dot" aria-hidden="true"></span>
        <span>${isLive ? t('live.joinNow') : t('live.waiting')}</span>
      </button>`.s;
    container.querySelector('#live-join-trigger')?.addEventListener('click', () => navigate(`/live/${session.id}`));
  } catch { container.innerHTML = ''; }
}

// ══════════════════════════════════════════════════════════════════════════════
// STUDENT VIEW — صفحة الحصة (Real-time SSE)
// ══════════════════════════════════════════════════════════════════════════════
let _sse = null; // EventSource الحالي

export async function liveSessionView(el, ctx) {
  const id = Number(ctx.params.id);
  _closeSSE();

  el.innerHTML = html`<div class="page-wrap live-page"><div class="live-loading">${t('live.loading')}</div></div>`.s;

  try {
    await api.post(`/live/${id}/join`, {});
  } catch (e) {
    const msg = e?.data?.error;
    if (msg === 'session_ended') return _showEnded(el);
    if (msg === 'forbidden')     return _showForbidden(el);
  }

  let initState = null;
  try { initState = await api.get(`/live/${id}/state`); } catch {}

  _buildStudentShell(el, id, initState);
  _connectSSE(el, id, false);
}

function _buildStudentShell(el, sessionId, initState) {
  const status = initState?.status || 'waiting';

  // ── واجهة NARSA الكاملة — نفس هيكل الامتحان التجريبي ───────────────────────
  el.innerHTML = html`<div class="nrs-window" id="live-student-wrap">

    <!-- شريط علوي -->
    <header class="nrs-topbar">
      <div class="live-conn-wrap">
        <span class="live-connection-dot" id="live-conn-dot" title="${t('live.connecting')}">●</span>
      </div>
      <div class="nrs-tb-pills">
        <span class="nrs-tb-pill nrs-tb-title">📡 ${t('live.liveSession')}</span>
        <span class="nrs-tb-pill nrs-tb-count" id="live-q-num">— / —</span>
      </div>
      <div style="width:40px"></div>
      <div class="nrs-tb-progress" aria-hidden="true"><i id="tb-progress" style="width:0%"></i></div>
    </header>

    <!-- الصف الرئيسي: wrapper — المحتوى (nrs-content-row) يُعاد رسمه عند كل سؤال -->
    <div class="live-nrs-main" id="live-main">
      <div class="nrs-content-row">
        ${raw(status === 'waiting' ? _waitingRoomSide() : status === 'ended' ? _endedSide() : _emptySide())}
      </div>
    </div>

    <!-- شريط سفلي (نفس quiz) -->
    <footer class="nrs-footer">
      <div class="nrs-footer-item">
        <span class="nrs-footer-label">صنف التكوين</span>
        <span class="nrs-footer-val">${store.user?.license_cat || 'B'}</span>
      </div>
      <div class="nrs-footer-item">
        <span class="nrs-footer-label">سؤال</span>
        <span class="nrs-footer-val" id="nrs-footer-counter">— / —</span>
      </div>
    </footer>

  </div>`.s;

  // إذا كانت الحصة نشطة ولديها سؤال حالي
  if (initState?.status === 'live' && initState?.question) {
    _renderQuestion(el, sessionId, initState);
  }
}

// HTML هيكل اللوحة الجانبية الفارغة — يُوضع مباشرة داخل #live-main
function _emptySide() {
  return html`<aside class="nrs-side">
    <div class="nrs-ctrl-col">
      <div class="nrs-indicators" id="nrs-indicators" aria-hidden="true">
        <span class="nrs-ind"></span><span class="nrs-ind"></span>
        <span class="nrs-ind"></span><span class="nrs-ind"></span>
      </div>
      <div class="nrs-panel">
        <div class="nrs-choices" id="nrs-choices">
          ${[1,2,3,4].map(n => html`<button class="nrs-choice-btn choice-inactive" disabled type="button"><span class="nrs-choice-num">${n}</span><span class="nrs-choice-sq"></span></button>`).join('')}
        </div>
        <button class="nrs-btn-ok" id="btn-ok" type="button" disabled>
          <span class="ok-ic" aria-hidden="true">✓</span><span class="ok-lbl">موافق</span>
        </button>
      </div>
    </div>
    <div class="nrs-info-box">
      <div class="nrs-info-school">${esc(store.user?.school_name || store.user?.name || '')}</div>
      <div class="nrs-info-cat">${store.user?.license_cat || 'B'}</div>
      <div class="nrs-info-num" id="nrs-info-num">#—</div>
    </div>
  </aside>
  <div class="nrs-main">
    <div class="nrs-media"><div class="nrs-no-media"><span>🚗</span></div></div>
    <div class="nrs-text-panel" id="nrs-text-panel">
      <div id="live-status-area"></div>
    </div>
  </div>`.s;
}

// الانتظار داخل الهيكل الكامل
function _waitingRoomSide() {
  return html`<aside class="nrs-side">
    <div class="nrs-ctrl-col">
      <div class="nrs-indicators" aria-hidden="true">
        <span class="nrs-ind"></span><span class="nrs-ind"></span>
        <span class="nrs-ind"></span><span class="nrs-ind"></span>
      </div>
      <div class="nrs-panel">
        <div class="nrs-choices">
          ${[1,2,3,4].map(n => html`<button class="nrs-choice-btn choice-inactive" disabled type="button"><span class="nrs-choice-num">${n}</span><span class="nrs-choice-sq"></span></button>`).join('')}
        </div>
        <button class="nrs-btn-ok" disabled type="button">
          <span class="ok-ic" aria-hidden="true">✓</span><span class="ok-lbl">موافق</span>
        </button>
      </div>
    </div>
    <div class="nrs-info-box">
      <div class="nrs-info-school">${esc(store.user?.school_name || store.user?.name || '')}</div>
      <div class="nrs-info-cat">${store.user?.license_cat || 'B'}</div>
      <div class="nrs-info-num">#—</div>
    </div>
  </aside>
  <div class="nrs-main">
    <div class="nrs-media"><div class="nrs-no-media"><span>📡</span></div></div>
    <div class="nrs-text-panel" id="nrs-text-panel">
      ${raw(_waitingRoomInner())}
    </div>
  </div>`.s;
}

function _waitingRoomInner() {
  return html`<div class="live-waiting-room">
    <div class="live-waiting-anim">
      <span class="live-waiting-dot"></span>
      <span class="live-waiting-dot"></span>
      <span class="live-waiting-dot"></span>
    </div>
    <div class="live-waiting-icon">📡</div>
    <h2 class="live-waiting-title">${t('live.waitingRoom')}</h2>
    <p class="live-waiting-desc">${t('live.waitingDesc')}</p>
    <p class="live-waiting-hint">${t('live.waitingHint')}</p>
  </div>`.s;
}

function _endedSide() {
  return html`<aside class="nrs-side">
    <div class="nrs-ctrl-col">
      <div class="nrs-indicators" aria-hidden="true">
        <span class="nrs-ind"></span><span class="nrs-ind"></span>
        <span class="nrs-ind"></span><span class="nrs-ind"></span>
      </div>
      <div class="nrs-panel">
        <div class="nrs-choices">
          ${[1,2,3,4].map(n => html`<button class="nrs-choice-btn choice-inactive" disabled type="button"><span class="nrs-choice-num">${n}</span><span class="nrs-choice-sq"></span></button>`).join('')}
        </div>
        <button class="nrs-btn-ok" disabled type="button">
          <span class="ok-ic" aria-hidden="true">✓</span><span class="ok-lbl">موافق</span>
        </button>
      </div>
    </div>
    <div class="nrs-info-box">
      <div class="nrs-info-school">${esc(store.user?.school_name || store.user?.name || '')}</div>
      <div class="nrs-info-cat">${store.user?.license_cat || 'B'}</div>
      <div class="nrs-info-num">#—</div>
    </div>
  </aside>
  <div class="nrs-main">
    <div class="nrs-media"><div class="nrs-no-media"><span>🏁</span></div></div>
    <div class="nrs-text-panel" id="nrs-text-panel">
      ${raw(_endedInner())}
    </div>
  </div>`.s;
}

function _endedInner() {
  return html`<div class="live-ended-wrap">
    <div class="live-ended-ic">🏁</div>
    <h2>${t('live.ended')}</h2>
    <p>${t('live.endedDesc')}</p>
    <a class="btn" href="/dashboard">${t('nav.dashboard')}</a>
  </div>`.s;
}

function _connectSSE(el, sessionId, isInstructor) {
  _closeSSE();
  const url = `/api/live/${sessionId}/stream`;
  _sse = new EventSource(url, { withCredentials: true });

  const dot = el.querySelector('#live-conn-dot');

  _sse.onopen = () => { if (dot) { dot.className = 'live-connection-dot connected'; dot.title = t('live.connected'); } };
  _sse.onerror = () => { if (dot) { dot.className = 'live-connection-dot error'; dot.title = t('live.disconnected'); } };

  _sse.addEventListener('session', (e) => {
    const data = JSON.parse(e.data);
    if (data.status === 'ended') {
      _closeSSE();
      // المؤسسة: إخفاء شريط التحكم عند الانتهاء
      const bar = el.querySelector('#live-instructor-bar');
      if (bar) bar.style.display = 'none';
      if (!isInstructor) {
        // للطالب: نعيد رسم بشاشة الانتهاء
        const wrap = el.querySelector('#live-main');
        if (wrap) wrap.innerHTML = `<div class="nrs-content-row">${_endedSide()}</div>`;
        api.get(`/live/${sessionId}/results`).then(r => {
          if (r?.answers?.length) {
            const panel = el.querySelector('#nrs-text-panel');
            if (panel) panel.insertAdjacentHTML('beforeend', _fullResultsHtml(r));
          }
        }).catch(() => {});
      } else {
        const main = el.querySelector('#live-main');
        if (main) main.innerHTML = _endedHtml();
      }
    } else if (data.status === 'live') {
      const main = el.querySelector('#live-main');
      // إظهار شاشة انطلاق مؤقتة ريثما يصل حدث `question`
      if (main) main.innerHTML = `<div class="nrs-content-row">${_emptySide()}</div>`;
      // المؤسسة: تبديل زر "بدء" → زر "التالي" في الشريط
      if (isInstructor) {
        const bar = el.querySelector('#live-instructor-bar');
        if (bar) {
          const badge = bar.querySelector('.live-badge');
          if (badge) { badge.className = 'live-badge live'; badge.textContent = t('live.admin.live'); }
          const startBtn = bar.querySelector('#start-live-btn');
          if (startBtn) {
            const nextBtn = document.createElement('button');
            nextBtn.className = 'btn btn-primary';
            nextBtn.id = 'next-q-btn';
            nextBtn.textContent = `⏭ ${t('live.admin.next')}`;
            nextBtn.addEventListener('click', () => _doAction(el, sessionId, 'next'));
            startBtn.replaceWith(nextBtn);
          }
        }
      }
    } else if (data.status === 'waiting') {
      const main = el.querySelector('#live-main');
      if (main) main.innerHTML = `<div class="nrs-content-row">${_waitingRoomSide()}</div>`;
    }
  });

  _sse.addEventListener('question', (e) => {
    if (isInstructor) return; // المؤسسة تستخدم question_full فقط
    const data = JSON.parse(e.data);
    _renderQuestion(el, sessionId, data);
    _updateProgress(el, data.current_q, data.total);
  });

  _sse.addEventListener('answer_ack', (e) => {
    if (isInstructor) return; // المؤسسة لا تُجيب
    const data = JSON.parse(e.data);
    _showAnswerFeedback(el, data);
  });

  // answered_count + leaderboard: للمؤسسة فقط — الطالب لا يرى هذه البيانات
  _sse.addEventListener('answered_count', (e) => {
    if (!isInstructor) return;
    const { count } = JSON.parse(e.data);
    const cnt = el.querySelector('#live-ans-count');
    if (cnt) cnt.textContent = count;
  });

  _sse.addEventListener('leaderboard', (e) => {
    if (!isInstructor) return;
    const { board } = JSON.parse(e.data);
    _updateLeaderboard(el, board, null);
  });

  _sse.addEventListener('connected_count', (e) => {
    if (!isInstructor) return;
    const { count } = JSON.parse(e.data);
    const c = el.querySelector('#live-connected-count');
    if (c) c.textContent = count;
  });

  _sse.addEventListener('question_full', (e) => {
    const data = JSON.parse(e.data);
    _renderInstructorQuestion(el, sessionId, data);
    _updateProgress(el, data.current_q, data.total);
  });

  document.addEventListener('routechange', _closeSSE, { once: true });
}

function _closeSSE() {
  if (_sse) { _sse.close(); _sse = null; }
}

// ── رسم السؤال للطالب — نفس تصميم quiz.js بالكامل ───────────────────────────
let _studentAnswered = false;
let _studentSelected = new Set(); // 1-based (نفس quiz.js)
let _currentOptCount = 4;         // عدد الخيارات الحقيقي للسؤال الحالي
let _activeSessionId = null;      // يُخزَّن عند رسم سؤال المؤسسة

function _renderQuestion(el, sessionId, data) {
  _studentAnswered = false;
  _studentSelected = new Set();
  const { question, myAnswer, current_q, total } = data;
  if (!question) return;

  _updateProgress(el, current_q, total);

  const opts     = question.options || [];
  const optCount = Math.max(opts.length, 2); // دائماً 2 على الأقل، 4 كحد أقصى
  _currentOptCount = optCount;
  const answered = !!myAnswer;
  // تحويل الإجابة المسجّلة إلى مجموعة 1-based
  const prevSel  = new Set(norm(myAnswer?.selected || []));
  if (answered) { _studentSelected = prevSel; _studentAnswered = true; }

  // ── يستبدل محتوى #live-main بالكامل ──────────────────────────────────────
  const main = el.querySelector('#live-main');
  if (!main) return;
  const wrap = main;

  const isLast = total > 0 && (current_q + 1) >= total;

  // نستبدل محتوى #live-main بمحتوى السؤال
  wrap.innerHTML = `
    <div class="nrs-content-row" id="live-q-wrap">
      <aside class="nrs-side">
        <div class="nrs-ctrl-col">
          <div class="nrs-indicators" id="nrs-indicators" aria-hidden="true"></div>
          <div class="nrs-panel">
            <div class="nrs-choices" id="nrs-choices"></div>
            <button class="nrs-btn-ok" id="btn-ok" type="button" disabled data-last="${isLast ? '1' : '0'}">
              <span class="ok-ic" aria-hidden="true">${IC.check}</span>
              <span class="ok-lbl">${isLast ? 'إنهاء' : 'موافق'}</span>
            </button>
          </div>
          <!-- أزرار تحكم الطالب -->
          <div class="live-student-ctrl-btns">
            <button class="live-ctrl-btn live-ctrl-stop" id="btn-stop-student" type="button" title="إنهاء الحصة">
              <span class="live-ctrl-ic">⏹</span><span class="live-ctrl-lbl">Stop</span>
            </button>
            <button class="live-ctrl-btn live-ctrl-reset" id="btn-reset-student" type="button" title="حذف الإجابة وإعادة الاختيار">
              <span class="live-ctrl-ic">✏️</span><span class="live-ctrl-lbl">تصحيح</span>
            </button>
          </div>
        </div>
        <div class="nrs-info-box">
          <div class="nrs-info-school">${esc(store.user?.school_name || store.user?.name || '')}</div>
          <div class="nrs-info-cat">${store.user?.license_cat || 'B'}</div>
          <div class="nrs-info-num" id="nrs-info-num">#${question.id || (current_q + 1)}</div>
        </div>
      </aside>
      <div class="nrs-main">
        <div class="nrs-media" id="nrs-media"></div>
        <div class="nrs-text-panel" id="nrs-text-panel"></div>
      </div>
    </div>`;

  // تحديث المؤشرات والأزرار والنص
  _liveRenderChoices(el, optCount, _studentSelected, answered);
  _liveRenderIndicators(el, optCount, _studentSelected);
  _liveRenderMedia(el, question);
  _liveRenderTextPanel(el, question, opts, _studentSelected, answered);

  if (answered) _liveShowRecorded(el);

  // ── ربط أزرار الحصة للطالب ───────────────────────────────────────────────
  // زر Stop: ينهي الامتحان ويعرض نتيجة الطالب
  const stopBtn = el.querySelector('#btn-stop-student');
  if (stopBtn) {
    stopBtn.addEventListener('click', () => _studentStop(el, sessionId));
  }

  // زر تصحيح: يحذف الإجابة المسجّلة ويعيد الاختيار
  const resetBtn = el.querySelector('#btn-reset-student');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => _studentReset(el, sessionId, question, opts, current_q, total));
  }

  // زر موافق: يُرسل الإجابة (أو ينهي إذا كان آخر سؤال)
  const okBtn = el.querySelector('#btn-ok');
  if (okBtn) {
    okBtn.addEventListener('click', () => _studentOkClick(el, sessionId, isLast));
  }

  // ربط أحداث الأزرار (فقط إذا لم يُجب بعد)
  if (!answered) {
    _liveBtnBindEvents(el, sessionId);
  }
}

// ── زر Stop للطالب: إنهاء وعرض النتيجة ──────────────────────────────────────
async function _studentStop(el, sessionId) {
  if (!confirm('هل تريد إنهاء الحصة وعرض نتيجتك؟')) return;
  _closeSSE();
  const main = el.querySelector('#live-main');
  if (main) main.innerHTML = `<div class="nrs-content-row">${_endedSide()}</div>`;
  try {
    const r = await api.get(`/live/${sessionId}/results`);
    _showStudentResults(el, r);
  } catch {
    toast('تعذّر جلب النتائج', 'error');
  }
}

// ── زر تصحيح للطالب: حذف الإجابة وإعادة الاختيار ────────────────────────────
function _studentReset(el, sessionId, question, opts, current_q, total) {
  // إعادة الحالة
  _studentAnswered = false;
  _studentSelected = new Set();

  // إعادة رسم الأزرار بدون تعطيل
  _liveRenderChoices(el, _currentOptCount, _studentSelected, false);
  _liveRenderIndicators(el, _currentOptCount, _studentSelected);
  _liveRenderTextPanel(el, question, opts, _studentSelected, false);

  // تعطيل زر موافق حتى يختار مجدداً
  const okBtn = el.querySelector('#btn-ok');
  if (okBtn) okBtn.disabled = true;

  // إزالة رسالة "تم التسجيل"
  el.querySelectorAll('.live-recorded').forEach(e => e.remove());

  // إعادة ربط أحداث الأزرار
  _liveBtnBindEvents(el, sessionId);

  // ربط زر موافق مجدداً
  if (okBtn) {
    // إزالة listener القديم بإعادة clone
    const newOk = okBtn.cloneNode(true);
    okBtn.replaceWith(newOk);
    newOk.addEventListener('click', () => _studentOkClick(el, sessionId, (current_q + 1) >= total));
  }

  // ربط زر تصحيح مجدداً
  const resetBtn = el.querySelector('#btn-reset-student');
  if (resetBtn) {
    const newReset = resetBtn.cloneNode(true);
    resetBtn.replaceWith(newReset);
    newReset.addEventListener('click', () => _studentReset(el, sessionId, question, opts, current_q, total));
  }
}

// ── زر موافق للطالب: لا يعمل إلا بعد الاختيار ───────────────────────────────
async function _studentOkClick(el, sessionId, isLast) {
  if (_studentSelected.size === 0) {
    toast('اختر إجابة أولاً', 'error');
    return;
  }

  if (!_studentAnswered) {
    // إرسال الإجابة أولاً إذا لم تُرسل بعد
    _studentAnswered = true;
    el.querySelectorAll('.nrs-choice-btn').forEach(b => b.disabled = true);
    try {
      await api.post(`/live/${sessionId}/answer`, { selected: [..._studentSelected] });
    } catch {
      _studentAnswered = false;
      el.querySelectorAll('.nrs-choice-btn[data-n]').forEach(b => b.disabled = false);
      toast(t('err.server_error'), 'error');
      return;
    }
  }

  if (isLast) {
    // آخر سؤال → عرض النتيجة
    _closeSSE();
    const main = el.querySelector('#live-main');
    if (main) main.innerHTML = `<div class="nrs-content-row">${_endedSide()}</div>`;
    try {
      const r = await api.get(`/live/${sessionId}/results`);
      _showStudentResults(el, r);
    } catch {
      toast('تعذّر جلب النتائج', 'error');
    }
  }
  // إذا لم يكن آخر سؤال، يبقى في انتظار حدث SSE question التالي
}

// ── عرض نتيجة الطالب بعد الانتهاء ──────────────────────────────────────────
function _showStudentResults(el, r) {
  const panel = el.querySelector('#nrs-text-panel');
  const { answers = [] } = r || {};
  const correct = answers.filter(a => a.isCorrect).length;
  const wrong   = answers.length - correct;

  const html2 = `<div class="live-results-full">
    <div class="live-results-score">
      <div class="live-score-row">
        <span class="live-score-ic">🏁</span>
        <span class="live-results-num">${correct} / ${answers.length}</span>
      </div>
      <span class="live-results-label">إجابات صحيحة</span>
      ${wrong > 0 ? `<div class="live-wrong-count">❌ ${wrong} سؤال خاطئ</div>` : '<div class="live-wrong-count correct-all">✅ أحسنت! جميع الإجابات صحيحة</div>'}
    </div>
    ${answers.map((a, qi) => `<div class="live-results-q ${a.isCorrect ? 'correct' : 'wrong'}">
      <div class="live-results-q-header">
        <span class="live-results-q-num">${qi + 1}.</span>
        <span class="live-results-q-ic">${a.isCorrect ? '✅' : '❌'}</span>
        <span class="live-results-q-text">${esc(a.text || '')}</span>
      </div>
      ${(a.options || []).map((o, i) => {
        const isCorrectOpt  = (a.correct  || []).map(Number).includes(i);
        const isSelectedOpt = (a.selected || []).map(Number).includes(i);
        let cls = 'live-results-opt';
        if (isCorrectOpt)  cls += ' correct';
        if (isSelectedOpt && !isCorrectOpt) cls += ' wrong';
        return `<div class="${cls}">
          <span class="live-opt-letter">${i + 1}</span>
          <span>${esc(typeof o === 'object' ? o.text || '' : String(o ?? ''))}</span>
          ${isCorrectOpt ? '<span style="margin-inline-start:auto">✓</span>' : ''}
        </div>`;
      }).join('')}
    </div>`).join('')}
  </div>`;

  if (panel) {
    panel.innerHTML = html2;
  } else {
    const main = el.querySelector('#live-main');
    if (main) main.insertAdjacentHTML('beforeend', html2);
  }
}

function _liveBtnBindEvents(el, sessionId) {
  el.querySelectorAll('.nrs-choice-btn[data-n]:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => _handleStudentClick(el, sessionId, btn), { once: true });
  });
}

// ── رسم أزرار الاختيار (1–4) ─────────────────────────────────────────────────
function _liveRenderChoices(el, optCount, selected, answered) {
  const container = el.querySelector('#nrs-choices');
  if (!container) return;
  container.innerHTML = Array.from({ length: 4 }, (_, i) => {
    const n = i + 1;
    const hasOpt  = n <= optCount;
    const pressed = selected.has(n);
    let cls = 'nrs-choice-btn';
    if (!hasOpt)       cls += ' choice-inactive';
    else if (pressed)  cls += ' choice-on';
    // إذا أجاب الطالب، الأزرار تصبح disabled (لا يمكن التغيير — يجب استخدام زر تصحيح)
    return `<button class="${cls}" data-n="${n}" ${(answered || !hasOpt) ? 'disabled' : ''} type="button">
      <span class="nrs-choice-num">${n}</span><span class="nrs-choice-sq"></span>
    </button>`;
  }).join('');
}

// ── تحديث زر موافق: نهاية → إنهاء في السؤال الأخير ──────────────────────────
function _updateOkBtn(el, current_q, total, isLast) {
  const btn = el.querySelector('#btn-ok');
  if (!btn) return;
  if (isLast) {
    btn.querySelector('.ok-lbl').textContent = 'إنهاء';
    btn.dataset.last = '1';
  } else {
    btn.querySelector('.ok-lbl').textContent = 'موافق';
    btn.dataset.last = '0';
  }

}

// ── رسم المؤشرات (1–4) ───────────────────────────────────────────────────────
function _liveRenderIndicators(el, optCount, selected) {
  const container = el.querySelector('#nrs-indicators');
  if (!container) return;
  container.innerHTML = [1, 2, 3, 4].map(n => {
    const on = selected.has(n) && n <= optCount;
    return `<span class="nrs-ind${on ? ' nrs-ind-on' : ''}">${on ? n : ''}</span>`;
  }).join('');
}

// ── رسم الوسائط ────────────────────────────────────────────────────────────────
function _liveRenderMedia(el, question) {
  const container = el.querySelector('#nrs-media');
  if (!container) return;
  if (question.image) {
    container.innerHTML = `<div class="nrs-img-wrap"><img src="${esc(question.image)}" alt="${esc(question.image_alt || '')}" loading="lazy" style="max-width:100%;max-height:100%;object-fit:contain"></div>`;
  } else {
    container.innerHTML = `<div class="nrs-no-media"><span>🚗</span></div>`;
  }
}

// ── رسم لوحة النص — نفس quiz.js بالضبط: nrs-q-main + nrs-block + nrs-opts-list ──
function _liveRenderTextPanel(el, question, opts, selected, answered) {
  const container = el.querySelector('#nrs-text-panel');
  if (!container) return;

  const main = question.text || '';

  const rows = Array.from({ length: 4 }, (_, i) => {
    const n = i + 1;
    const hasOpt = n <= opts.length;
    if (!hasOpt) return '';
    const on    = selected.has(n);
    const state = on ? 'sub-on' : '';
    return `<div class="nrs-opt ${state}" data-n="${n}"><span class="nrs-opt-n">${n}</span><div class="nrs-opt-dots" aria-hidden="true"></div><span class="nrs-opt-text">${esc(optText(opts[i]))}</span></div>`;
  }).join('');

  // نفس بنية quiz.js: nrs-q-main → nrs-block → nrs-opts-list
  container.innerHTML = `${main ? `<div class="nrs-q-main" dir="rtl">${esc(main)}</div>` : ''}<div class="nrs-block" dir="rtl"><div class="nrs-opts-list" id="nrs-opts-list">${rows}</div></div>`;
}

// ── إظهار رسالة "تم التسجيل" بدون كشف النتيجة ──────────────────────────────
function _liveShowRecorded(el) {
  const panel = el.querySelector('#nrs-text-panel');
  if (panel && !panel.querySelector('.live-recorded')) {
    panel.insertAdjacentHTML('beforeend', `<div class="live-recorded"><span>📝</span> <span>${t('live.recorded')}</span></div>`);
  }
}

function _handleStudentClick(el, sessionId, btn) {
  if (_studentAnswered) return;

  const n = Number(btn.dataset.n);
  if (!n) return;

  // toggle الاختيار (1-4، متعدد الاختيارات مدعوم)
  if (_studentSelected.has(n)) _studentSelected.delete(n);
  else _studentSelected.add(n); // لا clear — يدعم متعدد الاختيارات

  // تحديث واجهة الاختيار
  _liveRenderChoices(el, _currentOptCount, _studentSelected, false);
  _liveRenderIndicators(el, _currentOptCount, _studentSelected);

  // تحديث الخيار المتني
  el.querySelectorAll('.nrs-opt[data-n]').forEach(o => {
    o.classList.toggle('sub-on', _studentSelected.has(Number(o.dataset.n)));
  });

  // ربط أحداث الأزرار بعد re-render (نعيد الاستماع)
  _liveBtnBindEvents(el, sessionId);

  // تفعيل زر موافق إذا تم الاختيار، تعطيله إذا ألغي الكل
  const okBtn = el.querySelector('#btn-ok');
  if (okBtn) okBtn.disabled = (_studentSelected.size === 0);

  // ⚠️ لا نرسل الإجابة هنا — يُرسل عند ضغط "موافق"
}

function _showAnswerFeedback(el, data) {
  // SSE answer_ack: تأكيد تسجيل الإجابة بدون كشف الصحيح/الخطأ
  const confirmed = new Set(norm(data?.selected || []));

  _liveRenderChoices(el, _currentOptCount, confirmed, true);
  _liveRenderIndicators(el, _currentOptCount, confirmed);

  // تحديث الخيار المتني
  el.querySelectorAll('.nrs-opt[data-n]').forEach(o => {
    o.classList.toggle('sub-on', confirmed.has(Number(o.dataset.n)));
  });

  _liveShowRecorded(el);
}

// رسالة محايدة أثناء الحصة — لا تكشف النتيجة
function _recordedHtml() {
  return html`<div class="live-feedback recorded">
    <span class="live-fb-ic">📝</span> <span>${t('live.recorded')}</span>
  </div>`.s;
}

// تُستخدم عند انتهاء الحصة وعرض النتائج الكاملة
function _feedbackHtml(isCorrect) {
  return html`<div class="live-feedback ${isCorrect ? 'correct' : 'wrong'}">
    ${isCorrect
      ? html`<span class="live-fb-ic">✅</span> <span>${t('live.correct')}</span>`
      : html`<span class="live-fb-ic">❌</span> <span>${t('live.wrong')}</span>`}
  </div>`.s;
}

function _updateProgress(el, current, total) {
  const qNum = el.querySelector('#live-q-num');
  const fill = el.querySelector('#tb-progress');
  const footerCounter = el.querySelector('#nrs-footer-counter');
  const label = `${(current ?? 0) + 1} / ${total}`;
  if (qNum) qNum.textContent = label;
  if (footerCounter) footerCounter.textContent = label;
  if (fill) fill.style.width = `${total ? Math.round(100 * ((current ?? 0) + 1) / total) : 0}%`;
}

// ── لوحة الترتيب ────────────────────────────────────────────────────────────
const MEDALS = ['🥇', '🥈', '🥉'];

function _updateLeaderboard(el, board, myUserId) {
  const list = el.querySelector('#live-lb-list');
  if (!list) return;
  if (!board?.length) { list.innerHTML = html`<li class="lb-empty">${t('live.lbEmpty')}</li>`.s; return; }

  list.innerHTML = html`${board.map((row) => {
    const isMe  = String(row.userId) === String(myUserId);
    const medal = MEDALS[row.rank - 1] || `${row.rank}.`;
    return html`<li class="lb-row ${isMe ? 'is-me' : ''}" data-rank="${row.rank}">
      <span class="lb-medal">${medal}</span>
      <span class="lb-name">${isMe ? html`<strong>${t('live.lbYou')}</strong>` : html`${t('champ.candidate')} #${row.userId}`}</span>
      <span class="lb-score">${row.score} ${t('live.lbPts')}</span>
    </li>`;
  })}`.s;

  const myRow = list.querySelector('.lb-row.is-me');
  if (myRow) myRow.scrollIntoView({ block: 'nearest' });
}

function _waitingRoomHtml() {
  return html`<div class="live-waiting-room">
    <div class="live-waiting-anim">
      <span class="live-waiting-dot"></span>
      <span class="live-waiting-dot"></span>
      <span class="live-waiting-dot"></span>
    </div>
    <div class="live-waiting-icon">📡</div>
    <h2 class="live-waiting-title">${t('live.waitingRoom')}</h2>
    <p class="live-waiting-desc">${t('live.waitingDesc')}</p>
    <p class="live-waiting-hint">${t('live.waitingHint')}</p>
  </div>`.s;
}

function _launchingHtml() {
  return html`<div class="live-launching">
    <div class="live-launching-icon">🚀</div>
    <h2>${t('live.launching')}</h2>
  </div>`.s;
}

function _endedHtml() {
  return html`<div class="live-ended-wrap">
    <div class="live-ended-ic">🏁</div>
    <h2>${t('live.ended')}</h2>
    <p>${t('live.endedDesc')}</p>
    <a class="btn" href="/dashboard">${t('nav.dashboard')}</a>
  </div>`.s;
}

// عرض نتائج مفصّلة بعد انتهاء الحصة (يُظهر الإجابات الصحيحة والخاطئة)
function _fullResultsHtml(r) {
  const { answers = [], score = 0, total = 0 } = r;
  const correct = answers.filter(a => a.isCorrect).length;
  return html`<div class="live-results-full">
    <div class="live-results-score">
      <span class="live-results-num">${correct}/${answers.length}</span>
      <span class="live-results-label">${t('live.correct')}</span>
    </div>
    ${answers.map((a, qi) => html`<div class="live-results-q ${a.isCorrect ? 'correct' : 'wrong'}">
      <div class="live-results-q-header">
        <span class="live-results-q-num">${qi + 1}.</span>
        <span class="live-results-q-ic">${a.isCorrect ? '✅' : '❌'}</span>
        <span class="live-results-q-text">${esc(a.text || '')}</span>
      </div>
      ${(a.options || []).map((o, i) => {
        const isCorrectOpt  = (a.correct  || []).map(Number).includes(i);
        const isSelectedOpt = (a.selected || []).map(Number).includes(i);
        let cls = 'live-results-opt';
        if (isCorrectOpt)  cls += ' correct';
        if (isSelectedOpt && !isCorrectOpt) cls += ' wrong';
        return html`<div class="${cls}">
          <span class="live-opt-letter">${String.fromCharCode(0x0041 + i)}</span>
          <span>${esc(o)}</span>
          ${isCorrectOpt ? html`<span style="margin-inline-start:auto">✓</span>` : ''}
        </div>`;
      })}
      ${a.explanation ? html`<div class="live-results-explain">💡 ${esc(a.explanation)}</div>` : ''}
    </div>`)}
  </div>`.s;
}

function _showEnded(el) {
  el.innerHTML = html`<div class="page-wrap live-page"><div class="live-ended-wrap">
    <div class="live-ended-ic">🏁</div>
    <h2>${t('live.ended')}</h2>
    <a class="btn" href="/dashboard">${t('nav.dashboard')}</a>
  </div></div>`.s;
}

function _showForbidden(el) {
  el.innerHTML = html`<div class="page-wrap live-page"><div class="empty">${t('live.forbidden')}</div></div>`.s;
}

// ══════════════════════════════════════════════════════════════════════════════
// INSTRUCTOR / SCHOOL VIEW — لوحة التحكم
// ══════════════════════════════════════════════════════════════════════════════
export async function adminLiveView(el) {
  el.innerHTML = html`<div class="page-wrap"><div class="live-loading">${t('live.loading')}</div></div>`.s;
  _closeSSE();

  let sessions = [];
  try {
    const r = await api.get('/live/school');
    sessions = r.sessions || [];
  } catch {
    el.innerHTML = html`<div class="page-wrap"><div class="empty">${t('err.server_error')}</div></div>`.s;
    return;
  }

  _renderAdminPanel(el, sessions);
}

function _renderAdminPanel(el, sessions) {
  const activeSess = sessions.find(s => s.status === 'live' || s.status === 'waiting');

  if (activeSess) {
    // ── وضع الحصة النشطة: نفس shell الطالب + شريط تحكم ──
    _buildInstructorShell(el, activeSess);
    _connectSSE(el, activeSess.id, true);
    api.get(`/live/${activeSess.id}/state`).then(r => {
      if (r.board) _updateLeaderboard(el, r.board, null);
      if (r.question && activeSess.status === 'live') {
        _renderInstructorQuestion(el, activeSess.id, r);
        _updateProgress(el, r.current_q, r.total);
      }
    }).catch(() => {});
    return;
  }

  // ── لا توجد حصة نشطة: عرض لوحة الإدارة العادية ──
  el.innerHTML = html`<div class="page-wrap admin-live-wrap">
    <div class="admin-live-header">
      <h1 class="dash-h">${t('live.admin.title')}</h1>
      <button class="btn btn-primary" id="create-live-btn">+ ${t('live.admin.create')}</button>
    </div>

    <div class="live-sessions-list">
      <h2 class="dash-h" style="margin-bottom:12px">${t('live.admin.history')}</h2>
      ${sessions.filter(s => s.status === 'ended').length === 0
        ? html`<div class="empty small">${t('live.admin.empty')}</div>`
        : sessions.filter(s => s.status === 'ended').map(s => html`
          <div class="live-sess-card ended">
            <div class="live-sess-info">
              <strong>${esc(s.title)}</strong>
              <span class="live-badge ended">${t('live.admin.ended')}</span>
              <span class="muted small">${s.started_at ? s.started_at.slice(0, 16) : ''}</span>
            </div>
            <a class="btn btn-sm" href="/admin/live/${s.id}/results">${t('live.admin.results')}</a>
          </div>`)}
    </div>
  </div>`.s;

  el.querySelector('#create-live-btn')?.addEventListener('click', () => _showCreateModal(el).catch(() => {}));
}

// ── Shell الحصة النشطة للمؤسسة — تصميم NARSA الأصلي + شريط تحكم ─────────────
function _buildInstructorShell(el, sess) {
  const isWaiting = sess.status === 'waiting';
  const qCount    = (sess.question_ids || []).length;

  el.innerHTML = html`<div class="nrs-window inst-live-wrap" id="live-student-wrap">

    <!-- شريط علوي: مؤشر اتصال + رقم السؤال + التقدم + leaderboard -->
    <header class="nrs-topbar">
      <div class="live-conn-wrap">
        <span class="live-connection-dot" id="live-conn-dot" title="${t('live.connecting')}">●</span>
      </div>
      <div class="nrs-tb-pills">
        <span class="nrs-tb-pill nrs-tb-title">📡 ${t('live.liveSession')}</span>
        <span class="nrs-tb-pill nrs-tb-count" id="live-q-num">— / —</span>
        <span class="nrs-tb-pill nrs-tb-count">${t('live.answered')}: <strong id="live-ans-count">0</strong></span>
        <span class="nrs-tb-pill nrs-tb-count"><span id="live-connected-count">0</span> متصل</span>
      </div>
      <!-- زر لوحة الترتيب — للمؤسسة فقط -->
      <button class="live-lb-toggle-btn" id="live-lb-btn" title="${t('live.leaderboard')}">🏆</button>
      <div class="nrs-tb-progress" aria-hidden="true"><i id="tb-progress" style="width:0%"></i></div>
    </header>

    <!-- المحتوى الرئيسي -->
    <div id="live-main" class="live-nrs-main">
      ${raw(isWaiting ? _waitingRoomHtml() : '')}
    </div>

    <!-- شريط تحكم المؤسسة (ثابت في الأسفل) -->
    <div class="live-instructor-bar" id="live-instructor-bar">
      <div class="inst-bar-info">
        <span class="live-badge ${sess.status}">${isWaiting ? t('live.admin.waiting') : t('live.admin.live')}</span>
        <strong class="inst-bar-title">${esc(sess.title)}</strong>
        <span class="muted small">${qCount} ${t('live.admin.questions')}</span>
      </div>
      <div class="inst-bar-actions">
        ${isWaiting ? html`<button class="btn btn-primary" id="start-live-btn">▶ ${t('live.admin.start')}</button>` : ''}
        ${!isWaiting ? html`<button class="btn btn-primary" id="next-q-btn">⏭ ${t('live.admin.next')}</button>` : ''}
        <button class="btn btn-danger" id="end-live-btn">⏹ ${t('live.admin.end')}</button>
      </div>
    </div>

    <!-- لوحة الترتيب — مخفية افتراضياً، تُفتح بالزر فقط -->
    <aside class="live-lb-panel hidden" id="live-lb-panel" aria-label="${t('live.leaderboard')}">
      <div class="live-lb-header">
        <span>🏆 ${t('live.leaderboard')}</span>
        <button class="live-lb-close" id="live-lb-close">✕</button>
      </div>
      <ol class="live-lb-list" id="live-lb-list"></ol>
    </aside>

  </div>`.s;

  // أحداث الأزرار
  el.querySelector('#live-lb-btn')?.addEventListener('click', () => {
    el.querySelector('#live-lb-panel')?.classList.toggle('hidden');
  });
  el.querySelector('#live-lb-close')?.addEventListener('click', () => {
    el.querySelector('#live-lb-panel')?.classList.add('hidden');
  });
  el.querySelector('#start-live-btn')?.addEventListener('click', () => _doAction(el, sess.id, 'start'));
  el.querySelector('#next-q-btn')?.addEventListener('click',    () => _doAction(el, sess.id, 'next'));
  el.querySelector('#end-live-btn')?.addEventListener('click',  () => _doAction(el, sess.id, 'end'));
}

// ── رسم سؤال المؤسسة — تصميم NARSA بدون كشف الإجابة الصحيحة أثناء الحصة ──────
function _renderInstructorQuestion(el, _sessionId, data) {
  _activeSessionId = _sessionId; // حفظ للاستخدام في أحداث الأزرار
  const { question, current_q, total } = data;
  if (!question) return;
  _updateProgress(el, current_q, total);

  const main = el.querySelector('#live-main');
  if (!main) return;

  const opts = question.options || [];
  // ⚠️ لا نكشف correct ولا explanation أثناء الحصة — يظهران فقط بعد session ended
  // question_full يحتوي على correct لكن لا نستخدمه هنا عمداً

  const isLast = data.total > 0 && (current_q + 1) >= data.total;

  main.innerHTML = html`<div class="nrs-content-row" id="live-q-wrap">

    <!-- الجانب الأيسر: أزرار الأرقام (للمؤسسة: غير قابلة للنقر) -->
    <aside class="nrs-side">
      <div class="nrs-ctrl-col">
        <div class="nrs-indicators" id="nrs-indicators" aria-hidden="true">
          ${opts.map((_, i) => html`<span class="nrs-ind"></span>`)}
          ${opts.length < 4 ? Array.from({length: 4 - opts.length}, () => html`<span class="nrs-ind"></span>`) : ''}
        </div>
        <div class="nrs-panel">
          <div class="nrs-choices" id="nrs-choices">
            ${opts.map((_, i) => html`<button class="nrs-choice-btn inst-choice" data-idx="${i}" data-n="${i+1}" disabled type="button">
              <span class="nrs-choice-num">${i + 1}</span>
              <span class="nrs-choice-sq"></span>
            </button>`)}
            ${opts.length < 4 ? Array.from({length: 4 - opts.length}, () => html`<button class="nrs-choice-btn choice-inactive" disabled type="button"><span class="nrs-choice-num"></span><span class="nrs-choice-sq"></span></button>`) : ''}
          </div>
          <!-- زر موافق/إنهاء للمؤسسة -->
          <button class="nrs-btn-ok inst-ok-btn" id="inst-btn-ok" type="button">
            <span class="ok-ic" aria-hidden="true">✓</span>
            <span class="ok-lbl">${isLast ? 'إنهاء' : 'موافق'}</span>
          </button>
        </div>
        <!-- أزرار Stop وتصحيح للمؤسسة -->
        <div class="live-student-ctrl-btns">
          <button class="live-ctrl-btn live-ctrl-stop" id="inst-btn-stop" type="button" title="إنهاء الحصة وعرض التصحيح">
            <span class="live-ctrl-ic">⏹</span><span class="live-ctrl-lbl">Stop</span>
          </button>
          <button class="live-ctrl-btn live-ctrl-reset" id="inst-btn-next" type="button" title="السؤال التالي">
            <span class="live-ctrl-ic">⏭</span><span class="live-ctrl-lbl">تصحيح</span>
          </button>
        </div>
      </div>
      <div class="nrs-info-box">
        <div class="nrs-info-school">${esc(store.user?.school_name || store.user?.name || '')}</div>
        <div class="nrs-info-cat">${store.user?.license_cat || 'B'}</div>
        <div class="nrs-info-num">#${question.id || (current_q + 1)}</div>
      </div>
    </aside>

    <!-- الجانب الأيمن: الصورة + السؤال والخيارات -->
    <div class="nrs-main">
      <div class="nrs-media" id="nrs-media">
        ${question.image
          ? html`<div class="nrs-img-wrap"><img src="${question.image}" alt="${question.image_alt || ''}" loading="lazy" style="max-width:100%;max-height:100%;object-fit:contain"></div>`
          : html`<div class="nrs-no-media"><span>🚗</span></div>`}
      </div>
      <div class="nrs-text-panel" id="nrs-text-panel">
        ${question.text ? html`<div class="nrs-q-main" dir="rtl">${esc(question.text)}</div>` : ''}
        <div class="nrs-block" dir="rtl">
          <div class="nrs-opts-list" id="nrs-opts-list">
            ${opts.map((o, i) => html`<div class="nrs-opt" data-n="${i+1}">
              <span class="nrs-opt-n">${i + 1}</span>
              <div class="nrs-opt-dots" aria-hidden="true"></div>
              <span class="nrs-opt-text">${esc(typeof o === 'object' ? o.text || '' : String(o ?? ''))}</span>
            </div>`)}
          </div>
        </div>
        <!-- الإجابة الصحيحة والشرح: يظهران بعد انتهاء الحصة فقط — لا شيء هنا -->
      </div>
    </div>

  </div>`.s;

  // ── ربط أحداث أزرار المؤسسة ──────────────────────────────────────────────
  // زر Stop: إنهاء الحصة وعرض صفحة التصحيح
  main.querySelector('#inst-btn-stop')?.addEventListener('click', async () => {
    if (!confirm('إنهاء الحصة وعرض صفحة التصحيح؟')) return;
    await _doAction(el, _sessionId, 'end');
    // _doAction('end') يعيد رسم لوحة الإدارة — navigate لصفحة النتائج
    if (_sessionId) navigate(`/admin/live/${_sessionId}/results`);
  });

  // زر تصحيح (= السؤال التالي)
  main.querySelector('#inst-btn-next')?.addEventListener('click', () => {
    _doAction(el, _sessionId, 'next');
  });

  // زر موافق: نفس السؤال التالي (أو إنهاء إذا آخر سؤال)
  main.querySelector('#inst-btn-ok')?.addEventListener('click', () => {
    if (isLast) {
      if (!confirm('هذا آخر سؤال — إنهاء الحصة؟')) return;
      _doAction(el, _sessionId, 'end');
      if (_sessionId) navigate(`/admin/live/${_sessionId}/results`);
    } else {
      _doAction(el, _sessionId, 'next');
    }
  });
}

async function _showCreateModal(el) {
  // جلب السلاسل المتاحة أولاً
  let seriesList = [];
  try { seriesList = await api.get('/live/series'); } catch {}

  const seriesOptions = seriesList.length
    ? seriesList.map((s) => html`<option value="${s.id}">${s.title} (${s.question_count} سؤال)</option>`)
    : [];

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = html`<div class="modal-box" style="max-width:480px">
    <h2>${t('live.admin.create')}</h2>
    <label class="form-label">${t('live.admin.titleLabel')}
      <input type="text" id="live-title" value="حصة جماعية" class="inp">
    </label>
    <label class="form-label">${t('live.admin.mode')}
      <select id="live-mode" class="inp">
        <option value="exam">${t('live.admin.modeExam')}</option>
        <option value="practice">${t('live.admin.modePractice')}</option>
      </select>
    </label>

    <div style="margin:16px 0 8px;font-weight:600;font-size:.9rem">مصدر الأسئلة</div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
      <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:12px;border-radius:10px;border:2px solid var(--border);transition:border-color .2s" id="src-random-box">
        <input type="radio" name="live-source" value="random" id="src-random" checked style="margin-top:2px;accent-color:var(--primary,#c2410c)">
        <div>
          <div style="font-weight:600">🎲 عشوائي من بنك الأسئلة</div>
          <div class="muted small" style="margin-top:2px">يتم اختيار الأسئلة عشوائياً من المجموعة المنشورة</div>
        </div>
      </label>
      ${seriesList.length ? html`
      <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:12px;border-radius:10px;border:2px solid var(--border);transition:border-color .2s" id="src-series-box">
        <input type="radio" name="live-source" value="series" id="src-series" style="margin-top:2px;accent-color:var(--primary,#c2410c)">
        <div style="flex:1">
          <div style="font-weight:600">📚 اختيار سلسلة</div>
          <div class="muted small" style="margin-top:2px">يتم استخدام أسئلة السلسلة المختارة بالترتيب</div>
          <select id="live-series" class="inp" style="margin-top:8px;display:none">
            ${seriesOptions}
          </select>
        </div>
      </label>` : html``}
    </div>

    <div id="count-row">
      <label class="form-label">${t('live.admin.qcount')} (5–46)
        <input type="number" id="live-count" value="40" min="5" max="46" class="inp">
      </label>
    </div>

    <div class="modal-actions">
      <button class="btn btn-primary" id="create-confirm">${t('live.admin.createConfirm')}</button>
      <button class="btn" id="create-cancel">${t('modal.cancel')}</button>
    </div>
  </div>`.s;

  document.body.appendChild(modal);

  // تبديل الحالة عند اختيار المصدر
  const radios = modal.querySelectorAll('input[name="live-source"]');
  const countRow = modal.querySelector('#count-row');
  const seriesSelect = modal.querySelector('#live-series');
  const randomBox = modal.querySelector('#src-random-box');
  const seriesBox = modal.querySelector('#src-series-box');

  const updateSource = () => {
    const val = modal.querySelector('input[name="live-source"]:checked')?.value || 'random';
    if (val === 'series') {
      countRow.style.display = 'none';
      if (seriesSelect) seriesSelect.style.display = 'block';
      if (seriesBox) seriesBox.style.borderColor = 'var(--primary,#c2410c)';
      if (randomBox) randomBox.style.borderColor = 'var(--border)';
    } else {
      countRow.style.display = 'block';
      if (seriesSelect) seriesSelect.style.display = 'none';
      if (randomBox) randomBox.style.borderColor = 'var(--primary,#c2410c)';
      if (seriesBox) seriesBox.style.borderColor = 'var(--border)';
    }
  };
  radios.forEach((r) => r.addEventListener('change', updateSource));
  updateSource(); // تطبيق الحالة الأولية

  modal.querySelector('#create-cancel').onclick = () => modal.remove();
  modal.querySelector('#create-confirm').onclick = async () => {
    const title  = modal.querySelector('#live-title').value.trim() || 'حصة جماعية';
    const mode   = modal.querySelector('#live-mode').value;
    const source = modal.querySelector('input[name="live-source"]:checked')?.value || 'random';
    const body   = { title, mode, source };

    if (source === 'series') {
      const sid = modal.querySelector('#live-series')?.value;
      if (!sid) { toast('اختر سلسلة أولاً', 'error'); return; }
      body.series_id = Number(sid);
    } else {
      body.count = Number(modal.querySelector('#live-count').value) || 40;
    }

    try {
      await api.post('/live/school', body);
      toast(t('live.admin.created'), 'success');
      modal.remove();
      adminLiveView(el);
    } catch { toast(t('err.server_error'), 'error'); }
  };
}

async function _doAction(el, sessionId, action) {
  if (!sessionId) return;
  try {
    await api.post(`/live/school/${sessionId}/${action}`, {});
    toast(t(`live.admin.${action}Done`), 'success');
    if (action === 'end') {
      _closeSSE();
      adminLiveView(el);
    }
  } catch (e) {
    const errCode = e?.data?.error;
    // آخر سؤال — نُنهي الحصة تلقائياً بعد تأكيد المستخدم
    if (action === 'next' && errCode === 'no_more_questions') {
      toast(t('live.admin.noMoreQ'), 'info');
      return;
    }
    toast(errCode || t('err.server_error'), 'error');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN RESULTS VIEW — نتائج الحصة للمؤسسة
// ══════════════════════════════════════════════════════════════════════════════
export async function adminLiveResultsView(el, ctx) {
  const id = Number(ctx.params.id);
  el.innerHTML = html`<div class="page-wrap"><div class="live-loading">${t('live.loading')}</div></div>`.s;

  let r;
  try {
    r = await api.get(`/live/school/${id}/results`);
  } catch {
    el.innerHTML = html`<div class="page-wrap"><div class="empty">${t('err.server_error')}</div></div>`.s;
    return;
  }

  const { session: sess, participants, questionStats = [], leaderboard = [] } = r;

  el.innerHTML = html`<div class="page-wrap admin-live-results">

    <!-- رأس الصفحة -->
    <div class="alr-header">
      <a class="btn btn-sm" href="/admin/live">← ${t('live.admin.title')}</a>
      <div class="alr-title">
        <h1>${esc(sess.title)}</h1>
        <span class="muted small">${sess.started_at ? sess.started_at.slice(0, 16) : ''}</span>
      </div>
    </div>

    <!-- إحصاءات سريعة -->
    <div class="alr-stats">
      <div class="alr-stat-card">
        <span class="alr-stat-num">${participants}</span>
        <span class="alr-stat-label">${t('live.admin.r.participants')}</span>
      </div>
      <div class="alr-stat-card">
        <span class="alr-stat-num">${(sess.question_ids || []).length}</span>
        <span class="alr-stat-label">${t('live.admin.r.questions')}</span>
      </div>
      <div class="alr-stat-card">
        <span class="alr-stat-num">${leaderboard.length > 0 ? leaderboard[0].score : '—'}</span>
        <span class="alr-stat-label">${t('live.admin.r.topScore')}</span>
      </div>
    </div>

    <!-- لوحة الترتيب النهائية -->
    <section class="alr-section">
      <h2 class="alr-section-title">🏆 ${t('live.leaderboard')}</h2>
      ${leaderboard.length === 0
        ? html`<div class="empty small">${t('live.admin.r.noData')}</div>`
        : html`<ol class="alr-lb-list">
          ${leaderboard.map(p => html`<li class="alr-lb-item ${p.rank <= 3 ? 'top' : ''}">
            <span class="alr-lb-rank">${p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : p.rank}</span>
            <span class="alr-lb-name">${t('live.admin.r.candidate')} #${p.user_id}</span>
            <span class="alr-lb-score">${p.score} ${t('live.admin.r.pts')}</span>
          </li>`)}
        </ol>`}
    </section>

    <!-- تحليل الأسئلة (مرتبة حسب نسبة الخطأ) -->
    <section class="alr-section">
      <h2 class="alr-section-title">📊 ${t('live.admin.r.analysis')}</h2>
      ${questionStats.length === 0
        ? html`<div class="empty small">${t('live.admin.r.noData')}</div>`
        : html`<div class="alr-q-list">
          ${questionStats.map(q => html`<div class="alr-q-item">
            <div class="alr-q-top">
              <span class="alr-q-num">${t('live.question')} ${q.idx + 1}</span>
              <span class="alr-q-rate ${q.errorRate >= 50 ? 'high-err' : q.errorRate >= 25 ? 'mid-err' : 'low-err'}">
                ${q.errorRate !== null ? q.errorRate + '%' : '—'} ${t('live.admin.r.errors')}
              </span>
              <span class="alr-q-count">${q.correct}/${q.total} ${t('live.admin.r.correct')}</span>
            </div>
            ${q.wrongStudents.length > 0 ? html`<div class="alr-wrong-list">
              ${q.wrongStudents.slice(0, 8).map(s => html`<span class="alr-wrong-tag">${esc(s.name)}</span>`)}
              ${q.wrongStudents.length > 8 ? html`<span class="alr-wrong-more">+${q.wrongStudents.length - 8}</span>` : ''}
            </div>` : ''}
          </div>`)}
        </div>`}
    </section>

  </div>`.s;
}
