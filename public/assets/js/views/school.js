/**
 * واجهة مؤسسة تعليم السياقة (دور school)
 *   /admin/school/students    — إدارة متعلمي المؤسسة
 *   /admin/school/instructors — إدارة مدربي المؤسسة
 * نفس التصميم والنماذج المستعملة في لوحة الأدمن.
 */
import { html, raw, loading, toast, errorMessage, confirmDialog, fmtDate } from '../ui.js';
import { t } from '../i18n.js';
import { api } from '../api.js';
import {
  roleExtraFields, ALL_CATS, showCredentials, rowActions, bindActions, statusPill,
  fillUserForm, resetBlocked, resetWait, fmtWait, shell,
} from './admin.js';

export const schoolStudentsView = (root) => managedView(root, 'student');
export const schoolInstructorsView = (root) => managedView(root, 'instructor');

const CFG = {
  student: { path: '/admin/school/students', title: 'school.manageStudents', add: 'school.addStudentBtn', list: '/admin/students' },
  instructor: { path: '/admin/school/instructors', title: 'school.manageInstructors', add: 'school.addInstructor', list: '/admin/school/instructors' },
};

async function managedView(root, role) {
  const cfg = CFG[role];
  root.innerHTML = loading().s;
  let list = [];
  let filter = 'live';     // live | archived | all
  let formMode = null;     // null | 'add' | 'edit'
  let editUser = null;

  const refresh = async () => { list = await api.get(cfg.list); };
  try { await refresh(); } catch (err) { root.innerHTML = html`<div class="empty"><p>${errorMessage(err)}</p></div>`.s; return; }

  const stateOf = (u) => (u.archived ? 'archived' : (u.active ? 'active' : 'suspended'));
  const statePill = (u) => {
    const st = stateOf(u);
    return html`<span class="pill ${st === 'active' ? 'pill-success' : st === 'archived' ? '' : 'pill-warning'}">${st === 'active' ? 'نشيط' : st === 'archived' ? t('common.archived') : 'موقوف'}</span>`;
  };

  function renderForm() {
    const wrap = root.querySelector('#add-form-wrap');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!formMode) return;
    const editing = formMode === 'edit';
    const div = document.createElement('div');
    div.className = 'card';
    div.style.marginBottom = '16px';
    div.innerHTML = `<h3 style="margin-top:0">${editing ? '✏️ تعديل بيانات: ' + String(editUser.name).replace(/</g, '&lt;') : t(cfg.add)}</h3>
      <form id="user-form" class="stack" style="max-width:680px">
        ${roleExtraFields(role, [])}
        ${editing ? '' : '<p class="muted small" style="margin:0">🔑 تُولَّد كلمة سر عشوائية خاصة عند الحفظ وتظهر مرة واحدة.</p>'}
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" type="submit">${t('common.save')}</button>
          <button class="btn btn-secondary" type="button" id="btn-cancel-user">${t('common.cancel')}</button>
        </div>
      </form>`;
    wrap.appendChild(div);
    const form = div.querySelector('#user-form');
    if (editing) fillUserForm(form, editUser);
    div.querySelector('#btn-cancel-user').onclick = () => { formMode = null; editUser = null; renderForm(); };
    div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = div.querySelector('button[type="submit"]');
      if (btn.disabled) return;
      btn.disabled = true;
      const fd = new FormData(form);
      const body = { role };
      for (const [k, v] of fd.entries()) {
        if (k.startsWith('valid_cat_') || k.startsWith('instructor_cat_')) continue;
        const val = typeof v === 'string' ? v.trim() : v;
        if (editing) body[k] = val; else if (val !== '') body[k] = val;
      }
      if (role === 'student') body.valid_categories = JSON.stringify(ALL_CATS.filter((c) => fd.get('valid_cat_' + c)));
      if (role === 'instructor') body.instructor_categories = JSON.stringify(ALL_CATS.filter((c) => fd.get('instructor_cat_' + c)));
      try {
        if (editing) {
          delete body.role;
          await api.patch(`/admin/users/${editUser.id}`, body);
          toast(t('common.saved'));
          formMode = null; editUser = null;
          await refresh(); render();
        } else {
          const created = await api.post('/admin/users', body);
          formMode = null;
          await refresh(); render();
          await showCredentials({ email: created.email, password: created.generatedPassword, name: created.name });
        }
      } catch (err) { btn.disabled = false; toast(errorMessage(err), 'error'); }
    };
  }

  function render() {
    const shown = list.filter((u) => (filter === 'all' ? true : filter === 'archived' ? u.archived : !u.archived));
    const head = role === 'student'
      ? html`<th>${t('admin.name')}</th><th>${t('admin.email')}</th><th>${t('admin.exams')}</th><th>التقدم</th><th>${t('admin.lastActivity')}</th><th>${t('admin.status')}</th><th>${t('common.actions')}</th>`
      : html`<th>${t('admin.name')}</th><th>${t('admin.email')}</th><th>${t('admin.phone') === 'admin.phone' ? 'الهاتف' : t('admin.phone')}</th><th>المدينة</th><th>${t('admin.status')}</th><th>${t('common.actions')}</th>`;
    const cols = role === 'student' ? 7 : 6;
    shell(root, cfg.path, html`
      <div class="row" style="margin-bottom:12px;gap:8px;flex-wrap:wrap">
        <h2 style="margin:0">${t(cfg.title)}</h2>
        <span class="spacer"></span>
        <select id="u-filter" class="input" style="width:auto" aria-label="${t('admin.status')}">
          <option value="live" ${filter === 'live' ? raw('selected') : ''}>${t('booking.filterActive')}</option>
          <option value="archived" ${filter === 'archived' ? raw('selected') : ''}>${t('common.archived')}</option>
          <option value="all" ${filter === 'all' ? raw('selected') : ''}>${t('booking.filterAll')}</option>
        </select>
        <button class="btn btn-primary btn-sm" id="btn-add-user">＋ ${t(cfg.add)}</button>
      </div>
      <div id="add-form-wrap"></div>
      <div class="card table-wrap" style="overflow:auto"><table class="table list-table"><thead><tr>${head}</tr></thead><tbody>
        ${shown.length ? shown.map((u) => {
          const acts = rowActions({
            id: u.id, hidden: !u.active, hideLabel: 'إيقاف الحساب', showLabel: 'تفعيل الحساب', del: true,
            extra: html`<button class="act-btn" type="button" data-act="edit" data-id="${u.id}" title="${t('common.edit')}"><span aria-hidden="true">✏️</span><span class="act-lbl">${t('common.edit')}</span></button><button class="act-btn" type="button" data-act="reset" data-id="${u.id}" ${resetBlocked(u) ? raw('disabled') : ''} title="${resetBlocked(u) ? 'متاح بعد ' + resetWait(u) : 'توليد كلمة سر جديدة'}"><span aria-hidden="true">🔑</span><span class="act-lbl">كلمة سر</span></button><button class="act-btn" type="button" data-act="${u.archived ? 'unarchive' : 'archive'}" data-id="${u.id}" title="${u.archived ? t('common.unarchive') : t('common.archive')}"><span aria-hidden="true">${u.archived ? '♻️' : '📦'}</span><span class="act-lbl">${u.archived ? t('common.unarchive') : t('common.archive')}</span></button>`,
          });
          return role === 'student'
            ? html`<tr style="${u.active ? '' : 'opacity:.6'}"><td><a href="/admin/students/${u.id}">${u.name}</a></td><td class="small">${u.email}</td><td>${u.exams_passed}/${u.exams}</td>
                <td style="min-width:110px"><div style="height:8px;border-radius:99px;background:var(--border,#ddd);overflow:hidden"><div style="height:100%;width:${u.progress || 0}%;background:var(--success,#16a34a)"></div></div><span class="small">${u.progress || 0}%</span></td>
                <td>${u.last_activity ? fmtDate(u.last_activity) : '—'}</td><td>${statePill(u)}</td><td>${acts}</td></tr>`
            : html`<tr style="${u.active ? '' : 'opacity:.6'}"><td>${u.name}</td><td class="small">${u.email}</td><td class="small">${u.phone || '—'}</td><td class="small">${u.city || '—'}</td><td>${statePill(u)}</td><td>${acts}</td></tr>`;
        }) : html`<tr><td colspan="${cols}" class="muted">${t('common.none')}</td></tr>`}
      </tbody></table></div>`);

    root.querySelector('#u-filter').onchange = (e) => { filter = e.target.value; render(); };
    root.querySelector('#btn-add-user').onclick = () => { formMode = formMode === 'add' ? null : 'add'; editUser = null; renderForm(); };
    renderForm();

    const patch = async (id, body) => {
      try { await api.patch(`/admin/users/${id}`, body); toast(t('common.saved')); await refresh(); render(); }
      catch (err) { toast(errorMessage(err), 'error'); await refresh(); render(); }
    };
    bindActions(root, {
      hide: (id) => patch(id, { active: false }),
      show: (id) => patch(id, { active: true }),
      archive: async (id) => { if (await confirmDialog('أرشفة هذا الحساب؟ سيُوقف ولا يمكنه الدخول، ويمكن استرجاعه لاحقاً.')) patch(id, { archived: true }); },
      unarchive: (id) => patch(id, { archived: false }),
      edit: async (id) => {
        try { editUser = await api.get(`/admin/users/${id}`); formMode = 'edit'; renderForm(); }
        catch (err) { toast(errorMessage(err), 'error'); }
      },
      reset: async (id, b) => {
        const u = list.find((x) => String(x.id) === String(id));
        if (!(await confirmDialog(`توليد كلمة سر جديدة لـ ${u?.name}؟ ستُلغى كلمة السر الحالية، ويمكن تكرار ذلك مرة واحدة فقط كل 24 ساعة.`))) return;
        b.disabled = true;
        try {
          const r = await api.post(`/admin/users/${id}/reset-password`);
          await refresh(); render();
          await showCredentials({ email: r.email, password: r.generatedPassword, name: r.name });
        } catch (err) {
          if (err.code === 'reset_limit') toast(`مسموح مرة واحدة كل 24 ساعة. جرّب بعد ${fmtWait(err.details?.retryAt)}`, 'error');
          else toast(errorMessage(err), 'error');
          await refresh(); render();
        }
      },
      delete: async (id) => {
        if (!(await confirmDialog(t('admin.confirmDelete'), { danger: true }))) return;
        try { await api.del(`/admin/users/${id}`); await refresh(); render(); } catch (err) { toast(errorMessage(err), 'error'); }
      },
    });
  }
  render();
}
