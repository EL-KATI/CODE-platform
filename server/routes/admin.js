'use strict';
/**
 * Back-office.
 *   - moniteur (instructor) : suivi des élèves + gestion du contenu pédagogique
 *   - administrateur (admin) : tout, y compris utilisateurs et paramètres
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const config = require('../config');
const auth = require('../auth');
const progress = require('../services/progress');
const { wrap, str, int, optInt, bad, notFound, EMAIL_RE, HttpError } = require('../http');

const router = express.Router();

/** نفس المؤسسة؟ (school_id قد يكون TEXT في قواعد بيانات قديمة) — بدون مؤسسة = لا */
const sameSchool = (a, b) => a !== null && a !== undefined && a !== '' && b !== null && b !== undefined && b !== '' && Number(a) === Number(b);
/** المؤسسة والمدرب بدون school_id لا يرون أي متعلم (بدل رؤية الجميع) */
const viewerSchool = (req) => (req.user.role === 'admin' ? null : (req.user.school_id || 0));
/** رقم الهوية: أحرف كبيرة بدون فراغات أو شرطات (AB 123-456 → AB123456) */
const normCin = (v) => String(v ?? '').toUpperCase().replace(/[\s-]+/g, '').slice(0, 20);
/** رقم هوية مستعمل من قبل في نفس الدور (متعلم/مدرب) في كل المنصة؟ */
const cinTaken = (d, role, cin, exceptId = 0) => !!d.prepare("SELECT 1 FROM users WHERE role = ? AND cin = ? AND cin <> '' AND id <> ?").get(role, cin, exceptId);
// الوصول للوحة الإدارة: المدرب، المؤسسة، الأدمن
const staff = auth.requireRole('instructor', 'admin', 'school');
const adminOnly = auth.requireRole('admin');
const schoolOrAdmin = auth.requireRole('admin', 'school');
router.use(staff);

/** المدرب والمؤسسة: قراءة فقط للمحتوى التعليمي (أسئلة/سلاسل/دروس). */
function contentReadOnly(req, res, next) {
  if (['instructor', 'school'].includes(req.user.role))
    return res.status(403).json({ error: 'forbidden', details: { reason: 'instructor_readonly' } });
  next();
}
// اسم قديم للتوافق مع الكود الموجود
const instructorReadOnly = contentReadOnly;

const VISUAL_TYPES = ['sign', 'junction', 'driver', 'overtake', 'distance', 'road', 'parking', 'speed', 'dashboard', 'lights', 'mechanic', 'firstaid', 'safety', 'photo'];

// --- Statistiques -------------------------------------------------------------
router.get('/stats', adminOnly, (req, res) => {
  const d = db.get();
  const s = db.getSettings();
  res.json({
    users: d.prepare('SELECT role, COUNT(*) AS n FROM users GROUP BY role').all(),
    newUsers30: d.prepare("SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now','-30 days')").get().n,
    activeUsers7: d.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM attempts WHERE started_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')").get().n,
    activeNow: d.prepare("SELECT COUNT(*) AS n FROM users WHERE active = 1 AND session_id IS NOT NULL AND session_id NOT LIKE 'revoked-%' AND session_id NOT LIKE 'out-%'").get().n,
    attempts30: d.prepare("SELECT mode, COUNT(*) AS n FROM attempts WHERE finished_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days') GROUP BY mode").all(),
    exams: d.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(passed),0) AS passed, AVG(score * 1.0 / total) AS avg FROM attempts WHERE mode = 'exam' AND finished_at IS NOT NULL").get(),
    questions: d.prepare('SELECT status, COUNT(*) AS n FROM questions GROUP BY status').all(),
    coverage: d.prepare(`SELECT c.id, c.name_ar, c.name_fr, c.exam_weight,
        (SELECT COUNT(*) FROM questions q WHERE q.category_id = c.id AND q.status='published') AS published
      FROM categories c ORDER BY c.sort`).all().map((c) => ({ ...c, perExam: c.exam_weight })),
    hardest: d.prepare(`SELECT q.id, q.text, COUNT(*) AS answers, ROUND(100.0 * SUM(aa.is_correct) / COUNT(*)) AS success
      FROM attempt_answers aa JOIN questions q ON q.id = aa.question_id
      GROUP BY q.id HAVING answers >= 5 ORDER BY success ASC LIMIT 10`).all(),
    settings: s,
  });
});

// إحصائيات المؤسسة (متعلموها ومدربوها وحجوزاتها فقط)
router.get('/school/stats', auth.requireRole('school'), (req, res) => {
  const sid = req.user.school_id;
  const d = db.get();
  if (!sid) return res.json(null);
  const one = (sql, ...p) => d.prepare(sql).get(...p);
  const students = one(`SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN archived = 0 AND active = 1 THEN 1 ELSE 0 END),0) AS active,
      COALESCE(SUM(CASE WHEN archived = 0 AND active = 0 THEN 1 ELSE 0 END),0) AS suspended,
      COALESCE(SUM(CASE WHEN archived = 1 THEN 1 ELSE 0 END),0) AS archived
    FROM users WHERE role = 'student' AND school_id = ?`, sid);
  const instructors = one(`SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN archived = 0 AND active = 1 THEN 1 ELSE 0 END),0) AS active
    FROM users WHERE role = 'instructor' AND school_id = ?`, sid);
  const new30 = one("SELECT COUNT(*) AS n FROM users WHERE role = 'student' AND school_id = ? AND created_at >= datetime('now','-30 days')", sid).n;
  const active7 = one(`SELECT COUNT(DISTINCT a.user_id) AS n FROM attempts a JOIN users u ON u.id = a.user_id
    WHERE u.school_id = ? AND u.role = 'student' AND a.started_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')`, sid).n;
  const exams = one(`SELECT COUNT(*) AS total, COALESCE(SUM(a.passed),0) AS passed, AVG(a.score * 1.0 / a.total) AS avg
    FROM attempts a JOIN users u ON u.id = a.user_id
    WHERE u.school_id = ? AND u.role = 'student' AND a.mode = 'exam' AND a.finished_at IS NOT NULL`, sid);
  const bookings = d.prepare(`SELECT b.status, COUNT(*) AS n FROM training_bookings b JOIN users u ON u.id = b.student_id
    WHERE u.school_id = ? GROUP BY b.status`).all(sid);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = one(`SELECT COUNT(*) AS n FROM training_bookings b JOIN training_slots s ON s.id = b.slot_id JOIN users u ON u.id = b.student_id
    WHERE u.school_id = ? AND b.status IN ('approved','rescheduled') AND s.slot_date >= ?`, sid, today).n;
  const rows = d.prepare("SELECT id, name FROM users WHERE role = 'student' AND school_id = ? AND archived = 0 AND active = 1").all(sid);
  const prog = rows.map((r) => { let sc = 0; try { sc = progress.dashboard(r.id).readiness.score || 0; } catch { /* ignore */ } return { id: r.id, name: r.name, progress: sc }; });
  const avgProgress = prog.length ? Math.round(prog.reduce((a, r) => a + r.progress, 0) / prog.length) : 0;
  const ready = prog.filter((r) => r.progress >= 70).length;
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const examsSeries = d.prepare(`SELECT substr(a.finished_at,1,10) AS d, COUNT(*) AS total, COALESCE(SUM(a.passed),0) AS passed
    FROM attempts a JOIN users u ON u.id = a.user_id
    WHERE u.school_id = ? AND u.role = 'student' AND a.mode = 'exam' AND a.finished_at IS NOT NULL
      AND a.finished_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-' || ? || ' days')
    GROUP BY d ORDER BY d`).all(sid, days);
  const horizon = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const slots = d.prepare(`SELECT s.id, s.slot_date AS date, s.slot_hour AS hour, s.capacity, s.location, s.instructor_id, i.name AS instructor,
      (SELECT COUNT(*) FROM training_bookings b WHERE b.slot_id = s.id AND b.status IN ('pending','approved','rescheduled')) AS booked,
      (SELECT COUNT(*) FROM training_bookings b WHERE b.slot_id = s.id AND b.status = 'pending') AS pending
    FROM training_slots s LEFT JOIN users i ON i.id = s.instructor_id
    WHERE s.school_id = ? AND s.slot_date BETWEEN ? AND ? ORDER BY s.slot_date, s.slot_hour, i.name`).all(sid, today, horizon);
  const load = new Map();
  for (const sl of slots) {
    const k = sl.instructor_id;
    if (!load.has(k)) load.set(k, { id: k, name: sl.instructor || '—', seats: 0, booked: 0, slots: 0 });
    const o = load.get(k); o.seats += sl.capacity; o.booked += sl.booked; o.slots += 1;
  }
  const buckets = [0, 0, 0, 0];
  for (const r of prog) buckets[Math.min(3, Math.floor(r.progress / 25))] += 1;
  res.json({
    days, students, instructors, new30, active7, exams, bookings, upcoming, avgProgress, ready,
    examsSeries, slots, instructorLoad: [...load.values()], buckets,
    top: [...prog].sort((a, b) => b.progress - a.progress).slice(0, 5),
    lagging: [...prog].sort((a, b) => a.progress - b.progress).slice(0, 5),
  });
});

