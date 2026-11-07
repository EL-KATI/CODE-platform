'use strict';
/**
 * حجوزات حصص التدريب التطبيقي
 *   GET  /api/bookings/slots?from=YYYY-MM-DD&to=YYYY-MM-DD  — قائمة الحصص (مع عدد الحجوزات)
 *   POST /api/bookings/slots                                 — إنشاء حصة (مدرب/أدمن فقط)
 *   POST /api/bookings                                       — حجز حصة (متعلم)
 *   GET  /api/bookings/my                                    — حجوزاتي (متعلم)
 *   GET  /api/bookings                                       — كل الحجوزات (مدرب/أدمن)
 *   PATCH /api/bookings/:id                                  — تعديل الحالة (مدرب/أدمن)
 *   DELETE /api/bookings/:id                                 — إلغاء (متعلم — حجزه فقط)
 *   GET  /api/bookings/notifications                         — إشعاراتي
 *   PATCH /api/bookings/notifications/read                   — تعليم الإشعارات مقروءة
 */

const express = require('express');
const db = require('../db');
const auth = require('../auth');
const { wrap, int, bad, notFound } = require('../http');

const router = express.Router();
router.use(auth.requireRole('student', 'instructor', 'admin'));

const ALLOWED_HOURS = [9, 11, 15, 17];
const STATUSES = ['pending', 'approved', 'rejected', 'cancelled', 'rescheduled'];

/* ── أدوات مساعدة ─────────────────────────────────────────────────────── */
function addNotification(bookingId, userId, type, message) {
  db.get().prepare(`INSERT INTO booking_notifications (booking_id, user_id, type, message)
    VALUES (?,?,?,?)`).run(bookingId, userId, type, message);
}

function notifyStudent(booking, type, messageAr) {
  addNotification(booking.id, booking.student_id, type, messageAr);
}

function notifyStaff(booking, type, messageAr) {
  // نُشعر كل المدربين والأدمنز
  const staff = db.get().prepare(`SELECT id FROM users WHERE role IN ('instructor','admin') AND active = 1`).all();
  for (const u of staff) addNotification(booking.id, u.id, type, messageAr);
}

function slotLabel(slot) {
  const h = slot.slot_hour;
  const period = h < 12 ? 'ص' : 'م';
  const display = h <= 12 ? h : h - 12;
  return `${slot.slot_date} — ${display}:00 ${period}`;
}

function bookingWithSlot(id) {
  return db.get().prepare(`
    SELECT b.*, s.slot_date, s.slot_hour, s.capacity,
           u.name AS student_name, u.email AS student_email
    FROM training_bookings b
    JOIN training_slots s ON s.id = b.slot_id
    JOIN users u ON u.id = b.student_id
    WHERE b.id = ?
  `).get(id);
}

/* ── قائمة الحصص المتاحة ─────────────────────────────────────────────── */
router.get('/slots', wrap(async (req, res) => {
  // المتعلم غير المرتبط بمدرسة لا يمكنه رؤية الحصص
  if (req.user.role === 'student' && !req.user.school_id) return res.status(403).json({ error: 'forbidden', details: { reason: 'not_enrolled' } });
  const d = db.get();
  const from = req.query.from || new Date().toISOString().slice(0, 10);
  const to = req.query.to || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw bad('invalid_field');

  const slots = d.prepare(`
    SELECT s.*,
           COUNT(b.id) AS booked,
           (s.capacity - COUNT(b.id)) AS available
    FROM training_slots s
    LEFT JOIN training_bookings b ON b.slot_id = s.id
      AND b.status NOT IN ('rejected','cancelled')
    WHERE s.slot_date BETWEEN ? AND ?
    GROUP BY s.id
    ORDER BY s.slot_date, s.slot_hour
  `).all(from, to);

  // للمتعلم: نُضيف حالة حجزه إن وُجد
  if (req.user.role === 'student') {
    const myBookings = new Map(
      d.prepare(`SELECT slot_id, id AS booking_id, status FROM training_bookings WHERE student_id = ?`).all(req.user.id)
        .map((b) => [b.slot_id, b])
    );
    return res.json(slots.map((s) => ({ ...s, myBooking: myBookings.get(s.id) || null })));
  }

  // للمدرب/الأدمن: نُضيف قائمة المتعلمين في كل حصة
  const bookings = d.prepare(`
    SELECT b.slot_id, b.id, b.status, u.name, u.email
    FROM training_bookings b JOIN users u ON u.id = b.student_id
    WHERE b.status NOT IN ('rejected','cancelled')
    ORDER BY b.created_at
  `).all();
  const bySlot = {};
  for (const b of bookings) {
    if (!bySlot[b.slot_id]) bySlot[b.slot_id] = [];
    bySlot[b.slot_id].push(b);
  }
  res.json(slots.map((s) => ({ ...s, attendees: bySlot[s.id] || [] })));
}));

