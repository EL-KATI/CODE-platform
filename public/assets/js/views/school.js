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
  showCredentials, rowActions, bindActions, statusPill,
  resetBlocked, resetWait, fmtWait, shell,
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

  const { openUserView, openUserForm } = await import('./userModal.js');
  const refresh = async () => { list = await api.get(cfg.list); };
  try { await refresh(); } catch (err) { root.innerHTML = html`<div class="empty"><p>${errorMessage(err)}</p></div>`.s; return; }

  const stateOf = (u) => (u.archived ? 'archived' : (u.active ? 'active' : 'suspended'));
  const statePill = (u) => {
    const st = stateOf(u);
    return html`<span class="pill ${st === 'active' ? 'pill-success' : st === 'archived' ? '' : 'pill-warning'}">${st === 'active' ? 'نشيط' : st === 'archived' ? t('common.archived') : 'موقوف'}</span>`;
  };

  const render = async () => {
    const shown = list.filter((u) => (filter === 'all' ? true : filter === 'archived' ? u.archived : !u.archived));
    const head = role === 'student'
      ? html`<th>${t('admin.name')}</th><th>${t('admin.email')}</th><th>${t('admin.exams')}</th><th>التقدم</th><th>${t('admin.lastActivity')}</th><th>${t('admin.status')}</th><th>${t('common.actions')}</th>`
      : html`<th>${t('admin.name')}</th><th>${t('admin.email')}</th><th>الهاتف</th><th>المدينة</th><th>${t('admin.status')}</th><th>${t('common.actions')}</th>`;
    const cols = role === 'student' ? 7 : 6;
    shell(root, cfg.path, { action: html`<div class="row" style="gap:8px">
        <select id="u-filter" class="input" style="width:auto" aria-label="${t('admin.status')}">
          <option value="live" ${filter === 'live' ? raw('selected') : ''}>${t('booking.filterActive')}</option>
          <option value="archived" ${filter === 'archived' ? raw('selected') : ''}>${t('common.archived')}</option>
          <option value="all" ${filter === 'all' ? raw('selected') : ''}>${t('booking.filterAll')}</option>
        </select>
        <button class="btn btn-primary btn-sm" id="btn-add-user">＋ ${t(cfg.add)}</button>
      </div>`, content: html`
      <div class="card table-wrap" style="overflow:auto"><table class="table list-table"><thead><tr>${head}</tr></thead><tbody>
        ${shown.length ? shown.map((u) => {
          const acts = rowActions({
            id: u.id, hidden: !u.active, hideLabel: 'إيقاف الحساب', showLabel: 'تفعيل الحساب', del: true,
            extra: html`<button class="act-btn" type="button" data-act="edit" data-id="${u.id}" title="${t('common.edit')}"><span aria-hidden="true">✏️</span><span class="act-lbl">${t('common.edit')}</span></button>
                        <button class="act-btn" type="button" data-act="reset" data-id="${u.id}" ${resetBlocked(u) ? raw('disabled') : ''} title="${resetBlocked(u) ? 'متاح بعد ' + resetWait(u) : 'توليد كلمة سر جديدة'}"><span aria-hidden="true">🔑</span><span class="act-lbl">كلمة سر</span></button>
                        <button class="act-btn" type="button" data-act="${u.archived ? 'unarchive' : 'archive'}" data-id="${u.id}" title="${u.archived ? t('common.unarchive') : t('common.archive')}"><span aria-hidden="true">${u.archived ? '♻️' : '📦'}</span><span class="act-lbl">${u.archived ? t('common.unarchive') : t('common.archive')}</span></button>`,
          });
          return role === 'student'
            ? html`<tr style="${u.active ? '' : 'opacity:.6'}">
                <td><a data-view="${u.id}">${u.name}</a></td><td class="small">${u.email}</td><td>${u.exams_passed}/${u.exams}</td>
                <td style="min-width:110px"><div style="height:8px;border-radius:99px;background:var(--border,#ddd);overflow:hidden"><div style="height:100%;width:${u.progress || 0}%;background:var(--success,#16a34a)"></div></div><span class="small">${u.progress || 0}%</span></td>
                <td>${u.last_activity ? fmtDate(u.last_activity) : '—'}</td><td>${statePill(u)}</td><td>${acts}</td></tr>`
            : html`<tr style="${u.active ? '' : 'opacity:.6'}">
                <td><a data-view="${u.id}">${u.name}</a></td><td class="small">${u.email}</td><td class="small">${u.phone || '—'}</td><td class="small">${u.city || '—'}</td><td>${statePill(u)}</td><td>${acts}</td></tr>`;
        }) : html`<tr><td colspan="${cols}" class="muted">${t('common.none')}</td></tr>`}
      </tbody></table></div>` });

    root.querySelector('#u-filter').onchange = (e) => { filter = e.target.value; render(); };
    root.querySelector('#btn-add-user').onclick = () =>
      openUserForm({ mode: 'add', role, onDone: async () => { await refresh(); await render(); } });

    // نقر الاسم → نافذة عرض (مع زر تعديل داخلها)
    root.querySelectorAll('[data-view]').forEach((a) => {
      a.onclick = (e) => { e.preventDefault(); openUserView(a.dataset.view, { onChanged: async () => { await refresh(); await render(); } }); };
    });

    const patch = async (id, body) => {
      try { await api.patch(`/admin/users/${id}`, body); toast(t('common.saved')); await refresh(); await render(); }
      catch (err) { toast(errorMessage(err), 'error'); await refresh(); await render(); }
    };
    bindActions(root, {
      hide: (id) => patch(id, { active: false }),
      show: (id) => patch(id, { active: true }),
      archive: async (id) => { if (await confirmDialog('أرشفة هذا الحساب؟ سيُوقف ولا يمكنه الدخول، ويمكن استرجاعه لاحقاً.')) patch(id, { archived: true }); },
      unarchive: (id) => patch(id, { archived: false }),
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
        try { await api.del(`/admin/users/${id}`); await refresh(); await render(); } catch (err) { toast(errorMessage(err), 'error'); }
      },
    });
  };
  await render();
}

