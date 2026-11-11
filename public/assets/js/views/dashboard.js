import { html, raw, loading, fmtDate } from '../ui.js';
import { t, catName, getLocale } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { modeLabel, scorePill, startAttempt } from './common.js';

// أيقونات خطية (نمط SF Symbols) للإجراءات السريعة
const ICON = {
  exam: '<path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="9"/>',
  practice: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  mistakes: '<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v4.5h4.5"/><path d="M12 8.5v4"/><circle cx="12" cy="15.6" r=".6" fill="currentColor"/>',
  ai: '<path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7z"/><path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
};
const icon = (name) => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`);

// حلقة الجاهزية (نمط Apple Fitness): مسار رمادي + قوس متدرج بأطراف دائرية
const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;
function readinessRing(score, tone) {
  const v = Math.max(0, Math.min(100, Number(score) || 0));
  return html`
    <div class="rd-ring rd-${tone}" role="img" aria-label="${t('dash.readiness')}: ${v}%">
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <defs><linearGradient id="rd-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="rd-stop-a"/><stop offset="1" class="rd-stop-b"/></linearGradient></defs>
        <circle class="rd-track" cx="64" cy="64" r="${RING_R}"/>
        <circle class="rd-arc" cx="64" cy="64" r="${RING_R}" stroke="url(#rd-grad)" stroke-dasharray="${RING_C.toFixed(1)}" style="--rd-off:${(RING_C * (1 - v / 100)).toFixed(1)};--rd-full:${RING_C.toFixed(1)}"/>
      </svg>
      <div class="rd-ring-label"><strong>${v}<span>%</span></strong><small>${t('dash.readyShort')}</small></div>
    </div>`;
}

// الموعد القادم: من مسار الامتحانات (المؤسسة) أو من التاريخ الذي حدده المترشح في حسابه
const STEP_DATE = { theory_1: 'theory1_date', theory_2: 'theory2_date', practical_1: 'practical1_date', practical_2: 'practical2_date' };
function nextExam(journeyData, user) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const make = (iso, label) => {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
    const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
    const days = Math.round((date - today) / 86400000);
    return days >= 0 ? { date, days, label } : null;
  };
  const j = journeyData && journeyData.journey;
  const step = journeyData && journeyData.next_step;
  if (j && step && STEP_DATE[step.step]) {
    const e = make(j[STEP_DATE[step.step]], t(step.label));
    if (e) return e;
  }
  return make(user.examDate, t('dash.ticketTheory'));
}

export async function dashboardView(root) {
  // الأدمن لا يملك داشبورد متعلم — يُوجَّه مباشرة للإدارة
  if (store.isAdmin()) { const { navigate } = await import('../router.js'); navigate('/admin', { replace: true }); return; }
  root.innerHTML = loading().s;
  const [d, journey, liveData] = await Promise.all([
    api.get('/me/dashboard'),
    api.get('/exams/me').catch(() => null),
    store.user?.schoolId ? api.get('/live/active').catch(() => null) : Promise.resolve(null),
  ]);
  const u = store.user;
  const r = d.readiness;
  const tone = r.ready ? 'good' : r.score >= 50 ? 'mid' : 'low';
  const exam = nextExam(journey, u);
  const loc = getLocale() === 'fr' ? 'fr-MA' : 'ar-MA';
  const next = d.lessons.done < d.lessons.total ? { href: '/lessons', label: t('dash.nextLesson') }
    : d.counts.due > 0 ? { action: 'review', label: t('dash.nextReview', { n: d.counts.due }) }
      : { href: '/exam', label: t('dash.nextExam') };

  // بانر الحصة الجماعية الفعّالة
  const liveSession = liveData?.session || null;
  const liveBanner = liveSession ? html`
    <div id="live-banner" style="
      background:linear-gradient(135deg,var(--primary,#c2410c),#b45309);
      color:#fff;border-radius:14px;padding:18px 20px;margin-bottom:20px;
      display:flex;align-items:center;justify-content:space-between;gap:12px;
      box-shadow:0 4px 20px rgba(194,65,12,.35);animation:pulse-border 2s infinite">
      <div style="display:flex;align-items:center;gap:14px">
        <span style="font-size:2rem">🎓</span>
        <div>
          <div style="font-weight:700;font-size:1.05rem">${liveSession.title || 'حصة جماعية'}</div>
          <div style="font-size:.82rem;opacity:.9;margin-top:2px">
            ${liveSession.status === 'live' ? '🔴 الحصة جارية الآن' : '⏳ في انتظار البدء'}
          </div>
        </div>
      </div>
      <a class="btn" href="/live/${liveSession.id}"
        style="background:#fff;color:var(--primary,#c2410c);font-weight:700;white-space:nowrap;flex-shrink:0">
        دخول الحصة ←
      </a>
    </div>` : html``;

  root.innerHTML = html`
    <div class="dash">
      ${liveBanner}
      <header class="dash-hello">
        <div><p class="dash-eyebrow">${new Date().toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1>${t('dash.hello', { name: u.name })}</h1>
        ${u.schoolName ? html`<p class="muted small" style="margin:4px 0 0;display:flex;align-items:center;gap:6px"><span>🏫</span><span>${u.schoolName}</span></p>` : ''}
        </div>
        ${next.href ? html`<a class="btn btn-primary" href="${next.href}">${next.label}</a>` : html`<button class="btn btn-primary" id="next-btn">${next.label}</button>`}
      </header>

      <section class="dash-top" aria-label="${t('dash.readiness')}">
        <div class="card dash-ready">
          ${readinessRing(r.score, tone)}
          <div class="dash-ready-text">
            <span class="dash-eyebrow">${t('dash.readiness')}</span>
            <h2 class="rd-title rd-${tone}">${r.ready ? t('dash.ready') : t('dash.notReady')}</h2>
            <p class="muted small">${t('dash.readinessHelp', { n: d.settings.readinessWindow, m: d.settings.readinessWindow - 1 })}</p>
            <p class="small dash-ready-meta">${t('dash.examsPassed', { p: r.examsPassed, n: r.examsTaken })}${r.averageExamScore !== null ? ' · ' + t('dash.avg', { v: r.averageExamScore, n: d.settings.questionCount }) : ''}</p>
          </div>
        </div>

        ${exam ? html`
        <a class="ticket" href="${journey && journey.journey ? '/my-exams' : '/profile'}" aria-label="${t('dash.ticketTitle')}: ${exam.label}">
          <div class="ticket-main">
            <span class="ticket-kicker">${t('dash.ticketTitle')}</span>
            <strong class="ticket-name">${exam.label}</strong>
            <div class="ticket-fields">
              <div><small>${t('dash.ticketDate')}</small><span>${exam.date.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
              <div><small>${t('dash.ticketCandidate')}</small><span>${u.name}</span></div>
              <div><small>${t('dash.ticketCat')}</small><span>${u.license_cat || 'B'}</span></div>
            </div>
          </div>
          <div class="ticket-stub">
            <strong>${exam.days === 0 ? '0' : exam.days}</strong>
            <small>${exam.days === 0 ? t('dash.ticketToday') : t('dash.ticketDays')}</small>
          </div>
        </a>` : html`
        <a class="ticket ticket-empty" href="/profile">
          <div class="ticket-main">
            <span class="ticket-kicker">${t('dash.ticketTitle')}</span>
            <strong class="ticket-name">${t('dash.ticketNone')}</strong>
            <p class="ticket-hint">${t('dash.ticketNoneHelp')}</p>
          </div>
          <div class="ticket-stub"><span class="ticket-add" aria-hidden="true">+</span><small>${t('dash.ticketSet')}</small></div>
        </a>`}
      </section>

      <section aria-label="${t('dash.quick')}">
        <h2 class="dash-h">${t('dash.quick')}</h2>
        <div class="qa-grid">
          <a class="qa qa-exam" href="/exam"><span class="qa-icon">${icon('exam')}</span>
            <strong>${t('dash.qaExam')}</strong><small>${t('dash.qaExamSub', { n: d.settings.questionCount })}</small></a>
          <a class="qa qa-practice" href="/practice"><span class="qa-icon">${icon('practice')}</span>
            <strong>${t('dash.qaPractice')}</strong><small>${t('dash.qaPracticeSub', { n: d.series.length })}</small></a>
          <a class="qa qa-mistakes" href="/mistakes"><span class="qa-icon">${icon('mistakes')}</span>
            <strong>${t('dash.qaMistakes')}</strong><small>${t('dash.qaMistakesSub', { n: d.counts.mistakes })}</small></a>
          <a class="qa qa-ai" href="/assistant"><span class="qa-icon">${icon('ai')}</span>
            <strong>${t('dash.qaAi')}</strong><small>${t('dash.qaAiSub')}</small></a>
        </div>
        <div class="dash-chips">
          <button class="chip" id="review-btn" ${d.counts.due ? '' : 'disabled'}>🧠 ${t('dash.smartReview')} <b>${d.counts.due}</b></button>
          <button class="chip" id="bm-btn" ${d.counts.bookmarks ? '' : 'disabled'}>⭐ ${t('dash.bookmarks')} <b>${d.counts.bookmarks}</b></button>
        </div>
      </section>

      <section class="dash-stats" aria-label="${t('dash.subtitle')}">
        <div class="card stat-tile"><strong>${d.lessons.done}<span>/${d.lessons.total}</span></strong><small>${t('dash.lessonsDone')}</small></div>
        <div class="card stat-tile"><strong>${d.counts.seen}<span>/${d.counts.questions}</span></strong><small>${t('dash.questionsSeen')}</small></div>
        <div class="card stat-tile"><strong>${d.counts.due}</strong><small>${t('dash.due')}</small></div>
        <div class="card stat-tile"><strong>🔥 ${d.streak}</strong><small>${t('dash.streak')}</small></div>
      </section>

      <section>
        <div class="dash-h-row"><h2 class="dash-h">${t('dash.byCategory')}</h2><a href="/practice" class="dash-link">${t('dash.trainAll')}</a></div>
        <div class="card dash-list">
          ${d.categories.map((c) => html`
            <div class="cat-row">
              <span class="cat-icon" aria-hidden="true">${c.icon}</span>
              <div class="cat-body">
                <div class="cat-head"><strong>${catName(c)}</strong><span class="muted small">${c.mastery}%</span></div>
                <div class="cat-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${c.mastery}" aria-label="${catName(c)}"><i style="width:${c.mastery}%"></i></div>
                <span class="muted small">${c.seen}/${c.total} ${t('dash.seen')}${c.accuracy === null ? '' : ' · ' + t('dash.accuracy', { v: c.accuracy })}</span>
              </div>
              <button class="btn btn-secondary btn-sm" data-cat="${c.id}">${t('dash.train')}</button>
            </div>`)}
        </div>
      </section>

      <section>
        <div class="dash-h-row"><h2 class="dash-h">${t('dash.recent')}</h2><a class="dash-link" href="/history">${t('dash.allHistory')}</a></div>
        <div class="card dash-list">
          ${d.recent.length ? d.recent.map((a) => html`
            <a class="recent-row" href="/results/${a.id}">
              <div><strong>${modeLabel(a)}</strong><span class="muted small">${a.practice ? t('mode.practice') : t('mode.examConditions')} · ${fmtDate(a.finished_at)}</span></div>
              ${scorePill(a)}<span class="row-chevron">${icon('chevron')}</span>
            </a>`)
          : html`<div class="empty"><div class="big">🚦</div><p>${t('dash.noActivity')}</p></div>`}
        </div>
      </section>

      ${!u.schoolId ? html`
      <section>
        <div class="card" style="text-align:center;padding:28px 24px">
          <div style="font-size:2rem;margin-bottom:8px">🏫</div>
          <h3 style="margin:0 0 8px">${t('auth.enrollTitle')}</h3>
          <p class="muted" style="margin:0 0 20px;font-size:.9rem">${t('auth.enrollHint')}</p>
          <a href="/enroll" class="btn btn-primary">${t('auth.requestEnroll')}</a>
        </div>
      </section>` : html``}

      <section id="champ-section" aria-label="${t('champ.title')}">
        <div class="dash-h-row"><h2 class="dash-h">${raw('🏆')} ${t('champ.title')}</h2><button class="dash-link" id="lb-toggle">${t('champ.seeAll')}</button></div>
        <div id="champ-card" class="card" style="padding:16px 20px">
          <div class="muted small" style="text-align:center;padding:12px 0">${t('common.loading')}</div>
        </div>
        <div id="lb-panel" style="display:none;margin-top:12px"></div>
      </section>

    </div>`.s;

  root.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => startAttempt({ mode: 'category', categoryId: Number(b.dataset.cat), practice: true }, b)));
  const rv = root.querySelector('#review-btn');
  rv.onclick = () => startAttempt({ mode: 'review', practice: true }, rv);
  const bm = root.querySelector('#bm-btn');
  bm.onclick = () => startAttempt({ mode: 'bookmarks', practice: true }, bm);
  const nb = root.querySelector('#next-btn');
  if (nb) nb.onclick = () => startAttempt({ mode: 'review', practice: true }, nb);

  // ── بطل الكود ──────────────────────────────────────────────────────────────
  loadChampion(root, store.user);
}

async function loadChampion(root, user) {
  const card = root.querySelector('#champ-card');
  const lbPanel = root.querySelector('#lb-panel');
  const lbToggle = root.querySelector('#lb-toggle');

  let ch;
  try { ch = await api.get('/challenge/today'); } catch { return; }

  renderChampCard(card, ch, user);

  // زر إظهار/إخفاء لوحة الصدارة
  lbToggle.onclick = async () => {
    if (lbPanel.style.display === 'none') {
      lbPanel.style.display = '';
      lbToggle.textContent = t('champ.hide');
      if (!lbPanel.dataset.loaded) {
        lbPanel.innerHTML = html`<div class="muted small" style="padding:8px 0">${t('common.loading')}</div>`.s;
        try {
          const lb = await api.get('/challenge/leaderboard');
          lbPanel.innerHTML = renderLeaderboard(lb.leaderboard, user.id).s;
        } catch { lbPanel.innerHTML = ''; }
        lbPanel.dataset.loaded = '1';
      }
    } else {
      lbPanel.style.display = 'none';
      lbToggle.textContent = t('champ.seeAll');
    }
  };
}

function renderChampCard(card, ch, user) {
  const { mine, globalChamp, schoolBoard, globalRank } = ch;

  const champBlock = globalChamp ? html`
    <div class="champ-hero">
      <div class="champ-avatar champ-avatar-ph">👤</div>
      <div>
        <div class="champ-crown">👑 ${t('champ.grandChamp')}</div>
        <div class="champ-name">${t('champ.candidate')} #${globalChamp.user_id}</div>
        <div class="champ-score">${globalChamp.score}/7 · ${globalChamp.time_taken}s</div>
      </div>
    </div>` : html`<div class="champ-empty">${t('champ.noChampYet')}</div>`;

  if (mine) {
    // أجرى التحدي — عرض نتيجته + صدارة المؤسسة
    card.innerHTML = html`
      ${champBlock}
      <div class="champ-mine">${t('champ.yourScore')}: <strong>${mine.score}/7</strong> · ${mine.time_taken}s${globalRank ? html` · 🏅 ${t('champ.rank')} ${globalRank}` : html``}</div>
      ${schoolBoard.length > 1 ? html`
        <div class="champ-school-board">
          <div class="champ-board-title">${t('champ.schoolBoard')}</div>
          ${schoolBoard.slice(0, 5).map((r) => html`
            <div class="champ-board-row ${r.user_id === user.id ? 'is-me' : ''}">
              <span class="champ-rank">${r.rank}</span>
              <span class="champ-mini-av">👤</span>
              <span class="champ-board-name">${t('champ.candidate')} #${r.user_id}</span>
              <span class="champ-board-score">${r.score}/7</span>
              <span class="champ-board-time muted small">${r.time_taken}s</span>
            </div>`)}
        </div>` : html``}`.s;
  } else {
    // لم يبدأ التحدي بعد
    card.innerHTML = html`
      ${champBlock}
      <div class="champ-cta">
        <p class="muted small" style="margin:0 0 12px">${t('champ.joinToday')}</p>
        <button class="btn btn-primary" id="start-challenge">${raw('⚡')} ${t('champ.start')}</button>
      </div>`.s;

    card.querySelector('#start-challenge').onclick = () => openChallengeModal(card);
  }
}

// ── Modal التحدي ───────────────────────────────────────────────────────────
let _modal = null;

// export للاستخدام من صفحة /champion
export function openChallengeFromPage(root) {
  openChallengeModal(root);
}

function openChallengeModal(card) {
  if (_modal) return;
  _modal = document.createElement('div');
  _modal.className = 'modal-overlay';
  _modal.innerHTML = html`
    <div class="modal champ-modal" role="dialog" aria-modal="true" aria-label="${t('champ.title')}">
      <div class="modal-head">
        <h2>${raw('⚡')} ${t('champ.title')}</h2>
        <button class="modal-close" id="ch-close" aria-label="${t('common.close')}">✕</button>
      </div>
      <div id="ch-body" class="ch-body">
        <div class="muted" style="text-align:center;padding:24px">${t('common.loading')}</div>
      </div>
    </div>`.s;
  document.body.appendChild(_modal);
  _modal.querySelector('#ch-close').onclick = closeModal;
  _modal.addEventListener('click', (e) => { if (e.target === _modal) closeModal(); });
  startChallenge(card);
}

function closeModal() {
  if (_modal) { _modal.remove(); _modal = null; }
}

async function startChallenge(card) {
  const body = document.querySelector('#ch-body');
  try {
    const { questions } = await api.post('/challenge/start', {});
    runChallenge(body, questions, card);
  } catch (err) {
    const msg = err?.data?.error === 'already_done_today' ? t('champ.alreadyDone') : t('champ.startError');
    body.innerHTML = html`<div class="muted" style="text-align:center;padding:24px">${msg}</div>`.s;
  }
}

function runChallenge(body, questions, card) {
  let idx = 0;
  let selected = null;
  const answers = [];
  const startTime = Date.now();
  let timerEl, timerInterval;

  const render = () => {
    const q = questions[idx];
    const opts = q.options;
    body.innerHTML = html`
      <div class="ch-progress">${t('champ.question')} ${idx + 1} / ${questions.length}
        <span id="ch-timer" class="ch-timer">0s</span>
      </div>
      <div class="ch-q-text">${q.text}</div>
      ${q.image ? html`<img src="${q.image}" class="ch-q-img" alt="" loading="lazy">` : html``}
      <div class="ch-options">
        ${opts.map((o, i) => html`
          <button class="ch-opt" data-idx="${i + 1}">${o}</button>`)}
      </div>
      <button class="btn btn-primary ch-next" id="ch-next" disabled>${idx < questions.length - 1 ? t('champ.next') : t('champ.submit')}</button>`.s;

    selected = null;
    timerEl = body.querySelector('#ch-timer');
    let elapsed = Math.round((Date.now() - startTime) / 1000);
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      elapsed = Math.round((Date.now() - startTime) / 1000);
      if (timerEl) timerEl.textContent = elapsed + 's';
    }, 1000);

    body.querySelectorAll('.ch-opt').forEach((btn) => {
      btn.onclick = () => {
        body.querySelectorAll('.ch-opt').forEach((b) => b.classList.remove('sel'));
        btn.classList.add('sel');
        selected = Number(btn.dataset.idx);
        body.querySelector('#ch-next').disabled = false;
      };
    });

    body.querySelector('#ch-next').onclick = async () => {
      clearInterval(timerInterval);
      answers.push({ id: q.id, selected: selected ? [selected] : [] });
      if (idx < questions.length - 1) { idx++; render(); }
      else {
        const timeTaken = Math.round((Date.now() - startTime) / 1000);
        await submitChallenge(body, answers, timeTaken, card);
      }
    };
  };
  render();
}

async function submitChallenge(body, answers, timeTaken, card) {
  body.innerHTML = html`<div class="muted" style="text-align:center;padding:24px">${t('common.loading')}</div>`.s;
  try {
    const res = await api.post('/challenge/submit', { answers, time_taken: timeTaken });
    body.innerHTML = html`
      <div class="ch-result">
        <div class="ch-result-score">${res.score}<span>/${res.total}</span></div>
        <div class="ch-result-label">${t('champ.yourScore')}</div>
        <div class="ch-result-time">⏱ ${res.timeTaken}s${res.globalRank ? html` · 🏅 ${t('champ.rank')} ${res.globalRank}` : html``}</div>
        <button class="btn btn-primary" style="margin-top:20px" id="ch-done">${t('common.close')}</button>
      </div>`.s;
    body.querySelector('#ch-done').onclick = () => {
      closeModal();
      loadChampion(card.closest('.dash').parentElement, store.user);
    };
  } catch {
    body.innerHTML = html`<div class="muted" style="text-align:center;padding:24px">${t('champ.submitError')}</div>`.s;
  }
}

function renderLeaderboard(list, myId) {
  if (!list.length) return html`<div class="muted small" style="padding:8px 0">${t('champ.noEntries')}</div>`;
  return html`
    <div class="card">
      <div class="champ-board-title">${t('champ.globalBoard')}</div>
      ${list.map((r) => html`
        <div class="champ-board-row ${r.user_id === myId ? 'is-me' : ''}">
          <span class="champ-rank">${r.rank === 1 ? raw('🥇') : r.rank === 2 ? raw('🥈') : r.rank === 3 ? raw('🥉') : r.rank}</span>
          <span class="champ-mini-av">👤</span>
          <span class="champ-board-name">${t('champ.candidate')} #${r.user_id}</span>
          <span class="champ-board-score">${r.score}/7</span>
          <span class="champ-board-time muted small">${r.time_taken}s</span>
        </div>`)}
    </div>`;
}
