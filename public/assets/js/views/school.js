/**
 * واجهة مؤسسة تعليم السياقة (دور school)
 *   /admin/school/students  — إدارة طلاب المؤسسة
 */
import { html, raw, loading, toast, errorMessage, confirmDialog } from '../ui.js';
import { t } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { roleExtraFields, ALL_CATS, showCredentials } from './admin.js';

/* ═══════════════════════════════════════════════════════════
   واجهة إدارة الطلاب — مؤسسة تعليم السياقة
   ═══════════════════════════════════════════════════════════ */
export async function schoolStudentsView(root) {
  root.innerHTML = loading().s;
  try {
    const students = await api.get('/admin/students');
    renderStudents(root, students);
  } catch (err) {
    root.innerHTML = html`<div class="empty"><p>${errorMessage(err)}</p></div>`.s;
  }
}

function renderStudents(root, students, showAdd = false) {
  root.innerHTML = html`
  <div class="page-head">
    <div>
      <h1>🎓 ${t('school.students')}</h1>
      <p class="muted small">${t('school.studentsSubtitle')}</p>
    </div>
    <button class="btn btn-primary" id="add-btn">+ ${t('school.addStudent')}</button>
  </div>

  ${showAdd ? html`
  <div class="card" style="margin-bottom:20px;max-width:680px">
    <h2 style="margin:0 0 16px;font-size:1rem">${t('school.addStudent')}</h2>
    <form id="add-form" class="stack" style="gap:12px">
      <div id="add-fields"></div>
      <p class="muted small" style="margin:0">🔑 تُولَّد كلمة سر عشوائية خاصة عند الحفظ وتظهر مرة واحدة.</p>
      <div class="row" style="gap:8px">
        <button class="btn btn-primary" type="submit">${t('common.save')}</button>
        <button class="btn btn-secondary" type="button" id="cancel-add">${t('common.cancel')}</button>
      </div>
    </form>
  </div>` : ''}

  ${students.length === 0 ? html`
  <div class="empty">
    <div class="big">🎓</div>
    <p>${t('school.noStudents')}</p>
    <button class="btn btn-primary" id="add-btn2">+ ${t('school.addStudent')}</button>
  </div>` : html`
  <div class="card table-wrap">
    <table>
      <thead><tr>
        <th>${t('admin.name')}</th>
        <th>${t('admin.email')}</th>
        <th>${t('profile.examDate')}</th>
        <th>${t('admin.active')}</th>
        <th>${t('school.activity')}</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${students.map((s) => html`
        <tr>
          <td>
            <a href="/admin/students/${s.id}" style="font-weight:600;color:var(--primary)">${s.name}</a>
          </td>
          <td style="font-size:.85rem">${s.email}</td>
          <td style="font-size:.85rem">${s.exam_date || html`<span class="muted">—</span>`}</td>
          <td>
            <label class="toggle-label" title="${s.active ? t('school.suspend') : t('school.activate')}">
              <input type="checkbox" data-toggle="${s.id}" ${s.active ? raw('checked') : ''}>
              <span>${s.active ? t('admin.active') : t('school.suspended')}</span>
            </label>
          </td>
          <td style="font-size:.85rem">
            ${s.exams > 0
              ? html`${t('school.exams')}: ${s.exams_passed}/${s.exams}`
              : html`<span class="muted">${t('school.noActivity')}</span>`}
          </td>
          <td>
            <div class="row" style="gap:6px">
              <button class="btn btn-secondary btn-sm edit-btn"
                data-id="${s.id}" data-name="${s.name}" data-exam="${s.exam_date || ''}">${t('common.edit')}</button>
              <button class="btn btn-danger btn-sm del-btn" data-id="${s.id}">${t('common.delete')}</button>
            </div>
          </td>
        </tr>`)}
      </tbody>
    </table>
  </div>`}`.s;

  // زر إضافة
  const addBtn = root.querySelector('#add-btn') || root.querySelector('#add-btn2');
  if (addBtn) addBtn.onclick = () => renderStudents(root, students, true);
  const cancelBtn = root.querySelector('#cancel-add');
  if (cancelBtn) cancelBtn.onclick = () => renderStudents(root, students, false);

  // نموذج الإضافة — نفس حقول إضافة متعلم في لوحة الإدارة
  const form = root.querySelector('#add-form');
  if (form) {
    form.querySelector('#add-fields').innerHTML = roleExtraFields('student', []);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      if (btn.disabled) return;
      btn.disabled = true;
      const fd = new FormData(form);
      const body = { role: 'student' };
      for (const [k, v] of fd.entries()) {
        if (k.startsWith('valid_cat_')) continue;
        const val = typeof v === 'string' ? v.trim() : v;
        if (val !== '') body[k] = val;
      }
      body.valid_categories = JSON.stringify(ALL_CATS.filter((c) => fd.get('valid_cat_' + c)));
      try {
        const created = await api.post('/admin/users', body);
        const updated = await api.get('/admin/students');
        renderStudents(root, updated, false);
        await showCredentials({ email: created.email, password: created.generatedPassword, name: created.name });
      } catch (err) { btn.disabled = false; toast(errorMessage(err), 'error'); }
    };
  }

  // تفعيل/تعليق
  root.querySelectorAll('[data-toggle]').forEach((cb) => {
    cb.onchange = async () => {
      try {
        await api.patch(`/admin/school/students/${cb.dataset.toggle}`, { active: cb.checked });
        toast(t('common.saved'));
        const updated = await api.get('/admin/students');
        renderStudents(root, updated, false);
      } catch (err) { toast(errorMessage(err), 'error'); cb.checked = !cb.checked; }
    };
  });

  // تعديل
  root.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.onclick = () => showEditModal(root, btn.dataset.id, btn.dataset.name, btn.dataset.exam, students);
  });

  // حذف
  root.querySelectorAll('.del-btn').forEach((btn) => {
    btn.onclick = async () => {
      if (!(await confirmDialog(t('admin.confirmDelete')))) return;
      try {
        await api.del(`/admin/school/students/${btn.dataset.id}`);
        toast(t('common.saved'));
        const updated = await api.get('/admin/students');
        renderStudents(root, updated, false);
      } catch (err) { toast(errorMessage(err), 'error'); }
    };
  });
}

function showEditModal(root, id, name, examDate, students) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML = html`
  <div style="background:var(--surface);border-radius:16px;max-width:420px;width:100%;padding:24px">
    <h2 style="margin:0 0 16px">${t('common.edit')} — ${name}</h2>
    <form id="edit-form" class="stack" style="gap:12px">
      <div class="field">
        <label>${t('admin.name')}</label>
        <input class="input" name="name" value="${name}" required minlength="2" maxlength="80">
      </div>
      <div class="field">
        <label>${t('profile.examDate')}</label>
        <input class="input" name="exam_date" type="date" value="${examDate}">
      </div>
      <div class="row" style="justify-content:flex-end;gap:8px;margin-top:8px">
        <button class="btn btn-secondary" type="button" id="close-modal">${t('common.cancel')}</button>
        <button class="btn btn-primary" type="submit">${t('common.save')}</button>
      </div>
    </form>
  </div>`.s;
  document.body.appendChild(overlay);
  overlay.querySelector('#close-modal').onclick = () => overlay.remove();
  overlay.querySelector('#edit-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api.patch(`/admin/school/students/${id}`, {
        name: fd.get('name'),
        exam_date: fd.get('exam_date') || null,
      });
      toast(t('common.saved'));
      overlay.remove();
      const updated = await api.get('/admin/students');
      renderStudents(root, updated, false);
    } catch (err) { toast(errorMessage(err), 'error'); }
  };
}
