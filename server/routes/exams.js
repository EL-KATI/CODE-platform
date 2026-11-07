'use strict';
/**
 * /api/exams — مسار امتحانات رخصة السياقة
 *
 * منطق شجرة القرار:
 *   theory_1 ناجح  → practical_1
 *   theory_1 راسب  → theory_2
 *     theory_2 ناجح  → practical_1
 *     theory_2 راسب  → أرشيف «لم يحصل»
 *   practical_1 ناجح → أرشيف «حصل على الرخصة»
 *   practical_1 راسب → practical_2
 *     practical_2 ناجح → أرشيف «حصل على الرخصة»
 *     practical_2 راسب → أرشيف «لم يحصل»
 */
const { Router } = require('express');
const auth = require('../auth');
const getDb = require('../db');

const router = Router();

/** دالة مساعدة لتفادي تكرار try/catch */
function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** وسيط: مؤسسة أو أدمين فقط */
const schoolOrAdmin = auth.requireRole('admin', 'school');

/* ─────────────────────────────────────────────────────────────────────────
   حساب الخطوة التالية بناءً على نتائج الامتحانات
   ───────────────────────────────────────────────────────────────────────── */
function computeNextStep(j) {
  // لا نتيجة للامتحان النظري الأول بعد
  if (!j.theory1_result) return { step: 'theory_1', label: 'exam.step.theory1' };

  if (j.theory1_result === 'failed') {
    if (!j.theory2_result) return { step: 'theory_2', label: 'exam.step.theory2' };
    if (j.theory2_result === 'failed') return { step: 'archive', archived_status: 'failed' };
    // theory_2 ناجح → practical_1
  }

  // وصل إلى practical_1 (سواء نجح في theory_1 أو theory_2)
  if (!j.practical1_result) return { step: 'practical_1', label: 'exam.step.practical1' };

  if (j.practical1_result === 'passed') return { step: 'archive', archived_status: 'licensed' };

  // practical_1 راسب → practical_2
  if (!j.practical2_result) return { step: 'practical_2', label: 'exam.step.practical2' };

  if (j.practical2_result === 'passed') return { step: 'archive', archived_status: 'licensed' };

  return { step: 'archive', archived_status: 'failed' };
}

/* ─────────────────────────────────────────────────────────────────────────
   GET /api/exams/students
   جميع الطلاب في مسار الامتحانات (للمؤسسة أو الأدمين)
   ───────────────────────────────────────────────────────────────────────── */
router.get('/students', schoolOrAdmin, wrap(async (req, res) => {
  const d = getDb();
  let rows;

  if (req.user.role === 'admin') {
    rows = d.prepare(`
      SELECT ej.*, u.name, u.email
      FROM exam_journey ej
      JOIN users u ON u.id = ej.student_id
      ORDER BY ej.updated_at DESC
    `).all();
  } else {
    rows = d.prepare(`
      SELECT ej.*, u.name, u.email
      FROM exam_journey ej
      JOIN users u ON u.id = ej.student_id
      WHERE ej.school_id = ?
      ORDER BY ej.updated_at DESC
    `).all(req.user.school_id);
  }

  const enriched = rows.map(j => ({ ...j, next_step: computeNextStep(j) }));
  res.json({ journeys: enriched });
}));

/* ─────────────────────────────────────────────────────────────────────────
   GET /api/exams/today
   الطلاب الذين لديهم امتحان اليوم (نظري أو تطبيقي)
   ───────────────────────────────────────────────────────────────────────── */
