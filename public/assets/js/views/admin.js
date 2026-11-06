// Panneau d'administration : statistiques, contenu, élèves, utilisateurs, paramètres, audit.
import { html, raw, loading, toast, errorMessage, confirmDialog, fmtDate, pct } from '../ui.js';
import { t, catName } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { progressBar } from './common.js';

const TABS = [
  ['/admin', 'admin.stats'], ['/admin/questions', 'admin.questions'], ['/admin/series', 'admin.series'],
  ['/admin/lessons', 'admin.lessons'], ['/admin/students', 'admin.students'],
];
const ADMIN_TABS = [['/admin/users', 'admin.users'], ['/admin/settings', 'admin.settings'], ['/admin/audit', 'admin.audit']];

function shell(root, current, body) {
  const tabs = [...TABS, ...(store.isAdmin() ? ADMIN_TABS : [])];
  root.innerHTML = html`<div class="page-head"><div><h1>${t('admin.title')}</h1></div></div>
    <nav class="row" style="flex-wrap:wrap;gap:8px;margin-bottom:20px" aria-label="${t('admin.title')}">
      ${tabs.map(([href, key]) => html`<a class="btn ${href === current ? 'btn-primary' : 'btn-secondary'}" href="${href}">${t(key)}</a>`)}
    </nav>${body}`.s;
}

async function load(root, current, fn) {
  root.innerHTML = loading().s;
  try { await fn(); } catch (e) { shell(root, current, html`<div class="empty"><p>${errorMessage(e)}</p></div>`); }
}

const val = (form, name) => form.elements[name]?.value ?? '';

