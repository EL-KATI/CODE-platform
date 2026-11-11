'use strict';
/**
 * live.js — واجهة الحصص الجماعية
 *
 * mountLiveJoinBtn(container) — زر الانضمام في الهيدر (يستعلم كل 30 ثانية)
 * liveSessionView(el, ctx)    — صفحة الحصة المباشرة للطالب
 * adminLiveView(el, ctx)      — لوحة تحكم المؤسسة (إنشاء/إدارة الحصة)
 */
import { api } from './api.js';
import { html, raw, esc, toast } from './ui.js';
import { t } from './i18n.js';
import { store } from './store.js';
import { navigate } from './router.js';

// ══════════════════════════════════════════════════════════════════════════════
// زر الانضمام في الهيدر
// ══════════════════════════════════════════════════════════════════════════════
let _liveTimer = null;
let _liveSession = null;

export function mountLiveJoinBtn(container) {
  _renderJoinBtn(container);
  if (_liveTimer) clearInterval(_liveTimer);
  _liveTimer = setInterval(() => _renderJoinBtn(container), 30_000);
}

async function _renderJoinBtn(container) {
  try {
    const { session } = await api.get('/live/active');
    _liveSession = session;
    if (!session || session.status === 'ended') {
      container.innerHTML = '';
      return;
    }
    const isLive = session.status === 'live';
    container.innerHTML = html`
      <button class="live-join-btn ${isLive ? 'is-live' : 'is-waiting'}" id="live-join-trigger">
        <span class="live-dot" aria-hidden="true"></span>
        <span>${isLive ? t('live.joinNow') : t('live.waiting')}</span>
      </button>`.s;
    container.querySelector('#live-join-trigger')?.addEventListener('click', () => {
      navigate(`/live/${session.id}`);
    });
  } catch {
    container.innerHTML = '';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// صفحة الحصة (للطالب)
// ══════════════════════════════════════════════════════════════════════════════
export async function liveSessionView(el, ctx) {
  const id = Number(ctx.params.id);
  el.innerHTML = html`<div class="page-wrap live-page"><div class="live-loading">${t('live.loading')}</div></div>`.s;

  // أولاً: الانضمام (يمنح الصلاحية إذا لم تكن موجودة)
  try {
    await api.post(`/live/${id}/join`, {});
  } catch (e) {
    const msg = e?.data?.error;
    if (msg === 'session_ended') {
      el.innerHTML = html`<div class="page-wrap live-page"><div class="empty">${t('live.ended')}</div></div>`.s;
      return;
    }
    if (msg === 'forbidden') {
      el.innerHTML = html`<div class="page-wrap live-page"><div class="empty">${t('live.forbidden')}</div></div>`.s;
      return;
    }
  }

  // بدء التحديث الدوري
  _startLivePolling(el, id);
}

let _pollTimer = null;

function _startLivePolling(el, id) {
  if (_pollTimer) clearInterval(_pollTimer);
  _renderLiveState(el, id);
  _pollTimer = setInterval(() => _renderLiveState(el, id), 3_000);

  // إيقاف التحديث عند مغادرة الصفحة
  const stop = () => { clearInterval(_pollTimer); _pollTimer = null; };
  document.addEventListener('routechange', stop, { once: true });
}

let _lastQ = -1;
let _answered = false;

async function _renderLiveState(el, id) {
  try {
    const data = await api.get(`/live/${id}/state`);
    const { status, current_q, total, question, myAnswer, answered } = data;

    if (status === 'ended') {
      clearInterval(_pollTimer);
      el.innerHTML = html`<div class="page-wrap live-page"><div class="live-ended-wrap">
        <div class="live-ended-ic">🏁</div>
        <h2>${t('live.ended')}</h2>
        <p>${t('live.endedDesc')}</p>
        <a class="btn" href="/dashboard">${t('nav.dashboard')}</a>
      </div></div>`.s;
      return;
    }

    if (status === 'waiting') {
      el.innerHTML = html`<div class="page-wrap live-page"><div class="live-waiting-room">
        <div class="live-pulse">📡</div>
        <h2>${t('live.waitingRoom')}</h2>
        <p>${t('live.waitingDesc')}</p>
      </div></div>`.s;
      return;
    }

    // إعادة رسم فقط إذا تغيّر السؤال
    if (current_q === _lastQ && el.querySelector('.live-q-wrap')) {
      // تحديث عداد المجيبين فقط
      const counter = el.querySelector('.live-answered-count');
      if (counter) counter.textContent = answered;
      return;
    }
    _lastQ = current_q;
    _answered = !!myAnswer;

    _renderQuestion(el, id, current_q, total, question, myAnswer, answered);
  } catch { /* سكوت */ }
}

function _renderQuestion(el, id, qIdx, total, question, myAnswer, answeredCount) {
  if (!question) {
    el.innerHTML = html`<div class="page-wrap live-page"><div class="empty">${t('live.noQuestion')}</div></div>`.s;
    return;
  }

  const opts = question.options || [];
  const correct = question.correct || [];
  const answered = !!myAnswer;

  const optionsHtml = opts.map((o, i) => {
    let cls = 'live-opt';
    if (answered) {
      if (correct.map(Number).includes(i)) cls += ' correct';
      else if (myAnswer?.selected?.map(Number).includes(i)) cls += ' wrong';
    }
    return html`<button class="${cls}" data-idx="${i}" ${answered ? 'disabled' : ''} type="button">
      <span class="live-opt-letter">${String.fromCharCode(0x0041 + i)}</span>
      <span>${esc(o)}</span>
    </button>`.s;
  }).join('');

  el.innerHTML = html`<div class="page-wrap live-page">
    <div class="live-q-wrap">
      <div class="live-progress">
        <span class="live-q-num">${t('live.question')} ${qIdx + 1} / ${total}</span>
        <div class="live-prog-bar" role="progressbar" aria-valuenow="${qIdx + 1}" aria-valuemax="${total}">
          <div class="live-prog-fill" style="width:${Math.round(100 * (qIdx + 1) / total)}%"></div>
        </div>
        <span class="live-answered-label">${t('live.answered')}: <strong class="live-answered-count">${answeredCount}</strong></span>
      </div>

      ${question.image_url ? html`<img class="live-q-img" src="${question.image_url}" alt="">`.s : ''}
      <p class="live-q-text">${esc(question.text || '')}</p>

      <div class="live-opts">${raw(optionsHtml)}</div>

      ${answered && myAnswer ? html`<div class="live-feedback ${myAnswer.isCorrect ? 'correct' : 'wrong'}">
        ${myAnswer.isCorrect ? html`<span>✅ ${t('live.correct')}</span>`.s : html`<span>❌ ${t('live.wrong')}</span>`.s}
      </div>`.s : ''}

      ${answered && question.explanation ? html`<div class="live-explanation">${esc(question.explanation)}</div>`.s : ''}
    </div>
  </div>`.s;

  // أزرار الإجابة
  if (!answered) {
    el.querySelectorAll('.live-opt').forEach(btn => {
      btn.addEventListener('click', () => _submitAnswer(el, id, [Number(btn.dataset.idx)]));
    });
  }
}

async function _submitAnswer(el, id, selected) {
  // تعطيل الأزرار فوراً لمنع الضغط المتكرر
  el.querySelectorAll('.live-opt').forEach(b => b.disabled = true);
  try {
    const res = await api.post(`/live/${id}/answer`, { selected });
    _answered = true;
    // تحديث فوري لإظهار النتيجة
    await _renderLiveState(el, id);
  } catch (e) {
    toast(t('err.server_error'), 'error');
    el.querySelectorAll('.live-opt').forEach(b => b.disabled = false);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// لوحة المؤسسة (إنشاء + إدارة الحصة)
// ══════════════════════════════════════════════════════════════════════════════
export async function adminLiveView(el) {
  el.innerHTML = html`<div class="page-wrap"><div class="live-loading">${t('live.loading')}</div></div>`.s;

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

  el.innerHTML = html`<div class="page-wrap">
    <div class="admin-live-header">
      <h1>${t('live.admin.title')}</h1>
      ${!activeSess ? html`<button class="btn btn-primary" id="create-live-btn">${t('live.admin.create')}</button>`.s : ''}
    </div>

    ${activeSess ? _renderActiveSession(activeSess) : ''}

    <div class="live-sessions-list">
      ${sessions.length === 0 ? html`<div class="empty">${t('live.admin.empty')}</div>`.s : ''}
      ${sessions.filter(s => s.status === 'ended').map(s => html`
        <div class="live-sess-card ended">
          <div class="live-sess-info">
            <strong>${esc(s.title)}</strong>
            <span class="live-badge ended">${t('live.admin.ended')}</span>
          </div>
          <div class="live-sess-meta">${s.started_at || ''}</div>
          <a class="btn btn-sm" href="/admin/live/${s.id}/results">${t('live.admin.results')}</a>
        </div>`.s).join('')}
    </div>
  </div>`.s;

  // زر إنشاء حصة جديدة
  el.querySelector('#create-live-btn')?.addEventListener('click', () => _showCreateModal(el));

  // أزرار التحكم في الحصة الفعّالة
  el.querySelector('#start-live-btn')?.addEventListener('click', () => _doAction(el, activeSess?.id, 'start'));
  el.querySelector('#next-q-btn')?.addEventListener('click', () => _doAction(el, activeSess?.id, 'next'));
  el.querySelector('#end-live-btn')?.addEventListener('click', () => _doAction(el, activeSess?.id, 'end'));
}

function _renderActiveSession(sess) {
  const isWaiting = sess.status === 'waiting';
  const isLive    = sess.status === 'live';
  const qCount    = (sess.question_ids || []).length;

  return html`<div class="live-active-card">
    <div class="live-active-header">
      <span class="live-badge ${sess.status}">${isLive ? t('live.admin.live') : t('live.admin.waiting')}</span>
      <strong>${esc(sess.title)}</strong>
    </div>
    ${isLive ? html`<div class="live-active-progress">${t('live.question')} ${sess.current_q + 1} / ${qCount}</div>`.s : ''}
    <div class="live-active-actions">
      ${isWaiting ? html`<button class="btn btn-primary" id="start-live-btn">▶ ${t('live.admin.start')}</button>`.s : ''}
      ${isLive && sess.current_q + 1 < qCount ? html`<button class="btn" id="next-q-btn">⏭ ${t('live.admin.next')}</button>`.s : ''}
      <button class="btn btn-danger" id="end-live-btn">⏹ ${t('live.admin.end')}</button>
    </div>
  </div>`.s;
}

function _showCreateModal(el) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = html`<div class="modal-box">
    <h2>${t('live.admin.create')}</h2>
    <label>${t('live.admin.titleLabel')}
      <input type="text" id="live-title" value="حصة جماعية" class="inp">
    </label>
    <label>${t('live.admin.mode')}
      <select id="live-mode" class="inp">
        <option value="exam">${t('live.admin.modeExam')}</option>
        <option value="practice">${t('live.admin.modePractice')}</option>
      </select>
    </label>
    <label>${t('live.admin.qcount')}
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
      const r = await api.post('/live/school', { title, mode, count });
      toast(t('live.admin.created'), 'success');
      modal.remove();
      adminLiveView(el);
    } catch {
      toast(t('err.server_error'), 'error');
    }
  };
}

async function _doAction(el, sessionId, action) {
  if (!sessionId) return;
  try {
    await api.post(`/live/school/${sessionId}/${action}`, {});
    toast(t(`live.admin.${action}Done`), 'success');
    adminLiveView(el);
  } catch (e) {
    toast(e?.data?.error || t('err.server_error'), 'error');
  }
}
