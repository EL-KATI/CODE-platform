/**
 * views/schools.js — إدارة مؤسسات تعليم السياقة
 *
 * المصدّرات:
 *   schoolsView(root)       — قائمة المؤسسات (أدمين)
 *   schoolDetailView(root, { params }) — تفاصيل مؤسسة + أعضاؤها
 */
import { t, getLocale } from '../i18n.js';
import { api } from '../api.js';
import { shell } from './admin.js';

/* ── مساعدات ── */
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function roleBadge(role) {
  const map = { admin: ['badge-error', 'أدمين'], school: ['badge-warning', 'مؤسسة'], instructor: ['badge-info', 'مدرب'], student: ['badge-neutral', 'متعلم'] };
  const [cls, label] = map[role] || ['badge-neutral', role];
  return `<span class="badge ${cls}">${t('role.' + role) || label}</span>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   schoolsView — قائمة المؤسسات (أدمين)
   ══════════════════════════════════════════════════════════════════════════ */
export async function schoolsView(root) {
  shell(root, '/admin/schools', '');

  const wrap = document.createElement('div');
  wrap.className = 'schools-view';
  root.appendChild(wrap);

  async function reload() {
    wrap.innerHTML = `<div class="page-head row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <h2 style="margin:0">${t('schools.title')}</h2>
      <button class="btn btn-primary" id="add-school-btn">+ ${t('schools.addSchool')}</button>
    </div>
    <div id="schools-list"><div class="loading-spinner">${t('common.loading')}</div></div>`;

    wrap.querySelector('#add-school-btn').addEventListener('click', () => openSchoolModal(root, null, reload));

    try {
      const data = await api.get('/admin/schools');
      const list = wrap.querySelector('#schools-list');
      if (!data.schools.length) {
        list.innerHTML = `<p class="empty">${t('schools.noSchools')}</p>`;
        return;
      }
      list.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${t('schools.name')}</th>
                <th>${t('schools.code')}</th>
                <th>${t('schools.phone')}</th>
                <th>${t('schools.students')}</th>
                <th>${t('schools.instructors')}</th>
                <th>${t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              ${data.schools.map(s => `
                <tr>
                  <td><a class="link" href="/admin/schools/${s.id}">${esc(s.name)}</a>
                    ${!s.active ? `<span class="badge badge-error">${t('schools.inactive')}</span>` : ''}</td>
                  <td><code>${esc(s.code)}</code></td>
                  <td>${esc(s.phone) || '—'}</td>
                  <td>${s.students_count}</td>
                  <td>${s.instructors_count}</td>
                  <td class="row" style="gap:6px">
                    <button class="btn btn-xs btn-secondary edit-btn" data-id="${s.id}">${t('common.edit')}</button>
                    <button class="btn btn-xs btn-error del-btn" data-id="${s.id}" data-name="${esc(s.name)}">${t('common.delete')}</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;

      list.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const school = data.schools.find(s => s.id == btn.dataset.id);
          openSchoolModal(root, school, reload);
        });
      });

      list.querySelectorAll('.del-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm(t('schools.confirmDelete', { name: btn.dataset.name }))) return;
          try {
            await api.del(`/admin/schools/${btn.dataset.id}`);
            reload();
          } catch (e) { alert(e.message); }
        });
      });
    } catch (e) {
      wrap.querySelector('#schools-list').innerHTML = `<p class="empty">${e.message}</p>`;
    }
  }

  reload();
}

/* ══════════════════════════════════════════════════════════════════════════
   مودال إضافة / تعديل مؤسسة
   ══════════════════════════════════════════════════════════════════════════ */
