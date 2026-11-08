/**
 * واجهة حجز حصص التدريب التطبيقي
 *   /bookings        — المتعلم: تقويم الحجز
 *   /admin/bookings  — المدرب/الأدمن: إدارة الحجوزات
 */
import { html, raw, loading, toast, errorMessage, confirmDialog } from '../ui.js';
import { t } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';

const SLOT_HOURS = [9, 11, 15, 17];

function hourLabel(h) {
  if (h === 9)  return '9:00 ص';
  if (h === 11) return '11:00 ص';
  if (h === 15) return '3:00 م';
  if (h === 17) return '5:00 م';
  return `${h}:00`;
}

function dateRange(daysAhead = 30) {
  const from = new Date().toISOString().slice(0, 10);
  const to   = new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

function statusPill(status) {
  const map = {
    pending:     { cls: 'pill-warning', label: t('booking.pending') },
    approved:    { cls: 'pill-success', label: t('booking.approved') },
    rejected:    { cls: 'pill-danger',  label: t('booking.rejected') },
    cancelled:   { cls: 'pill',         label: t('booking.cancelled') },
    rescheduled: { cls: 'pill-info',    label: t('booking.rescheduled') },
  };
  const s = map[status] || { cls: 'pill', label: status };
  return html`<span class="pill ${s.cls}">${s.label}</span>`;
}

/* ══════════════════════════════════════════════════════════════════════
   واجهة المتعلم — تقويم الحجز
   ══════════════════════════════════════════════════════════════════════ */
export async function bookingsView(root) {
  root.innerHTML = loading().s;
  try {
    const { from, to } = dateRange(21);
    const [slots, myData] = await Promise.all([
      api.get(`/bookings/slots?from=${from}&to=${to}`),
      api.get('/bookings/my'),
    ]);
    renderStudentBookings(root, slots, myData, from, to);
  } catch (err) {
    root.innerHTML = html`<div class="empty"><p>${errorMessage(err)}</p></div>`.s;
  }
}

function renderStudentBookings(root, slots, myBookings, from, to) {
  // نجمّع الحصص حسب التاريخ
  const byDate = {};
  for (const s of slots) {
    if (!byDate[s.slot_date]) byDate[s.slot_date] = [];
    byDate[s.slot_date].push(s);
  }
  const dates = Object.keys(byDate).sort();

  // خريطة حجوزاتي الحالية
  const myMap = new Map(myBookings.map((b) => [b.slot_id, b]));

  root.innerHTML = html`
    <div class="page-head">
      <div>
        <h1>📅 ${t('booking.title')}</h1>
        <p class="muted small">${t('booking.subtitle')}</p>
      </div>
    </div>

    <!-- إشعاراتي -->
    <div id="notif-banner"></div>

    <!-- حجوزاتي الحالية -->
    ${myBookings.filter((b) => ['pending','approved','rescheduled'].includes(b.status)).length > 0 ? html`
    <div class="card stack" style="margin-bottom:20px">
      <h2 style="margin:0 0 12px">${t('booking.myBookings')}</h2>
      <div class="stack" style="gap:10px">
        ${myBookings.filter((b) => ['pending','approved','rescheduled'].includes(b.status)).map((b) => html`
        <div class="card" style="padding:14px 16px;border-inline-start:4px solid var(--${b.status==='approved'?'success':'warning'})">
          <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
            <div>
              <strong>${b.slot_date} — ${hourLabel(b.slot_hour)}</strong>
              <div class="small muted">${statusPill(b.status)} ${b.instructor_name ? html` — 🧑‍🏫 ${b.instructor_name}` : ''} ${b.note ? html` — ${b.note}` : ''}</div>
            </div>
            <button class="btn btn-secondary btn-sm booking-cancel-btn" data-id="${b.id}">${t('booking.cancel')}</button>
          </div>
        </div>`)}
      </div>
    </div>` : ''}

    <!-- تقويم الحصص -->
    <div class="stack" style="gap:20px">
      ${dates.length === 0 ? html`<div class="empty"><div class="big">📅</div><p>${t('booking.noSlots')}</p></div>` :
        dates.map((date) => html`
        <div class="card">
          <h3 style="margin:0 0 14px;font-size:1rem">${formatDate(date)}</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">
            ${byDate[date].map((slot) => renderSlotCard(slot, slot.slot_hour, date, myMap.get(slot.id)))}
          </div>
        </div>`
      )}
    </div>`.s;

  // أحداث الإلغاء
  root.querySelectorAll('.booking-cancel-btn').forEach((btn) => {
    btn.onclick = async () => {
      if (!(await confirmDialog(t('booking.confirmCancel')))) return;
      try {
        await api.del(`/bookings/${btn.dataset.id}`);
        toast(t('booking.cancelled'));
        await bookingsView(root);
      } catch (err) { toast(errorMessage(err), 'error'); }
    };
  });

  // أحداث الحجز
  root.querySelectorAll('.book-btn').forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await api.post('/bookings', { slotId: Number(btn.dataset.slot) });
        toast(t('booking.requested'));
        await bookingsView(root);
      } catch (err) {
        btn.disabled = false;
        const code = err?.code;
        if (code === 'slot_full') toast(t('booking.slotFull'), 'error');
        else if (code === 'already_booked') toast(t('booking.alreadyBooked'), 'error');
        else toast(errorMessage(err), 'error');
      }
    };
  });

  // تحميل الإشعارات
  loadNotifBanner(root.querySelector('#notif-banner'));
}