// --- Élèves -------------------------------------------------------------------
router.get('/students', (req, res) => {
  const q = `%${(req.query.q || '').toString().slice(0, 80)}%`;
  const d = db.get();
  // المؤسسة والمدرب يريان فقط طلابهم (school_id = school.school_id أو instructor.school_id)
  const viewerSchoolId = viewerSchool(req);
  if (viewerSchoolId === 0) return res.json([]);
  let rows;
  if (viewerSchoolId) {
    rows = d.prepare(`SELECT u.id, u.name, u.email, u.created_at, u.last_login_at, u.exam_date, u.active, u.archived, u.school_id,
        (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.finished_at IS NOT NULL) AS attempts,
        (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.mode='exam' AND a.passed = 1) AS exams_passed,
        (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.mode='exam' AND a.finished_at IS NOT NULL) AS exams,
        (SELECT MAX(a.finished_at) FROM attempts a WHERE a.user_id = u.id) AS last_activity
      FROM users u WHERE u.role = 'student' AND u.school_id = ?
        AND (u.name LIKE ? OR u.email LIKE ?)
      ORDER BY last_activity DESC NULLS LAST, u.id DESC LIMIT 500`).all(viewerSchoolId, q, q);
  } else {
    // الأدمين يرى فقط المترشحين المستقلين (بدون مدرسة)
    rows = d.prepare(`SELECT u.id, u.name, u.email, u.created_at, u.last_login_at, u.exam_date, u.active, u.archived, u.school_id,
        (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.finished_at IS NOT NULL) AS attempts,
        (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.mode='exam' AND a.passed = 1) AS exams_passed,
        (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.mode='exam' AND a.finished_at IS NOT NULL) AS exams,
        (SELECT MAX(a.finished_at) FROM attempts a WHERE a.user_id = u.id) AS last_activity
      FROM users u WHERE u.role = 'student' AND (u.school_id IS NULL OR u.school_id = '')
        AND (u.name LIKE ? OR u.email LIKE ?)
      ORDER BY last_activity DESC NULLS LAST, u.id DESC LIMIT 500`).all(q, q);
  }
  res.json(rows.map((r) => {
    let score = 0;
    try { score = progress.dashboard(r.id).readiness.score || 0; } catch { /* ignore */ }
    return { ...r, progress: score };
  }));
});

// مدربو المؤسسة (المؤسسة فقط ترى مدربيها)
router.get('/school/instructors', schoolOrAdmin, (req, res) => {
  const sid = req.user.role === 'school' ? req.user.school_id : (req.query.school_id || null);
  if (!sid) return res.json([]);
  res.json(db.get().prepare(`SELECT id, name, email, phone, city, active, archived, cin, instructor_categories, created_at, pw_reset_at
    FROM users WHERE role = 'instructor' AND school_id = ? ORDER BY archived, id DESC LIMIT 500`).all(sid));
});

router.get('/students/:id', wrap(async (req, res) => {
  const u = db.get().prepare(
    'SELECT id,email,name,role,locale,exam_date,active,created_at,last_login_at,school_id,cin,gender,first_name_fr,last_name_fr,first_name_ar,last_name_ar,birth_date,birth_place_fr,birth_place_ar,address_fr,address_ar,city,phone,license_cat,narsa_request_num,narsa_status,narsa_date_saisie,narsa_date_cloture,narsa_date_examen,id_type,nationality,license_num,valid_categories,registration_center FROM users WHERE id = ?'
  ).get(int(req.params.id, { min: 1 }));
  if (!u) throw notFound();
  // المؤسسة والمدرب لا يريان إلا طلاب مؤسستهم
  if (req.user.role !== 'admin' && !sameSchool(u.school_id, req.user.school_id)) return res.status(403).json({ error: 'forbidden' });
  res.json({ user: u, dashboard: progress.dashboard(u.id) });
}));

// --- إدارة طلاب المؤسسة (school + admin) ------------------------------------
// (أُزيل POST /school/students: كان يُنشئ متعلماً بدون رقم الهوية ولا تحقق من التكرار — الإضافة عبر POST /users)

// تعديل بيانات طالب (المؤسسة)
router.patch('/school/students/:id', schoolOrAdmin, wrap(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  const d = db.get();
  const u = d.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(id, 'student');
  if (!u) throw notFound();
  if (req.user.role !== 'admin' && !sameSchool(u.school_id, req.user.school_id)) return res.status(403).json({ error: 'forbidden' });
  const b = req.body || {};
  if (b.name) d.prepare('UPDATE users SET name = ? WHERE id = ?').run(str(b.name, { min: 2, max: 80, field: 'name' }), id);
  if (b.active !== undefined) d.prepare('UPDATE users SET active = ? WHERE id = ?').run(b.active ? 1 : 0, id);
  if (b.exam_date !== undefined) d.prepare('UPDATE users SET exam_date = ? WHERE id = ?').run(b.exam_date || null, id);
  db.audit(req.user.id, 'update', 'student', id, b);
  res.json({ ok: true });
}));