// --- Statistiques ----------------------------------------------------------------
export async function statsView(root) {
  await load(root, '/admin', async () => {
    const s = await api.get('/admin/stats');
    const total = s.users.reduce((a, u) => a + u.n, 0);
    const rate = s.exams.total ? pct(s.exams.passed, s.exams.total) : 0;
    shell(root, '/admin', html`
      <div class="grid grid-4">
        <div class="card"><div class="muted small">${t('admin.users_count')}</div><h2 style="margin:6px 0">${total}</h2></div>
        <div class="card"><div class="muted small">${t('admin.new30')}</div><h2 style="margin:6px 0">${s.newUsers30}</h2></div>
        <div class="card"><div class="muted small">${t('admin.active7')}</div><h2 style="margin:6px 0">${s.activeUsers7}</h2></div>
        <div class="card"><div class="muted small">${t('admin.examsPassRate')}</div><h2 style="margin:6px 0">${rate}%</h2><div class="small muted">${s.exams.total} ${t('admin.examsTotal')}</div></div>
      </div>
      <h2 style="margin:28px 0 12px">${t('admin.coverage')}</h2>
      <div class="card"><table class="table"><tbody>
        ${s.coverage.map((c) => html`<tr><td>${catName(c)}</td><td>${c.published}</td><td style="width:40%">${progressBar(Math.min(100, pct(c.published, Math.max(1, c.perExam * 3))))}</td></tr>`)}
      </tbody></table></div>
      <h2 style="margin:28px 0 12px">${t('admin.hardest')}</h2>
      <div class="card"><table class="table"><tbody>
        ${s.hardest.length ? s.hardest.map((q) => html`<tr><td><a href="/admin/questions/${q.id}">#${q.id}</a> ${q.text}</td><td>${q.success}%</td></tr>`) : html`<tr><td class="muted">${t('common.none')}</td></tr>`}
      </tbody></table></div>`);
  });
}

// --- Questions -------------------------------------------------------------------
export async function questionsView(root, { query }) {
  await load(root, '/admin/questions', async () => {
    const q = query.q || '';
    const data = await api.get(`/admin/questions?size=50&q=${encodeURIComponent(q)}`);
    shell(root, '/admin/questions', html`
      <form class="row" id="q-search" style="margin-bottom:16px">
        <input class="input" name="q" type="search" value="${q}" placeholder="${t('common.search')}" aria-label="${t('common.search')}">
        <button class="btn btn-secondary" type="submit">${t('common.search')}</button>
        <span class="spacer"></span>
        <a class="btn btn-primary" href="/admin/questions/new">+ ${t('common.new')}</a>
      </form>
      <p class="muted small">${data.total}</p>
      <div class="card" style="overflow:auto"><table class="table"><thead><tr><th>#</th><th>${t('admin.text')}</th><th>${t('admin.status')}</th><th>${t('admin.success')}</th></tr></thead><tbody>
        ${data.items.map((r) => html`<tr><td><a href="/admin/questions/${r.id}">${r.id}</a></td><td>${r.text}</td><td><span class="pill">${r.status}</span></td><td>${r.success ?? '—'}${r.success != null ? '%' : ''}</td></tr>`)}
      </tbody></table></div>`);
    root.querySelector('#q-search').onsubmit = (e) => { e.preventDefault(); navigate(`/admin/questions?q=${encodeURIComponent(val(e.target, 'q'))}`); };
  });
}

export async function questionEditView(root, { params }) {
  const isNew = params.id === 'new';
  await load(root, '/admin/questions', async () => {
    const cats = await store.getCategories();
    const q = isNew ? { categoryId: cats[0]?.id, text: '', options: ['', '', ''], correct: [1], explanation: '', difficulty: 2, status: 'published' } : await api.get(`/admin/questions/${params.id}`);
    const catId = q.category_id ?? q.categoryId;
    shell(root, '/admin/questions', html`
      <form class="card stack" id="q-form" style="max-width:760px">
        <label>${t('admin.category')}<select class="input" name="categoryId">${cats.map((c) => html`<option value="${c.id}" ${c.id === catId ? raw('selected') : ''}>${catName(c)}</option>`)}</select></label>
        <label>${t('admin.text')}<textarea class="input" name="text" rows="3" required>${q.text}</textarea></label>
        <label>${t('admin.options')}<textarea class="input" name="options" rows="4" required>${q.options.join('\n')}</textarea></label>
        <label>${t('admin.correct')}<input class="input" name="correct" value="${q.correct.join(',')}" required></label>
        <label>${t('admin.explanation')}<textarea class="input" name="explanation" rows="3">${q.explanation || ''}</textarea></label>
        <div class="row">
          <label>${t('admin.difficulty')}<select class="input" name="difficulty">${[1, 2, 3].map((d) => html`<option ${d === q.difficulty ? raw('selected') : ''}>${d}</option>`)}</select></label>
          <label>${t('admin.status')}<select class="input" name="status">${['draft', 'published', 'archived'].map((s) => html`<option ${s === q.status ? raw('selected') : ''}>${s}</option>`)}</select></label>
        </div>
        <div class="row"><button class="btn btn-primary" type="submit">${t('common.save')}</button>
          ${isNew ? '' : html`<button class="btn btn-danger" type="button" id="q-del">${t('common.delete')}</button>`}</div>
      </form>`);
    const form = root.querySelector('#q-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = {
        categoryId: Number(val(form, 'categoryId')), text: val(form, 'text'), explanation: val(form, 'explanation'),
        options: val(form, 'options').split('\n').map((s) => s.trim()).filter(Boolean),
        correct: val(form, 'correct').split(',').map((s) => Number(s.trim())).filter(Boolean),
        difficulty: Number(val(form, 'difficulty')), status: val(form, 'status'),
        visual: q.visual || null, image: q.image || null, imageAlt: q.image_alt || '',
      };
      try {
        if (isNew) await api.post('/admin/questions', body); else await api.put(`/admin/questions/${params.id}`, body);
        toast(t('common.saved')); navigate('/admin/questions');
      } catch (err) { toast(errorMessage(err), 'error'); }
    };
    const del = root.querySelector('#q-del');
    if (del) del.onclick = async () => {
      if (!(await confirmDialog(t('admin.confirmDelete'), { danger: true }))) return;
      try { await api.del(`/admin/questions/${params.id}`); navigate('/admin/questions'); } catch (err) { toast(errorMessage(err), 'error'); }
    };
  });
}

// --- Séries ----------------------------------------------------------------------
export async function seriesView(root) {
  await load(root, '/admin/series', async () => {
    const list = await api.get('/admin/series');
    shell(root, '/admin/series', html`
      <div class="card" style="overflow:auto"><table class="table"><thead><tr><th>#</th><th>${t('admin.title_fr')}</th><th>${t('admin.questions')}</th><th>${t('common.actions')}</th></tr></thead><tbody>
        ${list.map((s) => html`<tr><td>${s.id}</td><td>${s.title}</td><td>${s.questionIds.length}</td><td><button class="btn btn-secondary btn-sm" data-del="${s.id}" type="button">${t('common.delete')}</button></td></tr>`)}
      </tbody></table></div>`);
    root.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (!(await confirmDialog(t('admin.confirmDelete'), { danger: true }))) return;
      try { await api.del(`/admin/series/${b.dataset.del}`); await seriesView(root); } catch (err) { toast(errorMessage(err), 'error'); }
    });
  });
}

// --- Leçons ----------------------------------------------------------------------
export async function lessonsAdminView(root) {
  await load(root, '/admin/lessons', async () => {
    const list = await api.get('/admin/lessons');
    shell(root, '/admin/lessons', html`
      <div class="row" style="margin-bottom:16px"><span class="spacer"></span><a class="btn btn-primary" href="/admin/lessons/new">+ ${t('common.new')}</a></div>
      <div class="card" style="overflow:auto"><table class="table"><tbody>
        ${list.map((l) => html`<tr><td>${l.sort}</td><td><a href="/admin/lessons/${l.id}">${l.title}</a></td><td>${l.slug}</td><td>${l.published ? '✓' : '—'}</td></tr>`)}
      </tbody></table></div>`);
  });
}

export async function lessonEditView(root, { params }) {
  const isNew = params.id === 'new';
  await load(root, '/admin/lessons', async () => {
    const cats = await store.getCategories();
    const l = isNew ? { title: '', slug: '', summary: '', body: '', minutes: 5, sort: 0, published: 1, category_id: null }
      : (await api.get('/admin/lessons')).find((x) => String(x.id) === params.id);
    if (!l) return navigate('/admin/lessons', { replace: true });
    shell(root, '/admin/lessons', html`
      <form class="card stack" id="l-form" style="max-width:820px">
        <label>${t('admin.title_fr')}<input class="input" name="title" value="${l.title}" required></label>
        <label>slug<input class="input" name="slug" value="${l.slug}" pattern="[a-z0-9-]+" required></label>
        <label>${t('admin.category')}<select class="input" name="categoryId"><option value="">—</option>${cats.map((c) => html`<option value="${c.id}" ${c.id === l.category_id ? raw('selected') : ''}>${catName(c)}</option>`)}</select></label>
        <label>${t('admin.explanation')}<input class="input" name="summary" value="${l.summary || ''}"></label>
        <label>${t('admin.body')}<textarea class="input" name="body" rows="14">${l.body || ''}</textarea></label>
        <div class="row"><label>min<input class="input" name="minutes" type="number" min="1" value="${l.minutes}"></label>
          <label>#<input class="input" name="sort" type="number" min="0" value="${l.sort}"></label>
          <label><input type="checkbox" name="published" ${l.published ? raw('checked') : ''}> ${t('admin.active')}</label></div>
        <div class="row"><button class="btn btn-primary" type="submit">${t('common.save')}</button>
          ${isNew ? '' : html`<button class="btn btn-danger" type="button" id="l-del">${t('common.delete')}</button>`}</div>
      </form>`);
    const form = root.querySelector('#l-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = {
        title: val(form, 'title'), slug: val(form, 'slug'), summary: val(form, 'summary'), body: val(form, 'body'),
        minutes: Number(val(form, 'minutes')), sort: Number(val(form, 'sort')), published: form.elements.published.checked,
        categoryId: val(form, 'categoryId') || null,
      };
      try {
        if (isNew) await api.post('/admin/lessons', body); else await api.put(`/admin/lessons/${params.id}`, body);
        toast(t('common.saved')); navigate('/admin/lessons');
      } catch (err) { toast(errorMessage(err), 'error'); }
    };
    const del = root.querySelector('#l-del');
    if (del) del.onclick = async () => {
      if (!(await confirmDialog(t('admin.confirmDelete'), { danger: true }))) return;
      try { await api.del(`/admin/lessons/${params.id}`); navigate('/admin/lessons'); } catch (err) { toast(errorMessage(err), 'error'); }
    };
  });
}

// --- Élèves ----------------------------------------------------------------------
export async function studentsView(root) {
  await load(root, '/admin/students', async () => {
    const list = await api.get('/admin/students');
    shell(root, '/admin/students', html`
      <div class="card" style="overflow:auto"><table class="table"><thead><tr><th>${t('admin.name')}</th><th>${t('admin.email')}</th><th>${t('admin.exams')}</th><th>${t('admin.lastActivity')}</th></tr></thead><tbody>
        ${list.length ? list.map((u) => html`<tr><td><a href="/admin/students/${u.id}">${u.name}</a></td><td>${u.email}</td><td>${u.exams_passed}/${u.exams}</td><td>${u.last_activity ? fmtDate(u.last_activity) : '—'}</td></tr>`) : html`<tr><td class="muted">${t('common.none')}</td></tr>`}
      </tbody></table></div>`);
  });
}

export async function studentView(root, { params }) {
  await load(root, '/admin/students', async () => {
    const { user, dashboard: d } = await api.get(`/admin/students/${params.id}`);
    shell(root, '/admin/students', html`
      <div class="card"><h2 style="margin-top:0">${user.name}</h2><p class="muted">${user.email}</p>
        <pre class="small" style="white-space:pre-wrap;direction:ltr;text-align:left">${JSON.stringify(d.readiness ?? d, null, 2)}</pre></div>`);
  });
}

// --- Utilisateurs (admin) --------------------------------------------------------
export async function usersView(root) {
  await load(root, '/admin/users', async () => {
    const list = await api.get('/admin/users');
    shell(root, '/admin/users', html`
      <div class="card" style="overflow:auto"><table class="table"><thead><tr><th>${t('admin.name')}</th><th>${t('admin.email')}</th><th>${t('admin.role')}</th><th>${t('admin.active')}</th></tr></thead><tbody>
        ${list.map((u) => html`<tr><td>${u.name}</td><td>${u.email}</td>
          <td><select class="input" data-role="${u.id}">${['student', 'instructor', 'admin'].map((r) => html`<option value="${r}" ${r === u.role ? raw('selected') : ''}>${t('role.' + r)}</option>`)}</select></td>
          <td><input type="checkbox" data-active="${u.id}" ${u.active ? raw('checked') : ''} aria-label="${t('admin.active')}"></td></tr>`)}
      </tbody></table></div>`);
    const patch = async (id, body) => { try { await api.patch(`/admin/users/${id}`, body); toast(t('common.saved')); } catch (err) { toast(errorMessage(err), 'error'); await usersView(root); } };
    root.querySelectorAll('[data-role]').forEach((s) => s.onchange = () => patch(s.dataset.role, { role: s.value }));
    root.querySelectorAll('[data-active]').forEach((c) => c.onchange = () => patch(c.dataset.active, { active: c.checked }));
  });
}

// --- Paramètres (admin) ----------------------------------------------------------
export async function settingsView(root) {
  await load(root, '/admin/settings', async () => {
    const s = await store.getSettings(true);
    shell(root, '/admin/settings', html`
      <form class="card stack" id="s-form" style="max-width:480px">
        <p class="muted">${t('admin.settingsHelp')}</p>
        <label>${t('exam.questions')}<input class="input" name="exam_question_count" type="number" min="5" max="100" value="${s.questionCount}"></label>
        <label>${t('exam.passMark')}<input class="input" name="exam_pass_mark" type="number" min="1" max="100" value="${s.passMark}"></label>
        <label>${t('exam.perQuestion')} (s)<input class="input" name="exam_seconds_per_question" type="number" min="10" max="300" value="${s.secondsPerQuestion}"></label>
        <label>${t('dash.readiness')}<input class="input" name="readiness_window" type="number" min="2" max="20" value="${s.readinessWindow}"></label>
        <button class="btn btn-primary" type="submit">${t('common.save')}</button>
      </form>`);
    const form = root.querySelector('#s-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, Number(v)]));
      try { await api.put('/admin/settings', body); await store.getSettings(true); toast(t('common.saved')); } catch (err) { toast(errorMessage(err), 'error'); }
    };
  });
}

// --- Audit (admin) ---------------------------------------------------------------
export async function auditView(root) {
  await load(root, '/admin/audit', async () => {
    const list = await api.get('/admin/audit');
    shell(root, '/admin/audit', html`
      <div class="card" style="overflow:auto"><table class="table"><thead><tr><th>${t('admin.date')}</th><th>${t('admin.user')}</th><th>${t('admin.action')}</th></tr></thead><tbody>
        ${list.map((a) => html`<tr><td>${fmtDate(a.created_at)}</td><td>${a.user_name || '—'}</td><td>${a.action} ${a.entity || ''} ${a.entity_id ?? ''}</td></tr>`)}
      </tbody></table></div>`);
  });
}
