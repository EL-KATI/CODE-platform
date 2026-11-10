import { html, raw, loading, toast, errorMessage } from '../ui.js';
import { t, catName } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { renderMarkdown } from '../markdown.js';
import { startAttempt } from './common.js';
import { navigate } from '../router.js';
import { parseLesson, renderPart, wireParts, isGraded } from '../lessonBlocks.js';

const chevron = (d) => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`);
const NEXT = 'M9 6l6 6-6 6';
const BACK = 'M15 6l-6 6 6 6';

// حفظ التقدم داخل الدرس على هذا الجهاز (الخطوة + الأجوبة)
const memKey = (slug, review) => `lx:${review ? 'r:' : ''}${slug}`;
const memGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const memSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
const memDel = (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };
const viewPref = { get: () => { try { return localStorage.getItem('lx:view') || 'steps'; } catch { return 'steps'; } }, set: (v) => { try { localStorage.setItem('lx:view', v); } catch { /* ignore */ } } };

// --- قائمة الدروس ------------------------------------------------------------------
export async function lessonsView(root) {
  root.innerHTML = loading().s;
  const [lessons, cats] = await Promise.all([api.get('/lessons'), store.getCategories()]);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const done = lessons.filter((l) => l.completed).length;
  const groups = [];
  lessons.forEach((l, i) => {
    const key = l.category_id || 0;
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, cat: byId.get(l.category_id) || null, items: [] }; groups.push(g); }
    g.items.push({ ...l, n: i + 1 });
  });
  const pct = lessons.length ? Math.round((100 * done) / lessons.length) : 0;
  const due = store.user ? lessons.filter((l) => l.reviewDue) : [];
  const nextL = lessons.find((l) => !l.completed);
  const inProgress = nextL && memGet(memKey(nextL.slug));

  const row = (l, extra = '') => html`<a class="lesson-row" href="/lessons/${l.slug}${extra}">
    <span class="lesson-num ${l.completed ? 'is-done' : ''}" aria-hidden="true">${l.completed ? '✓' : l.n}</span>
    <div class="lesson-body"><strong>${l.title}</strong><span class="muted small">${l.summary}</span></div>
    <span class="lesson-meta muted small">${l.interactive ? html`<span class="lx-pill">${t('lx.interactive')}</span>` : ''}${l.completed ? html`<span class="sr-only">${t('lessons.done')} · </span>` : ''}${t('lessons.minutes', { n: l.minutes })}</span>
    <span class="row-chevron">${chevron(NEXT)}</span>
  </a>`;

  root.innerHTML = html`
    <div class="pg pg-narrow">
      <header class="pg-head"><h1>${t('lessons.title')}</h1><p>${t('lessons.subtitle')}</p></header>
      ${store.user && lessons.length ? html`<div class="card lessons-progress">
        <div class="cat-head"><strong>${t('lessons.progress', { d: done, n: lessons.length })}</strong><span class="muted small">${pct}%</span></div>
        <div class="cat-bar bar-good" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${t('lessons.progress', { d: done, n: lessons.length })}"><i style="width:${pct}%"></i></div>
      </div>` : ''}
      ${nextL ? html`<a class="card lx-continue" href="/lessons/${nextL.slug}">
        <span class="lx-continue-ic" aria-hidden="true">${raw('<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>')}</span>
        <span class="lx-continue-body"><small>${inProgress ? t('lx.resume') : done ? t('lx.continue') : t('lx.start')}</small><strong>${nextL.title}</strong></span>
        <span class="row-chevron">${chevron(NEXT)}</span>
      </a>` : ''}
      ${due.length ? html`<section>
        <h2 class="list-title">${t('lx.reviewDue')}</h2>
        <p class="muted small lx-review-help">${t('lx.reviewWhy')}</p>
        <div class="card dash-list lx-due">${due.map((l) => row(l, '?review=1'))}</div>
      </section>` : ''}
      ${lessons.length ? groups.map((g) => html`<section>
        ${groups.length > 1 ? html`<h2 class="list-title">${g.cat ? html`${g.cat.icon} ${catName(g.cat)}` : t('lessons.general')}</h2>` : ''}
        <div class="card dash-list">${g.items.map((l) => row(l))}</div>
      </section>`) : html`<div class="card empty"><div class="big">📖</div><p>${t('lessons.none')}</p></div>`}
    </div>`.s;
}

// --- قارئ الدرس التفاعلي -------------------------------------------------------------
export async function lessonView(root, { params, query = {} }) {
  root.innerHTML = loading().s;
  let l;
  try { l = await api.get(`/lessons/${encodeURIComponent(params.slug)}`); } catch { return navigate('/lessons', { replace: true }); }
  const cats = await store.getCategories();
  const c = cats.find((x) => x.id === l.category_id);
  const review = query.review === '1' && store.user && l.completed;
  const parsed = parseLesson(l.body);
  const allParts = parsed.steps.flatMap((s) => s.parts);
  const graded = allParts.filter(isGraded);

  // الخطوات: أقسام الدرس + خطوة الخلاصة. في وضع المراجعة: كل الأنشطة دون النص ثم الخلاصة.
  const steps = review
    ? [{ title: t('lx.reviewTitle'), parts: allParts.filter((p) => p.type !== 'md'), review: true }, { title: t('lx.summary'), final: true }]
    : [...parsed.steps, { title: t('lx.summary'), final: true }];
  const key = memKey(l.slug, review);
  const saved = memGet(key) || {};
  const answers = saved.answers || {};
  let idx = Math.min(saved.idx || 0, steps.length - 1);
  let mode = review ? 'steps' : viewPref.get();

  const score = () => {
    const a = graded.filter((p) => answers[p.id]);
    return { done: a.length, ok: a.filter((p) => answers[p.id].correct).length, n: graded.length };
  };
  const stepReady = (s) => !s.parts || s.parts.filter(isGraded).every((p) => answers[p.id]);
  const save = () => memSet(key, { idx, answers });

  const finalHtml = () => {
    const sc = score();
    const items = parsed.summary;
    return html`<div class="lx-final">
      ${sc.n ? html`<div class="lx-score ${sc.ok === sc.n ? 'is-perfect' : ''}">
        <div class="lx-score-num"><strong>${sc.ok}</strong><span>/${sc.n}</span></div>
        <p>${t('lx.score', { c: sc.ok, n: sc.n })}${sc.done < sc.n ? html` <span class="muted small">(${t('lx.unanswered', { n: sc.n - sc.done })})</span>` : ''}</p>
      </div>` : ''}
      ${items.length ? html`<div class="lx-summary"><h3>${t('lx.keyPoints')}</h3><ul>${items.map((x) => html`<li>${raw(renderMarkdown(x).replace(/^<p>|<\/p>$/g, ''))}</li>`)}</ul></div>` : ''}
      <div class="lx-final-actions">
        ${review ? html`<button class="btn btn-primary" id="review-done">${t('lx.reviewDone')}</button>`
          : store.user ? html`<button class="btn ${l.completed ? 'btn-secondary' : 'btn-primary'}" id="done-btn" aria-pressed="${l.completed}">${l.completed ? '✓ ' + t('lessons.done') : t('lx.finish')}</button>`
          : html`<a class="btn btn-primary" href="/register">${t('lessons.signupToTrack')}</a>`}
        ${store.user && c ? html`<button class="btn btn-secondary" id="quiz-btn">🎯 ${t('lessons.quiz')}</button>` : ''}
        ${l.next && !review ? html`<a class="btn btn-ghost" href="/lessons/${l.next.slug}">${t('lessons.next')}: ${l.next.title}</a>` : ''}
      </div>
    </div>`;
  };

  const stepBody = (s) => (s.final ? finalHtml() : html`${s.review ? html`<p class="muted lx-review-help">${t('lx.reviewHelp')}</p>` : ''}${raw(s.parts.map((p) => renderPart(p, answers)).join(''))}`);

  const render = () => {
    const s = steps[idx];
    const ready = stepReady(s);
    const head = html`<header class="reader-head">
      <div class="row">${c ? html`<span class="pill">${c.icon} ${catName(c)}</span>` : ''}<span class="pill">⏱ ${t('lessons.minutes', { n: l.minutes })}</span>
        ${review ? html`<span class="pill lx-pill">${t('lx.reviewTitle')}</span>` : ''}
        ${!review && parsed.steps.length > 1 ? html`<button class="lx-mode" type="button" id="mode-btn" aria-pressed="${mode === 'full'}">${mode === 'full' ? t('lx.stepView') : t('lx.fullView')}</button>` : ''}</div>
      <h1>${l.title}</h1><p class="muted">${l.summary}</p>
    </header>`;

    if (mode === 'full') {
      root.innerHTML = html`<div class="pg pg-narrow reader">
        <a class="reader-back" href="/lessons"><span class="row-chevron">${chevron(BACK)}</span>${t('lessons.title')}</a>
        <article class="card reader-card">${head}
          ${parsed.steps.map((st) => html`${st.title ? html`<h2 class="lx-step-title">${st.title}</h2>` : ''}${stepBody(st)}`)}
          <h2 class="lx-step-title">${t('lx.summary')}</h2>${finalHtml()}
        </article>
        ${navHtml()}
      </div>`.s;
    } else {
      root.innerHTML = html`<div class="pg pg-narrow reader">
        <a class="reader-back" href="/lessons"><span class="row-chevron">${chevron(BACK)}</span>${t('lessons.title')}</a>
        <article class="card reader-card lx-stepper">${head}
          <div class="lx-progress" role="progressbar" aria-valuemin="1" aria-valuemax="${steps.length}" aria-valuenow="${idx + 1}" aria-label="${t('lx.step', { i: idx + 1, n: steps.length })}">
            ${steps.map((st, i) => html`<button type="button" class="lx-seg ${i < idx ? 'is-done' : i === idx ? 'is-cur' : ''}" data-go="${i}" ${i > idx && !steps.slice(0, i).every(stepReady) ? 'disabled' : ''} title="${st.title || t('lx.intro')}"><i></i></button>`)}
          </div>
          <div class="lx-step-meta"><span>${t('lx.step', { i: idx + 1, n: steps.length })}</span>${graded.length ? html`<span>${t('lx.scoreShort', { c: score().ok, n: graded.length })}</span>` : ''}</div>
          <div class="lx-step" id="lx-step" tabindex="-1">
            ${s.title ? html`<h2 class="lx-step-title">${s.title}</h2>` : ''}
            ${stepBody(s)}
          </div>
          <footer class="lx-nav">
            <button class="btn btn-secondary" id="prev-btn" ${idx === 0 ? 'disabled' : ''}>${chevron(NEXT)}<span>${t('lx.prev')}</span></button>
            ${s.final ? '' : html`<button class="btn btn-primary" id="next-btn" ${ready ? '' : 'disabled'}><span>${idx === steps.length - 2 ? t('lx.toSummary') : t('lx.next')}</span>${chevron(BACK)}</button>`}
          </footer>
          ${!ready && !s.final ? html`<p class="lx-gate muted small" role="status">${t('lx.answerFirst')}</p>` : ''}
        </article>
        ${s.final ? navHtml() : ''}
      </div>`.s;
    }
    wire();
  };

  function navHtml() {
    if (review || !(l.prev || l.next)) return '';
    return html`<nav class="reader-nav" aria-label="${t('lessons.title')}">
      ${l.prev ? html`<a class="card reader-nav-link" href="/lessons/${l.prev.slug}"><small>${t('lessons.prev')}</small><strong>${l.prev.title}</strong></a>` : html`<span></span>`}
      ${l.next ? html`<a class="card reader-nav-link is-next" href="/lessons/${l.next.slug}"><small>${t('lessons.next')}</small><strong>${l.next.title}</strong></a>` : html`<span></span>`}
    </nav>`;
  }

  const go = (i) => {
    idx = Math.max(0, Math.min(steps.length - 1, i));
    save();
    render();
    const st = root.querySelector('.lx-progress');
    if (st) st.scrollIntoView({ block: 'nearest' });
    root.querySelector('#lx-step')?.focus({ preventScroll: true });
    if (steps[idx].final) autoComplete();
  };

  async function autoComplete() {
    if (review || !store.user || l.completed) return;
    try { await api.post(`/lessons/${l.id}/complete`); l.completed = true; toast(t('lessons.completedToast')); render(); } catch { /* ignore */ }
  }

  function wire() {
    const scope = mode === 'full' ? root.querySelector('.reader-card') : root.querySelector('#lx-step');
    const parts = mode === 'full' ? allParts : (steps[idx].parts || []);
    if (scope) {
      wireParts(scope, parts, answers, (id) => {
        save();
        const y = window.scrollY;
        render();
        window.scrollTo(0, y);
        const el = root.querySelector(`.lx[data-id="${id}"] .lx-verdict, .lx[data-id="${id}"] .lx-answer`);
        if (el) el.focus?.();
      });
    }
    root.querySelector('#mode-btn')?.addEventListener('click', () => { mode = mode === 'full' ? 'steps' : 'full'; viewPref.set(mode); render(); });
    root.querySelector('#prev-btn')?.addEventListener('click', () => go(idx - 1));
    root.querySelector('#next-btn')?.addEventListener('click', () => go(idx + 1));
    root.querySelectorAll('.lx-seg').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.go))));
    const doneBtn = root.querySelector('#done-btn');
    if (doneBtn) doneBtn.onclick = async () => {
      try {
        if (l.completed) await api.del(`/lessons/${l.id}/complete`); else await api.post(`/lessons/${l.id}/complete`);
        l.completed = !l.completed;
        if (l.completed) toast(t('lessons.completedToast'));
        render();
      } catch (e) { toast(errorMessage(e), 'error'); }
    };
    const rv = root.querySelector('#review-done');
    if (rv) rv.onclick = async () => {
      try { await api.post(`/lessons/${l.id}/review`); memDel(key); toast(t('lx.reviewSaved')); navigate('/lessons'); } catch (e) { toast(errorMessage(e), 'error'); }
    };
    const qb = root.querySelector('#quiz-btn');
    if (qb) qb.onclick = () => startAttempt({ mode: 'category', categoryId: c.id, practice: true, count: 10 }, qb);
  }

  render();
  if (steps[idx].final && mode === 'steps') autoComplete();
}