// حذف طالب (المؤسسة)
router.delete('/school/students/:id', schoolOrAdmin, wrap(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  const d = db.get();
  const u = d.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(id, 'student');
  if (!u) throw notFound();
  if (req.user.role !== 'admin' && !sameSchool(u.school_id, req.user.school_id)) return res.status(403).json({ error: 'forbidden' });
  d.prepare('DELETE FROM users WHERE id = ?').run(id);
  db.audit(req.user.id, 'delete', 'student', id);
  res.json({ ok: true });
}));

// ── طلبات الانتساب (school_enrollments) ──────────────────────────────────────
// المتعلم يطلب الانتساب لمؤسسة
// POST /api/admin/enroll  { school_id }  (المتعلم نفسه)
router.post('/enroll', auth.requireRole('student'), wrap(async (req, res) => {
  const school_id = int(req.body.school_id, { min: 1 });
  const d = db.get();
  const school = d.prepare("SELECT id FROM users WHERE id = ? AND role = 'school' AND active = 1").get(school_id);
  if (!school) throw notFound();
  // طلب موجود؟
  const existing = d.prepare('SELECT * FROM school_enrollments WHERE student_id = ? AND school_id = ?').get(req.user.id, school_id);
  if (existing) return res.json({ status: existing.status, message: 'already_requested' });
  d.prepare('INSERT INTO school_enrollments (student_id, school_id) VALUES (?,?)').run(req.user.id, school_id);
  db.audit(req.user.id, 'enroll_request', 'school', school_id);
  res.status(201).json({ ok: true, status: 'pending' });
}));

// قائمة طلبات الانتساب المعلقة (المؤسسة ترى طلباتها)
router.get('/school/enrollments', auth.requireRole('school', 'admin'), (req, res) => {
  const d = db.get();
  const sid = req.user.role === 'admin' ? (req.query.school_id || null) : req.user.school_id;
  let rows;
  if (sid) {
    rows = d.prepare(`
      SELECT e.id, e.student_id, e.status, e.created_at, e.reviewed_at,
             u.name, u.email, u.phone, u.city, u.first_name_fr, u.last_name_fr
      FROM school_enrollments e JOIN users u ON u.id = e.student_id
      WHERE e.school_id = ? ORDER BY e.status = 'pending' DESC, e.created_at DESC
    `).all(sid);
  } else {
    rows = d.prepare(`
      SELECT e.id, e.student_id, e.school_id, e.status, e.created_at, e.reviewed_at,
             u.name, u.email, u.phone, s.school_name
      FROM school_enrollments e JOIN users u ON u.id = e.student_id JOIN users s ON s.id = e.school_id
      ORDER BY e.status = 'pending' DESC, e.created_at DESC LIMIT 500
    `).all();
  }
  res.json(rows);
});

// قبول أو رفض طلب انتساب
router.patch('/school/enrollments/:id', auth.requireRole('school', 'admin'), wrap(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  const action = req.body.action; // 'approved' | 'rejected'
  if (!['approved', 'rejected'].includes(action)) throw bad('invalid_action');

  const d = db.get();
  const req_row = d.prepare('SELECT * FROM school_enrollments WHERE id = ?').get(id);
  if (!req_row) throw notFound();

  if (req.user.role !== 'admin' && req.user.school_id != req_row.school_id) {
    return res.status(403).json({ error: 'forbidden' });
  }

  d.transaction(() => {
    d.prepare(`UPDATE school_enrollments SET status=?, reviewed_at=datetime('now'), reviewed_by=? WHERE id=?`)
      .run(action, req.user.id, id);
    if (action === 'approved') {
      // ربط المتعلم بالمؤسسة
      d.prepare('UPDATE users SET school_id=? WHERE id=?').run(req_row.school_id, req_row.student_id);
      // إلغاء الطلبات الأخرى لهذا المتعلم
      d.prepare(`UPDATE school_enrollments SET status='rejected', reviewed_at=datetime('now'), reviewed_by=? WHERE student_id=? AND id!=?`)
        .run(req.user.id, req_row.student_id, id);
    }
  })();

  db.audit(req.user.id, `enroll_${action}`, 'student', req_row.student_id);
  res.json({ ok: true, action });
}));

// المتعلم يرى حالة طلبه
router.get('/enroll/status', auth.requireRole('student'), (req, res) => {
  const rows = db.get().prepare(`
    SELECT e.status, e.created_at, e.reviewed_at, s.school_name, s.id AS school_id
    FROM school_enrollments e JOIN users s ON s.id = e.school_id
    WHERE e.student_id = ? ORDER BY e.created_at DESC
  `).all(req.user.id);
  res.json(rows);
});

// --- Questions ----------------------------------------------------------------
function rowToAdmin(r) {
  return {
    ...r,
    options: JSON.parse(r.options),
    correct: JSON.parse(r.correct),
    visual: r.visual ? JSON.parse(r.visual) : null,
    sub_questions: r.sub_questions ? JSON.parse(r.sub_questions) : null,
  };
}

