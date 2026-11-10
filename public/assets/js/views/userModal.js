/**
 * نوافذ العرض والتعديل والإضافة الموحّدة للمستخدمين (متعلم، مدرب، مؤسسة، أدمين).
 * تُستعمل في كل الصفحات: قائمة المستخدمين، المتعلمون، متعلمو المؤسسة، مدربو المؤسسة.
 *   openUserView(id, { onChanged })       — نافذة عرض المعلومات (+ زر تعديل)
 *   openUserForm({ mode, id, role, roles, onDone }) — نافذة إضافة/تعديل (بدون كلمة سر)
 */
import { html, toast, errorMessage } from '../ui.js';
import { t } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { roleExtraFields, ALL_CATS, showCredentials, fillUserForm } from './admin.js';

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function modal(title, bodyHtml, footHtml = '') {
  document.querySelectorAll('.um-overlay').forEach((o) => o.remove());
  const ov = document.createElement('div');
  ov.className = 'rv-overlay um-overlay';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.innerHTML = `<div class="rv-modal um-modal">
    <div class="um-head"><h3>${title}</h3><button type="button" class="um-x" aria-label="${esc(t('results.close'))}">✕</button></div>
    <div class="rv-body um-body">${bodyHtml}</div>
    <div class="rv-foot um-foot">${footHtml}</div></div>`;
  document.body.appendChild(ov);
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  ov.querySelector('.um-x').onclick = close;
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  return { ov, close };
}

const canEditUsers = () => store.isAdmin() || store.isSchool();

// الحقول المعروضة حسب الدور: [المفتاح، التسمية]
const GENDER = { M: 'ذكر', F: 'أنثى' };
const FIELDS = {
  student: [
    ['email', 'البريد الإلكتروني'], ['phone', 'الهاتف'], ['city', 'المدينة'], ['gender', 'الجنس', (v) => GENDER[v] || v],
    ['nationality', 'الجنسية'], ['id_type', 'نوع الهوية'], ['cin', 'رقم الهوية (CIN)'],
    ['first_name_fr', 'الاسم الشخصي (فرنسي)'], ['last_name_fr', 'الاسم العائلي (فرنسي)'],
    ['first_name_ar', 'الاسم الشخصي (عربي)'], ['last_name_ar', 'الاسم العائلي (عربي)'],
    ['birth_date', 'تاريخ الميلاد'], ['birth_place_fr', 'مكان الميلاد (فرنسي)'], ['birth_place_ar', 'مكان الازدياد (عربي)'],
    ['address_fr', 'العنوان (فرنسي)'], ['address_ar', 'العنوان (عربي)'],
    ['license_cat', 'الصنف المطلوب'], ['registration_center', 'مركز التسجيل'], ['license_num', 'رقم الرخصة'],
    ['valid_categories', 'الأصناف الصالحة', (v) => { try { return JSON.parse(v || '[]').join(' · '); } catch { return v; } }],
    ['exam_date', 'تاريخ الامتحان'],
  ],
  instructor: [
    ['email', 'البريد الإلكتروني'], ['phone', 'الهاتف'], ['city', 'المدينة'], ['gender', 'الجنس', (v) => GENDER[v] || v], ['cin', 'رقم الهوية (CIN)'],
    ['first_name_fr', 'الاسم الشخصي (فرنسي)'], ['last_name_fr', 'الاسم العائلي (فرنسي)'],
    ['first_name_ar', 'الاسم الشخصي (عربي)'], ['last_name_ar', 'الاسم العائلي (عربي)'],
    ['pc_num', 'رقم الملف (PC)'], ['cap_num', 'رقم التأهيل (CAP)'],
    ['instructor_categories', 'فئات التأهيل', (v) => { try { return JSON.parse(v || '[]').join(' · '); } catch { return v; } }],
  ],
  school: [
    ['school_name', 'اسم المؤسسة'], ['manager_name', 'المدير'], ['email', 'البريد الإلكتروني'], ['phone', 'الهاتف'], ['city', 'المدينة'],
    ['tax_id', 'رقم التعريف الضريبي'], ['pro_license_num', 'رقم الرخصة المهنية'], ['narsa_num', 'الرقم في نظام NARSA'],
  ],
  admin: [['email', 'البريد الإلكتروني'], ['phone', 'الهاتف']],
};
const fmtD = (v) => (v ? String(v).replace('T', ' ').slice(0, 16) : '—');