function renderSlotCard(slot, hour, date, myBooking) {
  const label = hourLabel(hour);
  if (!slot) {
    // الحصة غير متاحة
    return html`
    <div style="border:1.5px dashed var(--border);border-radius:12px;padding:14px;opacity:.45;text-align:center">
      <div style="font-size:1.2rem">🚫</div>
      <div style="font-weight:700;font-size:.9rem;margin:4px 0">${label}</div>
      <div class="small muted">${t('booking.unavailable')}</div>
    </div>`;
  }

  const full = slot.available <= 0;
  const hasMyPending = myBooking && myBooking.status === 'pending';
  const hasMyApproved = myBooking && ['approved', 'rescheduled'].includes(myBooking.status);

  let cardBorder = 'var(--border)';
  let statusBadge = '';
  let action = '';

  if (hasMyApproved) {
    cardBorder = 'var(--success)';
    statusBadge = html`<span class="pill pill-success" style="font-size:.72rem">${t('booking.approved')}</span>`;
    action = html`<div class="small" style="color:var(--success);font-weight:700;margin-top:8px">✅ ${t('booking.youAreBooked')}</div>`;
  } else if (hasMyPending) {
    cardBorder = 'var(--warning)';
    statusBadge = html`<span class="pill pill-warning" style="font-size:.72rem">${t('booking.pending')}</span>`;
    action = html`<div class="small muted" style="margin-top:8px">⏳ ${t('booking.waitingApproval')}</div>`;
  } else if (full) {
    action = html`<button class="btn btn-secondary btn-sm w-full" disabled style="margin-top:8px">${t('booking.full')}</button>`;
  } else {
    action = html`<button class="btn btn-primary btn-sm w-full book-btn" data-slot="${slot.id}" style="margin-top:8px">${t('booking.book')}</button>`;
  }

  return html`
  <div style="border:1.5px solid ${raw(cardBorder)};border-radius:12px;padding:14px;transition:box-shadow .15s">
    <div class="row" style="justify-content:space-between;margin-bottom:6px">
      <strong style="font-size:.95rem">${label}</strong>
      ${statusBadge}
    </div>
    ${slot.instructor_name ? html`<div class="small" style="margin-bottom:2px">🧑‍🏫 ${slot.instructor_name}</div>` : ''}
    <div class="small muted">${t('booking.seats')}: ${slot.available}/${slot.capacity}</div>
    <div style="height:5px;background:var(--surface-2);border-radius:999px;margin:8px 0;overflow:hidden">
      <div style="height:100%;background:${raw(full?'var(--danger)':'var(--primary)')};width:${raw(Math.round((1-(slot.available/slot.capacity))*100))}%;border-radius:999px;transition:width .4s"></div>
    </div>
    ${action}
  </div>`;
}