/* ── إنشاء حصة (مدرب/أدمن) ──────────────────────────────────────────── */
router.post('/slots', wrap(async (req, res) => {
  if (req.user.role === 'student') return res.status(403).json({ error: 'forbidden' });
  const { date, hour } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad('invalid_field', { field: 'date' });
  if (!ALLOWED_HOURS.includes(Number(hour))) throw bad('invalid_field', { field: 'hour' });
  const d = db.get();
  const existing = d.prepare('SELECT id FROM training_slots WHERE slot_date = ? AND slot_hour = ?').get(date, Number(hour));
  if (existing) return res.json({ id: existing.id, already_exists: true });
  const info = d.prepare('INSERT INTO training_slots (slot_date, slot_hour) VALUES (?,?)').run(date, Number(hour));
  res.status(201).json({ id: info.lastInsertRowid });
}));

/* ── حجز حصة (متعلم) ────────────────────────────────────────────────── */
router.post('/', wrap(async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'forbidden' });
  // يجب أن يكون المتعلم مرتبطاً بمدرسة قيادة
  if (!req.user.school_id) return res.status(403).json({ error: 'forbidden', details: { reason: 'not_enrolled' } });
  const slotId = int(req.body?.slotId, { min: 1 });
  const d = db.get();

  const slot = d.prepare('SELECT * FROM training_slots WHERE id = ?').get(slotId);
  if (!slot) throw notFound();

  // تحقق من تاريخ الحصة (لا يمكن الحجز في الماضي)
  const slotDate = new Date(`${slot.slot_date}T${String(slot.slot_hour).padStart(2, '0')}:00:00`);
  if (slotDate < new Date()) throw bad('slot_in_past');

  // هل الحصة ممتلئة؟
  const booked = d.prepare(`SELECT COUNT(*) AS n FROM training_bookings WHERE slot_id = ? AND status NOT IN ('rejected','cancelled')`).get(slotId).n;
  if (booked >= slot.capacity) throw bad('slot_full');

  // هل المتعلم حجز بالفعل؟
  const myExisting = d.prepare('SELECT id, status FROM training_bookings WHERE slot_id = ? AND student_id = ?').get(slotId, req.user.id);
  if (myExisting) {
    if (['pending', 'approved'].includes(myExisting.status)) throw bad('already_booked');
    // إعادة الحجز إن كان ملغى أو مرفوض
    d.prepare(`UPDATE training_bookings SET status='pending', note=NULL, reviewed_by=NULL, reviewed_at=NULL,
      updated_at=datetime('now') WHERE id=?`).run(myExisting.id);
    const booking = bookingWithSlot(myExisting.id);
    notifyStaff(booking, 'booking_requested',
      `طلب حجز جديد من ${req.user.name} — ${slotLabel(slot)}`);
    return res.json({ id: myExisting.id, status: 'pending' });
  }

  const info = d.prepare(`INSERT INTO training_bookings (slot_id, student_id) VALUES (?,?)`).run(slotId, req.user.id);
  const booking = bookingWithSlot(info.lastInsertRowid);
  notifyStaff(booking, 'booking_requested',
    `طلب حجز جديد من ${req.user.name} — ${slotLabel(slot)}`);
  res.status(201).json({ id: info.lastInsertRowid, status: 'pending' });
}));

/* ── حجوزاتي (متعلم) ────────────────────────────────────────────────── */
router.get('/my', wrap(async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'forbidden' });
  const list = db.get().prepare(`
    SELECT b.*, s.slot_date, s.slot_hour, s.capacity,
           r.name AS reviewer_name
    FROM training_bookings b
    JOIN training_slots s ON s.id = b.slot_id
    LEFT JOIN users r ON r.id = b.reviewed_by
    WHERE b.student_id = ?
    ORDER BY s.slot_date DESC, s.slot_hour DESC
  `).all(req.user.id);
  res.json(list);
}));