/** نافذة عرض معلومات مستخدم */
export async function openUserView(id, { onChanged } = {}) {
  let u; let dash = null;
  try {
    u = await api.get(`/admin/users/${id}`).catch(() => null);
    if (!u) u = (await api.get(`/admin/students/${id}`)).user;       // المدرب: اطلاع فقط
    if (u.role === 'student') { try { dash = (await api.get(`/admin/students/${id}`)).dashboard; } catch { /* ignore */ } }
  } catch (err) { toast(errorMessage(err), 'error'); return; }

  const state = u.archived ? 'مؤرشف' : (u.active ? 'نشيط' : 'موقوف');
  const rows = (FIELDS[u.role] || []).filter(([k]) => k !== 'exam_date' || !u.school_id || u.role !== 'student' || true)
    .map(([k, label, fmt]) => {
      const raw = u[k];
      const v = raw === null || raw === undefined || raw === '' ? '—' : (fmt ? fmt(raw) : raw);
      return `<div class="um-row"><span>${esc(label)}</span><b dir="auto">${esc(v)}</b></div>`;
    }).join('');
  const score = dash?.readiness?.score;
  const progress = score === undefined ? '' : `<div class="um-prog"><div class="um-row"><span>التقدم (الجاهزية)</span><b>${score}%</b></div>
    <div class="dash-track"><i style="width:${score}%;background:var(--success,#16a34a)"></i></div>
    <div class="small muted" style="margin-top:4px">امتحانات ناجحة: ${dash.readiness.examsPassed ?? 0} / ${dash.readiness.examsTaken ?? 0}</div></div>`;
  const body = `<div class="um-meta"><span class="pill">${esc(t('role.' + u.role))}</span> <span class="pill ${u.active && !u.archived ? 'pill-success' : 'pill-warning'}">${state}</span></div>
    ${progress}<div class="um-grid">${rows}
      <div class="um-row"><span>تاريخ الإنشاء</span><b>${esc(fmtD(u.created_at))}</b></div>
      <div class="um-row"><span>آخر دخول</span><b>${esc(fmtD(u.last_login_at))}</b></div></div>`;
  const editable = canEditUsers() && (store.isAdmin() || ['student', 'instructor'].includes(u.role));
  const { ov, close } = modal(esc(u.name), body, `${editable ? '<button type="button" class="btn btn-primary" id="um-edit">✏️ تعديل</button>' : '<span></span>'}<button type="button" class="btn btn-secondary" id="um-close">إغلاق</button>`);
  ov.querySelector('#um-close').onclick = close;
  const ed = ov.querySelector('#um-edit');
  if (ed) ed.onclick = () => openUserForm({ mode: 'edit', id, onDone: onChanged });
}

/** نافذة إضافة/تعديل مستخدم — بلا كلمة سر (تُولَّد عند الإضافة، وزر 🔑 منفصل لإعادة توليدها) */
export async function openUserForm({ mode = 'edit', id = null, role = 'student', roles = null, onDone } = {}) {
  let user = null;
  if (mode === 'edit') {
    try { user = await api.get(`/admin/users/${id}`); } catch (err) { toast(errorMessage(err), 'error'); return; }
    role = user.role;
  }
  const editing = mode === 'edit';
  const { ov, close } = modal(editing ? `✏️ تعديل: ${esc(user.name)}` : esc(t(role === 'instructor' ? 'school.addInstructor' : 'admin.addUser')), '<form id="um-form" class="stack"></form>', '');
  const form = ov.querySelector('#um-form');
  const foot = ov.querySelector('.um-foot');
  let curRole = role;

  const draw = () => {
    form.innerHTML = `${!editing && roles && roles.length > 1 ? `<label>${esc(t('admin.role'))}<select class="input" name="role" id="um-role">${roles.map((r) => `<option value="${r}" ${r === curRole ? 'selected' : ''}>${esc(t('role.' + r))}</option>`).join('')}</select></label>` : ''}
      ${roleExtraFields(curRole, [])}
      ${editing ? '<p class="muted small" style="margin:0">🔒 لا يمكن تعديل كلمة السر ولا الدور من هنا.</p>' : '<p class="muted small" style="margin:0">🔑 تُولَّد كلمة سر عشوائية خاصة عند الحفظ وتظهر مرة واحدة.</p>'}`;
    if (editing) fillUserForm(form, user);
    // رقم الهوية لا يُعدَّل بعد التسجيل (يُكمَّل فقط إذا كان فارغاً في حساب قديم)
    const cinEl = form.elements.cin;
    if (editing && cinEl && cinEl.value) {
      cinEl.readOnly = true;
      cinEl.setAttribute('aria-readonly', 'true');
      cinEl.title = t('admin.cinLocked');
      cinEl.insertAdjacentHTML('afterend', `<span class="small muted">🔒 ${esc(t('admin.cinLocked'))}</span>`);
    }
    const sel = form.querySelector('#um-role');
    if (sel) sel.onchange = () => { curRole = sel.value; draw(); };
  };
  draw();
  foot.innerHTML = '<button type="submit" form="um-form" class="btn btn-primary" id="um-save">حفظ</button><button type="button" class="btn btn-secondary" id="um-cancel">إلغاء</button>';
  foot.querySelector('#um-cancel').onclick = close;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = foot.querySelector('#um-save');
    if (btn.disabled) return;
    btn.disabled = true;
    const fd = new FormData(form);
    const body = { role: curRole };
    for (const [k, v] of fd.entries()) {
      if (k === 'role' && !editing) continue;
      if (k.startsWith('valid_cat_') || k.startsWith('instructor_cat_')) continue;
      const val = typeof v === 'string' ? v.trim() : v;
      if (editing) body[k] = val; else if (val !== '') body[k] = val;
    }
    body.role = curRole;
    if (curRole === 'student') body.valid_categories = JSON.stringify(ALL_CATS.filter((c) => fd.get('valid_cat_' + c)));
    if (curRole === 'instructor') body.instructor_categories = JSON.stringify(ALL_CATS.filter((c) => fd.get('instructor_cat_' + c)));
    try {
      if (editing) {
        delete body.role;
        if (form.elements.cin && form.elements.cin.readOnly) delete body.cin;
        await api.patch(`/admin/users/${id}`, body);
        toast(t('common.saved'));
        close();
        if (onDone) await onDone();
      } else {
        const created = await api.post('/admin/users', body);
        close();
        if (onDone) await onDone();
        await showCredentials({ email: created.email, password: created.generatedPassword, name: created.name });
      }
    } catch (err) { btn.disabled = false; toast(errorMessage(err), 'error'); }
  };
}

/** ربط أي عنصر [data-view="id"] داخل root بنافذة العرض */
export function bindUserLinks(root, onChanged) {
  root.querySelectorAll('[data-view]').forEach((a) => {
    a.onclick = (e) => { e.preventDefault(); openUserView(a.dataset.view, { onChanged }); };
  });
}
