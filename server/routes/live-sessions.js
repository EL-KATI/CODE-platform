'use strict';
/**
 * /api/live — الحصص الجماعية المباشرة
 *
 * ── المؤسسة (school/instructor) ──
 * GET  /api/live/school           — قائمة حصص المؤسسة
 * POST /api/live/school           — إنشاء حصة جديدة
 * POST /api/live/school/:id/start — بدء الحصة (live)
 * POST /api/live/school/:id/next  — الانتقال للسؤال التالي
 * POST /api/live/school/:id/end   — إنهاء الحصة
 * GET  /api/live/school/:id/results — نتائج الحصة (من أجاب صح/خطأ)
 *
 * ── المتعلم (student) ──
 * GET  /api/live/active           — الحصة المفعّلة حالياً لمؤسسة المتعلم
 * POST /api/live/:id/join         — طلب/تأكيد الانضمام (first-time approval)
 * GET  /api/live/:id/state        — حالة الحصة (سؤال حالي + إجابتي)
 * POST /api/live/:id/answer       — إرسال إجابة على السؤال الحالي
 */

const express = require('express');
const db      = require('../db');
const auth    = require('../auth');
const { wrap, int, bad } = require('../http');
const { drawExamPublic } = require('../services/liveDraw');

const router = express.Router();
router.use(auth.requireAuth);

// ─── helpers ──────────────────────────────────────────────────────────────────
const sameSchool = (req, schoolId) => {
  if (req.user.role === 'admin') return true;
  return String(req.user.school_id || '') === String(schoolId || '');
};

function getSession(id) {
  return db.get().prepare('SELECT * FROM live_sessions WHERE id = ?').get(id);
}

// ══════════════════════════════════════════════════════════════════════════════
// SCHOOL / INSTRUCTOR side
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/live/school — قائمة حصص المؤسسة (آخر 20)
router.get('/school', auth.requireRole('school', 'instructor', 'admin'), wrap(async (req, res) => {
  const d   = db.get();
  const sid = req.user.school_id;
  if (!sid && req.user.role !== 'admin') return bad(res, 'no school');

  const rows = d.prepare(`
    SELECT ls.*, u.name AS creator_name
    FROM live_sessions ls
    JOIN users u ON u.id = ls.created_by
    ${req.user.role === 'admin' ? '' : 'WHERE ls.school_id = ?'}
    ORDER BY ls.created_at DESC LIMIT 20
  `).all(...(req.user.role === 'admin' ? [] : [sid]));

  res.json({ sessions: rows.map(row => ({ ...row, question_ids: JSON.parse(row.question_ids || '[]') })) });
}));

// POST /api/live/school — إنشاء حصة جديدة
router.post('/school', auth.requireRole('school', 'instructor', 'admin'), wrap(async (req, res) => {
  const d   = db.get();
  const sid = req.user.school_id;
  if (!sid && req.user.role !== 'admin') return bad(res, 'no school');

  const { title = 'حصة جماعية', mode = 'exam', count = 40, school_id } = req.body;
  const targetSchool = req.user.role === 'admin' ? (school_id || sid) : sid;
  if (!targetSchool) return bad(res, 'school_id required');

  if (!['exam', 'practice'].includes(mode)) return bad(res, 'invalid mode');
  const qCount = Math.min(Math.max(Number(count) || 40, 5), 46);

  // سحب أسئلة عشوائية
  const questionIds = drawExamPublic(qCount);
  if (!questionIds.length) return bad(res, 'no_questions');

  const info = d.prepare(`
    INSERT INTO live_sessions (school_id, created_by, title, mode, status, question_ids)
    VALUES (?, ?, ?, ?, 'waiting', ?)
  `).run(targetSchool, req.user.id, title, mode, JSON.stringify(questionIds));

  res.status(201).json({ id: info.lastInsertRowid, questionCount: questionIds.length });
}));

// POST /api/live/school/:id/start — بدء الحصة
router.post('/school/:id/start', auth.requireRole('school', 'instructor', 'admin'), wrap(async (req, res) => {
  const d   = db.get();
  const sess = getSession(int(req.params.id));
  if (!sess) return res.status(404).json({ error: 'not_found' });
  if (!sameSchool(req, sess.school_id)) return res.status(403).json({ error: 'forbidden' });
  if (sess.status !== 'waiting') return bad(res, 'already_started');

  d.prepare(`UPDATE live_sessions SET status='live', started_at=datetime('now'), current_q=0 WHERE id=?`).run(sess.id);
  res.json({ ok: true });
}));

