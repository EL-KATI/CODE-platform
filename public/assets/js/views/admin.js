// Panneau d'administration : statistiques, contenu, élèves, utilisateurs, paramètres, audit.
import { html, raw, loading, toast, errorMessage, confirmDialog, fmtDate, pct } from '../ui.js';
import { t, catName } from '../i18n.js';
import { api, uploadBlob } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { progressBar, videoBlock } from './common.js';
import { speak } from '../ui.js';

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
const STATUSES = ['published', 'draft', 'archived'];

export async function questionsView(root, { query }) {
  await load(root, '/admin/questions', async () => {
    const q = query.q || '';
    const category = query.category || '';
    const status = query.status || '';
    const page = Math.max(1, Number(query.page) || 1);
    const qs = new URLSearchParams({ size: '50', page: String(page), q });
    if (category) qs.set('category', category);
    if (status) qs.set('status', status);
    const [cats, data] = await Promise.all([store.getCategories(), api.get(`/admin/questions?${qs}`)]);
    const catById = new Map(cats.map((c) => [c.id, c]));
    const pages = Math.max(1, Math.ceil(data.total / data.size));
    const link = (p) => {
      const u = new URLSearchParams({ q, page: String(p) });
      if (category) u.set('category', category);
      if (status) u.set('status', status);
      return `/admin/questions?${u}`;
    };
    shell(root, '/admin/questions', html`
      <form class="row" id="q-search" style="margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <input class="input" name="q" type="search" value="${q}" placeholder="${t('common.search')}" aria-label="${t('common.search')}" style="flex:1;min-width:180px">
        <select class="input" name="category" aria-label="${t('admin.category')}" style="width:auto">
          <option value="">${t('admin.allCategories')}</option>
          ${cats.map((c) => html`<option value="${c.id}" ${String(c.id) === category ? raw('selected') : ''}>${c.icon || ''} ${catName(c)}</option>`)}
        </select>
        <select class="input" name="status" aria-label="${t('admin.status')}" style="width:auto">
          <option value="">${t('admin.allStatuses')}</option>
          ${STATUSES.map((st) => html`<option value="${st}" ${st === status ? raw('selected') : ''}>${t('status.' + st)}</option>`)}
        </select>
        <button class="btn btn-secondary" type="submit">${t('common.search')}</button>
        <span class="spacer"></span>
        <a class="btn btn-primary" href="/admin/questions/new">+ ${t('common.new')}</a>
      </form>
      <p class="muted small">${t('admin.results', { n: data.total })}</p>
      <div class="card" style="overflow:auto"><table class="table"><thead><tr><th>#</th><th>${t('admin.text')}</th><th>${t('admin.category')}</th><th>${t('admin.status')}</th><th>${t('admin.success')}</th></tr></thead><tbody>
        ${data.items.map((r) => {
          const c = catById.get(r.category_id);
          return html`<tr><td><a href="/admin/questions/${r.id}">${r.id}</a></td><td><a href="/admin/questions/${r.id}">${r.text}</a></td>
            <td class="small">${c ? `${c.icon || ''} ${catName(c)}` : '—'}</td><td><span class="pill">${t('status.' + r.status)}</span></td><td>${r.success ?? '—'}${r.success != null ? '%' : ''}</td></tr>`;
        })}
      </tbody></table></div>
      ${pages > 1 ? html`<div class="row" style="justify-content:center;margin-top:12px;gap:8px">
        ${page > 1 ? html`<a class="btn btn-secondary btn-sm" href="${link(page - 1)}">‹</a>` : ''}
        <span class="small muted">${page} / ${pages}</span>
        ${page < pages ? html`<a class="btn btn-secondary btn-sm" href="${link(page + 1)}">›</a>` : ''}</div>` : ''}`);
    const form = root.querySelector('#q-search');
    const submit = () => {
      const u = new URLSearchParams({ q: val(form, 'q') });
      if (val(form, 'category')) u.set('category', val(form, 'category'));
      if (val(form, 'status')) u.set('status', val(form, 'status'));
      navigate(`/admin/questions?${u}`);
    };
    form.onsubmit = (e) => { e.preventDefault(); submit(); };
    form.elements.category.onchange = submit;
    form.elements.status.onchange = submit;
  });
}