router.get('/today', schoolOrAdmin, wrap(async (req, res) => {
  const d = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const schoolFilter = req.user.role === 'admin' ? '' : 'AND ej.school_id = ?';
  const params = req.user.role === 'admin' ? [today, today, today, today] : [today, today, today, today, req.user.school_id];

  const rows = d.prepare(`
    SELECT ej.*, u.name, u.email
    FROM exam_journey ej
    JOIN users u ON u.id = ej.student_id
    WHERE ej.status = 'active'
      AND (
        (ej.theory1_date = ? AND ej.theory1_result IS NULL) OR
        (ej.theory2_date = ? AND ej.theory2_result IS NULL) OR
        (ej.practical1_date = ? AND ej.practical1_result IS NULL) OR
        (ej.practical2_date = ? AND ej.practical2_result IS NULL)
      )
      ${schoolFilter}
    ORDER BY u.name
  `).all(...params);

  const enriched = rows.map(j => {
    const ns = computeNextStep(j);
    // تحديد نوع الامتحان اليوم
    let todayExam = null;
    if (j.theory1_date === today && j.theory1_result === null) todayExam = 'theory_1';
    else if (j.theory2_date === today && j.theory2_result === null) todayExam = 'theory_2';
    else if (j.practical1_date === today && j.practical1_result === null) todayExam = 'practical_1';
    else if (j.practical2_date === today && j.practical2_result === null) todayExam = 'practical_2';
    return { ...j, next_step: ns, today_exam: todayExam };
  });

  res.json({ journeys: enriched, date: today });
}));

/* ─────────────────────────────────────────────────────────────────────────
   GET /api/exams/archive
   الطلاب المؤرشفون (نهاية المسار)
   ───────────────────────────────────────────────────────────────────────── */
router.get('/archive', schoolOrAdmin, wrap(async (req, res) => {
  const d = getDb();
  let rows;

  if (req.user.role === 'admin') {
    rows = d.prepare(`
      SELECT ej.*, u.name, u.email
      FROM exam_journey ej
      JOIN users u ON u.id = ej.student_id
      WHERE ej.status = 'archived'
      ORDER BY ej.updated_at DESC
    `).all();
  } else {
    rows = d.prepare(`
      SELECT ej.*, u.name, u.email
      FROM exam_journey ej
      JOIN users u ON u.id = ej.student_id
      WHERE ej.status = 'archived' AND ej.school_id = ?
      ORDER BY ej.updated_at DESC
    `).all(req.user.school_id);
  }

  res.json({ archive: rows });
}));

/* ─────────────────────────────────────────────────────────────────────────
   POST /api/exams/enroll
   إدراج طالب في مسار الامتحانات وتحديد موعد الامتحان النظري الأول
   body: { student_id, theory1_date }
   ───────────────────────────────────────────────────────────────────────── */
router.post('/enroll', schoolOrAdmin, wrap(async (req, res) => {
  const d = getDb();
  const { student_id, theory1_date } = req.body;

  if (!student_id || !theory1_date) {
    return res.status(400).json({ error: 'student_id and theory1_date required' });
  }

  // التحقق من أن الطالب ينتمي للمؤسسة
  const student = d.prepare('SELECT id, school_id FROM users WHERE id = ? AND role = ?').get(student_id, 'student');
  if (!student) return res.status(404).json({ error: 'student_not_found' });
  if (req.user.role !== 'admin' && student.school_id !== req.user.school_id) {
    return res.status(403).json({ error: 'forbidden' });
  }

  // هل هو مسجّل مسبقاً؟
  const existing = d.prepare('SELECT id FROM exam_journey WHERE student_id = ?').get(student_id);
  if (existing) return res.status(409).json({ error: 'already_enrolled' });

  const schoolId = req.user.role === 'admin' ? (student.school_id || null) : req.user.school_id;
  if (!schoolId) return res.status(400).json({ error: 'student_has_no_school' });

  d.prepare(`
    INSERT INTO exam_journey (student_id, school_id, theory1_date)
    VALUES (?, ?, ?)
  `).run(student_id, schoolId, theory1_date);

  const journey = d.prepare('SELECT * FROM exam_journey WHERE student_id = ?').get(student_id);
  res.status(201).json({ journey, next_step: computeNextStep(journey) });
}));

/* ─────────────────────────────────────────────────────────────────────────
   PATCH /api/exams/:studentId/date
   تحديد / تعديل موعد امتحان معيّن
   body: { exam_type: 'theory_1'|'theory_2'|'practical_1'|'practical_2', date }
   ───────────────────────────────────────────────────────────────────────── */