function openSchoolModal(root, school, onSave) {
  const isEdit = !!school;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" style="max-width:500px">
      <h3>${isEdit ? t('schools.editSchool') : t('schools.addSchool')}</h3>
      <label class="field">
        <span>${t('schools.name')} *</span>
        <input type="text" id="sc-name" value="${esc(school?.name || '')}" maxlength="120" />
      </label>
      ${!isEdit ? `
      <label class="field">
        <span>${t('schools.code')} *</span>
        <input type="text" id="sc-code" value="" maxlength="30" placeholder="AUTO_ECOLE_1" />
        <small>${t('schools.codeHelp')}</small>
      </label>
      <label class="field">
        <span>${t('schools.email')} *</span>
        <input type="email" id="sc-email" value="" maxlength="200" placeholder="autoecole@example.com" />
        <small>${t('schools.emailHelp')}</small>
      </label>` : ''}
      <label class="field">
        <span>${t('schools.phone')}</span>
        <input type="tel" id="sc-phone" value="${esc(school?.phone || '')}" maxlength="30" />
      </label>
      <label class="field">
        <span>${t('schools.address')}</span>
        <input type="text" id="sc-address" value="${esc(school?.address || '')}" maxlength="200" />
      </label>
      ${isEdit ? `
      <label class="field-row">
        <input type="checkbox" id="sc-active" ${school.active ? 'checked' : ''} />
        <span>${t('schools.active')}</span>
      </label>` : ''}
      <p id="sc-err" class="form-error hidden"></p>
      <div class="modal-actions">
        <button class="btn btn-primary" id="sc-save">${t('common.save')}</button>
        <button class="btn btn-ghost" id="sc-cancel">${t('common.cancel')}</button>
      </div>
    </div>`;

  root.appendChild(overlay);
  const errP = overlay.querySelector('#sc-err');
  overlay.querySelector('#sc-cancel').onclick = () => overlay.remove();

  overlay.querySelector('#sc-save').onclick = async () => {
    errP.classList.add('hidden');
    const body = {
      name: overlay.querySelector('#sc-name').value.trim(),
      phone: overlay.querySelector('#sc-phone').value.trim(),
      address: overlay.querySelector('#sc-address').value.trim(),
    };
    if (!isEdit) {
      body.code  = overlay.querySelector('#sc-code').value.trim();
      body.email = overlay.querySelector('#sc-email').value.trim();
    }
    if (isEdit && overlay.querySelector('#sc-active')) body.active = overlay.querySelector('#sc-active').checked;

    try {
      if (isEdit) {
        await api.patch(`/admin/schools/${school.id}`, body);
        overlay.remove();
        onSave?.();
      } else {
        const res = await api.post('/admin/schools', body);
        // عرض كلمة السر المؤقتة قبل الإغلاق
        overlay.querySelector('.modal').innerHTML = `
          <h3 style="color:var(--success)">✅ ${t('schools.created')}</h3>
          <p>${t('schools.credentialsInfo')}</p>
          <div class="temp-pwd-box">
            <div class="field-row"><strong>${t('common.email')}:</strong> <code>${esc(body.email)}</code></div>
            <div class="field-row"><strong>${t('schools.tempPassword')}:</strong>
              <code id="tmp-pwd">${esc(res.temp_password)}</code>
              <button class="btn btn-xs btn-ghost" id="copy-pwd">📋</button>
            </div>
          </div>
          <p class="form-error" style="display:block">${t('schools.savePasswordWarning')}</p>
          <div class="modal-actions">
            <button class="btn btn-primary" id="sc-done">${t('common.understood')}</button>
          </div>`;
        overlay.querySelector('#copy-pwd').onclick = () => {
          navigator.clipboard.writeText(res.temp_password);
          overlay.querySelector('#copy-pwd').textContent = '✅';
        };
        overlay.querySelector('#sc-done').onclick = () => { overlay.remove(); onSave?.(); };
      }
    } catch (e) {
      errP.textContent = e.message || t('common.error');
      errP.classList.remove('hidden');
    }
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   schoolDetailView — تفاصيل مؤسسة + أعضاؤها
   ══════════════════════════════════════════════════════════════════════════ */
export async function schoolDetailView(root, ctx) {
  const id = ctx?.params?.id;
  if (!id) { root.innerHTML = `<p class="empty">${t('err.not_found')}</p>`; return; }

  shell(root, '/admin/schools', '');

  const wrap = document.createElement('div');
  wrap.className = 'schools-view school-detail-view';
  root.appendChild(wrap);

  async function reload() {
    wrap.innerHTML = `<div class="loading-spinner">${t('common.loading')}</div>`;
    try {
      const data = await api.get(`/admin/schools/${id}`);
      const { school, members } = data;

      const students = members.filter(m => m.role === 'student');
      const instructors = members.filter(m => m.role === 'instructor');
      const managers = members.filter(m => m.role === 'school');

      wrap.innerHTML = `
        <div class="page-head row" style="justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
          <div>
            <a class="btn btn-ghost btn-xs" href="/admin/schools">← ${t('common.back')}</a>
            <h2 style="margin:4px 0 2px">${esc(school.name)}</h2>
            <small class="text-muted">
              <code>${esc(school.code)}</code>
              ${school.phone ? ` · 📞 ${esc(school.phone)}` : ''}
              ${school.address ? ` · 📍 ${esc(school.address)}` : ''}
            </small>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button class="btn btn-secondary" id="add-instructor-btn">+ ${t('schools.addInstructor')}</button>
            <button class="btn btn-secondary" id="add-student-btn">+ ${t('schools.addStudentNew')}</button>
            <button class="btn btn-primary" id="enroll-student-btn">🔗 ${t('schools.enrollExisting')}</button>
          </div>
        </div>

        <!-- إحصاءات سريعة -->
        <div class="school-stats-row">
          <div class="school-stat"><strong>${students.length}</strong><span>${t('schools.students')}</span></div>
          <div class="school-stat"><strong>${instructors.length}</strong><span>${t('schools.instructors')}</span></div>
          <div class="school-stat"><strong>${managers.length}</strong><span>${t('schools.managers')}</span></div>
        </div>

        <!-- قائمة المدربين -->
        ${instructors.length ? `
        <section class="school-section">
          <h3>${t('schools.instructors')} (${instructors.length})</h3>
          ${membersTable(instructors, id)}
        </section>` : ''}

        <!-- قائمة المتعلمين -->
        <section class="school-section">
          <h3>${t('schools.students')} (${students.length})</h3>
          ${students.length ? membersTable(students, id) : `<p class="empty">${t('schools.noStudents')}</p>`}
        </section>
      `;

      // أحداث الأزرار
      wrap.querySelector('#add-instructor-btn').addEventListener('click', () =>
        openAddMemberModal(root, id, 'instructor', reload));
      wrap.querySelector('#add-student-btn').addEventListener('click', () =>
        openAddMemberModal(root, id, 'student', reload));
      wrap.querySelector('#enroll-student-btn').addEventListener('click', () =>
        openEnrollModal(root, id, reload));

      // فصل الأعضاء
      wrap.querySelectorAll('.unenroll-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm(t('schools.confirmUnenroll', { name: btn.dataset.name }))) return;
          try {
            await api.del(`/admin/schools/${id}/members/${btn.dataset.id}`);
            reload();
          } catch (e) { alert(e.message); }
        });
      });

    } catch (e) {
      wrap.innerHTML = `<p class="empty">${e.message}</p>`;
    }
  }

  reload();
}

function membersTable(members, schoolId) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t('admin.name')}</th>
            <th>${t('admin.email')}</th>
            <th>${t('admin.role')}</th>
            <th>${t('common.actions')}</th>
          </tr>
        </thead>
        <tbody>
          ${members.map(m => `
            <tr>
              <td>${esc(m.name)} ${!m.active ? `<span class="badge badge-error">${t('school.suspended')}</span>` : ''}</td>
              <td>${esc(m.email)}</td>
              <td>${roleBadge(m.role)}</td>
              <td>
                <button class="btn btn-xs btn-error unenroll-btn"
                  data-id="${m.id}" data-name="${esc(m.name)}">
                  ${t('schools.unenroll')}
                </button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   مودال إضافة عضو جديد (مدرب أو متعلم)
   ══════════════════════════════════════════════════════════════════════════ */
function openAddMemberModal(root, schoolId, role, onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const isInstructor = role === 'instructor';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h3>${isInstructor ? t('schools.addInstructor') : t('schools.addStudentNew')}</h3>
      <label class="field">
        <span>${t('admin.name')} *</span>
        <input type="text" id="mb-name" maxlength="100" />
      </label>
      <label class="field">
        <span>${t('auth.email')} *</span>
        <input type="email" id="mb-email" />
      </label>
      <label class="field">
        <span>${t('auth.password')} (${t('common.optional')})</span>
        <input type="text" id="mb-pwd" placeholder="${t('schools.autoPassword')}" />
      </label>
      <p id="mb-err" class="form-error hidden"></p>
      <div class="modal-actions">
        <button class="btn btn-primary" id="mb-save">${t('schools.addBtn')}</button>
        <button class="btn btn-ghost" id="mb-cancel">${t('common.cancel')}</button>
      </div>
      <p id="mb-result" class="hidden" style="margin-top:14px;padding:12px;background:#f0fdf4;border-radius:8px;font-size:.88rem"></p>
    </div>`;

  root.appendChild(overlay);
  const errP = overlay.querySelector('#mb-err');
  overlay.querySelector('#mb-cancel').onclick = () => overlay.remove();

  overlay.querySelector('#mb-save').onclick = async () => {
    errP.classList.add('hidden');
    const endpoint = isInstructor
      ? `/admin/schools/${schoolId}/instructors`
      : `/admin/schools/${schoolId}/students`;
    const body = {
      name: overlay.querySelector('#mb-name').value.trim(),
      email: overlay.querySelector('#mb-email').value.trim(),
      password: overlay.querySelector('#mb-pwd').value.trim() || undefined,
    };
    try {
      const data = await api.post(endpoint, body);
      const result = overlay.querySelector('#mb-result');
      result.classList.remove('hidden');
      result.innerHTML = `✅ ${t('schools.memberAdded')}
        ${data.temp_password ? `<br>${t('schools.tempPwd')}: <strong>${data.temp_password}</strong>` : ''}`;
      overlay.querySelector('#mb-name').value = '';
      overlay.querySelector('#mb-email').value = '';
      overlay.querySelector('#mb-pwd').value = '';
      onSave?.();
    } catch (e) {
      errP.textContent = e.message || t('common.error');
      errP.classList.remove('hidden');
    }
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   مودال نسب متعلم موجود للمؤسسة
   ══════════════════════════════════════════════════════════════════════════ */
function openEnrollModal(root, schoolId, onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h3>${t('schools.enrollExisting')}</h3>
      <label class="field">
        <span>${t('schools.searchStudent')}</span>
        <input type="text" id="enroll-search" placeholder="${t('schools.searchPlaceholder')}" />
      </label>
      <div id="enroll-results" style="max-height:220px;overflow-y:auto;margin-top:8px"></div>
      <p id="enroll-err" class="form-error hidden"></p>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="enroll-cancel">${t('common.cancel')}</button>
      </div>
    </div>`;

  root.appendChild(overlay);
  const errP = overlay.querySelector('#enroll-err');
  overlay.querySelector('#enroll-cancel').onclick = () => overlay.remove();

  let searchTimer;
  overlay.querySelector('#enroll-search').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => doSearch(e.target.value), 300);
  });

  async function doSearch(q) {
    if (q.length < 2) { overlay.querySelector('#enroll-results').innerHTML = ''; return; }
    try {
      const data = await api.get(`/admin/schools/search-students?q=${encodeURIComponent(q)}`);
      const res = overlay.querySelector('#enroll-results');
      if (!data.users.length) { res.innerHTML = `<p class="empty" style="font-size:.85rem">${t('schools.noResultsSearch')}</p>`; return; }
      res.innerHTML = data.users.map(u => `
        <div class="enroll-result-row" data-id="${u.id}">
          <span>${esc(u.name)} <small class="text-muted">${esc(u.email)}</small></span>
          <button class="btn btn-xs btn-primary enroll-pick" data-id="${u.id}" data-name="${esc(u.name)}">
            ${t('schools.enrollBtn')}
          </button>
        </div>`).join('');

      res.querySelectorAll('.enroll-pick').forEach(btn => {
        btn.addEventListener('click', async () => {
          errP.classList.add('hidden');
          try {
            await api.post(`/admin/schools/${schoolId}/enroll`, { user_id: Number(btn.dataset.id) });
            overlay.remove();
            onSave?.();
          } catch (e) {
            errP.textContent = e.message || t('common.error');
            errP.classList.remove('hidden');
          }
        });
      });
    } catch (e) { /* تجاهل */ }
  }
}