// POST /api/live/school/:id/next — السؤال التالي
router.post('/school/:id/next', auth.requireRole('school', 'instructor', 'admin'), wrap(async (req, res) => {
  const d    = db.get();
  const sess = getSession(int(req.params.id));
  if (!sess) return res.status(404).json({ error: 'not_found' });
  if (!sameSchool(req, sess.school_id)) return res.status(403).json({ error: 'forbidden' });
  if (sess.status !== 'live') return bad(res, 'not_live');

  const ids   = JSON.parse(sess.question_ids || '[]');
  const nextQ = sess.current_q + 1;
  if (nextQ >= ids.length) return bad(res, 'no_more_questions');

  d.prepare('UPDATE live_sessions SET current_q=? WHERE id=?').run(nextQ, sess.id);
  res.json({ ok: true, current_q: nextQ });
}));

// POST /api/live/school/:id/end — إنهاء الحصة
router.post('/school/:id/end', auth.requireRole('school', 'instructor', 'admin'), wrap(async (req, res) => {
  const d    = db.get();
  const sess = getSession(int(req.params.id));
  if (!sess) return res.status(404).json({ error: 'not_found' });
  if (!sameSchool(req, sess.school_id)) return res.status(403).json({ error: 'forbidden' });

  d.prepare(`UPDATE live_sessions SET status='ended', ended_at=datetime('now') WHERE id=?`).run(sess.id);
  res.json({ ok: true });
}));

// GET /api/live/school/:id/results — نتائج الحصة (للمؤسسة)
router.get('/school/:id/results', auth.requireRole('school', 'instructor', 'admin'), wrap(async (req, res) => {
  const d    = db.get();
  const sess = getSession(int(req.params.id));
  if (!sess) return res.status(404).json({ error: 'not_found' });
  if (!sameSchool(req, sess.school_id)) return res.status(403).json({ error: 'forbidden' });

  const ids   = JSON.parse(sess.question_ids || '[]');
  // إجمالي المشاركين
  const participants = d.prepare(`
    SELECT DISTINCT user_id FROM live_session_answers WHERE session_id = ?
  `).all(sess.id).map(r => r.user_id);

  // لكل سؤال: عدد الصواب والخطأ وأسماء المخطئين
  const questionStats = ids.map((qid, idx) => {
    const answers = d.prepare(`
      SELECT lsa.user_id, lsa.is_correct, u.name, u.first_name_ar, u.last_name_ar
      FROM live_session_answers lsa
      JOIN users u ON u.id = lsa.user_id
      WHERE lsa.session_id = ? AND lsa.question_id = ?
    `).all(sess.id, qid);

    const correct = answers.filter(a => a.is_correct).length;
    const total   = answers.length;
    const errorRate = total > 0 ? Math.round(100 * (total - correct) / total) : null;
    const wrongStudents = answers
      .filter(a => !a.is_correct)
      .map(a => ({ id: a.user_id, name: a.first_name_ar || a.name }));

    return { idx, question_id: qid, correct, total, errorRate, wrongStudents };
  });

  res.json({
    session: { ...sess, question_ids: ids },
    participants: participants.length,
    questionStats,
  });
}));

// ══════════════════════════════════════════════════════════════════════════════
// STUDENT side
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/live/active — الحصة المفعّلة لمؤسسة المتعلم
router.get('/active', wrap(async (req, res) => {
  const d   = db.get();
  const sid = req.user.school_id;
  if (!sid) return res.json({ session: null });

  const sess = d.prepare(`
    SELECT id, title, mode, status, current_q, started_at,
           (SELECT COUNT(*) FROM live_session_answers WHERE session_id=live_sessions.id) AS answer_count
    FROM live_sessions
    WHERE school_id = ? AND status IN ('waiting','live')
    ORDER BY created_at DESC LIMIT 1
  `).get(sid) || null;

  // هل لدى المتعلم صلاحية مسبقة؟
  let hasAccess = false;
  if (sess) {
    const access = d.prepare('SELECT 1 FROM live_session_access WHERE user_id=? AND school_id=?').get(req.user.id, sid);
    hasAccess = !!access;
  }

  res.json({ session: sess, hasAccess });
}));