export async function questionEditView(root, { params }) {
  const isNew = params.id === 'new';
  await load(root, '/admin/questions', async () => {
    const cats = await store.getCategories();
    const q = isNew ? { categoryId: cats[0]?.id, text: '', options: ['', '', ''], correct: [1], explanation: '', difficulty: 2, status: 'published', question_type: '3/../', skill_type: 'معرفية' } : await api.get(`/admin/questions/${params.id}`);
    const catId = q.category_id ?? q.categoryId;
    shell(root, '/admin/questions', html`
      <form class="card stack" id="q-form" style="max-width:760px">
        <label>${t('admin.category')}<select class="input" name="categoryId">${cats.map((c) => html`<option value="${c.id}" ${c.id === catId ? raw('selected') : ''}>${catName(c)}</option>`)}</select></label>
        <label>${t('admin.text')}<textarea class="input" name="text" rows="3" required>${q.text}</textarea></label>
        <label>${t('admin.options')}<textarea class="input" name="options" rows="4" required>${q.options.join('\n')}</textarea></label>
        <label>${t('admin.correct')}<input class="input" name="correct" value="${q.correct.join(',')}" required></label>
        <label>${t('admin.explanation')}<textarea class="input" name="explanation" rows="3">${q.explanation || ''}</textarea></label>
        <fieldset class="stack" style="border:1px solid var(--border,#ccd);border-radius:10px;padding:12px">
          <legend>${t('admin.media')}</legend>
          <div id="img-prev"></div>
          <div class="row" style="flex-wrap:wrap;gap:8px">
            <label class="btn btn-secondary">🖼️ ${t('admin.uploadImage')}<input type="file" id="img-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden></label>
            <button class="btn btn-ghost" type="button" id="img-clear">${t('admin.removeImage')}</button>
          </div>
          <label>${t('admin.imageUrl')}<input class="input" name="image" dir="ltr" value="${q.image || ''}" placeholder="https://… ${t('admin.orPaste')}"></label>
          <label>${t('admin.imageAlt')}<input class="input" name="imageAlt" value="${q.image_alt || ''}"></label>
          <hr style="width:100%;opacity:.3">
          <div id="vid-prev"></div>
          <div class="row" style="flex-wrap:wrap;gap:8px">
            <label class="btn btn-secondary">🎬 ${t('admin.uploadVideo')}<input type="file" id="vid-file" accept="video/mp4,video/webm" hidden></label>
            <button class="btn btn-ghost" type="button" id="vid-clear">${t('admin.removeVideo')}</button>
          </div>
          <label>${t('admin.videoUrl')}<input class="input" name="video" dir="ltr" value="${q.video || ''}" placeholder="YouTube / https://…mp4"></label>
          <hr style="width:100%;opacity:.3">
          <label>${t('admin.audioText')}<textarea class="input" name="audioText" rows="3" placeholder="${t('admin.audioHelp')}">${q.audio_text || ''}</textarea></label>
          <div><button class="btn btn-secondary" type="button" id="audio-test">🔊 ${t('admin.audioTest')}</button></div>
        </fieldset>
        <div class="row">
          <label>${t('admin.questionType')}
            <select class="input" name="question_type">
              ${[['½','½'],['½½','½½'],['3/../','3/../'],['4/../','4/../']].map(([v,l]) => html`<option value="${v}" ${v === (q.question_type || '3/../') ? raw('selected') : ''}>${l}</option>`)}
            </select>
          </label>
          <label>${t('admin.skillType')}
            <select class="input" name="skill_type">
              ${[['معرفية','معرفية'],['سلوكية','سلوكية'],['اجتماعية','اجتماعية']].map(([v,l]) => html`<option value="${v}" ${v === (q.skill_type || 'معرفية') ? raw('selected') : ''}>${l}</option>`)}
            </select>
          </label>
        </div>
        <div class="row">
          <label>${t('admin.difficulty')}<select class="input" name="difficulty">${[1, 2, 3].map((d) => html`<option ${d === q.difficulty ? raw('selected') : ''}>${d}</option>`)}</select></label>
          <label>${t('admin.status')}<select class="input" name="status">${['draft', 'published', 'archived'].map((s) => html`<option ${s === q.status ? raw('selected') : ''}>${s}</option>`)}</select></label>
        </div>
        <div class="row"><button class="btn btn-primary" type="submit">${t('common.save')}</button>
          ${isNew ? '' : html`<button class="btn btn-danger" type="button" id="q-del">${t('common.delete')}</button>`}</div>
      </form>`);
    const form = root.querySelector('#q-form');
    const showMedia = () => {
      const img = val(form, 'image').trim();
      root.querySelector('#img-prev').innerHTML = img ? html`<img src="${img}" alt="" style="max-width:320px;max-height:220px;border-radius:8px">`.s : '';
      root.querySelector('#vid-prev').innerHTML = videoBlock({ video: val(form, 'video').trim() }).s || '';
    };
    const readDataUrl = (file) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(file); });
    const sendImage = async (file) => {
      try {
        const { url } = await api.post('/admin/uploads', { dataUrl: await readDataUrl(file) });
        form.elements.image.value = url; showMedia(); toast(t('common.saved'));
      } catch (err) { toast(errorMessage(err), 'error'); }
    };
    root.querySelector('#img-file').onchange = (e) => { const f = e.target.files[0]; if (f) sendImage(f); };
    root.querySelector('#img-clear').onclick = () => { form.elements.image.value = ''; showMedia(); };
    root.querySelector('#vid-clear').onclick = () => { form.elements.video.value = ''; showMedia(); };
    root.querySelector('#vid-file').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > 30 * 1024 * 1024) { toast(t('admin.videoTooBig'), 'error'); return; }
      toast(t('common.loading'));
      try { const { url } = await uploadBlob('/admin/uploads-video', f); form.elements.video.value = url; showMedia(); toast(t('common.saved')); } catch (err) { toast(errorMessage(err), 'error'); }
    };
    form.addEventListener('paste', (e) => {
      const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
      if (f) { e.preventDefault(); sendImage(f); }
    });
    form.elements.image.addEventListener('change', showMedia);
    form.elements.video.addEventListener('change', showMedia);
    root.querySelector('#audio-test').onclick = () => speak(val(form, 'audioText') || val(form, 'text'));
    showMedia();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = {
        categoryId: Number(val(form, 'categoryId')), text: val(form, 'text'), explanation: val(form, 'explanation'),
        options: val(form, 'options').split('\n').map((s) => s.trim()).filter(Boolean),
        correct: val(form, 'correct').split(',').map((s) => Number(s.trim())).filter(Boolean),
        difficulty: Number(val(form, 'difficulty')), status: val(form, 'status'),
        question_type: val(form, 'question_type'), skill_type: val(form, 'skill_type'),
        visual: q.visual || null, image: val(form, 'image').trim() || null, imageAlt: val(form, 'imageAlt'),
        video: val(form, 'video').trim() || null, audioText: val(form, 'audioText'),
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
const seriesBody = (s, extra = {}) => ({ title: s.title, description: s.description || '', sort: s.sort || 0, published: !!s.published, ...extra });

export async function seriesView(root) {
  await load(root, '/admin/series', async () => {
    const list = await api.get('/admin/series');
    shell(root, '/admin/series', html`
      <div class="row" style="margin-bottom:16px"><span class="spacer"></span><a class="btn btn-primary" href="/admin/series/new">+ ${t('admin.newSeries')}</a></div>
      <div class="card" style="overflow:auto"><table class="table"><thead><tr><th>${t('admin.order')}</th><th>${t('admin.seriesTitle')}</th><th>${t('admin.questions')}</th><th>${t('admin.status')}</th><th>${t('common.actions')}</th></tr></thead><tbody>
        ${list.length ? list.map((s) => html`<tr style="${s.published ? '' : 'opacity:.6'}"><td>${s.sort}</td><td><a href="/admin/series/${s.id}">${s.title}</a></td><td>${s.questionIds.length}</td>
          <td><span class="pill ${s.published ? 'pill-success' : 'pill-warning'}">${s.published ? t('admin.visible') : t('admin.hidden')}</span></td>
          <td class="row" style="gap:6px;flex-wrap:wrap">
            <a class="btn btn-secondary btn-sm" href="/admin/series/${s.id}">${t('common.edit')}</a>
            <button class="btn btn-secondary btn-sm" data-toggle="${s.id}" type="button">${s.published ? '🚫 ' + t('admin.hide') : '👁️ ' + t('admin.show')}</button>
            <button class="btn btn-danger btn-sm" data-del="${s.id}" type="button">${t('common.delete')}</button></td></tr>`)
          : html`<tr><td colspan="5" class="muted">${t('common.none')}</td></tr>`}
      </tbody></table></div>`);
    root.querySelectorAll('[data-toggle]').forEach((b) => b.onclick = async () => {
      const s = list.find((x) => String(x.id) === b.dataset.toggle);
      b.disabled = true;
      try { await api.put(`/admin/series/${s.id}`, seriesBody(s, { published: !s.published })); toast(t('common.saved')); await seriesView(root); }
      catch (err) { b.disabled = false; toast(errorMessage(err), 'error'); }
    });
    root.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (!(await confirmDialog(t('admin.confirmDelete'), { danger: true }))) return;
      try { await api.del(`/admin/series/${b.dataset.del}`); await seriesView(root); } catch (err) { toast(errorMessage(err), 'error'); }
    });
  });
}

