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

  el.innerHTML = html`<div class="page-wrap live-page" id="live-student-wrap">
    <div class="live-top-bar">
      <div class="live-connection-dot" id="live-conn-dot" title="${t('live.connecting')}">●</div>
      <div class="live-prog-wrap" id="live-prog-wrap">
        <span class="live-q-num" id="live-q-num"></span>
        <div class="live-prog-bar"><div class="live-prog-fill" id="live-prog-fill" style="width:0%"></div></div>
        <span class="live-answered-label">${t('live.answered')}: <strong id="live-ans-count">0</strong></span>
      </div>
      <button class="live-lb-toggle" id="live-lb-btn" title="${t('live.leaderboard')}">🏆</button>
    </div>

    <div id="live-main">
      ${raw(status === 'waiting' ? _waitingRoomHtml() : status === 'ended' ? _endedHtml() : '')}
    </div>

    <aside class="live-lb-panel hidden" id="live-lb-panel" aria-label="${t('live.leaderboard')}">
      <div class="live-lb-header">
        <span>🏆 ${t('live.leaderboard')}</span>
        <button class="live-lb-close" id="live-lb-close">✕</button>
      </div>
      <ol class="live-lb-list" id="live-lb-list"></ol>
    </aside>
  </div>`.s;

  el.querySelector('#live-lb-btn')?.addEventListener('click', () => {
    el.querySelector('#live-lb-panel')?.classList.toggle('hidden');
  });
  el.querySelector('#live-lb-close')?.addEventListener('click', () => {
    el.querySelector('#live-lb-panel')?.classList.add('hidden');
  });

  if (initState?.status === 'live' && initState?.question) {
    _renderQuestion(el, sessionId, initState);
    if (initState.board) _updateLeaderboard(el, initState.board, store.user?.id);
  }
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
      if (data.finalBoard) _updateLeaderboard(el, data.finalBoard, store.user?.id);
      const main = el.querySelector('#live-main');
      if (main) main.innerHTML = _endedHtml(data.finalBoard);
      _closeSSE();
    } else if (data.status === 'live') {
      const main = el.querySelector('#live-main');
      if (main) main.innerHTML = '';
    } else if (data.status === 'waiting') {
      const main = el.querySelector('#live-main');
      if (main) main.innerHTML = _waitingRoomHtml();
    }
  });

  _sse.addEventListener('question', (e) => {
    const data = JSON.parse(e.data);
    _renderQuestion(el, sessionId, data);
    _updateProgress(el, data.current_q, data.total);
    const cnt = el.querySelector('#live-ans-count');
    if (cnt) cnt.textContent = '0';
  });

  _sse.addEventListener('answer_ack', (e) => {
    const data = JSON.parse(e.data);
    _showAnswerFeedback(el, data);
  });

  _sse.addEventListener('answered_count', (e) => {
    const { count } = JSON.parse(e.data);
    const cnt = el.querySelector('#live-ans-count');
    if (cnt) cnt.textContent = count;
  });

  _sse.addEventListener('leaderboard', (e) => {
    const { board } = JSON.parse(e.data);
    _updateLeaderboard(el, board, store.user?.id);
  });

  _sse.addEventListener('connected_count', (e) => {
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

// ── رسم السؤال للطالب ────────────────────────────────────────────────────────
let _studentAnswered = false;
let _studentSelected = [];

function _renderQuestion(el, sessionId, data) {
  _studentAnswered = false;
  _studentSelected = [];
  const { question, myAnswer, current_q, total } = data;
  if (!question) return;

  _updateProgress(el, current_q, total);
  const main = el.querySelector('#live-main');
  if (!main) return;

  const opts = question.options || [];
  const alreadyAnswered = !!myAnswer;

  main.innerHTML = html`<div class="live-q-wrap" id="live-q-wrap">
    ${question.image_url ? html`<img class="live-q-img" src="${question.image_url}" alt="" loading="lazy">` : ''}
    <p class="live-q-text">${esc(question.text || '')}</p>
    <div class="live-opts" id="live-opts">
      ${opts.map((o, i) => {
        let cls = 'live-opt';
        if (alreadyAnswered) {
          if ((myAnswer?.selected || []).map(Number).includes(i)) cls += myAnswer.isCorrect ? ' correct' : ' wrong';
        }
        return html`<button class="${cls}" data-idx="${i}" ${alreadyAnswered ? 'disabled' : ''} type="button">
          <span class="live-opt-letter">${String.fromCharCode(0x0041 + i)}</span>
          <span>${esc(o)}</span>
        </button>`;
      })}
    </div>
    ${alreadyAnswered ? raw(_feedbackHtml(myAnswer.isCorrect)) : ''}
  </div>`.s;

  if (!alreadyAnswered) {
    main.querySelectorAll('.live-opt').forEach(btn => {
      btn.addEventListener('click', () => _handleStudentClick(el, sessionId, btn, opts.length));
    });
  }
}

function _handleStudentClick(el, sessionId, btn, optsCount) {
  if (_studentAnswered) return;
  _studentAnswered = true;

  el.querySelectorAll('.live-opt').forEach(b => b.disabled = true);
  btn.classList.add('selected-pending');

  api.post(`/live/${sessionId}/answer`, { selected: [Number(btn.dataset.idx)] })
    .catch(() => {
      _studentAnswered = false;
      el.querySelectorAll('.live-opt').forEach(b => b.disabled = false);
      btn.classList.remove('selected-pending');
      toast(t('err.server_error'), 'error');
    });
}

function _showAnswerFeedback(el, data) {
  const { isCorrect, selected, correct } = data;
  const opts = el.querySelectorAll('.live-opt');

  opts.forEach((btn, i) => {
    btn.disabled = true;
    btn.classList.remove('selected-pending', 'correct', 'wrong');
    if (correct?.map(Number).includes(i)) btn.classList.add('correct');
    else if (selected?.map(Number).includes(i)) btn.classList.add('wrong');
  });

  const wrap = el.querySelector('#live-q-wrap');
  if (wrap && !wrap.querySelector('.live-feedback')) {
    wrap.insertAdjacentHTML('beforeend', _feedbackHtml(isCorrect));
  }
}

function _feedbackHtml(isCorrect) {
  return html`<div class="live-feedback ${isCorrect ? 'correct' : 'wrong'}">
    ${isCorrect
      ? html`<span class="live-fb-ic">✅</span> <span>${t('live.correct')}</span>`
      : html`<span class="live-fb-ic">❌</span> <span>${t('live.wrong')}</span>`}
  </div>`.s;
}

function _updateProgress(el, current, total) {
  const qNum = el.querySelector('#live-q-num');
  const fill = el.querySelector('#live-prog-fill');
  if (qNum) qNum.textContent = `${t('live.question')} ${(current ?? 0) + 1} / ${total}`;
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
    <div class="live-pulse">📡</div>
    <h2>${t('live.waitingRoom')}</h2>
    <p>${t('live.waitingDesc')}</p>
  </div>`.s;
}

function _endedHtml(finalBoard) {
  return html`<div class="live-ended-wrap">
    <div class="live-ended-ic">🏁</div>
    <h2>${t('live.ended')}</h2>
    <p>${t('live.endedDesc')}</p>
    ${finalBoard ? html`<p class="muted small">${t('live.checkLeaderboard')}</p>` : ''}
    <a class="btn" href="/dashboard">${t('nav.dashboard')}</a>
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

  el.innerHTML = html`<div class="page-wrap admin-live-wrap">
    <div class="admin-live-header">
      <h1 class="dash-h">${t('live.admin.title')}</h1>
      ${!activeSess
        ? html`<button class="btn btn-primary" id="create-live-btn">+ ${t('live.admin.create')}</button>`
        : ''}
    </div>

    <div id="active-sess-wrap">
      ${activeSess ? raw(_renderActiveCard(activeSess)) : ''}
    </div>

    ${activeSess ? html`<div class="card live-admin-lb" id="admin-lb-wrap">
      <h2 class="dash-h">🏆 ${t('live.leaderboard')} · <span id="live-connected-count">0</span> متصل</h2>
      <ol class="live-lb-list" id="live-lb-list"></ol>
    </div>` : ''}

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

  el.querySelector('#create-live-btn')?.addEventListener('click', () => _showCreateModal(el));
  el.querySelector('#start-live-btn')?.addEventListener('click', () => _doAction(el, activeSess?.id, 'start'));
  el.querySelector('#next-q-btn')?.addEventListener('click',  () => _doAction(el, activeSess?.id, 'next'));
  el.querySelector('#end-live-btn')?.addEventListener('click', () => _doAction(el, activeSess?.id, 'end'));

  if (activeSess) {
    _connectSSE(el, activeSess.id, true);
    api.get(`/live/${activeSess.id}/state`).then(r => {
      if (r.board) _updateLeaderboard(el, r.board, null);
    }).catch(() => {});
  }
}

function _renderActiveCard(sess) {
  const isWaiting = sess.status === 'waiting';
  const isLive    = sess.status === 'live';
  const qCount    = (sess.question_ids || []).length;

  return html`<div class="live-active-card" id="live-active-card">
    <div class="live-active-header">
      <span class="live-badge ${sess.status}">${isLive ? t('live.admin.live') : t('live.admin.waiting')}</span>
      <strong>${esc(sess.title)}</strong>
      <span class="muted small">${qCount} ${t('live.admin.questions')}</span>
    </div>
    ${isLive ? html`<div class="live-active-progress" id="live-instructor-q">
      ${t('live.question')} ${sess.current_q + 1} / ${qCount}
    </div>` : ''}

    <div id="instructor-q-wrap"></div>

    <div class="live-active-actions">
      ${isWaiting ? html`<button class="btn btn-primary" id="start-live-btn">▶ ${t('live.admin.start')}</button>` : ''}
      ${isLive ? html`<button class="btn btn-primary" id="next-q-btn">⏭ ${t('live.admin.next')}</button>` : ''}
      <button class="btn btn-danger" id="end-live-btn">⏹ ${t('live.admin.end')}</button>
    </div>
  </div>`.s;
}

function _renderInstructorQuestion(el, _sessionId, data) {
  const { question, current_q, total } = data;
  if (!question) return;
  _updateProgress(el, current_q, total);

  const wrap = el.querySelector('#instructor-q-wrap');
  if (!wrap) return;

  const opts    = question.options || [];
  const correct = (question.correct || []).map(Number);

  wrap.innerHTML = html`<div class="instructor-q-preview">
    ${question.image_url ? html`<img class="live-q-img" src="${question.image_url}" alt="" style="max-height:120px">` : ''}
    <p class="live-q-text" style="font-size:.95rem">${esc(question.text || '')}</p>
    <div class="live-opts readonly">
      ${opts.map((o, i) => html`<div class="live-opt ${correct.includes(i) ? 'correct' : ''}" style="cursor:default">
        <span class="live-opt-letter">${String.fromCharCode(0x0041 + i)}</span>
        <span>${esc(o)}</span>
        ${correct.includes(i) ? html`<span class="live-opt-tick">✓</span>` : ''}
      </div>`)}
    </div>
  </div>`.s;
}

function _showCreateModal(el) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = html`<div class="modal-box">
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
    <label class="form-label">${t('live.admin.qcount')} (5–46)
      <input type="number" id="live-count" value="40" min="5" max="46" class="inp">
    </label>
    <div class="modal-actions">
      <button class="btn btn-primary" id="create-confirm">${t('live.admin.createConfirm')}</button>
      <button class="btn" id="create-cancel">${t('modal.cancel')}</button>
    </div>
  </div>`.s;

  document.body.appendChild(modal);
  modal.querySelector('#create-cancel').onclick = () => modal.remove();
  modal.querySelector('#create-confirm').onclick = async () => {
    const title = modal.querySelector('#live-title').value.trim() || 'حصة جماعية';
    const mode  = modal.querySelector('#live-mode').value;
    const count = Number(modal.querySelector('#live-count').value) || 40;
    try {
      await api.post('/live/school', { title, mode, count });
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
    toast(e?.data?.error || t('err.server_error'), 'error');
  }
}