router.patch('/:studentId/date', schoolOrAdmin, wrap(async (req, res) => {
  const d = getDb();
  const { studentId } = req.params;
  const { exam_type, date } = req.body;

  const ALLOWED_TYPES = ['theory_1', 'theory_2', 'practical_1', 'practical_2'];
  if (!ALLOWED_TYPES.includes(exam_type) || !date) {
    return res.status(400).json({ error: 'invalid exam_type or missing date' });
  }

  const journey = d.prepare('SELECT * FROM exam_journey WHERE student_id = ?').get(studentId);
  if (!journey) return res.status(404).json({ error: 'journey_not_found' });
  if (req.user.role !== 'admin' && journey.school_id !== req.user.school_id) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const colMap = {
    theory_1: 'theory1_date',
    theory_2: 'theory2_date',
    practical_1: 'practical1_date',
    practical_2: 'practical2_date',
  };
  const col = colMap[exam_type];

  d.prepare(`UPDATE exam_journey SET ${col} = ?, updated_at = datetime('now') WHERE student_id = ?`)
    .run(date, studentId);

  const updated = d.prepare('SELECT * FROM exam_journey WHERE student_id = ?').get(studentId);
  res.json({ journey: updated, next_step: computeNextStep(updated) });
}));

/* ─────────────────────────────────────────────────────────────────────────
   PATCH /api/exams/:studentId/result
   إدخال نتيجة امتحان → يحسب الخطوة التالية تلقائياً ويؤرشف عند الانتهاء
   body: { exam_type, result: 'passed'|'failed' }
   ───────────────────────────────────────────────────────────────────────── */
router.patch('/:studentId/result', schoolOrAdmin, wrap(async (req, res) => {
  const d = getDb();
  const { studentId } = req.params;
  const { exam_type, result } = req.body;

  const ALLOWED_TYPES = ['theory_1', 'theory_2', 'practical_1', 'practical_2'];
  if (!ALLOWED_TYPES.includes(exam_type) || !['passed', 'failed'].includes(result)) {
    return res.status(400).json({ error: 'invalid exam_type or result' });
  }

  const journey = d.prepare('SELECT * FROM exam_journey WHERE student_id = ?').get(studentId);
  if (!journey) return res.status(404).json({ error: 'journey_not_found' });
  if (journey.status === 'archived') return res.status(409).json({ error: 'already_archived' });
  if (req.user.role !== 'admin' && journey.school_id !== req.user.school_id) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const colMap = {
    theory_1: 'theory1_result',
    theory_2: 'theory2_result',
    practical_1: 'practical1_result',
    practical_2: 'practical2_result',
  };
  const col = colMap[exam_type];

  // تسجيل النتيجة
  d.prepare(`UPDATE exam_journey SET ${col} = ?, updated_at = datetime('now') WHERE student_id = ?`)
    .run(result, studentId);

  // إعادة حساب الخطوة التالية بعد التسجيل
  const refreshed = d.prepare('SELECT * FROM exam_journey WHERE student_id = ?').get(studentId);
  const next = computeNextStep(refreshed);

  // أرشفة تلقائية إذا وصلنا لنهاية المسار
  if (next.step === 'archive') {
    d.prepare(`
      UPDATE exam_journey
      SET status = 'archived', archived_status = ?, updated_at = datetime('now')
      WHERE student_id = ?
    `).run(next.archived_status, studentId);
  }

  const final = d.prepare('SELECT * FROM exam_journey WHERE student_id = ?').get(studentId);
  res.json({ journey: final, next_step: computeNextStep(final) });
}));

/* ─────────────────────────────────────────────────────────────────────────
   GET /api/exams/me
   مسار الامتحان الخاص بالطالب الحالي
   ───────────────────────────────────────────────────────────────────────── */
router.get('/me', auth.requireAuth, wrap(async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'forbidden' });
  const d = getDb();
  const journey = d.prepare('SELECT * FROM exam_journey WHERE student_id = ?').get(req.user.id);
  if (!journey) return res.json({ journey: null });
  res.json({ journey, next_step: computeNextStep(journey) });
}));

module.exports = router;
