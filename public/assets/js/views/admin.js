// Panneau d'administration : statistiques, contenu, élèves, utilisateurs, paramètres, audit.
import { html, raw, loading, toast, errorMessage, confirmDialog, fmtDate, pct } from '../ui.js';
import { t, catName } from '../i18n.js';
import { api, uploadBlob } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { progressBar, videoBlock } from './common.js';
import { speak } from '../ui.js';

/**
 * يُبرز الحقل الخاطئ في النموذج عند وجود خطأ من السيرفر يحتوي على details.field
 * — يضيف border حمراء + scroll إلى الحقل + رسالة خطأ صغيرة تحته
 */
function highlightField(form, err) {
  // أزل أي تمييز سابق
  form.querySelectorAll('.field-error-msg').forEach((el) => el.remove());
  form.querySelectorAll('[data-field-error]').forEach((el) => {
    el.style.borderColor = '';
    el.style.boxShadow = '';
    delete el.dataset.fieldError;
  });

  const rawField = err?.details?.field;
  if (!rawField || !form) return;

  // خريطة أسماء الحقول من السيرفر إلى أسماء الحقول في النموذج
  const fieldMap = {
    text: 'text',
    options: 'options',
    correct: 'correct',
    categoryId: 'categoryId',
    image: 'image',
    imageAlt: 'imageAlt',
    video: 'video',
    audioText: 'audioText',
    explanation: 'explanation',
    'sub_questions[0].text': 'sq1_text',
    'sub_questions[0].options': 'sq1_options',
    'sub_questions[0].correct': 'sq1_correct',
    'sub_questions[1].text': 'sq2_text',
    'sub_questions[1].options': 'sq2_options',
    'sub_questions[1].correct': 'sq2_correct',
    sub_questions: 'sq1_text',
  };
  const fieldName = fieldMap[rawField] || rawField;
  const el = form.elements[fieldName];
  if (!el) return;

  el.style.borderColor = 'var(--danger)';
  el.style.boxShadow = '0 0 0 3px rgb(185 28 28 / .2)';
  el.dataset.fieldError = '1';

  // أضف رسالة خطأ صغيرة أسفل الحقل
  const msg = document.createElement('span');
  msg.className = 'field-error-msg';
  msg.style.cssText = 'color:var(--danger);font-size:.8rem;font-weight:700;margin-top:4px;display:block';
  const labelMap = {
    text: t('admin.text'), options: t('admin.options'), correct: t('admin.correct'),
    categoryId: t('admin.category'), image: t('admin.imageUrl'), imageAlt: t('admin.imageAlt'),
    video: t('admin.videoUrl'), audioText: t('admin.audioText'), explanation: t('admin.explanation'),
    sq1_text: t('admin.text') + ' — ' + t('admin.subQ1'), sq1_options: t('admin.options') + ' — ' + t('admin.subQ1'),
    sq1_correct: t('admin.correct') + ' — ' + t('admin.subQ1'),
    sq2_text: t('admin.text') + ' — ' + t('admin.subQ2'), sq2_options: t('admin.options') + ' — ' + t('admin.subQ2'),
    sq2_correct: t('admin.correct') + ' — ' + t('admin.subQ2'),
  };
  msg.textContent = '⚠ ' + (labelMap[fieldName] || fieldName) + ' — ' + t('err.invalid_field');

  el.after(msg);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus();

  // أزل التمييز عند تعديل الحقل
  el.addEventListener('input', () => {
    el.style.borderColor = '';
    el.style.boxShadow = '';
    msg.remove();
  }, { once: true });
}

// تبويبات حسب الدور
const ADMIN_TABS_CONTENT = [
  ['/admin', 'admin.stats'], ['/admin/questions', 'admin.questions'], ['/admin/series', 'admin.series'],
  ['/admin/lessons', 'admin.lessons'], ['/admin/students', 'admin.students'],
];
const ADMIN_TABS_MANAGE = [['/admin/users', 'admin.users'], ['/admin/settings', 'admin.settings'], ['/admin/audit', 'admin.audit']];
// تبويبات السوبر أدمين الإضافية
const SUPER_TABS = [['/admin/import', 'admin.import']];
// المؤسسة: بيانات المؤسسة + طلابها + حجوزاتهم
export function schoolTabs() {
  return [['/admin', 'admin.stats'], ['/admin/school/enrollments', 'school.enrollments'], ['/admin/school/students', 'school.manageStudents'], ['/admin/school/instructors', 'school.manageInstructors'], ['/admin/bookings', 'nav.bookings'], ['/admin/exams', 'nav.exams']];
}
// المدرب: طلابه + حجوزاتهم
const INSTRUCTOR_TABS = [['/admin', 'admin.stats'], ['/admin/students', 'admin.students'], ['/admin/bookings', 'nav.bookings']];
// الأدمن: كل الصفحات (+ استيراد الأسئلة للسوبر أدمين)
const ADMIN_TABS = [...ADMIN_TABS_CONTENT, ...ADMIN_TABS_MANAGE];
function adminTabs() {
  return store.isSuperAdmin() ? [...ADMIN_TABS_CONTENT, ...SUPER_TABS, ...ADMIN_TABS_MANAGE] : ADMIN_TABS;
}

/** يُستعمل من app.js لبناء القائمة الجانبية */
export function getStaffTabs() {
  if (store.isSchool()) return schoolTabs();
  if (store.isInstructor()) return INSTRUCTOR_TABS;
  return adminTabs();
}

/** shell: بدون تبويبات علوية — التنقل عبر القائمة الجانبية فقط
 *  @param {Element} root
 *  @param {string}  current   href الصفحة الحالية (لاختيار العنوان)
 *  @param {object|string} body  إما HTML string أو {content, action} لإضافة زر في رأس الصفحة
 */
export function shell(root, current, body) {
  const allTabs = [
    ...ADMIN_TABS_CONTENT, ...ADMIN_TABS_MANAGE, ...SUPER_TABS,
    ...schoolTabs(), ...INSTRUCTOR_TABS,
    ['/admin/bookings', 'nav.bookings'],
    ['/admin/exams', 'nav.exams'],
    ['/admin/schools', 'schools.title'],
    ['/admin/school/students', 'school.manageStudents'],
    ['/admin/school/instructors', 'school.manageInstructors'],
  ];
  const found = allTabs.find(([href]) => href === current);
  const pageTitle = found ? t(found[1]) : t('admin.title');

  // body يمكن أن يكون كائناً { content, action } أو HTML مباشراً
  const { content, action } = (body && typeof body === 'object' && body.content !== undefined)
    ? body : { content: body, action: null };

  root.innerHTML = html`<div class="page-head">
      <div><h1>${pageTitle}</h1></div>
      ${action || ''}
    </div>${content}`.s;
}

async function load(root, current, fn) {
  root.innerHTML = loading().s;
  try { await fn(); } catch (e) { shell(root, current, html`<div class="empty"><p>${errorMessage(e)}</p></div>`); }
}

const val = (form, name) => form.elements[name]?.value ?? '';

// مساعد مشترك: بطاقة KPI
export const kpiCard = (icon, label, value, sub = '', href = '') => html`<a class="dash-kpi ${href ? '' : 'no-link'}" ${href ? html`href="${href}"` : ''}>
  <span class="dash-kpi-ic" aria-hidden="true">${icon}</span>
  <span class="muted small">${label}</span>
  <strong>${value}</strong>
  ${sub ? html`<span class="small muted">${sub}</span>` : ''}
</a>`;

// مساعد مشترك: عنوان قسم
const secHead = (txt) => html`<h3 class="dash-h">${txt}</h3>`;