function validateQuestion(b) {
  const d = db.get();
  const categoryId = int(b.categoryId, { min: 1, field: 'categoryId' });
  if (!d.prepare('SELECT 1 FROM categories WHERE id = ?').get(categoryId)) throw bad('invalid_field', { field: 'categoryId' });
  // --- سؤال منفرد: options + correct ---
  if (!Array.isArray(b.options)) throw bad('invalid_field', { field: 'options' });
  const options = b.options.map((o) => str(o, { min: 1, max: 300, field: 'options' }));
  if (options.length < 2 || options.length > 4) throw bad('options_count');
  if (!Array.isArray(b.correct) || !b.correct.length) throw bad('correct_required');
  const correct = [...new Set(b.correct.map(Number))].sort((x, y) => x - y);
  if (correct.some((c) => !Number.isInteger(c) || c < 1 || c > options.length)) throw bad('invalid_field', { field: 'correct' });

  // --- سؤال مزدوج: sub_questions ---
  const isDouble = b.is_double ? 1 : 0;
  let subQuestions = null;
  if (isDouble) {
    if (!Array.isArray(b.sub_questions) || b.sub_questions.length !== 2) throw bad('invalid_field', { field: 'sub_questions' });
    subQuestions = b.sub_questions.map((sq, si) => {
      if (!Array.isArray(sq.options)) throw bad('invalid_field', { field: `sub_questions[${si}].options` });
      const sqOpts = sq.options.map((o) => str(o, { min: 1, max: 300, field: `sub_questions[${si}].options` }));
      if (sqOpts.length < 2 || sqOpts.length > 4) throw bad('options_count');
      if (!Array.isArray(sq.correct) || !sq.correct.length) throw bad('correct_required');
      const sqCorrect = [...new Set(sq.correct.map(Number))].sort((x, y) => x - y);
      if (sqCorrect.some((c) => !Number.isInteger(c) || c < 1 || c > sqOpts.length)) throw bad('invalid_field', { field: `sub_questions[${si}].correct` });
      return { text: str(sq.text || '', { min: 2, max: 500, field: `sub_questions[${si}].text` }), options: sqOpts, correct: sqCorrect };
    });
  }
  let visual = null;
  if (b.visual && b.visual.type) {
    if (!VISUAL_TYPES.includes(b.visual.type)) throw bad('invalid_field', { field: 'visual' });
    visual = { type: b.visual.type, sub: str(b.visual.sub || '', { max: 60, field: 'visual' }) };
  }
  let image = null;
  if (b.image) {
    image = str(b.image, { max: 500, field: 'image' });
    if (!/^(\/uploads\/[\w.-]+|\/assets\/[\w./-]+|https:\/\/[^\s"'<>]+)$/.test(image)) throw bad('invalid_field', { field: 'image' });
  }
  let video = null;
  if (b.video) {
    const raw = str(b.video, { max: 500, field: 'video' });
    const yt = /^https:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|embed\/|shorts\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([\w-]{11})/.exec(raw);
    if (yt) video = `https://www.youtube-nocookie.com/embed/${yt[1]}`;
    else if (/^(\/uploads\/[\w.-]+\.(mp4|webm)|https:\/\/[^\s"'<>]+\.(mp4|webm|ogg)(\?[^\s"'<>]*)?)$/i.test(raw)) video = raw;
    else throw bad('invalid_field', { field: 'video' });
  }
  const status = ['draft', 'published', 'archived'].includes(b.status) ? b.status : 'published';
  return {
    category_id: categoryId,
    text: str(b.text, { min: 5, max: 1000, field: 'text' }),
    options: JSON.stringify(options),
    correct: JSON.stringify(correct),
    explanation: str(b.explanation || '', { max: 2000, field: 'explanation' }),
    visual: visual ? JSON.stringify(visual) : null,
    image,
    image_alt: str(b.imageAlt || '', { max: 300, field: 'imageAlt' }),
    video,
    audio_text: str(b.audioText || '', { max: 3000, field: 'audioText' }),
    difficulty: optInt(b.difficulty, { min: 1, max: 3, field: 'difficulty' }) || 2,
    status,
    is_double: isDouble,
    sub_questions: subQuestions ? JSON.stringify(subQuestions) : null,
    skill_type: ['معرفية', 'سلوكية', 'اجتماعية'].includes(b.skill_type) ? b.skill_type : 'معرفية',
  };
}

router.get('/questions', (req, res) => {
  const where = [];
  const p = {};
  if (req.query.q) { where.push('(q.text LIKE @q OR q.explanation LIKE @q OR q.id = @id)'); p.q = `%${String(req.query.q).slice(0, 100)}%`; p.id = Number(req.query.q) || -1; }
  if (req.query.category) { where.push('q.category_id = @cat'); p.cat = Number(req.query.category); }
  if (req.query.status) { where.push('q.status = @status'); p.status = String(req.query.status); }
  if (req.query.series) { where.push('q.id IN (SELECT question_id FROM series_questions WHERE series_id = @series)'); p.series = Number(req.query.series); }
  const sql = `FROM questions q ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(Math.max(Number(req.query.size) || 20, 1), 500);
  const total = db.get().prepare(`SELECT COUNT(*) AS n ${sql}`).get(p).n;
  const rows = db.get().prepare(`SELECT q.*, (SELECT COUNT(*) FROM attempt_answers aa WHERE aa.question_id = q.id) AS answers,
      (SELECT ROUND(100.0 * SUM(is_correct) / COUNT(*)) FROM attempt_answers aa WHERE aa.question_id = q.id) AS success
    ${sql} ORDER BY q.id DESC LIMIT @size OFFSET @off`).all({ ...p, size, off: (page - 1) * size });
  res.json({ total, page, size, items: rows.map(rowToAdmin) });
});

router.get('/questions/:id', wrap(async (req, res) => {
  const r = db.get().prepare('SELECT * FROM questions WHERE id = ?').get(int(req.params.id, { min: 1 }));
  if (!r) throw notFound();
  const out = rowToAdmin(r);
  out.series = db.get().prepare('SELECT series_id FROM series_questions WHERE question_id = ?').all(r.id).map((x) => x.series_id);
  res.json(out);
}));

router.post('/questions', instructorReadOnly, wrap(async (req, res) => {
  const v = validateQuestion(req.body || {});
  const info = db.get().prepare(`INSERT INTO questions (category_id, text, options, correct, explanation, visual, image, image_alt, video, audio_text, difficulty, status, is_double, sub_questions, skill_type)
    VALUES (@category_id, @text, @options, @correct, @explanation, @visual, @image, @image_alt, @video, @audio_text, @difficulty, @status, @is_double, @sub_questions, @skill_type)`).run(v);
  db.audit(req.user.id, 'create', 'question', info.lastInsertRowid);
  res.status(201).json(rowToAdmin(db.get().prepare('SELECT * FROM questions WHERE id = ?').get(info.lastInsertRowid)));
}));

router.put('/questions/:id', instructorReadOnly, wrap(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  if (!db.get().prepare('SELECT 1 FROM questions WHERE id = ?').get(id)) throw notFound();
  const v = validateQuestion(req.body || {});
  db.get().prepare(`UPDATE questions SET category_id=@category_id, text=@text, options=@options, correct=@correct, explanation=@explanation,
    visual=@visual, image=@image, image_alt=@image_alt, video=@video, audio_text=@audio_text, difficulty=@difficulty, status=@status,
    is_double=@is_double, sub_questions=@sub_questions, skill_type=@skill_type, updated_at=datetime('now') WHERE id=@id`).run({ ...v, id });
  db.audit(req.user.id, 'update', 'question', id);
  res.json(rowToAdmin(db.get().prepare('SELECT * FROM questions WHERE id = ?').get(id)));
}));

router.delete('/questions/:id', instructorReadOnly, wrap(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  const d = db.get();
  // Une question déjà utilisée dans des tentatives est archivée (pour garder l'historique), sinon supprimée.
  const used = d.prepare('SELECT 1 FROM attempt_answers WHERE question_id = ? LIMIT 1').get(id);
  if (used) d.prepare("UPDATE questions SET status = 'archived', updated_at = datetime('now') WHERE id = ?").run(id);
  else d.prepare('DELETE FROM questions WHERE id = ?').run(id);
  db.audit(req.user.id, used ? 'archive' : 'delete', 'question', id);
  res.json({ ok: true, archived: !!used });
}));

router.get('/questions-export', adminOnly, (req, res) => {
  const d = db.get();
  const cats = new Map(d.prepare('SELECT id, slug FROM categories').all().map((c) => [c.id, c.slug]));
  const items = d.prepare('SELECT * FROM questions ORDER BY id').all().map((r) => {
    const q = rowToAdmin(r);
    return { id: q.id, category: cats.get(q.category_id), text: q.text, options: q.options, correct: q.correct, explanation: q.explanation,
      visual: q.visual, image: q.image, imageAlt: q.image_alt, difficulty: q.difficulty, status: q.status };
  });
  res.setHeader('Content-Disposition', 'attachment; filename="question-bank.json"');
  res.json({ format: 'code-platform/questions@1', exportedAt: new Date().toISOString(), questions: items });
});

router.post('/questions-import', instructorReadOnly, wrap(async (req, res) => {
  const list = Array.isArray(req.body) ? req.body : (req.body && req.body.questions);
  if (!Array.isArray(list) || !list.length) throw bad('invalid_import');
  if (list.length > 5000) throw bad('import_too_large');
  const d = db.get();
  const cats = new Map(d.prepare('SELECT id, slug FROM categories').all().map((c) => [c.slug, c.id]));
  const ins = d.prepare(`INSERT INTO questions (category_id, text, options, correct, explanation, visual, image, image_alt, video, audio_text, difficulty, status, is_double, sub_questions, skill_type)
    VALUES (@category_id, @text, @options, @correct, @explanation, @visual, @image, @image_alt, @video, @audio_text, @difficulty, @status, @is_double, @sub_questions, @skill_type)`);
  const dup = d.prepare('SELECT 1 FROM questions WHERE category_id = ? AND text = ?');
  let created = 0;
  const errors = [];
  d.transaction(() => {
    list.forEach((raw, i) => {
      try {
        const categoryId = raw.categoryId || cats.get(raw.category);
        const v = validateQuestion({ ...raw, categoryId });
        if (dup.get(v.category_id, v.text)) throw bad('duplicate_question');
        ins.run(v);
        created++;
      } catch (e) {
        errors.push({ index: i, error: e.code || e.message });
      }
    });
  })();
  db.audit(req.user.id, 'import', 'question', null, { created, errors: errors.length });
  res.json({ created, errors: errors.slice(0, 50) });
}));

// Téléversement d'image (JSON base64, 2 Mo max) -> /uploads/<hash>.<ext>
router.post('/uploads', instructorReadOnly, wrap(async (req, res) => {
  const m = /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,([A-Za-z0-9+/=]+)$/.exec((req.body && req.body.dataUrl) || '');
  if (!m) throw bad('invalid_image');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 2 * 1024 * 1024) throw bad('image_too_large');
  const ext = { png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp', gif: 'gif', 'svg+xml': 'svg' }[m[1]];
  if (ext === 'svg' && /<script|on\w+\s*=|javascript:/i.test(buf.toString('utf8'))) throw bad('invalid_image');
  const name = `${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 24)}.${ext}`;
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(config.uploadsDir, name), buf);
  db.audit(req.user.id, 'upload', 'image', null, { name });
  res.status(201).json({ url: `/uploads/${name}` });
}));

// Téléversement de vidéo (corps binaire brut mp4/webm, 30 Mo max) -> /uploads/<hash>.<ext>
router.post('/uploads-video', instructorReadOnly, express.raw({ type: ['video/mp4', 'video/webm'], limit: '30mb' }), wrap(async (req, res) => {
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) throw bad('invalid_video');
  const isMp4 = buf.length > 12 && buf.toString('latin1', 4, 8) === 'ftyp';
  const isWebm = buf.length > 4 && buf.readUInt32BE(0) === 0x1a45dfa3;
  if (!isMp4 && !isWebm) throw bad('invalid_video');
  const ext = isMp4 ? 'mp4' : 'webm';
  const name = `${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 24)}.${ext}`;
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(config.uploadsDir, name), buf);
  db.audit(req.user.id, 'upload', 'video', null, { name });
  res.status(201).json({ url: `/uploads/${name}` });
}));

// --- Séries -------------------------------------------------------------------
router.get('/series', (req, res) => {
  const d = db.get();
  const rows = d.prepare('SELECT * FROM series ORDER BY sort, id').all();
  const qs = d.prepare('SELECT question_id FROM series_questions WHERE series_id = ? ORDER BY position');
  res.json(rows.map((s) => ({ ...s, questionIds: qs.all(s.id).map((r) => r.question_id) })));
});

function saveSeries(id, b, userId) {
  const d = db.get();
  const title = str(b.title, { min: 2, max: 200, field: 'title' });
  const description = str(b.description || '', { max: 1000, field: 'description' });
  const sort = optInt(b.sort, { min: 0, max: 10000, field: 'sort' }) ?? 0;
  const published = b.published === false ? 0 : 1;
  const ids = Array.isArray(b.questionIds) ? [...new Set(b.questionIds.map(Number))] : null;
  if (ids && ids.length > 100) throw bad('too_many_questions');
  if (ids && ids.length) {
    const found = d.prepare(`SELECT COUNT(*) AS n FROM questions WHERE id IN (${ids.map(() => '?').join(',')})`).get(...ids).n;
    if (found !== ids.length) throw bad('unknown_question');
  }
  return d.transaction(() => {
    if (id) d.prepare('UPDATE series SET title=?, description=?, sort=?, published=? WHERE id=?').run(title, description, sort, published, id);
    else id = d.prepare('INSERT INTO series (title, description, sort, published) VALUES (?,?,?,?)').run(title, description, sort, published).lastInsertRowid;
    if (ids) {
      d.prepare('DELETE FROM series_questions WHERE series_id = ?').run(id);
      const ins = d.prepare('INSERT INTO series_questions (series_id, question_id, position) VALUES (?,?,?)');
      ids.forEach((q, i) => ins.run(id, q, i));
    }
    db.audit(userId, 'save', 'series', id);
    return id;
  })();
}

router.post('/series', instructorReadOnly, wrap(async (req, res) => res.status(201).json({ id: saveSeries(null, req.body || {}, req.user.id) })));
router.put('/series/:id', instructorReadOnly, wrap(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  if (!db.get().prepare('SELECT 1 FROM series WHERE id = ?').get(id)) throw notFound();
  res.json({ id: saveSeries(id, req.body || {}, req.user.id) });
}));
router.delete('/series/:id', instructorReadOnly, wrap(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  db.get().prepare('DELETE FROM series WHERE id = ?').run(id);
  db.audit(req.user.id, 'delete', 'series', id);
  res.json({ ok: true });
}));

// --- Leçons -------------------------------------------------------------------
router.get('/lessons', (req, res) => res.json(db.get().prepare('SELECT * FROM lessons ORDER BY sort, id').all()));

function saveLesson(id, b, userId) {
  const d = db.get();
  const v = {
    title: str(b.title, { min: 2, max: 200, field: 'title' }),
    slug: str(b.slug, { min: 2, max: 80, field: 'slug' }).toLowerCase(),
    summary: str(b.summary || '', { max: 500, field: 'summary' }),
    body: str(b.body || '', { max: 100000, field: 'body' }),
    minutes: optInt(b.minutes, { min: 1, max: 300, field: 'minutes' }) || 5,
    sort: optInt(b.sort, { min: 0, max: 10000, field: 'sort' }) ?? 0,
    published: b.published === false ? 0 : 1,
    category_id: optInt(b.categoryId, { min: 1, field: 'categoryId' }),
  };
  if (!/^[a-z0-9-]+$/.test(v.slug)) throw bad('invalid_field', { field: 'slug' });
  const clash = d.prepare('SELECT id FROM lessons WHERE slug = ?').get(v.slug);
  if (clash && clash.id !== id) throw bad('slug_taken');
  if (id) d.prepare(`UPDATE lessons SET title=@title, slug=@slug, summary=@summary, body=@body, minutes=@minutes, sort=@sort,
    published=@published, category_id=@category_id, updated_at=datetime('now') WHERE id=@id`).run({ ...v, id });
  else id = d.prepare(`INSERT INTO lessons (title, slug, summary, body, minutes, sort, published, category_id)
    VALUES (@title, @slug, @summary, @body, @minutes, @sort, @published, @category_id)`).run(v).lastInsertRowid;
  db.audit(userId, 'save', 'lesson', id);
  return id;
}

router.post('/lessons', instructorReadOnly, wrap(async (req, res) => res.status(201).json({ id: saveLesson(null, req.body || {}, req.user.id) })));
router.put('/lessons/:id', instructorReadOnly, wrap(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  if (!db.get().prepare('SELECT 1 FROM lessons WHERE id = ?').get(id)) throw notFound();
  res.json({ id: saveLesson(id, req.body || {}, req.user.id) });
}));
router.delete('/lessons/:id', instructorReadOnly, wrap(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  db.get().prepare('DELETE FROM lessons WHERE id = ?').run(id);
  db.audit(req.user.id, 'delete', 'lesson', id);
  res.json({ ok: true });
}));

// --- Thèmes (catégories) : admin uniquement ----------------------------------
router.post('/categories', adminOnly, wrap(async (req, res) => {
  const b = req.body || {};
  const slug = str(b.slug, { min: 2, max: 60, field: 'slug' }).toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) throw bad('invalid_field', { field: 'slug' });
  const examCount = b.exam_count != null ? int(b.exam_count, { min: 1, max: 200, field: 'exam_count' }) : null;
  const info = db.get().prepare('INSERT INTO categories (slug, name_ar, name_fr, icon, exam_weight, exam_count, sort) VALUES (?,?,?,?,?,?,?)')
    .run(slug, str(b.name_ar, { min: 2, max: 100, field: 'name_ar' }), str(b.name_fr, { min: 2, max: 100, field: 'name_fr' }),
      str(b.icon || '', { max: 8, field: 'icon' }), int(b.exam_weight ?? 1, { min: 0, max: 40, field: 'exam_weight' }), examCount, int(b.sort ?? 99, { min: 0, max: 1000 }));
  db.audit(req.user.id, 'create', 'category', info.lastInsertRowid);
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.put('/categories/:id', adminOnly, wrap(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  const b = req.body || {};
  const examCount = b.exam_count != null ? int(b.exam_count, { min: 1, max: 200, field: 'exam_count' }) : null;
  const r = db.get().prepare('UPDATE categories SET name_ar=?, name_fr=?, icon=?, exam_weight=?, exam_count=?, sort=? WHERE id=?')
    .run(str(b.name_ar, { min: 2, max: 100, field: 'name_ar' }), str(b.name_fr, { min: 2, max: 100, field: 'name_fr' }),
      str(b.icon || '', { max: 8, field: 'icon' }), int(b.exam_weight, { min: 0, max: 40, field: 'exam_weight' }), examCount, int(b.sort ?? 0, { min: 0, max: 1000 }), id);
  if (!r.changes) throw notFound();
  db.audit(req.user.id, 'update', 'category', id);
  res.json({ ok: true });
}));

// --- Utilisateurs : admin uniquement -------------------------------------------
// هل المستخدم الحالي سوبر أدمين؟
const isSuperAdmin = (req) => !!(req.user && req.user.is_super_admin);

router.get('/users', adminOnly, (req, res) => {
  const q = `%${(req.query.q || '').toString().slice(0, 80)}%`;
  // الأدمين الأكبر لا يظهر في قائمة المستخدمين لأدمين عادي
  const hideSuperClause = isSuperAdmin(req) ? '' : "AND (u.is_super_admin = 0 OR u.is_super_admin IS NULL)";
  res.json(db.get().prepare(`SELECT id, name, email, role, active, locale, school_id, phone, city, pw_reset_at, created_at, last_login_at, is_super_admin FROM users u
    WHERE (name LIKE ? OR email LIKE ?) ${hideSuperClause} ORDER BY id DESC LIMIT 500`).all(q, q));
});

// حقول المستخدم القابلة للتعديل حسب الدور (قائمة بيضاء → أسماء الأعمدة)
const USER_FIELDS = {
  common: { phone: 30, city: 80 },
  student: {
    gender: 1, nationality: 50, id_type: 4, cin: 20,
    first_name_fr: 80, last_name_fr: 80, first_name_ar: 80, last_name_ar: 80,
    birth_date: 10, birth_place_fr: 100, birth_place_ar: 100, address_fr: 200, address_ar: 200,
    license_cat: 20, registration_center: 100, license_num: 30, valid_categories: 100,
  },
  instructor: {
    gender: 1, cin: 20, first_name_fr: 80, last_name_fr: 80, first_name_ar: 80, last_name_ar: 80,
    pc_num: 40, cap_num: 40, instructor_categories: 100,
  },
  school: { manager_name: 80, school_name: 120, tax_id: 40, pro_license_num: 40, narsa_num: 40 },
  admin: {},
};
const REQUIRED = {
  student: ['first_name_fr', 'last_name_fr', 'cin'],
  instructor: ['first_name_fr', 'last_name_fr', 'cin'],
  school: ['manager_name', 'school_name', 'phone', 'city', 'tax_id', 'pro_license_num', 'narsa_num'],
  admin: ['name', 'phone'],
};
const PW_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
/** كلمة سر عشوائية قوية (12 حرفاً) — لا تتكرر عملياً */
function generatePassword(len = 12) {
  let out = '';
  for (let i = 0; i < len; i++) out += PW_ALPHABET[crypto.randomInt(PW_ALPHABET.length)];
  return out;
}
const clean = (v, max) => (v === undefined || v === null ? null : (String(v).trim().slice(0, max) || null));

/** الاسم المعروض: متعلم = الاسم الشخصي + العائلي، مؤسسة = اسم المؤسسة، أدمين = الاسم */
function displayName(role, f, fallback) {
  if (role === 'student' || role === 'instructor') return `${f.first_name_fr || ''} ${f.last_name_fr || ''}`.trim() || fallback;
  if (role === 'school') return f.school_name || fallback;
  return fallback;
}

/** المؤسسة تدير متعلميها ومدربيها فقط؛ الأدمن يدير الجميع؛ الأدمين الأكبر محمي من الأدمين العادي */
const userScope = wrap(async (req, res, next) => {
  const targetId = int(req.params.id, { min: 1 });
  const u = db.get().prepare('SELECT id, role, school_id, is_super_admin FROM users WHERE id = ?').get(targetId);
  if (!u) throw notFound();
  // الأدمين العادي لا يمكنه الوصول لحساب الأدمين الأكبر
  if (u.is_super_admin && !isSuperAdmin(req)) return res.status(403).json({ error: 'forbidden' });
  if (req.user.role === 'admin') return next();
  if (!sameSchool(u.school_id, req.user.school_id) || !['student', 'instructor'].includes(u.role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
});

router.get('/users/:id', schoolOrAdmin, userScope, wrap(async (req, res) => {
  const u = db.get().prepare('SELECT * FROM users WHERE id = ?').get(int(req.params.id, { min: 1 }));
  if (!u) throw notFound();
  delete u.password_hash;
  res.json(u);
}));

router.post('/users', schoolOrAdmin, wrap(async (req, res) => {
  const body = req.body || {};
  // المؤسسة تضيف متعلمين فقط، ويُربطون بها تلقائياً
  const isSchool = req.user.role === 'school';
  const role = isSchool ? (['student', 'instructor'].includes(body.role) ? body.role : 'student') : (['student', 'admin', 'school'].includes(body.role) ? body.role : null);
  if (!role) throw bad('invalid_field', { field: 'role' });
  const email = str(body.email, { min: 5, max: 160, field: 'email' }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw bad('invalid_email');

  const fields = { ...USER_FIELDS.common, ...USER_FIELDS[role] };
  const vals = {};
  for (const [k, max] of Object.entries(fields)) vals[k] = clean(body[k], max);
  if (role === 'student' || role === 'instructor') vals.gender = ['M', 'F'].includes(body.gender) ? body.gender : null;
  if (role === 'student') {
    vals.id_type = ['CIN', 'CD', 'CS'].includes(body.id_type) ? body.id_type : 'CIN';
  }
  const rawName = clean(body.name, 80);
  for (const k of REQUIRED[role]) {
    if (!(k === 'name' ? rawName : vals[k])) throw bad('invalid_field', { field: k });
  }
  const name = displayName(role, vals, rawName);
  if (!name || name.length < 2) throw bad('invalid_field', { field: 'name' });
  const locale = ['fr', 'ar', 'ar-dialect'].includes(body.locale) ? body.locale : 'ar';

  const d = db.get();
  if (d.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'email_taken');
  // رقم الهوية: موحّد، ولا يتكرر لنفس الدور في كل المنصة
  if (role === 'student' || role === 'instructor') {
    vals.cin = normCin(vals.cin);
    if (vals.cin.length < 4) throw bad('invalid_field', { field: 'cin' });
    if (cinTaken(d, role, vals.cin)) throw new HttpError(409, 'cin_taken');
  }

  // كلمة سر عشوائية تُولَّد عند الحفظ وتُعرض مرة واحدة فقط
  const password = generatePassword();
  const hash = await auth.hashPassword(password);
  const cols = ['email', 'name', 'password_hash', 'role', 'locale', ...Object.keys(vals)];
  const params = [email, name, hash, role, locale, ...Object.values(vals)];
  if (isSchool) { cols.push('school_id'); params.push(req.user.school_id); }
  let info;
  try {
    info = d.prepare(`INSERT INTO users (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...params);
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) throw new HttpError(409, /cin/.test(e.message) ? 'cin_taken' : 'email_taken');
    console.error('[POST /users] INSERT error:', e.message);
    throw new HttpError(500, 'server_error');
  }
  if (role === 'school') d.prepare('UPDATE users SET school_id = id WHERE id = ?').run(info.lastInsertRowid);
  db.audit(req.user.id, 'create', 'user', info.lastInsertRowid, { name, email, role });
  res.status(201).json({ id: info.lastInsertRowid, name, email, role, active: 1, generatedPassword: password });
}));

router.patch('/users/:id', schoolOrAdmin, userScope, wrap(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  const d = db.get();
  const u = d.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) throw notFound();
  const b = req.body || {};
  // الدور لا يتغير بعد الإنشاء
  if (b.role !== undefined && b.role !== u.role) throw bad('role_locked');
  if (id === req.user.id && b.active === false) throw bad('cannot_demote_self');
  if (b.active !== undefined) d.prepare('UPDATE users SET active = ? WHERE id = ?').run(b.active ? 1 : 0, id);
  if (b.archived !== undefined) {
    if (!['student', 'instructor'].includes(u.role)) throw bad('invalid_field', { field: 'archived' });
    if (b.archived) d.prepare('UPDATE users SET archived = 1, active = 0 WHERE id = ?').run(id);
    else d.prepare('UPDATE users SET archived = 0 WHERE id = ?').run(id);
  }
  if ('school_id' in b && req.user.role === 'admin') {
    const sid = b.school_id ? int(b.school_id, { min: 1 }) : null;
    d.prepare('UPDATE users SET school_id = ? WHERE id = ?').run(sid, id);
  }

  // تعديل المعلومات
  const sets = {};
  if (b.email !== undefined) {
    const email = str(b.email, { min: 5, max: 160, field: 'email' }).toLowerCase();
    if (!EMAIL_RE.test(email)) throw bad('invalid_email');
    if (d.prepare('SELECT 1 FROM users WHERE email = ? AND id <> ?').get(email, id)) throw new HttpError(409, 'email_taken');
    sets.email = email;
  }
  const fields = { ...USER_FIELDS.common, ...(USER_FIELDS[u.role] || {}) };
  for (const [k, max] of Object.entries(fields)) if (b[k] !== undefined && k !== 'cin') sets[k] = clean(b[k], max);
  // رقم الهوية لا يُعدَّل بعد التسجيل (لأي دور، حتى الأدمين). استثناء وحيد: حساب قديم بدون رقم يُكمَّل مرة واحدة.
  if (b.cin !== undefined && 'cin' in fields) {
    const next = normCin(b.cin);
    const cur = normCin(u.cin);
    if (cur) { if (next !== cur) throw bad('cin_locked'); }
    else if (next) {
      if (next.length < 4) throw bad('invalid_field', { field: 'cin' });
      if (cinTaken(d, u.role, next, id)) throw new HttpError(409, 'cin_taken');
      sets.cin = next;
    }
  }
  if (u.role === 'student' || u.role === 'instructor') {
    if (b.gender !== undefined) sets.gender = ['M', 'F'].includes(b.gender) ? b.gender : null;
    if (u.role === 'student' && b.id_type !== undefined) sets.id_type = ['CIN', 'CD', 'CS'].includes(b.id_type) ? b.id_type : 'CIN';
  }
  if (b.locale !== undefined && ['fr', 'ar', 'ar-dialect'].includes(b.locale)) sets.locale = b.locale;
  if (Object.keys(sets).length || b.name !== undefined) {
    const merged = { ...u, ...sets };
    for (const k of REQUIRED[u.role] || []) {
      if (k !== 'name' && !merged[k]) throw bad('invalid_field', { field: k });
    }
    const fallback = b.name !== undefined ? clean(b.name, 80) : u.name;
    const name = displayName(u.role, merged, fallback);
    if (!name || name.length < 2) throw bad('invalid_field', { field: 'name' });
    sets.name = name;
    const cols = Object.keys(sets);
    try {
      d.prepare(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(sets), id);
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE')) throw new HttpError(409, /cin/.test(e.message) ? 'cin_taken' : 'email_taken');
      throw e;
    }
  }
  db.audit(req.user.id, 'update', 'user', id, { active: b.active, school_id: b.school_id, edited: Object.keys(sets) });
  res.json({ ok: true });
}));