const MAX_SERIES_QUESTIONS = 100;

export async function seriesEditView(root, { params }) {
  const isNew = params.id === 'new';
  await load(root, '/admin/series', async () => {
    const [cats, list] = await Promise.all([store.getCategories(), api.get('/admin/series')]);
    const s = isNew ? { title: '', description: '', sort: list.length + 1, published: 1, questionIds: [] } : list.find((x) => String(x.id) === params.id);
    if (!s) return navigate('/admin/series', { replace: true });
    const catById = new Map(cats.map((c) => [c.id, c]));
    // Questions choisies (ordre = ordre de passage) et cache des textes.
    const picked = [...s.questionIds];
    const info = new Map();
    if (picked.length) {
      const all = await api.get('/admin/questions?size=500');
      all.items.forEach((q) => info.set(q.id, q));
      for (const id of picked.filter((id) => !info.has(id))) {
        try { info.set(id, await api.get(`/admin/questions/${id}`)); } catch { /* question supprimée */ }
      }
      for (let i = picked.length - 1; i >= 0; i--) if (!info.has(picked[i])) picked.splice(i, 1);
    }
    const qLabel = (q) => {
      const c = catById.get(q.category_id);
      return html`<span class="small muted">#${q.id} ${c ? c.icon || '' : ''}</span> ${q.text}${q.status !== 'published' ? html` <span class="pill">${t('status.' + q.status)}</span>` : ''}`;
    };

    shell(root, '/admin/series', html`
      <h2 style="margin:0 0 12px">${isNew ? t('admin.newSeries') : t('admin.editSeries')}</h2>
      <form class="card stack" id="s-form" style="margin-bottom:20px">
        <label>${t('admin.seriesTitle')}<input class="input" name="title" value="${s.title}" required minlength="2" maxlength="200"></label>
        <label>${t('admin.description')}<textarea class="input" name="description" rows="2" maxlength="1000">${s.description || ''}</textarea></label>
        <div class="row" style="gap:16px;flex-wrap:wrap">
          <label>${t('admin.order')}<input class="input" name="sort" type="number" min="0" max="10000" value="${s.sort}" style="width:110px"></label>
          <label style="align-self:end"><input type="checkbox" name="published" ${s.published ? raw('checked') : ''}> ${t('admin.showToLearners')}</label>
        </div>
        <div class="row"><button class="btn btn-primary" type="submit">${t('common.save')}</button>
          <a class="btn btn-secondary" href="/admin/series">${t('common.back')}</a>
          ${isNew ? '' : html`<button class="btn btn-danger" type="button" id="s-del">${t('common.delete')}</button>`}</div>
      </form>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px">
        <section class="card"><h3 id="picked-title" style="margin-top:0"></h3><ol id="picked" class="stack" style="padding-inline-start:20px;margin:0"></ol></section>
        <section class="card"><h3 style="margin-top:0">${t('admin.addQuestions')}</h3>
          <form class="row" id="pick-search" style="flex-wrap:wrap;gap:8px;margin-bottom:12px">
            <select class="input" name="category" aria-label="${t('admin.category')}" style="width:auto">
              <option value="">${t('admin.allCategories')}</option>
              ${cats.map((c) => html`<option value="${c.id}">${c.icon || ''} ${catName(c)}</option>`)}
            </select>
            <input class="input" name="q" type="search" placeholder="${t('common.search')}" aria-label="${t('common.search')}" style="flex:1;min-width:140px">
            <button class="btn btn-secondary" type="submit">${t('common.search')}</button>
          </form>
          <div class="row small muted" style="margin-bottom:8px"><span id="pick-count"></span><span class="spacer"></span><button class="btn btn-ghost btn-sm" type="button" id="add-all">+ ${t('admin.addAll')}</button></div>
          <ul id="pool" class="stack" style="list-style:none;padding:0;margin:0;max-height:520px;overflow:auto"></ul>
        </section>
      </div>`);

    const pickedEl = root.querySelector('#picked');
    const poolEl = root.querySelector('#pool');
    let pool = [];

    function drawPicked() {
      root.querySelector('#picked-title').textContent = t('admin.seriesQuestions', { n: picked.length });
      pickedEl.innerHTML = picked.length ? html`${picked.map((id, i) => {
        const q = info.get(id);
        return html`<li><div class="row" style="gap:6px;align-items:flex-start"><span style="flex:1" lang="ar" dir="rtl">${q ? qLabel(q) : `#${id}`}</span>
          <button class="btn btn-ghost btn-sm" type="button" data-up="${i}" aria-label="${t('admin.up')}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-ghost btn-sm" type="button" data-down="${i}" aria-label="${t('admin.down')}" ${i === picked.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn btn-ghost btn-sm" type="button" data-rm="${i}" aria-label="${t('admin.remove')}">✕</button></div></li>`;
      })}`.s : html`<p class="muted small">${t('admin.noneSelected')}</p>`.s;
      pickedEl.querySelectorAll('[data-up]').forEach((b) => b.onclick = () => { const i = +b.dataset.up; [picked[i - 1], picked[i]] = [picked[i], picked[i - 1]]; drawPicked(); });
      pickedEl.querySelectorAll('[data-down]').forEach((b) => b.onclick = () => { const i = +b.dataset.down; [picked[i + 1], picked[i]] = [picked[i], picked[i + 1]]; drawPicked(); });
      pickedEl.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { picked.splice(+b.dataset.rm, 1); drawPicked(); drawPool(); });
    }

    function add(id) {
      if (picked.includes(id)) return true;
      if (picked.length >= MAX_SERIES_QUESTIONS) { toast(t('admin.maxQuestions'), 'error'); return false; }
      picked.push(id);
      return true;
    }

    function drawPool() {
      const free = pool.filter((q) => !picked.includes(q.id));
      root.querySelector('#pick-count').textContent = t('admin.results', { n: free.length });
      poolEl.innerHTML = free.length ? html`${free.map((q) => html`<li class="row" style="gap:6px;align-items:flex-start;border-bottom:1px solid var(--border, #0001);padding-bottom:6px">
        <span style="flex:1" lang="ar" dir="rtl">${qLabel(q)}</span>
        <button class="btn btn-secondary btn-sm" type="button" data-add="${q.id}">+ ${t('admin.add')}</button></li>`)}`.s
        : html`<li class="muted small">${t('common.none')}</li>`.s;
      poolEl.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => { if (add(+b.dataset.add)) { drawPicked(); drawPool(); } });
    }

    async function search() {
      const f = root.querySelector('#pick-search');
      const u = new URLSearchParams({ size: '500', q: val(f, 'q') });
      if (val(f, 'category')) u.set('category', val(f, 'category'));
      try {
        const res = await api.get(`/admin/questions?${u}`);
        pool = res.items.filter((q) => q.status !== 'archived');
        pool.forEach((q) => info.set(q.id, q));
        drawPool();
      } catch (err) { toast(errorMessage(err), 'error'); }
    }

    const pf = root.querySelector('#pick-search');
    pf.onsubmit = (e) => { e.preventDefault(); search(); };
    pf.elements.category.onchange = search;
    root.querySelector('#add-all').onclick = () => {
      for (const q of pool) if (!picked.includes(q.id) && !add(q.id)) break;
      drawPicked(); drawPool();
    };

    const form = root.querySelector('#s-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = { title: val(form, 'title'), description: val(form, 'description'), sort: Number(val(form, 'sort')) || 0,
        published: form.elements.published.checked, questionIds: picked };
      try {
        if (isNew) await api.post('/admin/series', body); else await api.put(`/admin/series/${params.id}`, body);
        toast(t('common.saved')); navigate('/admin/series');
      } catch (err) { toast(errorMessage(err), 'error'); }
    };
    const del = root.querySelector('#s-del');
    if (del) del.onclick = async () => {
      if (!(await confirmDialog(t('admin.confirmDelete'), { danger: true }))) return;
      try { await api.del(`/admin/series/${params.id}`); navigate('/admin/series'); } catch (err) { toast(errorMessage(err), 'error'); }
    };

    drawPicked();
    search();
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
    let showAddForm = false;

    function render() {
      shell(root, '/admin/users', html`
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h2 style="margin:0">${t('admin.users')}</h2>
          <button class="btn btn-primary btn-sm" id="btn-add-user">＋ ${t('admin.addUser')}</button>
        </div>
        ${showAddForm ? html`
        <div class="card" style="margin-bottom:16px">
          <h3 style="margin-top:0">${t('admin.addUser')}</h3>
          <form id="add-user-form" class="stack" style="max-width:420px">
            <label>${t('admin.name')}<input class="input" name="name" required minlength="2" maxlength="80" placeholder="${t('admin.namePlaceholder')}"></label>
            <label>${t('admin.email')}<input class="input" name="email" type="email" required placeholder="exemple@gmail.com"></label>
            <label>${t('admin.password')}<input class="input" name="password" type="password" required minlength="8" placeholder="${t('admin.passwordHint')}"></label>
            <label>${t('admin.role')}
              <select class="input" name="role">
                ${['student', 'instructor', 'admin'].map((r) => html`<option value="${r}">${t('role.' + r)}</option>`)}
              </select>
            </label>
            <div style="display:flex;gap:8px">
              <button class="btn btn-primary" type="submit">${t('common.save')}</button>
              <button class="btn btn-secondary" type="button" id="btn-cancel-user">${t('common.cancel')}</button>
            </div>
          </form>
        </div>` : ''}
        <div class="card" style="overflow:auto"><table class="table"><thead><tr>
          <th>${t('admin.name')}</th><th>${t('admin.email')}</th><th>${t('admin.role')}</th><th>${t('admin.active')}</th><th></th>
        </tr></thead><tbody>
          ${list.map((u) => html`<tr>
            <td>${u.name}</td>
            <td>${u.email}</td>
            <td><select class="input" data-role="${u.id}">${['student', 'instructor', 'admin'].map((r) => html`<option value="${r}" ${r === u.role ? raw('selected') : ''}>${t('role.' + r)}</option>`)}</select></td>
            <td><input type="checkbox" data-active="${u.id}" ${u.active ? raw('checked') : ''} aria-label="${t('admin.active')}"></td>
            <td><button class="btn btn-danger btn-sm" data-del="${u.id}" title="${t('admin.deleteUser')}">🗑</button></td>
          </tr>`)}
        </tbody></table></div>`);

      root.querySelector('#btn-add-user').onclick = () => { showAddForm = !showAddForm; render(); };
      const cancelBtn = root.querySelector('#btn-cancel-user');
      if (cancelBtn) cancelBtn.onclick = () => { showAddForm = false; render(); };

      const addForm = root.querySelector('#add-user-form');
      if (addForm) {
        addForm.onsubmit = async (e) => {
          e.preventDefault();
          const fd = new FormData(addForm);
          const body = { name: fd.get('name'), email: fd.get('email'), password: fd.get('password'), role: fd.get('role'), acceptTerms: true };
          try {
            await api.post('/admin/users', body);
            toast(t('common.saved'));
            showAddForm = false;
            const updated = await api.get('/admin/users');
            list.splice(0, list.length, ...updated);
            render();
          } catch (err) { toast(errorMessage(err), 'error'); }
        };
      }

      const patch = async (id, body) => {
        try { await api.patch(`/admin/users/${id}`, body); toast(t('common.saved')); }
        catch (err) { toast(errorMessage(err), 'error'); const updated = await api.get('/admin/users'); list.splice(0, list.length, ...updated); render(); }
      };
      root.querySelectorAll('[data-role]').forEach((s) => s.onchange = () => patch(s.dataset.role, { role: s.value }));
      root.querySelectorAll('[data-active]').forEach((c) => c.onchange = () => patch(c.dataset.active, { active: c.checked }));
      root.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
        if (!confirm(t('admin.confirmDelete'))) return;
        try {
          await api.del(`/admin/users/${b.dataset.del}`);
          const updated = await api.get('/admin/users');
          list.splice(0, list.length, ...updated);
          render();
        } catch (err) { toast(errorMessage(err), 'error'); }
      });
    }
    render();
  });
}

// --- Paramètres (admin) ----------------------------------------------------------
export async function settingsView(root) {
  await load(root, '/admin/settings', async () => {
    const [s, cats] = await Promise.all([store.getSettings(true), store.getCategories()]);
    shell(root, '/admin/settings', html`
      <form class="card stack" id="s-form" style="max-width:480px">
        <p class="muted">${t('admin.settingsHelp')}</p>
        <label>${t('exam.questions')} <small class="muted">(${t('admin.defaultForAll')})</small><input class="input" name="exam_question_count" type="number" min="5" max="200" value="${s.questionCount}"></label>
        <label>${t('exam.passMark')}<input class="input" name="exam_pass_mark" type="number" min="1" max="200" value="${s.passMark}"></label>
        <label>${t('exam.perQuestion')} (s)<input class="input" name="exam_seconds_per_question" type="number" min="10" max="300" value="${s.secondsPerQuestion}"></label>
        <label>${t('dash.readiness')}<input class="input" name="readiness_window" type="number" min="2" max="20" value="${s.readinessWindow}"></label>
        <button class="btn btn-primary" type="submit">${t('common.save')}</button>
      </form>
      <div class="card" style="margin-top:16px">
        <h3 style="margin-top:0">${t('admin.examCountPerCategory')}</h3>
        <p class="muted small">${t('admin.examCountHelp')}</p>
        <table class="table"><thead><tr><th>${t('admin.category')}</th><th>${t('admin.examCount')}</th></tr></thead><tbody>
          ${cats.map((c) => html`<tr>
            <td>${c.name_ar || c.nameAr}</td>
            <td><input class="input" type="number" min="1" max="200" placeholder="${s.questionCount}" data-catcount="${c.id}" value="${c.exam_count ?? c.examCount ?? ''}"></td>
          </tr>`)}
        </tbody></table>
        <button class="btn btn-secondary" id="btn-save-counts" style="margin-top:12px">${t('common.save')}</button>
      </div>`);
    const form = root.querySelector('#s-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, Number(v)]));
      try { await api.put('/admin/settings', body); await store.getSettings(true); toast(t('common.saved')); } catch (err) { toast(errorMessage(err), 'error'); }
    };
    // Save per-category exam counts
    root.querySelector('#btn-save-counts').onclick = async () => {
      const inputs = root.querySelectorAll('[data-catcount]');
      const saves = [...inputs].map(async (inp) => {
        const id = inp.dataset.catcount;
        const val = inp.value.trim();
        const cat = cats.find((c) => String(c.id) === String(id));
        if (!cat) return;
        const examCount = val === '' ? null : Number(val);
        const body = { name_ar: cat.name_ar || cat.nameAr, name_fr: cat.name_fr || cat.nameFr, icon: cat.icon || '', exam_weight: cat.exam_weight ?? cat.examWeight ?? 1, sort: cat.sort ?? 0, exam_count: examCount };
        return api.put(`/admin/categories/${id}`, body);
      });
      try { await Promise.all(saves); await store.getCategories(true); toast(t('common.saved')); } catch (err) { toast(errorMessage(err), 'error'); }
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