// --- Statistiques ----------------------------------------------------------------
export async function statsView(root) {
  if (store.isSchool()) { import('./school.js').then((m) => m.schoolStatsView(root)); return; }
  if (store.isInstructor()) { import('./instructor.js').then((m) => m.instructorHomeView(root)); return; }
  await load(root, '/admin', async () => {
    const s = await api.get('/admin/stats');
    const total = s.users.reduce((a, u) => a + u.n, 0);
    const rate = s.exams.total ? pct(s.exams.passed, s.exams.total) : 0;
    shell(root, '/admin', html`
      <div class="dash-kpis">
        ${kpiCard('👥', t('admin.users_count'), total)}
        ${kpiCard('🟢', t('admin.activeNow'), s.activeNow ?? 0)}
        ${kpiCard('🆕', t('admin.new30'), s.newUsers30)}
        ${kpiCard('⚡', t('admin.active7'), s.activeUsers7)}
        ${kpiCard('📝', t('admin.examsPassRate'), rate + '%', s.exams.total + ' ' + t('admin.examsTotal'))}
      </div>
      <div class="grid grid-2" style="margin-top:20px">
        <div class="card">
          ${secHead('📚 ' + t('admin.coverage'))}
          <table class="table"><tbody>
            ${s.coverage.map((c) => html`<tr><td>${catName(c)}</td><td>${c.published}</td><td style="width:40%">${progressBar(Math.min(100, pct(c.published, Math.max(1, c.perExam * 3))))}</td></tr>`)}
          </tbody></table>
        </div>
        <div class="card">
          ${secHead('🔥 ' + t('admin.hardest'))}
          <table class="table"><tbody>
            ${s.hardest.length ? s.hardest.map((q) => html`<tr><td><a href="/admin/questions/${q.id}">#${q.id}</a> ${q.text}</td><td class="small muted">${q.success}%</td></tr>`) : html`<tr><td class="muted">${t('common.none')}</td></tr>`}
          </tbody></table>
        </div>
      </div>`);
  });
}

// --- Actions unifiées pour toutes les listes d'administration ------------------------
const actBtn = (act, id, icon, label, cls = '') => html`<button class="act-btn ${cls}" type="button" data-act="${act}" data-id="${id}" title="${label}" aria-label="${label}"><span aria-hidden="true">${icon}</span><span class="act-lbl">${label}</span></button>`;
const actLink = (href, icon, label) => html`<a class="act-btn" href="${href}" title="${label}" aria-label="${label}"><span aria-hidden="true">${icon}</span><span class="act-lbl">${label}</span></a>`;
// Même jeu de boutons partout : عرض · معاينة · تعديل · إخفاء/إظهار · حذف
export function rowActions({ id, viewHref, editHref, edit, preview, hidden, hide = true, del = true, extra = '', hideLabel, showLabel }) {
  return html`<div class="act-row">
    ${viewHref ? actLink(viewHref, '📄', t('admin.view')) : ''}
    ${preview ? actBtn('preview', id, '👁', t('admin.preview')) : ''}
    ${editHref ? actLink(editHref, '✏️', t('common.edit')) : ''}
    ${edit ? actBtn('edit', id, '✏️', t('common.edit')) : ''}
    ${hide ? actBtn(hidden ? 'show' : 'hide', id, hidden ? '👁️' : '🚫', hidden ? (showLabel || t('admin.show')) : (hideLabel || t('admin.hide'))) : ''}
    ${extra}
    ${del ? actBtn('delete', id, '🗑', t('common.delete'), 'act-danger') : ''}
  </div>`;
}
export function bindActions(root, handlers) {
  root.querySelectorAll('button[data-act]').forEach((b) => {
    const fn = handlers[b.dataset.act];
    if (fn) b.onclick = () => fn(b.dataset.id, b);
  });
}
export const statusPill = (visible, on = t('admin.visible'), off = t('admin.hidden')) => html`<span class="pill ${visible ? 'pill-success' : 'pill-warning'}">${visible ? on : off}</span>`;

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
      <div class="card" style="overflow:auto"><table class="table list-table"><thead><tr><th>#</th><th>${t('admin.text')}</th><th>${t('admin.category')}</th><th>${t('admin.status')}</th><th>${t('admin.success')}</th><th>${t('common.actions')}</th></tr></thead><tbody>
        ${data.items.length ? data.items.map((r) => {
          const c = catById.get(r.category_id);
          const hidden = r.status !== 'published';
          return html`<tr style="${hidden ? 'opacity:.6' : ''}">
            <td>${r.id}</td>
            <td><a href="/admin/questions/${r.id}">${r.text}</a></td>
            <td class="small">${c ? `${c.icon || ''} ${catName(c)}` : '—'}</td>
            <td>${statusPill(!hidden)}</td>
            <td>${r.success ?? '—'}${r.success != null ? '%' : ''}</td>
            <td>${rowActions({ id: r.id, edit: true, preview: true, hidden })}</td>
          </tr>`;
        }) : html`<tr><td colspan="6" class="muted">${t('common.none')}</td></tr>`}
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
    const back = () => navigate(`/admin/questions?${new URLSearchParams({ q, page: String(page), ...(category ? { category } : {}), ...(status ? { status } : {}) })}`);
    const setStatus = async (qid, newStatus) => {
      const existing = await api.get(`/admin/questions/${qid}`);
      await api.put(`/admin/questions/${qid}`, { ...existing, categoryId: existing.category_id, imageAlt: existing.image_alt, audioText: existing.audio_text, status: newStatus });
    };
    bindActions(root, {
      preview: async (id) => { try { showQuestionPreview(await api.get(`/admin/questions/${id}`)); } catch (err) { toast(errorMessage(err), 'error'); } },
      edit: (id) => openQuestionEditModal(id, back),
      hide: async (id) => { try { await setStatus(id, 'draft'); toast(t('common.saved')); back(); } catch (err) { toast(errorMessage(err), 'error'); } },
      show: async (id) => { try { await setStatus(id, 'published'); toast(t('common.saved')); back(); } catch (err) { toast(errorMessage(err), 'error'); } },
      delete: async (id) => {
        if (!(await confirmDialog(t('admin.confirmDelete'), { danger: true }))) return;
        try { await api.del(`/admin/questions/${id}`); back(); } catch (err) { toast(errorMessage(err), 'error'); }
      },
    });
  });
}

function openPreviewModal(title, bodyHtml) {
  const existing = document.getElementById('admin-preview-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'admin-preview-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = `<div style="background:var(--surface,#fff);border-radius:14px;max-width:680px;width:100%;max-height:90vh;overflow:auto;padding:24px;position:relative">
    <button id="preview-close" style="position:absolute;top:12px;left:12px;background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--text-muted)">✕</button>
    <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">${t('admin.preview')}</div>
    <h2 style="margin:0 0 16px;font-size:1.1rem" dir="rtl">${title}</h2>
    ${bodyHtml}
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#preview-close').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

function showSeriesPreview(title, questions, total) {
  const items = questions.map((q, i) => `<div style="border:1px solid var(--border,#ddd);border-radius:10px;padding:12px 14px;margin-bottom:10px">
    <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:6px">${t('admin.question')} ${i + 1}</div>
    ${q.image ? `<img src="${q.image}" alt="" style="width:100%;max-height:140px;object-fit:contain;border-radius:6px;margin-bottom:8px">` : ''}
    <p dir="rtl" style="margin:0 0 8px;font-weight:600;font-size:.95rem">${q.text}</p>
    <div style="display:flex;flex-direction:column;gap:4px">
      ${(q.options || []).map((o, oi) => `<div dir="rtl" style="padding:5px 10px;border-radius:6px;font-size:.88rem;background:${(q.correct || []).includes(oi + 1) ? 'rgba(22,163,74,.12)' : 'var(--surface2,#f4f4f5)'}">
        <span style="font-weight:600">${oi + 1}.</span> ${o} ${(q.correct || []).includes(oi + 1) ? '✓' : ''}
      </div>`).join('')}
    </div>
  </div>`).join('');
  const footer = total > questions.length ? `<p class="muted small" style="text-align:center;margin-top:8px">... و${total - questions.length} سؤال آخر</p>` : '';
  openPreviewModal(title, items + footer);
}

function showQuestionPreview(q) {
  const opts = (q.options || []).map((o, i) => `<div style="padding:8px 12px;border:1px solid var(--border,#ddd);border-radius:8px;margin-bottom:6px;display:flex;gap:10px;align-items:center">
    <span style="font-weight:700;min-width:20px">${i + 1}</span>
    <span dir="rtl" style="flex:1">${o}</span>
    ${(q.correct || []).includes(i + 1) ? '<span style="color:#16a34a">✓</span>' : ''}
  </div>`).join('');
  openPreviewModal(`${t('admin.question')} #${q.id}`, `
    ${q.image ? `<img src="${q.image}" alt="" style="width:100%;max-height:200px;object-fit:contain;border-radius:8px;margin-bottom:12px">` : ''}
    <p dir="rtl" style="font-size:1.05rem;font-weight:600;margin:0 0 16px;line-height:1.6">${q.text}</p>
    <div>${opts}</div>
    ${q.explanation ? `<div style="margin-top:16px;padding:12px;background:var(--surface2,#f4f4f5);border-radius:8px;font-size:.9rem" dir="rtl">💡 ${q.explanation}</div>` : ''}`);
}

export async function questionEditView(root, { params }) {
  const isNew = params.id === 'new';
  await load(root, '/admin/questions', async () => {
    const cats = await store.getCategories();
    const q = isNew
      ? { categoryId: cats[0]?.id, text: '', options: ['', '', ''], correct: [1], explanation: '', difficulty: 2, status: 'published', is_double: 0, sub_questions: null, skill_type: 'معرفية' }
      : await api.get(`/admin/questions/${params.id}`);
    const catId = q.category_id ?? q.categoryId;

    // --- Step 1: اختيار نوع السؤال أولاً (للأسئلة الجديدة) ---
    if (isNew) {
      shell(root, '/admin/questions', html`
        <div class="card stack" style="max-width:480px;margin:auto;text-align:center">
          <h2 style="margin:0 0 8px">${t('admin.chooseKind')}</h2>
          <p class="muted small" style="margin:0 0 24px">${t('admin.chooseKindHint')}</p>
          <div class="row" style="justify-content:center;gap:16px">
            <button class="btn btn-primary" style="font-size:1.1rem;padding:14px 32px" id="kind-single">
              📄 ${t('admin.single')}
            </button>
            <button class="btn btn-secondary" style="font-size:1.1rem;padding:14px 32px" id="kind-double">
              ⚡ ${t('admin.double')}
            </button>
          </div>
        </div>`);
      root.querySelector('#kind-single').onclick = () => renderForm(root, cats, q, catId, false, isNew, params);
      root.querySelector('#kind-double').onclick = () => renderForm(root, cats, q, catId, true, isNew, params);
      return;
    }

    renderForm(root, cats, q, catId, !!q.is_double, isNew, params);
  });
}

function renderForm(root, cats, q, catId, startDouble, isNew, params, { onSaved } = {}) {
  const isDouble = startDouble;
  shell(root, '/admin/questions', html`
    <form class="card stack" id="q-form" style="max-width:760px">

      <!-- نوع السؤال — في أعلى الفورم -->
      <div style="background:var(--surface2,#f4f4f5);border-radius:10px;padding:12px 16px">
        <div class="row" style="align-items:center;gap:16px;flex-wrap:wrap">
          <strong style="white-space:nowrap">📋 ${t('admin.questionKind')}</strong>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="radio" name="is_double" value="0" ${!isDouble ? 'checked' : ''}> ${t('admin.single')}
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="radio" name="is_double" value="1" ${isDouble ? 'checked' : ''}> ${t('admin.double')}
          </label>
        </div>
      </div>

      <!-- الفئة + النص المشترك -->
      <label>${t('admin.category')}<select class="input" name="categoryId">${cats.map((c) => html`<option value="${c.id}" ${c.id === catId ? raw('selected') : ''}>${catName(c)}</option>`)}</select></label>
      <label>${t('admin.text')}<textarea class="input" name="text" rows="3" required>${q.text}</textarea></label>

      <!-- حقول السؤال المنفرد -->
      <div id="single-fields" style="display:${isDouble ? 'none' : 'contents'}">
        <label>${t('admin.options')}<textarea class="input" name="options" rows="4">${(q.options || []).join('\n')}</textarea></label>
        <label>${t('admin.correct')}<input class="input" name="correct" value="${(q.correct || []).join(',')}"></label>
      </div>

      <!-- حقول السؤال المزدوج -->
      <div id="double-fields" style="display:${isDouble ? 'block' : 'none'}">
        <fieldset class="stack" style="border:1px solid var(--border,#ccd);border-radius:10px;padding:12px;margin-top:4px">
          <legend>⚡ ${t('admin.double')} — ${t('admin.subQ1')}</legend>
          <label>${t('admin.text')}<textarea class="input" name="sq1_text" rows="2">${q.sub_questions?.[0]?.text || ''}</textarea></label>
          <label>${t('admin.options')}<textarea class="input" name="sq1_options" rows="3">${(q.sub_questions?.[0]?.options || ['', '']).join('\n')}</textarea></label>
          <label>${t('admin.correct')}<input class="input" name="sq1_correct" value="${(q.sub_questions?.[0]?.correct || [1]).join(',')}"></label>
        </fieldset>
        <fieldset class="stack" style="border:1px solid var(--border,#ccd);border-radius:10px;padding:12px;margin-top:8px">
          <legend>⚡ ${t('admin.double')} — ${t('admin.subQ2')}</legend>
          <label>${t('admin.text')}<textarea class="input" name="sq2_text" rows="2">${q.sub_questions?.[1]?.text || ''}</textarea></label>
          <label>${t('admin.options')}<textarea class="input" name="sq2_options" rows="3">${(q.sub_questions?.[1]?.options || ['', '']).join('\n')}</textarea></label>
          <label>${t('admin.correct')}<input class="input" name="sq2_correct" value="${(q.sub_questions?.[1]?.correct || [1]).join(',')}"></label>
        </fieldset>
      </div>

      <label>${t('admin.explanation')}<textarea class="input" name="explanation" rows="3">${q.explanation || ''}</textarea></label>

      <!-- الوسائط -->
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

      <!-- الصعوبة + نوع المهارة فقط (بدون الحالة) -->
      <div class="row">
        <label>${t('admin.skillType')}
          <select class="input" name="skill_type">
            ${[['معرفية', 'معرفية'], ['سلوكية', 'سلوكية'], ['اجتماعية', 'اجتماعية']].map(([v, l]) => html`<option value="${v}" ${v === (q.skill_type || 'معرفية') ? raw('selected') : ''}>${l}</option>`)}
          </select>
        </label>
        <label>${t('admin.difficulty')}<select class="input" name="difficulty">${[1, 2, 3].map((d) => html`<option ${d === (q.difficulty || 2) ? raw('selected') : ''}>${d}</option>`)}</select></label>
      </div>

      <!-- الحالة مخفية — تُدار من قائمة الأسئلة -->
      <input type="hidden" name="status" value="${q.status || 'published'}">

      <div class="row">
        <button class="btn btn-primary" type="submit">${t('common.save')}</button>
        <button class="btn btn-secondary" type="button" id="q-preview-inline">👁 ${t('admin.preview')}</button>
        ${isNew ? '' : html`<button class="btn btn-danger" type="button" id="q-del">${t('common.delete')}</button>`}
      </div>
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

  // toggle بين منفرد ومزدوج
  const singleFields = root.querySelector('#single-fields');
  const doubleFields = root.querySelector('#double-fields');
  root.querySelectorAll('[name=is_double]').forEach((r) => {
    r.onchange = () => {
      const dbl = r.value === '1';
      singleFields.style.display = dbl ? 'none' : 'contents';
      doubleFields.style.display = dbl ? 'block' : 'none';
    };
  });
  showMedia();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const isDoubleNow = val(form, 'is_double') === '1';
    const subQuestions = isDoubleNow ? [
      {
        text: val(form, 'sq1_text').trim(),
        options: val(form, 'sq1_options').split('\n').map((s) => s.trim()).filter(Boolean),
        correct: val(form, 'sq1_correct').split(',').map((s) => Number(s.trim())).filter(Boolean),
      },
      {
        text: val(form, 'sq2_text').trim(),
        options: val(form, 'sq2_options').split('\n').map((s) => s.trim()).filter(Boolean),
        correct: val(form, 'sq2_correct').split(',').map((s) => Number(s.trim())).filter(Boolean),
      },
    ] : null;
    // للسؤال المزدوج: options/correct ترسل فارغة ثم السيرفر يتجاهلها
    const opts = isDoubleNow ? ['أ', 'ب'] : val(form, 'options').split('\n').map((s) => s.trim()).filter(Boolean);
    const corr = isDoubleNow ? [1] : val(form, 'correct').split(',').map((s) => Number(s.trim())).filter(Boolean);
    const body = {
      categoryId: Number(val(form, 'categoryId')), text: val(form, 'text'), explanation: val(form, 'explanation'),
      options: opts, correct: corr,
      difficulty: Number(val(form, 'difficulty')), status: val(form, 'status'),
      is_double: isDoubleNow ? 1 : 0, sub_questions: subQuestions, skill_type: val(form, 'skill_type'),
      visual: q.visual || null, image: val(form, 'image').trim() || null, imageAlt: val(form, 'imageAlt'),
      video: val(form, 'video').trim() || null, audioText: val(form, 'audioText'),
    };
    try {
      if (isNew) await api.post('/admin/questions', body); else await api.put(`/admin/questions/${params.id}`, body);
      toast(t('common.saved'));
      if (onSaved) { onSaved(); } else { navigate('/admin/questions'); }
    } catch (err) {
      toast(errorMessage(err), 'error');
      highlightField(form, err);
    }
  };
  root.querySelector('#q-preview-inline').onclick = () => {
    const isDoubleNow = val(form, 'is_double') === '1';
    const opts = isDoubleNow ? [] : val(form, 'options').split('\n').map((s) => s.trim()).filter(Boolean);
    const corr = isDoubleNow ? [] : val(form, 'correct').split(',').map((s) => Number(s.trim())).filter(Boolean);
    showQuestionPreview({
      id: params.id || 'جديد',
      text: val(form, 'text'),
      options: opts,
      correct: corr,
      explanation: val(form, 'explanation'),
      image: val(form, 'image').trim() || null,
    });
  };
  const del = root.querySelector('#q-del');
  if (del) del.onclick = async () => {
    if (!(await confirmDialog(t('admin.confirmDelete'), { danger: true }))) return;
    try { await api.del(`/admin/questions/${params.id}`); navigate('/admin/questions'); } catch (err) { toast(errorMessage(err), 'error'); }
  };
}

// --- Modal تعديل السؤال (بدون مغادرة الصفحة) ------------------------------------
async function openQuestionEditModal(id, onDone) {
  const existing = document.getElementById('q-edit-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'q-edit-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:8000;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto';
  overlay.innerHTML = `<div id="q-edit-modal-inner" style="background:var(--surface,#fff);border-radius:14px;width:100%;max-width:800px;padding:24px;position:relative;margin:auto">
    <button id="q-edit-close" style="position:absolute;top:12px;left:12px;background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--text-muted)">✕</button>
    <div id="q-edit-body" style="margin-top:8px"></div>
  </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#q-edit-close').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  const inner = overlay.querySelector('#q-edit-body');
  try {
    const [cats, q] = await Promise.all([store.getCategories(), api.get(`/admin/questions/${id}`)]);
    const catId = q.category_id ?? q.categoryId;
    renderForm(inner, cats, q, catId, !!q.is_double, false, { id }, {
      onSaved: () => { close(); if (onDone) onDone(); },
    });
  } catch (err) {
    inner.innerHTML = `<p style="color:red">${errorMessage(err)}</p>`;
  }
}

// --- Séries ----------------------------------------------------------------------
const seriesBody = (s, extra = {}) => ({ title: s.title, description: s.description || '', sort: s.sort || 0, published: !!s.published, ...extra });

export async function seriesView(root) {
  await load(root, '/admin/series', async () => {
    const list = await api.get('/admin/series');
    shell(root, '/admin/series', html`
      <div class="row" style="margin-bottom:16px"><span class="spacer"></span><a class="btn btn-primary" href="/admin/series/new">+ ${t('admin.newSeries')}</a></div>
      <div class="card" style="overflow:auto"><table class="table list-table"><thead><tr><th>${t('admin.order')}</th><th>${t('admin.seriesTitle')}</th><th>${t('admin.questions')}</th><th>${t('admin.status')}</th><th>${t('common.actions')}</th></tr></thead><tbody>
        ${list.length ? list.map((s) => html`<tr style="${s.published ? '' : 'opacity:.6'}"><td>${s.sort}</td><td><a href="/admin/series/${s.id}">${s.title}</a></td><td>${s.questionIds.length}</td>
          <td>${statusPill(!!s.published)}</td>
          <td>${rowActions({ id: s.id, editHref: `/admin/series/${s.id}`, preview: true, hidden: !s.published })}</td></tr>`)
          : html`<tr><td colspan="5" class="muted">${t('common.none')}</td></tr>`}
      </tbody></table></div>`);
    const find = (id) => list.find((x) => String(x.id) === String(id));
    const toggle = async (id, published) => {
      try { await api.put(`/admin/series/${id}`, seriesBody(find(id), { published })); toast(t('common.saved')); await seriesView(root); }
      catch (err) { toast(errorMessage(err), 'error'); }
    };
    bindActions(root, {
      preview: async (id) => {
        try {
          const series = find(id);
          const qs = await Promise.all((series.questionIds || []).slice(0, 10).map((qid) => api.get(`/admin/questions/${qid}`)));
          showSeriesPreview(series.title, qs, series.questionIds.length);
        } catch (err) { toast(errorMessage(err), 'error'); }
      },
      hide: (id) => toggle(id, false),
      show: (id) => toggle(id, true),
      delete: async (id) => {
        if (!(await confirmDialog(t('admin.confirmDelete'), { danger: true }))) return;
        try { await api.del(`/admin/series/${id}`); await seriesView(root); } catch (err) { toast(errorMessage(err), 'error'); }
      },
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
      } catch (err) { toast(errorMessage(err), 'error'); highlightField(form, err); }
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
      <div class="card" style="overflow:auto"><table class="table list-table"><thead><tr><th>#</th><th>${t('admin.title_fr')}</th><th>slug</th><th>${t('admin.status')}</th><th>${t('common.actions')}</th></tr></thead><tbody>
        ${list.length ? list.map((l) => html`<tr style="${l.published ? '' : 'opacity:.6'}">
          <td>${l.sort}</td>
          <td><a href="/admin/lessons/${l.id}">${l.title}</a></td>
          <td class="small muted">${l.slug}</td>
          <td>${statusPill(!!l.published)}</td>
          <td>${rowActions({ id: l.id, editHref: `/admin/lessons/${l.id}`, preview: true, hidden: !l.published })}</td>
        </tr>`) : html`<tr><td colspan="5" class="muted">${t('common.none')}</td></tr>`}
      </tbody></table></div>`);
    const find = (id) => list.find((x) => String(x.id) === String(id));
    const toggle = async (id, published) => {
      const l = find(id);
      try {
        await api.put(`/admin/lessons/${id}`, { title: l.title, slug: l.slug, summary: l.summary || '', body: l.body || '', minutes: l.minutes, sort: l.sort, published, categoryId: l.category_id || null });
        toast(t('common.saved')); await lessonsAdminView(root);
      } catch (err) { toast(errorMessage(err), 'error'); }
    };
    bindActions(root, {
      preview: (id) => { const l = find(id); if (l) showLessonPreview(l); },
      hide: (id) => toggle(id, false),
      show: (id) => toggle(id, true),
      delete: async (id) => {
        if (!(await confirmDialog(t('admin.confirmDelete'), { danger: true }))) return;
        try { await api.del(`/admin/lessons/${id}`); await lessonsAdminView(root); } catch (err) { toast(errorMessage(err), 'error'); }
      },
    });
  });
}

function showLessonPreview(l) {
  openPreviewModal(l.title, `
    ${l.summary ? `<p class="muted" dir="rtl" style="margin:0 0 16px;font-style:italic">${l.summary}</p>` : ''}
    <div dir="rtl" style="line-height:1.9;font-size:.95rem;white-space:pre-wrap">${l.body || '<span class="muted">— لا يوجد محتوى —</span>'}</div>
    <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border,#ddd);display:flex;gap:16px;font-size:.8rem;color:var(--text-muted)">
      <span>⏱ ${l.minutes} دقيقة</span>
      <span>🔗 /${l.slug}</span>
    </div>`);
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
        <details class="lx-help small"><summary>${t('lx.authorHelp')}</summary>
          <pre dir="rtl" style="white-space:pre-wrap;font-size:.82rem;margin:8px 0 0">${`:::quiz
? نص السؤال
- [ ] خيار خاطئ
- [x] خيار صحيح
! الشرح بعد الجواب
:::

:::scenario
? وصف الموقف
- [x] خيار :: لماذا هو صحيح
- [ ] خيار :: لماذا هو خاطئ
:::

:::reveal
? سؤال للتفكير
الجواب
:::

:::summary
- نقطة مهمة
:::`}</pre>
          <p class="muted">${t('lx.authorNote')}</p>
        </details>
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
      } catch (err) { toast(errorMessage(err), 'error'); highlightField(form, err); }
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
  if (store.isSchool()) return navigate('/admin/school/students', { replace: true });
  await load(root, '/admin/students', async () => {
    const draw = async () => {
      const list = await api.get('/admin/students');
      shell(root, '/admin/students', html`
        <div class="card" style="overflow:auto"><table class="table list-table"><thead><tr>
          <th>${t('admin.name')}</th><th>${t('admin.email')}</th><th>${t('admin.exams')}</th><th>التقدم</th><th>${t('admin.lastActivity')}</th><th>${t('admin.status')}</th>
        </tr></thead><tbody>
          ${list.length ? list.map((u) => html`<tr style="${u.active ? '' : 'opacity:.6'}">
            <td><a data-view="${u.id}">${u.name}</a></td>
            <td class="small">${u.email}</td>
            <td>${u.exams_passed}/${u.exams}</td>
            <td style="min-width:110px"><div style="height:8px;border-radius:99px;background:var(--border,#ddd);overflow:hidden"><div style="height:100%;width:${u.progress || 0}%;background:var(--success,#16a34a)"></div></div><span class="small">${u.progress || 0}%</span></td>
            <td>${u.last_activity ? fmtDate(u.last_activity) : '—'}</td>
            <td>${statusPill(!!u.active, 'نشيط', 'موقوف')}</td>
          </tr>`) : html`<tr><td colspan="6" class="muted">${t('common.none')}</td></tr>`}
        </tbody></table></div>`);
      import('./userModal.js').then(({ bindUserLinks }) => bindUserLinks(root, draw));
    };
    await draw();
  });
}

// حلقة جاهزية المتعلم (نفس شكل حلقة لوحة المترشح)
function readinessRingStaff(score, tone) {
  const R = 54; const C = 2 * Math.PI * R;
  const v = Math.max(0, Math.min(100, Number(score) || 0));
  return html`<div class="rd-ring rd-${tone}" role="img" aria-label="${t('dash.readiness')}: ${v}%">
    <svg viewBox="0 0 128 128" aria-hidden="true">
      <defs><linearGradient id="rd-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="rd-stop-a"/><stop offset="1" class="rd-stop-b"/></linearGradient></defs>
      <circle class="rd-track" cx="64" cy="64" r="${R}"/>
      <circle class="rd-arc" cx="64" cy="64" r="${R}" stroke="url(#rd-grad)" stroke-dasharray="${C.toFixed(1)}" style="--rd-off:${(C * (1 - v / 100)).toFixed(1)};--rd-full:${C.toFixed(1)}"/>
    </svg>
    <div class="rd-ring-label"><strong>${v}<span>%</span></strong><small>${t('dash.readyShort')}</small></div>
  </div>`;
}

/** متابعة تقدم متعلم واحد (المؤسسة، المدرب، الأدمين): الجاهزية، المحاور، وآخر المحاولات. */
export async function studentView(root, { params }) {
  await load(root, '/admin/students', async () => {
    const { user, dashboard: d } = await api.get(`/admin/students/${params.id}`);
    const r = d.readiness;
    const tone = r.ready ? 'good' : r.score >= 50 ? 'mid' : 'low';
    const back = store.isSchool() ? '/admin/school/students' : '/admin/students';
    // المحاور الأضعف أولاً: هي التي تحتاج متابعة
    const cats = [...d.categories].sort((a, b) => a.mastery - b.mastery);
    const weakest = cats.find((c) => c.total > 0);
    const examDate = user.exam_date ? new Date(`${String(user.exam_date).slice(0, 10)}T00:00:00`).toLocaleDateString(document.documentElement.lang === 'fr' ? 'fr-MA' : 'ar-MA', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
    const modeName = (a) => (a.mode === 'exam' ? t('mode.exam') : a.mode === 'series' ? (a.series_title || t('mode.series')) : a.mode === 'category' ? t('mode.category') : a.mode === 'review' ? t('mode.review') : a.mode);
    shell(root, back, html`
      <div class="stu">
        <a class="stu-back" href="${back}">‹ ${t(store.isSchool() ? 'school.manageStudents' : 'admin.students')}</a>
        <section class="card stu-hero">
          ${readinessRingStaff(r.score, tone)}
          <div class="stu-id">
            <h2>${user.name}</h2>
            <p class="muted small">${user.email}${user.phone ? ` · ${user.phone}` : ''}</p>
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <span class="pill ${r.ready ? 'pill-success' : tone === 'mid' ? 'pill-warning' : 'pill-danger'}">${r.ready ? t('stu.ready') : t('stu.notReady')}</span>
              <span class="pill">${t('stu.category')} ${user.license_cat || 'B'}</span>
              ${user.active ? '' : html`<span class="pill pill-warning">${t('stu.suspended')}</span>`}
              ${examDate ? html`<span class="pill pill-info">📅 ${t('stu.examDate')} ${examDate}</span>` : ''}
            </div>
          </div>
          <div class="res-counts stu-counts">
            <div class="res-count ${r.examsPassed ? 'is-ok' : ''}"><strong>${r.examsPassed}/${r.examsTaken}</strong><small>${t('stu.exams')}</small></div>
            <div class="res-count"><strong>${r.averageExamScore === null ? '—' : `${r.averageExamScore}/${d.settings.questionCount}`}</strong><small>${t('stu.avg')}</small></div>
            <div class="res-count"><strong>${d.lessons.done}/${d.lessons.total}</strong><small>${t('dash.lessonsDone')}</small></div>
            <div class="res-count"><strong>${d.counts.seen}/${d.counts.questions}</strong><small>${t('dash.questionsSeen')}</small></div>
            <div class="res-count ${d.counts.mistakes ? 'is-ko' : ''}"><strong>${d.counts.mistakes}</strong><small>${t('stu.mistakes')}</small></div>
            <div class="res-count"><strong>🔥 ${d.streak}</strong><small>${t('dash.streak')}</small></div>
          </div>
        </section>

        <div class="grid grid-2" style="margin-top:20px">
          <section class="card">
            <h3 class="dash-h">📊 ${t('dash.byCategory')}</h3>
            ${weakest && weakest.mastery < 60 ? html`<p class="small stu-hint">⚠️ ${t('stu.weakest', { name: catName(weakest), v: weakest.mastery })}</p>` : ''}
            ${cats.map((c) => html`<div class="cat-row">
              <span class="cat-icon" aria-hidden="true">${c.icon}</span>
              <div class="cat-body">
                <div class="cat-head"><strong>${catName(c)}</strong><span class="muted small">${c.mastery}%</span></div>
                <div class="cat-bar ${c.mastery >= 70 ? 'bar-good' : c.mastery < 40 ? 'bar-low' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${c.mastery}" aria-label="${catName(c)}"><i style="width:${c.mastery}%"></i></div>
                <span class="muted small">${c.seen}/${c.total} ${t('dash.seen')}${c.accuracy === null ? '' : ' · ' + t('dash.accuracy', { v: c.accuracy })}</span>
              </div>
            </div>`)}
          </section>
          <section class="card">
            <h3 class="dash-h">🕘 ${t('dash.recent')}</h3>
            ${d.recent.length ? d.recent.map((a) => html`<div class="recent-row">
              <div><strong>${modeName(a)}</strong><span class="muted small">${a.practice ? t('mode.practice') : t('mode.examConditions')} · ${fmtDate(a.finished_at)}</span></div>
              <span class="pill ${a.passed === 1 ? 'pill-success' : a.passed === 0 ? 'pill-danger' : 'pill-info'}">${a.score}/${a.total}</span>
            </div>`) : html`<p class="muted small">${t('dash.noActivity')}</p>`}
          </section>
        </div>
      </div>`);
  });
}

// --- Utilisateurs (admin) --------------------------------------------------------
// الحقول الإضافية حسب الدور — تُرجع HTML string
export function roleExtraFields(role, schools) {
  const esc = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  if (role === 'student') return `
    <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px;margin:4px 0">
      <legend style="font-weight:600;padding:0 6px">الهوية</legend>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label style="grid-column:1/-1">البريد الإلكتروني<input class="input" name="email" type="email" required placeholder="exemple@gmail.com"></label>
        <label>الجنس
          <select class="input" name="gender">
            <option value="M">ذكر</option>
            <option value="F">أنثى</option>
          </select>
        </label>
        <label>الجنسية<input class="input" name="nationality" value="MAROCAINE" placeholder="MAROCAINE"></label>
        <label>نوع الهوية
          <select class="input" name="id_type">
            <option value="CIN">CIN</option>
            <option value="CD">CD</option>
            <option value="CS">CS</option>
          </select>
        </label>
        <label>رقم الهوية (CIN)<input class="input" name="cin" required placeholder="AB123456" style="text-transform:uppercase"></label>
        <label>الاسم الشخصي (فرنسي)<input class="input" name="first_name_fr" required placeholder="Prénom"></label>
        <label>الاسم العائلي (فرنسي)<input class="input" name="last_name_fr" required placeholder="Nom"></label>
        <label>الاسم الشخصي (عربي)<input class="input" name="first_name_ar" placeholder="الاسم الشخصي"></label>
        <label>الاسم العائلي (عربي)<input class="input" name="last_name_ar" placeholder="الاسم العائلي"></label>
        <label>تاريخ الميلاد<input class="input" name="birth_date" type="date"></label>
        <label>مكان الميلاد (فرنسي)<input class="input" name="birth_place_fr" placeholder="Lieu de naissance"></label>
        <label>مكان الازدياد (عربي)<input class="input" name="birth_place_ar" placeholder="مكان الازدياد"></label>
        <label>المدينة<input class="input" name="city" placeholder="Tanger"></label>
      </div>
    </fieldset>
    <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px;margin:4px 0">
      <legend style="font-weight:600;padding:0 6px">التواصل والسكن</legend>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label>الهاتف<input class="input" name="phone" type="tel" placeholder="06xxxxxxxx"></label>
        <label>العنوان (فرنسي)<input class="input" name="address_fr" placeholder="Adresse"></label>
        <label>العنوان (عربي)<input class="input" name="address_ar" placeholder="العنوان"></label>
      </div>
    </fieldset>
    <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px;margin:4px 0">
      <legend style="font-weight:600;padding:0 6px">الترشح</legend>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label>اللغة
          <select class="input" name="locale">
            <option value="ar-dialect">عربية دارجة</option>
            <option value="ar">عربية فصحى</option>
            <option value="fr">Français</option>
          </select>
        </label>
        <label>الصنف المطلوب
          <select class="input" name="license_cat">
            <option value="B">B</option>
            <option value="A">A</option>
            <option value="A1">A1</option>
            <option value="C">C</option>
            <option value="D">D</option>
            <option value="EB">EB</option>
            <option value="EC">EC</option>
            <option value="ED">ED</option>
          </select>
        </label>
        <label style="grid-column:1/-1">مركز التسجيل<input class="input" name="registration_center" placeholder="Centre Immatriculateur"></label>
      </div>
    </fieldset>
    <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px;margin:4px 0">
      <legend style="font-weight:600;padding:0 6px">التمديد (Extension) — اختياري</legend>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label style="grid-column:1/-1">رقم الرخصة (Numéro du permis)<input class="input" name="license_num" placeholder="00000000"></label>
      </div>
      <div style="margin-top:8px">
        <span style="font-size:.85em;opacity:.7;display:block;margin-bottom:6px">الأصناف الصالحة حالياً</span>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          ${['A','A1','B','C','D','EB','EC','ED'].map(c => `<label style="display:flex;align-items:center;gap:4px;font-weight:normal"><input type="checkbox" name="valid_cat_${c}" value="${c}"> ${c}</label>`).join('')}
        </div>
      </div>
    </fieldset>`;

  if (role === 'instructor') return `
    <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px;margin:4px 0">
      <legend style="font-weight:600;padding:0 6px">الهوية</legend>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label>الاسم العائلي (NOM)<input class="input" name="last_name_fr" required placeholder="NFISSI"></label>
        <label>الاسم الشخصي (PRENOM)<input class="input" name="first_name_fr" required placeholder="HAMZA"></label>
        <label>الاسم العائلي (عربي)<input class="input" name="last_name_ar" placeholder="النسب"></label>
        <label>الاسم الشخصي (عربي)<input class="input" name="first_name_ar" placeholder="الاسم الشخصي"></label>
        <label>رقم الهوية (CIN)<input class="input" name="cin" required placeholder="KB193777" style="text-transform:uppercase"></label>
        <label>الجنس
          <select class="input" name="gender">
            <option value="M">ذكر</option>
            <option value="F">أنثى</option>
          </select>
        </label>
      </div>
    </fieldset>
    <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px;margin:4px 0">
      <legend style="font-weight:600;padding:0 6px">ملف NARSA</legend>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label>رقم الملف (PC)<input class="input" name="pc_num" placeholder="11/317275"></label>
        <label>رقم التأهيل (CAP)<input class="input" name="cap_num" placeholder="11871"></label>
      </div>
      <div style="margin-top:8px">
        <span style="font-size:.85em;opacity:.7;display:block;margin-bottom:6px">فئات التأهيل (Catégories)</span>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          ${['A','A1','B','C','D','EB','EC','ED'].map(c => `<label style="display:flex;align-items:center;gap:4px;font-weight:normal"><input type="checkbox" name="instructor_cat_${c}" value="${c}"> ${c}</label>`).join('')}
        </div>
      </div>
    </fieldset>
    <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px;margin:4px 0">
      <legend style="font-weight:600;padding:0 6px">التواصل</legend>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label style="grid-column:1/-1">البريد الإلكتروني (للدخول إلى الحساب)<input class="input" name="email" type="email" required maxlength="160" autocomplete="off" placeholder="exemple@gmail.com" dir="ltr"></label>
        <label>الهاتف<input class="input" name="phone" type="tel" placeholder="06xxxxxxxx"></label>
        <label>المدينة<input class="input" name="city" placeholder="Tanger"></label>
      </div>
    </fieldset>`;

  if (role === 'school') return `
    <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px;margin:4px 0">
      <legend style="font-weight:600;padding:0 6px">بيانات المؤسسة</legend>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label style="grid-column:1/-1">اسم المؤسسة<input class="input" name="school_name" required maxlength="120" placeholder="Auto-école ..."></label>
        <label>رقم التعريف الضريبي<input class="input" name="tax_id" required maxlength="40"></label>
        <label>رقم الرخصة المهنية<input class="input" name="pro_license_num" required maxlength="40"></label>
        <label style="grid-column:1/-1">الرقم المخصص في نظام NARSA<input class="input" name="narsa_num" required maxlength="40"></label>
      </div>
    </fieldset>
    <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px;margin:4px 0">
      <legend style="font-weight:600;padding:0 6px">المدير والتواصل</legend>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label style="grid-column:1/-1">الاسم الشخصي للمدير<input class="input" name="manager_name" required maxlength="80"></label>
        <label style="grid-column:1/-1">البريد الإلكتروني للمؤسسة<input class="input" name="email" type="email" required placeholder="exemple@gmail.com"></label>
        <label>رقم الهاتف<input class="input" name="phone" type="tel" required placeholder="06xxxxxxxx"></label>
        <label>المدينة<input class="input" name="city" required placeholder="Tanger"></label>
      </div>
    </fieldset>`;

  if (role === 'admin') return `
    <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px;margin:4px 0">
      <legend style="font-weight:600;padding:0 6px">بيانات الأدمين</legend>
      <div style="display:grid;grid-template-columns:1fr;gap:8px">
        <label>الاسم<input class="input" name="name" required minlength="2" maxlength="80"></label>
        <label>البريد الإلكتروني<input class="input" name="email" type="email" required placeholder="exemple@gmail.com"></label>
        <label>رقم الهاتف<input class="input" name="phone" type="tel" required placeholder="06xxxxxxxx"></label>
      </div>
    </fieldset>`;
  return '';
}

// توليد كلمة سر جديدة: مسموح مرة واحدة كل 24 ساعة لكل حساب
const RESET_MS = 24 * 3600 * 1000;
export function fmtWait(iso) {
  const ms = Math.max(0, Date.parse(iso) - Date.now());
  const h = Math.floor(ms / 3600000), m = Math.ceil((ms % 3600000) / 60000);
  return h ? `${h} س و${m} د` : `${m} د`;
}
export const resetBlocked = (u) => !!u.pw_reset_at && Date.now() - Date.parse(u.pw_reset_at) < RESET_MS;
export const resetWait = (u) => fmtWait(new Date(Date.parse(u.pw_reset_at) + RESET_MS).toISOString());

export const ALL_CATS = ['A', 'A1', 'B', 'C', 'D', 'EB', 'EC', 'ED'];

/** يملأ نموذج التعديل ببيانات المستخدم الحالية */
export function fillUserForm(form, u) {
  for (const el of form.elements) {
    if (!el.name || el.name === 'role') continue;
    if (el.name.startsWith('valid_cat_')) continue;
    if (u[el.name] !== undefined && u[el.name] !== null) el.value = u[el.name];
  }
  let valid = [];
  try { valid = JSON.parse(u.valid_categories || '[]'); } catch { valid = []; }
  ALL_CATS.forEach((c) => { const cb = form.elements['valid_cat_' + c]; if (cb) cb.checked = valid.includes(c); });
  let ic = [];
  try { ic = JSON.parse(u.instructor_categories || '[]'); } catch { ic = []; }
  ALL_CATS.forEach((c) => { const cb = form.elements['instructor_cat_' + c]; if (cb) cb.checked = ic.includes(c); });
}

/** يعرض بيانات الدخول (كلمة السر العشوائية) مرة واحدة بعد الحفظ */
export function showCredentials({ email, password, name }) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'rv-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    ov.innerHTML = `<div class="rv-modal" style="width:min(460px,100%)">
      <div class="rv-body" style="padding:22px">
        <h3 style="margin:0 0 6px">✅ تم إنشاء الحساب</h3>
        <p class="muted small" style="margin:0 0 14px">${esc(name)}</p>
        <label style="display:block;margin-bottom:10px">البريد الإلكتروني
          <input class="input" readonly dir="ltr" value="${esc(email)}" style="text-align:left"></label>
        <label style="display:block">كلمة السر (تظهر الآن مرة واحدة فقط)
          <div style="display:flex;gap:8px"><input class="input" readonly dir="ltr" id="cred-pw" value="${esc(password)}" style="text-align:left;font-weight:800;letter-spacing:.05em;flex:1">
          <button type="button" class="btn btn-secondary" id="cred-copy">نسخ</button></div></label>
        <p class="small" style="margin:12px 0 0;color:var(--danger)">انسخها وسلّمها لصاحب الحساب الآن؛ لن تتمكن من رؤيتها لاحقاً.</p>
      </div>
      <div class="rv-foot"><span></span><button type="button" class="btn btn-primary" id="cred-ok">تم</button></div>
    </div>`;
    document.body.appendChild(ov);
    const close = () => { ov.remove(); resolve(); };
    ov.querySelector('#cred-ok').onclick = close;
    ov.querySelector('#cred-copy').onclick = async (e) => {
      const pw = ov.querySelector('#cred-pw');
      try { await navigator.clipboard.writeText(pw.value); } catch { pw.select(); document.execCommand('copy'); }
      e.currentTarget.textContent = 'تم النسخ ✓';
    };
    ov.querySelector('#cred-pw').select();
  });
}

export async function usersView(root) {
  await load(root, '/admin/users', async () => {
    const { openUserView, openUserForm } = await import('./userModal.js');

    const fetchList = () => api.get('/admin/users');
    let list = await fetchList();
    const schools = () => list.filter((x) => x.role === 'school');

    const refresh = async () => { list = await fetchList(); };

    const render = async () => {
      const sch = schools();
      const amSuper = store.isSuperAdmin();
      // الأدمين العادي لا يرى الأدمين الأكبر (الخادم يستبعده أيضاً، هذا للأمان المضاعف)
      const visible = amSuper ? list : list.filter((u) => !u.is_super_admin);
      shell(root, '/admin/users', { action: html`<button class="btn btn-primary btn-sm" id="btn-add-user">＋ ${t('admin.addUser')}</button>`, content: html`
        <div class="card table-wrap"><table class="table list-table"><thead><tr>
          <th>${t('admin.name')}</th><th>${t('admin.email')}</th><th>${t('admin.role')}</th><th>${t('admin.status')}</th><th>${t('admin.school')}</th><th>${t('common.actions')}</th>
        </tr></thead><tbody>
          ${visible.map((u) => {
            const isProtected = u.is_super_admin && !amSuper;
            return html`<tr style="${u.active ? '' : 'opacity:.6'}">
              <td><a data-view="${u.id}">${u.name}${u.is_super_admin ? html` <span class="pill pill-warning" style="font-size:.7rem">سوبر</span>` : ''}</a></td>
              <td style="font-size:.85rem">${u.email}</td>
              <td><span class="pill">${t('role.' + u.role)}</span></td>
              <td>${statusPill(!!u.active, 'نشيط', 'موقوف')}</td>
              <td style="font-size:.8rem">${u.school_id ? (sch.find((x) => x.id === u.school_id)?.name || u.school_id) : '—'}</td>
              <td>${isProtected ? html`<span class="pill pill-warning">محمي</span>` : rowActions({ id: u.id, hidden: !u.active, hideLabel: 'إيقاف الحساب', showLabel: 'تفعيل الحساب',
                extra: html`<button class="act-btn" type="button" data-act="edit" data-id="${u.id}" title="${t('common.edit')}"><span aria-hidden="true">✏️</span><span class="act-lbl">${t('common.edit')}</span></button>
                            <button class="act-btn" type="button" data-act="reset" data-id="${u.id}" ${resetBlocked(u) ? raw('disabled') : ''} title="${resetBlocked(u) ? 'متاح بعد ' + resetWait(u) : 'توليد كلمة سر جديدة'}"><span aria-hidden="true">🔑</span><span class="act-lbl">كلمة سر</span></button>` })}</td>
            </tr>`;
          })}
        </tbody></table></div>` });

      // ربط نقر الاسم بنافذة العرض
      root.querySelectorAll('[data-view]').forEach((a) => {
        a.onclick = (e) => { e.preventDefault(); openUserView(a.dataset.view, { onChanged: async () => { await refresh(); await render(); } }); };
      });

      root.querySelector('#btn-add-user').onclick = () =>
        openUserForm({ mode: 'add', roles: ['student', 'school', 'admin'], onDone: async () => { await refresh(); await render(); } });

      const setActive = async (id, active) => {
        try { await api.patch(`/admin/users/${id}`, { active }); toast(t('common.saved')); await refresh(); await render(); }
        catch (err) { toast(errorMessage(err), 'error'); }
      };
      bindActions(root, {
        hide: (id) => setActive(id, false),
        show: (id) => setActive(id, true),
        edit: (id) => openUserForm({ mode: 'edit', id, onDone: async () => { await refresh(); await render(); } }),
        reset: async (id, b) => {
          const u = list.find((x) => String(x.id) === String(id));
          if (!(await confirmDialog(`توليد كلمة سر جديدة لـ ${u?.name}؟ ستُلغى كلمة السر الحالية، ويمكن تكرار ذلك مرة واحدة فقط كل 24 ساعة.`))) return;
          b.disabled = true;
          try {
            const r = await api.post(`/admin/users/${id}/reset-password`);
            await refresh(); await render();
            await showCredentials({ email: r.email, password: r.generatedPassword, name: r.name });
          } catch (err) {
            if (err.code === 'reset_limit') toast(`مسموح مرة واحدة كل 24 ساعة. جرّب بعد ${fmtWait(err.details?.retryAt)}`, 'error');
            else toast(errorMessage(err), 'error');
            await refresh(); await render();
          }
        },
        delete: async (id) => {
          if (!(await confirmDialog(t('admin.confirmDelete'), { danger: true }))) return;
          try { await api.del(`/admin/users/${id}`); await refresh(); await render(); }
          catch (err) { toast(errorMessage(err), 'error'); }
        },
      });
    };
    await render();
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
    // Monitor AI: مفاتيح API
    const aiBox = document.createElement('div');
    aiBox.className = 'card ai-keys';
    aiBox.style.marginTop = '16px';
    root.querySelector('#s-form').parentNode.appendChild(aiBox);
    await renderAiKeys(aiBox);
  });
}

const AI_PROV = [
  { id: 'claude', name: 'Claude (Anthropic)', hint: 'sk-ant-…', url: 'https://console.anthropic.com/settings/keys', modelPh: 'claude-opus-5-5' },
  { id: 'gemini', name: 'Gemini (Google)', hint: 'AIza… / AQ.…', url: 'https://aistudio.google.com/apikey', modelPh: 'gemini-3.8-flash' },
];

async function renderAiKeys(box) {
  let st;
  try { st = await api.get('/admin/ai-keys'); } catch (err) { box.innerHTML = html`<p class="muted">${errorMessage(err)}</p>`.s; return; }
  const srcLabel = (p) => (p.source === 'admin' ? t('ai.keySrcAdmin') : p.source === 'env' ? t('ai.keySrcEnv') : t('ai.keyNone'));
  box.innerHTML = html`
    <h3 style="margin-top:0">${raw('🔑')} ${t('ai.keysTitle')}</h3>
    <p class="muted small">${t('ai.keysHelp')}</p>
    ${AI_PROV.map((pv) => { const p = st[pv.id]; return html`
      <div class="ai-key-row" data-prov="${pv.id}">
        <div class="ai-key-head">
          <strong>${pv.name}</strong>
          <span class="ai-key-badge ${p.configured ? 'on' : 'off'}">${p.configured ? t('ai.keyActive') : t('ai.keyNone')}</span>
        </div>
        ${p.configured ? html`<div class="ai-key-meta"><code dir="ltr">${p.masked}</code> · <span>${srcLabel(p)}</span>${p.updatedAt ? html` · <span>${fmtDate(p.updatedAt)}</span>` : ''} · <span>${t('ai.model')}: <code dir="ltr">${p.effectiveModel}</code></span></div>` : ''}
        <label>${p.configured ? t('ai.keyReplace') : t('ai.keyNew')}
          <input class="input" type="password" autocomplete="off" spellcheck="false" dir="ltr" name="key" placeholder="${pv.hint}">
        </label>
        <label>${t('ai.modelOpt')}
          <input class="input" type="text" dir="ltr" name="model" placeholder="${t('ai.autoPh')} (${pv.modelPh})" value="${p.model}">
        </label>
        <div class="ai-key-actions">
          <button class="btn btn-primary" type="button" data-act="save">${t('common.save')}</button>
          ${p.configured ? html`<button class="btn btn-secondary" type="button" data-act="test">${t('ai.keyTest')}</button>` : ''}
          ${p.source === 'admin' ? html`<button class="btn btn-danger" type="button" data-act="del">${t('common.delete')}</button>` : ''}
          <a class="small" href="${pv.url}" target="_blank" rel="noopener noreferrer">${t('ai.getKey')}</a>
        </div>
        <div class="ai-key-result small" aria-live="polite"></div>
      </div>`; })}
    <p class="muted small">${t('ai.keysNote')}</p>`.s;

  box.querySelectorAll('.ai-key-row').forEach((row) => {
    const prov = row.dataset.prov;
    const out = row.querySelector('.ai-key-result');
    const btns = () => row.querySelectorAll('button');
    const busy = (on) => btns().forEach((b) => { b.disabled = on; });
    row.querySelector('[data-act="save"]').onclick = async () => {
      const key = row.querySelector('[name="key"]').value.trim();
      const model = row.querySelector('[name="model"]').value.trim();
      busy(true);
      try { await api.put(`/admin/ai-keys/${prov}`, key ? { key, model } : { model }); toast(t('common.saved')); await renderAiKeys(box); }
      catch (err) { toast(errorMessage(err), 'error'); busy(false); }
    };
    const del = row.querySelector('[data-act="del"]');
    if (del) del.onclick = async () => {
      if (!(await confirmDialog(t('ai.keyDelConfirm'), { danger: true }))) return;
      busy(true);
      try { await api.del(`/admin/ai-keys/${prov}`); toast(t('common.saved')); await renderAiKeys(box); }
      catch (err) { toast(errorMessage(err), 'error'); busy(false); }
    };
    const test = row.querySelector('[data-act="test"]');
    if (test) test.onclick = async () => {
      busy(true); out.className = 'ai-key-result small'; out.textContent = t('ai.keyTesting');
      try {
        const r = await api.post(`/admin/ai-keys/${prov}/test`, {});
        out.classList.add(r.ok ? 'ok' : 'err');
        out.textContent = r.ok ? `✓ ${t('ai.keyOk')} — ${r.model || ''} (${r.ms} ms)` : `✗ ${r.status ? `[${r.status}] ` : ''}${r.error}`;
      } catch (err) { out.classList.add('err'); out.textContent = errorMessage(err); }
      busy(false);
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

// --- استيراد الأسئلة (سوبر أدمين) -----------------------------------------------
export async function importView(root) {
  if (!store.isSuperAdmin()) { navigate('/admin', { replace: true }); return; }

  await load(root, '/admin/import', async () => {
    const cats = await store.getCategories();

    shell(root, '/admin/import', html`
      <div style="display:grid;gap:20px;max-width:860px">

        <!-- قسم 1: استيراد JSON -->
        <div class="card">
          <div class="dash-h">📥 استيراد أسئلة من ملف JSON</div>
          <p class="muted small" style="margin:0 0 14px">الصيغة المدعومة: مصفوفة JSON فيها أسئلة. كل سؤال يحتوي على: <code>category</code>، <code>text</code>، <code>options</code>، <code>correct</code>.</p>

          <div style="display:flex;flex-direction:column;gap:10px">
            <label class="label">اختر ملف JSON
              <input type="file" id="imp-file" accept=".json" class="input" style="margin-top:4px">
            </label>

            <div id="imp-preview" style="display:none">
              <div class="dash-kpis" id="imp-stats"></div>
              <details style="margin-top:10px">
                <summary class="small muted" style="cursor:pointer">معاينة أول 3 أسئلة</summary>
                <pre id="imp-sample" style="font-size:.78rem;background:var(--bg-soft);padding:12px;border-radius:8px;overflow:auto;max-height:260px;direction:ltr"></pre>
              </details>
            </div>

            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
              <select id="imp-cat" class="input" style="width:auto;min-width:160px">
                <option value="">— صنف افتراضي (اختياري) —</option>
                ${cats.map((c) => html`<option value="${c.slug}">${c.name_ar || c.nameAr}</option>`)}
              </select>
              <button class="btn btn-primary" id="imp-btn" disabled>📤 استيراد الآن</button>
              <a class="btn" href="/api/admin/questions-export" download="questions.json">⬇️ تصدير الأسئلة الحالية</a>
            </div>

            <div id="imp-result" style="display:none"></div>
          </div>
        </div>

        <!-- قسم 2: بنية JSON مع مثال -->
        <div class="card">
          <div class="dash-h">📋 بنية الملف المدعومة</div>
          <pre style="font-size:.8rem;background:var(--bg-soft);padding:14px;border-radius:8px;overflow:auto;direction:ltr;line-height:1.6">[
  {
    "category": "b",           // slug الصنف (B, A, C...)
    "text": "نص السؤال هنا",
    "options": [
      "الخيار الأول",
      "الخيار الثاني",
      "الخيار الثالث",
      "الخيار الرابع"
    ],
    "correct": [1],            // رقم الإجابة الصحيحة (يبدأ من 1)
    "explanation": "شرح الإجابة (اختياري)",
    "image": null,             // رابط الصورة أو null
    "video": null,             // رابط الفيديو أو null
    "difficulty": 2,           // 1=سهل 2=متوسط 3=صعب
    "is_double": 0             // 0=منفرد 1=مزدوج
  },
  {
    "category": "b",
    "text": "سؤال مزدوج — هل يمكن التجاوز هنا؟",
    "options": [],
    "correct": [],
    "is_double": 1,
    "sub_questions": [
      { "text": "السؤال الفرعي أ", "options": ["نعم","لا"], "correct": [2] },
      { "text": "السؤال الفرعي ب", "options": ["نعم","لا"], "correct": [1] }
    ]
  }
]</pre>
        </div>

      </div>`);

    // --- منطق الصفحة ---
    let parsed = null;
    const fileInput = root.querySelector('#imp-file');
    const impBtn = root.querySelector('#imp-btn');
    const preview = root.querySelector('#imp-preview');
    const stats = root.querySelector('#imp-stats');
    const sample = root.querySelector('#imp-sample');
    const result = root.querySelector('#imp-result');
    const catSel = root.querySelector('#imp-cat');

    fileInput.onchange = async () => {
      const file = fileInput.files[0];
      if (!file) { parsed = null; impBtn.disabled = true; preview.style.display = 'none'; return; }
      try {
        const text = await file.text();
        const raw = JSON.parse(text);
        parsed = Array.isArray(raw) ? raw : (raw.questions || []);
        if (!parsed.length) throw new Error('الملف فارغ');

        // إحصاء
        const doubles = parsed.filter((q) => q.is_double).length;
        const withImg = parsed.filter((q) => q.image).length;
        const withVid = parsed.filter((q) => q.video).length;
        stats.innerHTML = html`
          <a class="dash-kpi no-link"><span class="dash-kpi-ic">📝</span><span class="muted small">إجمالي الأسئلة</span><strong>${parsed.length}</strong></a>
          <a class="dash-kpi no-link"><span class="dash-kpi-ic">🔀</span><span class="muted small">مزدوجة</span><strong>${doubles}</strong></a>
          <a class="dash-kpi no-link"><span class="dash-kpi-ic">🖼️</span><span class="muted small">مع صورة</span><strong>${withImg}</strong></a>
          <a class="dash-kpi no-link"><span class="dash-kpi-ic">🎬</span><span class="muted small">مع فيديو</span><strong>${withVid}</strong></a>`.s;

        sample.textContent = JSON.stringify(parsed.slice(0, 3), null, 2);
        preview.style.display = '';
        impBtn.disabled = false;
        result.style.display = 'none';
      } catch (err) {
        toast(`خطأ في الملف: ${err.message}`, 'error');
        parsed = null; impBtn.disabled = true; preview.style.display = 'none';
      }
    };

    impBtn.onclick = async () => {
      if (!parsed) return;
      impBtn.disabled = true;
      impBtn.textContent = '⏳ جارٍ الاستيراد...';
      result.style.display = 'none';
      try {
        const defCat = catSel.value || undefined;
        const payload = defCat ? parsed.map((q) => ({ ...q, category: q.category || defCat })) : parsed;
        const res = await api.post('/admin/questions-import', payload);
        const errHtml = res.errors?.length
          ? html`<details style="margin-top:8px"><summary class="small">عرض ${res.errors.length} خطأ</summary><pre style="font-size:.75rem;overflow:auto;max-height:200px;direction:ltr">${JSON.stringify(res.errors, null, 2)}</pre></details>`
          : html``;
        result.innerHTML = html`<div class="nrs-fb-ok" style="padding:12px 16px;border-radius:8px;background:rgba(22,101,52,.15);border:1px solid #166534">
          ✅ تمّ استيراد <strong>${res.created}</strong> سؤال بنجاح${res.errors?.length ? html` — ${res.errors.length} سؤال فيه خطأ` : ''}
          ${errHtml}
        </div>`.s;
        result.style.display = '';
        toast(`استُورد ${res.created} سؤال ✅`);
        parsed = null; fileInput.value = ''; impBtn.disabled = true; preview.style.display = 'none';
      } catch (err) {
        result.innerHTML = html`<div style="color:var(--danger)">${errorMessage(err)}</div>`.s;
        result.style.display = '';
        toast(errorMessage(err), 'error');
      } finally {
        impBtn.disabled = false;
        impBtn.textContent = '📤 استيراد الآن';
      }
    };
  });
}