async function loadNotifBanner(el) {
  if (!el) return;
  try {
    const { notifications, unread } = await api.get('/bookings/notifications');
    if (unread === 0 || notifications.length === 0) return;
    const recent = notifications.filter((n) => !n.read).slice(0, 3);
    el.innerHTML = html`
    <div class="card" style="margin-bottom:16px;border-color:var(--primary);background:var(--primary-soft)">
      <div class="row" style="justify-content:space-between;margin-bottom:10px">
        <strong style="color:var(--primary)">🔔 ${t('booking.notifications')} (${unread})</strong>
        <button class="btn btn-ghost btn-sm" id="mark-read-btn">${t('booking.markRead')}</button>
      </div>
      <div class="stack" style="gap:6px">
        ${recent.map((n) => html`
        <div style="font-size:.88rem;padding:8px 12px;background:var(--surface);border-radius:8px;border:1px solid var(--border)">
          ${n.message}
        </div>`)}
      </div>
    </div>`.s;
    el.querySelector('#mark-read-btn')?.addEventListener('click', async () => {
      await api.patch('/bookings/notifications/read');
      el.innerHTML = '';
    });
  } catch { /* ignore */ }
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('ar-MA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

/* ══════════════════════════════════════════════════════════════════════
   واجهة المدرب/الأدمن — إدارة الحجوزات
   ══════════════════════════════════════════════════════════════════════ */
export async function adminBookingsView(root) {
  root.innerHTML = loading().s;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const toDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const [slots, bookingsRes] = await Promise.all([
      api.get(`/bookings/slots?from=${today}&to=${toDate}`),
      api.get('/bookings'),
    ]);
    const bookings = bookingsRes.bookings ?? bookingsRes;
    const canManage = bookingsRes.canManage !== false;
    renderAdminBookings(root, slots, bookings, today, toDate, canManage);
  } catch (err) {
    root.innerHTML = html`<div class="empty"><p>${errorMessage(err)}</p></div>`.s;
  }
}

let bkFilter = 'active';

function renderAdminBookings(root, slots, bookingsAll, today, toDate, canManage = true) {
  const shownBookings = bookingsAll.filter((b) => bkFilter === 'all' || (bkFilter === 'pending' ? b.status === 'pending' : ['pending', 'approved', 'rescheduled'].includes(b.status)));
  const knownInstructors = [...new Set(bookingsAll.map((b) => b.instructor_name).filter(Boolean))];
  root.innerHTML = html`
  <div class="page-head">
    <div><h1>📅 ${t('booking.adminTitle')}</h1></div>
    ${canManage ? html`<div class="row" style="gap:8px">
      <button class="btn btn-primary" id="add-slot-btn">+ ${t('booking.addSlot')}</button>
    </div>` : ''}
  </div>

  <!-- طلبات الحجز -->
  <div class="card" style="margin-bottom:20px">
    <div class="row" style="margin-bottom:12px;gap:8px;flex-wrap:wrap">
      <h2 style="margin:0;font-size:1rem">${t('booking.requests')} (${bookingsAll.length})</h2>
      <span class="spacer"></span>
      <select id="bk-filter" class="input" style="width:auto" aria-label="${t('admin.status')}">
        <option value="active" ${bkFilter === 'active' ? raw('selected') : ''}>${t('booking.filterActive')}</option>
        <option value="pending" ${bkFilter === 'pending' ? raw('selected') : ''}>${t('booking.pending')}</option>
        <option value="all" ${bkFilter === 'all' ? raw('selected') : ''}>${t('booking.filterAll')}</option>
      </select>
    </div>
    <div class="table-wrap" style="overflow:auto">
    <table class="table list-table">
      <thead><tr><th>${t('booking.student')}</th><th>${t('booking.slot')}</th><th>${t('booking.instructor')}</th><th>${t('admin.status')}</th><th>${t('booking.action')}</th></tr></thead>
      <tbody>
        ${shownBookings.length === 0 ? html`<tr><td colspan="5" class="muted">${t('booking.noPending')}</td></tr>` : shownBookings.map((b) => {
          const live = ['pending', 'approved', 'rescheduled'].includes(b.status);
          const btn = (act, icon, label, cls = '') => html`<button class="act-btn ${cls} review-btn" type="button" data-id="${b.id}" data-action="${act}" data-instr="${b.instructor_name || ''}" title="${label}"><span aria-hidden="true">${icon}</span><span class="act-lbl">${label}</span></button>`;
          return html`
        <tr style="${live ? '' : 'opacity:.6'}">
          <td><strong>${b.student_name}</strong><br><span class="small muted">${b.student_email}</span></td>
          <td>${b.slot_date} — ${hourLabel(b.slot_hour)}</td>
          <td>${b.instructor_name || html`<span class="muted">—</span>`}</td>
          <td>${statusPill(b.status)}</td>
          <td>${canManage && live ? html`<div class="act-row">
            ${b.status === 'pending' ? btn('approved', '✅', t('booking.approve')) : ''}
            ${btn('rescheduled', '📅', t('booking.reschedule'))}
            ${b.status === 'pending' ? btn('rejected', '❌', t('booking.reject')) : ''}
            ${btn('cancelled', '🚫', t('booking.cancelBooking'), 'act-danger')}
          </div>` : ''}</td>
        </tr>`; })}
      </tbody>
    </table>
    </div>
  </div>

  <!-- جدول الحصص -->
  <div class="card">
    <h2 style="margin:0 0 14px;font-size:1rem">${t('booking.upcomingSlots')}</h2>
    <div class="table-wrap">
    <table>
      <thead><tr><th>${t('booking.date')}</th><th>${t('booking.hour')}</th><th>${t('booking.instructor')}</th><th>${t('booking.booked')}</th><th>${t('booking.attendees')}</th><th>${canManage ? t('common.actions') : ''}</th></tr></thead>
      <tbody>
        ${slots.length === 0 ? html`<tr><td colspan="6" class="text-center muted">${t('booking.noSlots')}</td></tr>` :
          slots.map((s) => html`
          <tr>
            <td>${formatDate(s.slot_date)}</td>
            <td><strong>${hourLabel(s.slot_hour)}</strong></td>
            <td>${s.instructor_name || html`<span class="muted">—</span>`}</td>
            <td>
              <div style="display:flex;align-items:center;gap:8px">
                <div style="width:60px;height:6px;background:var(--surface-2);border-radius:999px;overflow:hidden">
                  <div style="height:100%;background:var(--primary);width:${raw(Math.round((s.booked/s.capacity)*100))}%;border-radius:999px"></div>
                </div>
                <span class="small">${s.booked}/${s.capacity}</span>
              </div>
            </td>
            <td>
              ${(s.attendees||[]).length === 0
                ? html`<span class="muted small">${t('booking.empty')}</span>`
                : html`<div class="stack" style="gap:3px">${(s.attendees||[]).map((a) => html`
                  <span class="small">${a.name} ${statusPill(a.status)}</span>`)}</div>`}
            </td>
            <td>${canManage ? html`<div class="act-row">
              <button class="act-btn slot-edit-btn" type="button" data-slot="${s.id}" data-cap="${s.capacity}" data-booked="${s.booked}" title="${t('booking.editSeats')}"><span aria-hidden="true">✏️</span><span class="act-lbl">${t('booking.editSeats')}</span></button>
              <button class="act-btn act-danger slot-del-btn" type="button" data-slot="${s.id}" title="${t('common.delete')}"><span aria-hidden="true">🗑</span><span class="act-lbl">${t('common.delete')}</span></button>
            </div>` : ''}</td>
          </tr>`)}
      </tbody>
    </table>
    </div>
  </div>

  <!-- مودال الإجراء -->
  <div id="review-modal"></div>
  <div id="slot-modal"></div>`.s;

  // زر إضافة حصة (مؤسسة/أدمين فقط)
  if (canManage) root.querySelector('#add-slot-btn')?.addEventListener('click', () => showSlotModal(root.querySelector('#slot-modal'), root));

  // أزرار الموافقة/الرفض/إعادة الجدولة
  root.querySelectorAll('.review-btn').forEach((btn) => {
    btn.onclick = () => showReviewModal(root.querySelector('#review-modal'), btn.dataset.id, btn.dataset.action, root, btn.dataset.instr || '', []);
  });
  const flt = root.querySelector('#bk-filter');
  if (flt) flt.onchange = () => { bkFilter = flt.value; renderAdminBookings(root, slots, bookingsAll, today, toDate, canManage); };

  // تعديل عدد المقاعد / حذف الحصة
  root.querySelectorAll('.slot-edit-btn').forEach((btn) => {
    btn.onclick = () => showSlotModal(root.querySelector('#slot-modal'), root, { id: btn.dataset.slot, capacity: Number(btn.dataset.cap) });
  });
  root.querySelectorAll('.slot-del-btn').forEach((btn) => {
    btn.onclick = async () => {
      if (!(await confirmDialog(t('admin.confirmDelete'), { danger: true }))) return;
      try { await api.del(`/bookings/slots/${btn.dataset.slot}`); toast(t('common.saved')); await adminBookingsView(root); }
      catch (err) { toast(errorMessage(err), 'error'); }
    };
  });
}

function showReviewModal(container, bookingId, action, root, currentInstructor = '', knownInstructors = []) {
  const actionLabel = { approved: t('booking.approve'), rejected: t('booking.reject'), rescheduled: t('booking.reschedule'), cancelled: t('booking.cancelBooking'), instructor: t('booking.assignInstructor') }[action];
  const needsSlot = action === 'rescheduled';
  const needsNote = true;

  container.innerHTML = html`
  <div class="booking-modal-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="background:var(--surface);border-radius:16px;max-width:480px;width:100%;padding:24px">
      <h2 style="margin:0 0 16px">${actionLabel}</h2>
      ${needsSlot ? html`
      <div class="field">
        <label>${t('booking.newSlot')}</label>
        <select id="new-slot-sel" style="width:100%">
          <option value="">${t('booking.selectSlot')}</option>
        </select>
      </div>` : ''}
      ${needsNote ? html`
      <div class="field">
        <label>${t('booking.note')} <span class="muted small">(${t('common.optional')})</span></label>
        <textarea id="review-note" rows="3" style="width:100%;border-radius:8px;border:1.5px solid var(--border);padding:10px;font:inherit"></textarea>
      </div>` : ''}
      <div class="row" style="justify-content:flex-end;gap:8px;margin-top:16px">
        <button class="btn btn-secondary" id="modal-cancel">${t('common.cancel')}</button>
        <button class="btn ${action === 'cancelled' || action === 'rejected' ? 'btn-danger' : 'btn-primary'}" id="modal-confirm">${actionLabel}</button>
      </div>
    </div>
  </div>`.s;

  if (needsSlot) {
    const { from, to } = dateRange(30);
    api.get(`/bookings/slots?from=${from}&to=${to}`).then((slots) => {
      const sel = container.querySelector('#new-slot-sel');
      for (const s of slots.filter((s) => s.available > 0)) {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${formatDate(s.slot_date)} — ${hourLabel(s.slot_hour)}${s.instructor_name ? ' — ' + s.instructor_name : ''} (${s.available} ${t('booking.available')})`;
        sel.appendChild(opt);
      }
    }).catch(() => {});
  }

  container.querySelector('#modal-cancel').onclick = () => { container.innerHTML = ''; };
  container.querySelector('#modal-confirm').onclick = async () => {
    const note = needsNote ? container.querySelector('#review-note').value.trim() : '';
    const newSlotId = needsSlot ? container.querySelector('#new-slot-sel').value : undefined;
    if (needsSlot && !newSlotId) { toast(t('booking.selectSlot'), 'error'); return; }
    const body = {};
    body.status = action;
    if (note) body.note = note;
    if (newSlotId) body.newSlotId = Number(newSlotId);
    try {
      await api.patch(`/bookings/${bookingId}`, body);
      toast(t('common.saved'));
      container.innerHTML = '';
      await adminBookingsView(root);
    } catch (err) { toast(errorMessage(err), 'error'); }
  };
}

async function showSlotModal(container, root, edit = null) {
  const today = new Date().toISOString().slice(0, 10);
  let instructors = [];
  if (!edit) {
    try { instructors = (await api.get('/admin/school/instructors')).filter((i) => i.active && !i.archived); }
    catch (err) { toast(errorMessage(err), 'error'); return; }
    if (!instructors.length) { toast(t('booking.noInstructors'), 'error'); return; }
  }
  container.innerHTML = html`
  <div class="booking-modal-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="background:var(--surface);border-radius:16px;max-width:400px;width:100%;padding:24px">
      <h2 style="margin:0 0 16px">${edit ? t('booking.editSeats') : '+ ' + t('booking.addSlot')}</h2>
      ${edit ? '' : html`
      <div class="field">
        <label>${t('booking.instructor')}</label>
        <select id="slot-instr" style="width:100%">${instructors.map((i) => html`<option value="${i.id}">${i.name}</option>`)}</select>
      </div>
      <div class="field">
        <label>${t('booking.date')}</label>
        <input type="date" id="slot-date" min="${today}" value="${today}" style="width:100%">
      </div>
      <div class="field">
        <label>${t('booking.hour')}</label>
        <select id="slot-hour" style="width:100%">
          ${SLOT_HOURS.map((h) => html`<option value="${h}">${hourLabel(h)}</option>`)}
        </select>
      </div>`}
      <div class="field">
        <label>${t('booking.seatsPerInstructor')} (1–12)</label>
        <input type="number" id="slot-cap" min="1" max="12" value="${edit ? edit.capacity : 3}" style="width:100%">
        <p class="small muted" style="margin:4px 0 0">${t('booking.dayLimitHint')}</p>
      </div>
      <div class="row" style="justify-content:flex-end;gap:8px;margin-top:16px">
        <button class="btn btn-secondary" id="slot-cancel">${t('common.cancel')}</button>
        <button class="btn btn-primary" id="slot-confirm">${edit ? t('common.save') : '+ ' + t('booking.addSlot')}</button>
      </div>
    </div>
  </div>`.s;

  container.querySelector('#slot-cancel').onclick = () => { container.innerHTML = ''; };
  container.querySelector('#slot-confirm').onclick = async () => {
    const capacity = Number(container.querySelector('#slot-cap').value);
    try {
      if (edit) await api.patch(`/bookings/slots/${edit.id}`, { capacity });
      else {
        await api.post('/bookings/slots', {
          date: container.querySelector('#slot-date').value,
          hour: Number(container.querySelector('#slot-hour').value),
          instructorId: Number(container.querySelector('#slot-instr').value),
          capacity,
        });
      }
      toast(t('common.saved'));
      container.innerHTML = '';
      await adminBookingsView(root);
    } catch (err) { toast(errorMessage(err), 'error'); }
  };
}