// POST /api/live/:id/join — الانضمام وطلب/تأكيد الصلاحية
router.post('/:id/join', wrap(async (req, res) => {
  const d    = db.get();
  const sess = getSession(int(req.params.id));
  if (!sess) return res.status(404).json({ error: 'not_found' });
  if (!sameSchool(req, sess.school_id)) return res.status(403).json({ error: 'forbidden' });
  if (sess.status === 'ended') return bad(res, 'session_ended');

  const uid = req.user.id;
  const sid = sess.school_id;

  // هل لديه صلاحية؟
  const existing = d.prepare('SELECT 1 FROM live_session_access WHERE user_id=? AND school_id=?').get(uid, sid);

  if (!existing) {
    // first-time: نمنح الصلاحية تلقائياً (يمكن لاحقاً إضافة موافقة يدوية)
    d.prepare(`INSERT OR IGNORE INTO live_session_access (user_id, school_id) VALUES (?,?)`).run(uid, sid);
  }

  res.json({ ok: true, joined: true, current_q: sess.current_q, status: sess.status });
}));

// GET /api/live/:id/state — حالة الحصة + السؤال الحالي + إجابة المتعلم
router.get('/:id/state', wrap(async (req, res) => {
  const d    = db.get();
  const sess = getSession(int(req.params.id));
  if (!sess) return res.status(404).json({ error: 'not_found' });

  // تحقق الصلاحية
  const access = d.prepare('SELECT 1 FROM live_session_access WHERE user_id=? AND school_id=?')
    .get(req.user.id, sess.school_id);
  if (!access && !sameSchool(req, sess.school_id)) return res.status(403).json({ error: 'forbidden' });

  const ids = JSON.parse(sess.question_ids || '[]');
  const qid = ids[sess.current_q];

  // السؤال الحالي من DB
  let question = null;
  if (qid) {
    const q = d.prepare(`
      SELECT q.id, q.text, q.image_url, q.is_double, q.sub_questions,
             q.options, q.correct, q.explanation, c.name_ar AS cat
      FROM questions q
      LEFT JOIN categories c ON c.id = q.category_id
      WHERE q.id = ?
    `).get(qid);
    if (q) {
      question = {
        ...q,
        options:       tryJson(q.options, []),
        correct:       tryJson(q.correct, []),
        sub_questions: tryJson(q.sub_questions, null),
      };
    }
  }

  // هل أجاب المتعلم على هذا السؤال؟
  const myAnswer = qid ? d.prepare(
    'SELECT selected, is_correct FROM live_session_answers WHERE session_id=? AND user_id=? AND question_id=?'
  ).get(sess.id, req.user.id, qid) : null;

  // إحصائيات مجيبين على السؤال الحالي
  const answered = qid ? d.prepare(
    'SELECT COUNT(*) AS n FROM live_session_answers WHERE session_id=? AND question_id=?'
  ).get(sess.id, qid).n : 0;

  res.json({
    status    : sess.status,
    current_q : sess.current_q,
    total     : ids.length,
    question,
    myAnswer  : myAnswer ? { selected: tryJson(myAnswer.selected, []), isCorrect: !!myAnswer.is_correct } : null,
    answered,
  });
}));

// POST /api/live/:id/answer — إرسال إجابة
router.post('/:id/answer', wrap(async (req, res) => {
  const d    = db.get();
  const sess = getSession(int(req.params.id));
  if (!sess) return res.status(404).json({ error: 'not_found' });
  if (sess.status !== 'live') return bad(res, 'not_live');

  const access = d.prepare('SELECT 1 FROM live_session_access WHERE user_id=? AND school_id=?')
    .get(req.user.id, sess.school_id);
  if (!access && !sameSchool(req, sess.school_id)) return res.status(403).json({ error: 'forbidden' });

  const ids = JSON.parse(sess.question_ids || '[]');
  const qid = ids[sess.current_q];
  if (!qid) return bad(res, 'no_question');

  const { selected = [] } = req.body;
  if (!Array.isArray(selected)) return bad(res, 'selected must be array');

  // حساب الصواب
  const qRow = d.prepare('SELECT correct FROM questions WHERE id=?').get(qid);
  const correct = tryJson(qRow?.correct, []).map(Number);
  const sel     = selected.map(Number);
  const isCorrect = correct.length > 0
    && correct.every(n => sel.includes(n))
    && sel.every(n => correct.includes(n)) ? 1 : 0;

  // INSERT OR IGNORE (لا يُجيب مرتين)
  d.prepare(`
    INSERT OR IGNORE INTO live_session_answers (session_id, user_id, question_id, selected, is_correct)
    VALUES (?, ?, ?, ?, ?)
  `).run(sess.id, req.user.id, qid, JSON.stringify(sel), isCorrect);

  res.json({ ok: true, isCorrect: !!isCorrect, correct });
}));

function tryJson(str, def) {
  try { return JSON.parse(str); } catch { return def; }
}

module.exports = router;