const RESET_COOLDOWN_MS = 24 * 3600 * 1000;
/** توليد كلمة سر جديدة لمستخدم — مرة واحدة كل 24 ساعة لكل حساب */
router.post('/users/:id/reset-password', schoolOrAdmin, userScope, wrap(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  const d = db.get();
  const u = d.prepare('SELECT id, name, email, pw_reset_at FROM users WHERE id = ?').get(id);
  if (!u) throw notFound();
  const tooSoon = (last) => last && Date.now() - Date.parse(last) < RESET_COOLDOWN_MS;
  const limit = (last) => new HttpError(429, 'reset_limit', { retryAt: new Date(Date.parse(last) + RESET_COOLDOWN_MS).toISOString() });
  if (tooSoon(u.pw_reset_at)) throw limit(u.pw_reset_at);

  const password = generatePassword();
  const hash = await auth.hashPassword(password);
  const now = new Date();
  const cutoff = new Date(now.getTime() - RESET_COOLDOWN_MS).toISOString();
  // تحديث شرطي ذري: يمنع طلبين متزامنين من تجاوز الحد
  const r = d.prepare('UPDATE users SET password_hash = ?, pw_reset_at = ? WHERE id = ? AND (pw_reset_at IS NULL OR pw_reset_at <= ?)')
    .run(hash, now.toISOString(), id, cutoff);
  if (!r.changes) {
    const again = d.prepare('SELECT pw_reset_at FROM users WHERE id = ?').get(id);
    throw limit(again.pw_reset_at || now.toISOString());
  }
  auth.revokeSessions(id); // كلمة سر جديدة → تسقط كل الجلسات المفتوحة للحساب
  db.audit(req.user.id, 'reset_password', 'user', id);
  res.json({ id, name: u.name, email: u.email, generatedPassword: password, nextResetAt: new Date(now.getTime() + RESET_COOLDOWN_MS).toISOString() });
}));