/* ═══ لوحة إحصائيات المؤسسة — الواجهة الأولى (تفاعلية) ═══ */
const HOUR_LBL = { 9: '9:00 ص', 11: '11:00 ص', 15: '3:00 م', 17: '5:00 م' };
const dayShort = (d) => d.slice(5).replace('-', '/');

export async function schoolStatsView(root, days = 30) {
  root.innerHTML = loading().s;
  let s;
  try { s = await api.get(`/admin/school/stats?days=${days}`); }
  catch (err) { root.innerHTML = html`<div class="empty"><p>${errorMessage(err)}</p></div>`.s; return; }
  if (!s) { shell(root, '/admin', html`<div class="empty"><p>${t('common.none')}</p></div>`); return; }

  const rate = s.exams.total ? Math.round((100 * s.exams.passed) / s.exams.total) : 0;
  const bk = Object.fromEntries(s.bookings.map((b) => [b.status, b.n]));
  const kpi = (icon, label, value, sub, href) => html`<a class="dash-kpi" href="${href}" data-tip="${label}: ${value}${sub ? ' — ' + sub : ''}">
    <span class="dash-kpi-ic" aria-hidden="true">${icon}</span><span class="muted small">${label}</span><strong>${value}</strong>${sub ? html`<span class="small muted">${sub}</span>` : ''}</a>`;

  // ── مخطط الامتحانات (أعمدة مكدّسة: ناجح/راسب لكل يوم) ──
  const ex = s.examsSeries;
  const maxEx = Math.max(1, ...ex.map((x) => x.total));
  const examChart = ex.length ? html`<div class="dash-bars" role="img" aria-label="${t('nav.exams')}">${ex.map((x) => {
    const failed = x.total - x.passed;
    return html`<div class="dash-bar-col" data-tip="${x.d}: ${x.passed} ناجح · ${failed} راسب"><div class="dash-bar" style="height:${Math.round((100 * x.total) / maxEx)}%"><i style="flex:${failed};background:var(--danger,#dc2626)"></i><i style="flex:${x.passed};background:var(--success,#16a34a)"></i></div><span class="small muted">${dayShort(x.d)}</span></div>`;
  })}</div>` : html`<p class="muted small">لا امتحانات في هذه الفترة</p>`;

  // ── توزيع التقدم ──
  const bl = ['0–24%', '25–49%', '50–74%', '75–100%'];
  const maxB = Math.max(1, ...s.buckets);
  const progChart = html`${s.buckets.map((n, i) => html`<a class="dash-hrow" href="/admin/school/students" data-tip="${bl[i]}: ${n} متعلم"><span class="small" style="width:70px">${bl[i]}</span><span class="dash-track"><i style="width:${Math.round((100 * n) / maxB)}%;background:${['#dc2626', '#f59e0b', '#2563eb', '#16a34a'][i]}"></i></span><strong class="small" style="width:28px;text-align:end">${n}</strong></a>`)}`;

  // ── حالة الحجوزات (أسطورة قابلة للإخفاء/الإظهار) ──
  const BK = [['pending', 'قيد الانتظار', '#f59e0b'], ['approved', 'مقبول', '#16a34a'], ['rescheduled', 'تغيير موعد', '#2563eb'], ['rejected', 'مرفوض', '#dc2626'], ['cancelled', 'ملغى', '#94a3b8']];

  // ── حمل المدربين ──
  const loadChart = s.instructorLoad.length ? html`${s.instructorLoad.map((i) => {
    const p = i.seats ? Math.round((100 * i.booked) / i.seats) : 0;
    return html`<a class="dash-hrow" href="/admin/bookings" data-tip="${i.name}: ${i.booked}/${i.seats} مقعد في ${i.slots} حصة (14 يوماً القادمة)"><span class="small" style="width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i.name}</span><span class="dash-track"><i style="width:${p}%;background:${p >= 90 ? '#dc2626' : 'var(--primary,#c2410c)'}"></i></span><strong class="small" style="width:60px;text-align:end">${i.booked}/${i.seats}</strong></a>`;
  })}` : html`<p class="muted small">لا حصص مجدولة — أضف حصصاً من «حجز التدريب»</p>`;

  // ── الحصص القادمة (مجمّعة حسب اليوم) ──
  const byDay = {};
  for (const sl of s.slots) (byDay[sl.date] ||= []).push(sl);
  const slotsView = Object.keys(byDay).length ? html`${Object.keys(byDay).slice(0, 7).map((dte) => html`<div class="dash-day"><div class="small muted" style="margin-bottom:4px">${dte}</div><div class="dash-chips">${byDay[dte].map((sl) => {
    const full = sl.booked >= sl.capacity;
    return html`<a class="dash-chip ${full ? 'is-full' : ''}" href="/admin/bookings" data-tip="${sl.instructor || '—'} — ${HOUR_LBL[sl.hour] || sl.hour}${sl.location ? ' — ' + sl.location : ''}: ${sl.booked}/${sl.capacity}${sl.pending ? ' · ' + sl.pending + ' معلّق' : ''}"><b>${HOUR_LBL[sl.hour] || sl.hour}</b><span class="small">${sl.instructor || '—'}</span>${sl.location ? html`<span class="small muted">📍 ${sl.location}</span>` : ''}<span class="small">${sl.booked}/${sl.capacity}</span></a>`;
  })}</div></div>`)}` : html`<p class="muted small">لا حصص خلال 14 يوماً القادمة</p>`;

  const list = (rows) => rows.length
    ? html`${rows.map((r) => html`<a class="dash-hrow" href="/admin/students/${r.id}" data-tip="${r.name}: ${r.progress}%"><span class="small" style="width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.name}</span><span class="dash-track"><i style="width:${r.progress}%;background:var(--success,#16a34a)"></i></span><strong class="small" style="width:40px;text-align:end">${r.progress}%</strong></a>`)}`
    : html`<p class="muted small">${t('common.none')}</p>`;

  shell(root, '/admin', { action: html`<div class="dash-seg" role="group" aria-label="period">${[7, 30, 90].map((d) => html`<button type="button" class="${d === s.days ? 'on' : ''}" data-days="${d}">${d} يوم</button>`)}</div>`, content: html`
    <div class="dash-kpis">
      ${kpi('🎓', 'المتعلمون', s.students.active, `${s.students.total} إجمالاً · ${s.students.suspended} موقوف · ${s.students.archived} مؤرشف`, '/admin/school/students')}
      ${kpi('🧑‍🏫', 'المدربون', s.instructors.active, `${s.instructors.total} إجمالاً`, '/admin/school/instructors')}
      ${kpi('📈', 'متوسط التقدم', `${s.avgProgress}%`, `${s.ready} جاهز للامتحان`, '/admin/school/students')}
      ${kpi('📝', 'نجاح الامتحانات', `${rate}%`, `${s.exams.passed}/${s.exams.total}`, '/admin/exams')}
      ${kpi('🟢', 'متعلمون الآن', s.activeNow ?? 0, `${s.activeNowPct ?? 0}% من إجمالي المتعلمين`, '/admin/school/students')}
      ${kpi('📅', 'حصص قادمة مقبولة', s.upcoming, '', '/admin/bookings')}
      ${kpi('⏳', 'طلبات معلقة', bk.pending || 0, 'تحتاج قراراً', '/admin/bookings')}
      ${kpi('📡', 'الحصص الجماعية المباشرة', '', 'إنشاء وإدارة الحصص', '/admin/live')}
    </div>
    <div class="grid grid-2" style="margin-top:20px">
      <div class="card"><h3 class="dash-h">📝 الامتحانات حسب اليوم <span class="small muted">(آخر ${s.days} يوماً)</span></h3>${examChart}
        <div class="small muted" style="margin-top:8px"><span class="dash-dot" style="background:var(--success,#16a34a)"></span> ناجح <span class="dash-dot" style="background:var(--danger,#dc2626)"></span> راسب</div></div>
      <div class="card"><h3 class="dash-h">📊 توزيع تقدم المتعلمين</h3>${progChart}</div>
      <div class="card"><h3 class="dash-h">🧑‍🏫 إشغال المدربين <span class="small muted">(14 يوماً القادمة)</span></h3>${loadChart}</div>
      <div class="card"><h3 class="dash-h">📅 حالة الحجوزات <span class="small muted">(اضغط للإخفاء/الإظهار)</span></h3>
        <div class="dash-stack" id="bk-stack"></div><div class="dash-legend" id="bk-legend"></div></div>
    </div>
    <div class="card" style="margin-top:20px"><h3 class="dash-h">🗓 الحصص القادمة</h3>${slotsView}</div>
    <div class="grid grid-2" style="margin-top:20px">
      <div class="card"><h3 class="dash-h">🏆 الأعلى تقدماً</h3>${list(s.top)}</div>
      <div class="card"><h3 class="dash-h">⚠️ يحتاجون متابعة</h3>${list(s.lagging)}</div>
    </div>
    <div id="dash-tip" class="dash-tip" hidden></div>` });

  // الفترة
  root.querySelectorAll('[data-days]').forEach((b) => { b.onclick = () => schoolStatsView(root, Number(b.dataset.days)); });

  // أسطورة الحجوزات التفاعلية
  const off = new Set();
  const drawBk = () => {
    const vis = BK.filter(([k]) => !off.has(k));
    const total = vis.reduce((a, [k]) => a + (bk[k] || 0), 0);
    root.querySelector('#bk-stack').innerHTML = total
      ? vis.map(([k, l, c]) => (bk[k] ? `<i data-tip="${l}: ${bk[k]}" style="flex:${bk[k]};background:${c}"></i>` : '')).join('')
      : '<span class="small muted" style="padding:6px">لا حجوزات</span>';
    root.querySelector('#bk-legend').innerHTML = BK.map(([k, l, c]) =>
      `<button type="button" class="dash-lg ${off.has(k) ? 'off' : ''}" data-k="${k}"><span class="dash-dot" style="background:${c}"></span>${l} <b>${bk[k] || 0}</b></button>`).join('');
    root.querySelectorAll('#bk-legend [data-k]').forEach((b) => { b.onclick = () => { off.has(b.dataset.k) ? off.delete(b.dataset.k) : off.add(b.dataset.k); drawBk(); }; });
  };
  drawBk();

  // تلميحات عند التمرير/اللمس
  const tip = root.querySelector('#dash-tip');
  const show = (e) => {
    const el = e.target.closest('[data-tip]');
    if (!el) { tip.hidden = true; return; }
    tip.textContent = el.dataset.tip; tip.hidden = false;
    const x = Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, e.clientX + 12));
    tip.style.left = `${x}px`; tip.style.top = `${e.clientY + 16}px`;
  };
  root.addEventListener('mousemove', show);
  root.addEventListener('mouseleave', () => { tip.hidden = true; });
}

// ── صفحة طلبات الانتساب (school/admin) ────────────────────────────────────────
export async function enrollmentsView(root) {
  const { html, toast, errorMessage } = await import('../ui.js');
  const { t } = await import('../i18n.js');
  const { api } = await import('../api.js');

  root.innerHTML = html`
    <div style="padding:20px">
      <h2 style="margin:0 0 4px">${t('school.enrollments')}</h2>
      <p class="muted small" style="margin:0 0 20px">${t('auth.enrollHint')}</p>
      <div id="enroll-list">
        <div class="muted" style="padding:20px;text-align:center">⟳</div>
      </div>
    </div>`.s;

  async function load() {
    const rows = await api.get('/admin/school/enrollments');
    const box = root.querySelector('#enroll-list');
    if (!rows.length) {
      box.innerHTML = `<p class="muted" style="text-align:center;padding:32px">${t('school.enrollments.empty')}</p>`;
      return;
    }
    const statusColor = { pending: 'var(--orange-500)', approved: 'var(--green-600)', rejected: 'var(--red-600)' };
    const statusLabel = { pending: t('auth.enrollPending'), approved: t('auth.enrollApproved'), rejected: t('auth.enrollRejected') };

    box.innerHTML = html`
      <table class="rtable">
        <thead><tr>
          <th>${t('admin.name')}</th><th>${t('auth.email')}</th>
          <th>${t('auth.phone')}</th><th>${t('auth.city')}</th>
          <th>الحالة</th><th>التاريخ</th><th>${t('common.actions')}</th>
        </tr></thead>
        <tbody>
          ${rows.map((r) => `<tr data-id="${r.id}" data-status="${r.status}">
            <td data-label="${t('admin.name')}">${r.name || '—'}</td>
            <td data-label="${t('auth.email')}">${r.email || '—'}</td>
            <td data-label="${t('auth.phone')}">${r.phone || '—'}</td>
            <td data-label="${t('auth.city')}">${r.city || '—'}</td>
            <td data-label="الحالة"><span style="color:${statusColor[r.status] || 'var(--muted)'}">${statusLabel[r.status] || r.status}</span></td>
            <td data-label="التاريخ" style="font-size:.8rem">${r.created_at ? r.created_at.slice(0,10) : '—'}</td>
            <td data-label="${t('common.actions')}">
              ${r.status === 'pending' ? `
                <button class="btn btn-sm btn-primary" data-action="approved">✓ قبول</button>
                <button class="btn btn-sm" style="background:var(--red-100);color:var(--red-700);border:none;margin-inline-start:6px" data-action="rejected">✕ رفض</button>
              ` : `<span class="small muted">—</span>`}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`.s;

    // أزرار القبول/الرفض
    box.querySelectorAll('[data-action]').forEach((btn) => {
      btn.onclick = async () => {
        const row = btn.closest('tr');
        const id = row.dataset.id;
        const action = btn.dataset.action;
        btn.disabled = true;
        try {
          await api.patch(`/admin/school/enrollments/${id}`, { action });
          toast(action === 'approved' ? '✅ تم قبول الطلب' : '✕ تم رفض الطلب');
          await load();
        } catch (ex) {
          toast(errorMessage(ex), 'error');
          btn.disabled = false;
        }
      };
    });
  }

  load().catch((ex) => {
    root.querySelector('#enroll-list').innerHTML = `<p class="form-error" style="display:block">${errorMessage(ex)}</p>`;
  });
}