/* ── كل الحجوزات (مدرب/أدمن) ────────────────────────────────────────── */
router.get('/', wrap(async (req, res) => {
  if (req.user.role === 'student') return res.status(403).json({ error: 'forbidden' });
  const { status, date } = req.query;
  let query = `
    SELECT b.*, s.slot_date, s.slot_hour,
           u.name AS student_name, u.email AS student_email,
           r.name AS reviewer_name
    FROM training_bookings b
    JOIN training_slots s ON s.id = b.slot_id
    JOIN users u ON u.id = b.student_id
    LEFT JOIN users r ON r.id = b.reviewed_by
    WHERE 1=1
  `;
  const params = [];
  if (status && STATUSES.includes(status)) { query += ' AND b.status = ?'; params.push(status); }
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) { query += ' AND s.slot_date = ?'; params.push(date); }
  query += ' ORDER BY s.slot_date DESC, s.slot_hour DESC, b.created_at';
  res.json(db.get().prepare(query).all(...params));
}));

/* ── تعديل حالة الحجز (مدرب/أدمن) ──────────────────────────────────── */
router.patch('/:id', wrap(async (req, res) => {
  if (req.user.role === 'student') return res.status(403).json({ error: 'forbidden' });
  const id = int(req.params.id, { min: 1 });
  const d = db.get();
  const booking = bookingWithSlot(id);
  if (!booking) throw notFound();

  const { status, note, newSlotId } = req.body || {};
  if (!STATUSES.includes(status)) throw bad('invalid_field', { field: 'status' });

  let finalSlotId = booking.slot_id;

  // إعادة الجدولة: يجب تقديم slotId جديد
  if (status === 'rescheduled') {
    if (!newSlotId) throw bad('invalid_field', { field: 'newSlotId' });
    const newSlot = d.prepare('SELECT * FROM training_slots WHERE id = ?').get(int(newSlotId, { min: 1 }));
    if (!newSlot) throw bad('invalid_field', { field: 'newSlotId' });
    const booked = d.prepare(`SELECT COUNT(*) AS n FROM training_bookings WHERE slot_id = ? AND id != ? AND status NOT IN ('rejected','cancelled')`).get(newSlot.id, id).n;
    if (booked >= newSlot.capacity) throw bad('slot_full');
    finalSlotId = newSlot.id;
  }

  d.prepare(`UPDATE training_bookings SET status=?, note=?, slot_id=?, reviewed_by=?, reviewed_at=datetime('now'),
    updated_at=datetime('now') WHERE id=?`).run(status, note || null, finalSlotId, req.user.id, id);

  const updated = bookingWithSlot(id);
  const label = slotLabel(updated);

  const msgMap = {
    approved:     `✅ تم الموافقة على حجزك — ${label}`,
    rejected:     `❌ تم رفض حجزك — ${label}${note ? ' — ' + note : ''}`,
    cancelled:    `🚫 تم إلغاء حجزك — ${label}${note ? ' — ' + note : ''}`,
    rescheduled:  `📅 تم تغيير موعد حجزك — ${label}`,
    pending:      `⏳ تمت إعادة حجزك إلى قيد الانتظار`,
  };
  notifyStudent(updated, `booking_${status}`, msgMap[status] || `تم تحديث حجزك`);
  res.json({ ok: true, booking: updated });
}));

/* ── إلغاء الحجز (متعلم) ────────────────────────────────────────────── */
router.delete('/:id', wrap(async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'forbidden' });
  const id = int(req.params.id, { min: 1 });
  const d = db.get();
  const booking = d.prepare('SELECT * FROM training_bookings WHERE id = ? AND student_id = ?').get(id, req.user.id);
  if (!booking) throw notFound();
  if (!['pending', 'approved'].includes(booking.status)) throw bad('cannot_cancel');
  d.prepare(`UPDATE training_bookings SET status='cancelled', updated_at=datetime('now') WHERE id=?`).run(id);
  notifyStaff({ ...booking }, 'booking_cancelled',
    `${req.user.name} ألغى حجزه`);
  res.json({ ok: true });
}));

/* ── إشعاراتي ────────────────────────────────────────────────────────── */
router.get('/notifications', wrap(async (req, res) => {
  const list = db.get().prepare(`
    SELECT n.*, s.slot_date, s.slot_hour
    FROM booking_notifications n
    JOIN training_bookings b ON b.id = n.booking_id
    JOIN training_slots s ON s.id = b.slot_id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
    LIMIT 50
  `).all(req.user.id);
  const unread = db.get().prepare('SELECT COUNT(*) AS n FROM booking_notifications WHERE user_id = ? AND read = 0').get(req.user.id).n;
  res.json({ notifications: list, unread });
}));

/* ── تعليم الإشعارات مقروءة ─────────────────────────────────────────── */
router.patch('/notifications/read', wrap(async (req, res) => {
  db.get().prepare('UPDATE booking_notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
}));

module.exports = router;