router.delete('/users/:id', schoolOrAdmin, userScope, wrap(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  if (id === req.user.id) throw bad('cannot_delete_self');
  db.get().prepare('DELETE FROM users WHERE id = ?').run(id);
  db.audit(req.user.id, 'delete', 'user', id);
  res.json({ ok: true });
}));

// --- Paramètres de l'examen : admin uniquement ------------------------------------
router.put('/settings', adminOnly, wrap(async (req, res) => {
  const b = req.body || {};
  const v = {
    exam_question_count: int(b.exam_question_count, { min: 5, max: 100, field: 'exam_question_count' }),
    exam_pass_mark: int(b.exam_pass_mark, { min: 1, max: 100, field: 'exam_pass_mark' }),
    exam_seconds_per_question: int(b.exam_seconds_per_question, { min: 10, max: 300, field: 'exam_seconds_per_question' }),
    readiness_window: int(b.readiness_window, { min: 2, max: 20, field: 'readiness_window' }),
  };
  if (v.exam_pass_mark > v.exam_question_count) throw bad('invalid_field', { field: 'exam_pass_mark' });
  const up = db.get().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, val] of Object.entries(v)) up.run(k, String(val));
  db.audit(req.user.id, 'update', 'settings', null, v);
  res.json(db.getSettings());
}));

