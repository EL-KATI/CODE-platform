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
  const [d, journey] = await Promise.all([api.get('/me/dashboard'), api.get('/exams/me').catch(() => null)]);
  const u = store.user;
  const r = d.readiness;
  const tone = r.ready ? 'good' : r.score >= 50 ? 'mid' : 'low';
  const exam = nextExam(journey, u);
  const loc = getLocale() === 'fr' ? 'fr-MA' : 'ar-MA';
  const next = d.lessons.done < d.lessons.total ? { href: '/lessons', label: t('dash.nextLesson') }
    : d.counts.due > 0 ? { action: 'review', label: t('dash.nextReview', { n: d.counts.due }) }
      : { href: '/exam', label: t('dash.nextExam') };

  root.innerHTML = html`
    <div class="dash">
      <header class="dash-hello">
        <div><p class="dash-eyebrow">${new Date().toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1>${t('dash.hello', { name: u.name })}</h1></div>
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
    </div>`.s;

  root.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => startAttempt({ mode: 'category', categoryId: Number(b.dataset.cat), practice: true }, b)));
  const rv = root.querySelector('#review-btn');
  rv.onclick = () => startAttempt({ mode: 'review', practice: true }, rv);
  const bm = root.querySelector('#bm-btn');
  bm.onclick = () => startAttempt({ mode: 'bookmarks', practice: true }, bm);
  const nb = root.querySelector('#next-btn');
  if (nb) nb.onclick = () => startAttempt({ mode: 'review', practice: true }, nb);
}