// --- Monitor AI: مفاتيح API (أدمين فقط، لا تُعاد القيمة الكاملة أبداً) -----------------
const secrets = require('../services/secrets');
const ai = require('../services/ai');
const AI_PROVIDERS = { claude: 'anthropic', gemini: 'gemini' };
const aiProvider = (p) => { if (!AI_PROVIDERS[p]) throw bad('invalid_field', { field: 'provider' }); return AI_PROVIDERS[p]; };

router.get('/ai-keys', adminOnly, (req, res) => res.json(ai.providerStatus()));

router.put('/ai-keys/:provider', adminOnly, wrap(async (req, res) => {
  const pre = aiProvider(req.params.provider);
  const b = req.body || {};
  const changed = [];
  if (b.key !== undefined && String(b.key).trim() !== '') {
    // تنظيف ما يُلصق عادةً مع المفتاح: مسافات/أسطر، علامات تنصيص، «GEMINI_API_KEY=»
    const k = String(b.key).replace(/^\s*[A-Z_]+_API_KEY\s*=\s*/, '').replace(/[\s"'`]/g, '');
    if (k.length < 20 || k.length > 400 || k.includes('...')) throw bad('invalid_ai_key');
    secrets.set(`${pre}_key`, k); changed.push('key');
  }
  if (b.model !== undefined) {
    let m = String(b.model).trim().replace(/^models\//, '');
    if (/^(تلقائي|auto|automatique|automatic|default)$/i.test(m)) m = ''; // = اختيار تلقائي
    if (m && !/^[\w.\-/:]{2,80}$/.test(m)) throw bad('invalid_ai_model');
    if (m) secrets.set(`${pre}_model`, m); else secrets.remove(`${pre}_model`);
    changed.push('model');
  }
  db.audit(req.user.id, 'update', 'ai_keys', null, { provider: req.params.provider, changed }); // بدون قيمة المفتاح
  res.json(ai.providerStatus());
}));

router.delete('/ai-keys/:provider', adminOnly, wrap(async (req, res) => {
  const pre = aiProvider(req.params.provider);
  secrets.remove(`${pre}_key`);
  db.audit(req.user.id, 'delete', 'ai_keys', null, { provider: req.params.provider });
  res.json(ai.providerStatus());
}));

router.post('/ai-keys/:provider/test', adminOnly, wrap(async (req, res) => {
  aiProvider(req.params.provider);
  try {
    res.json(await ai.testProvider(req.params.provider));
  } catch (e) {
    const msg = String(e.message || e).split('\n')[0]
      .replace(/(key=)[^&\s]+/gi, '$1***').replace(/\b(sk-ant-|AIza|AQ\.)[\w.-]+/g, '***').slice(0, 300);
    res.json({ ok: false, status: e.status || e.statusCode || null, error: msg });
  }
}));

router.get('/audit', adminOnly, (req, res) => {
  res.json(db.get().prepare(`SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 200`).all());
});

/** GET /admin/db-status — تشخيص حالة قاعدة البيانات */
router.get('/db-status', adminOnly, wrap(async (req, res) => {
  const d = db.get();
  const tables = d.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
  const schoolsCols = tables.includes('schools')
    ? d.prepare('PRAGMA table_info(schools)').all().map(c => ({ name: c.name, type: c.type }))
    : null;
  const usersCols = d.prepare('PRAGMA table_info(users)').all().map(c => ({ name: c.name, type: c.type }));
  const orphanSchoolUsers = d.prepare("SELECT id, email FROM users WHERE role='school' AND (school_id IS NULL OR school_id='')").all();
  res.json({ tables, schoolsCols, usersCols, orphanSchoolUsers });
}));

/** POST /admin/cleanup-orphan-users — حذف المستخدمين اليتامى (school بلا school_id) */
router.post('/cleanup-orphan-users', adminOnly, wrap(async (req, res) => {
  const d = db.get();
  const orphans = d.prepare("SELECT id, email FROM users WHERE role = 'school' AND (school_id IS NULL OR school_id = '')").all();
  for (const u of orphans) {
    d.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  }
  res.json({ deleted: orphans.length, emails: orphans.map(u => u.email) });
}));

module.exports = router;
