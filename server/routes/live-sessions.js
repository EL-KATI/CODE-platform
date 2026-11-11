'use strict';
/**
 * /api/live — الحصص الجماعية المباشرة (Real-time via SSE)
 *
 * ── SSE (Server-Sent Events) ──────────────────────────────────────────────
 * GET  /api/live/:id/stream        — اشتراك SSE (طالب أو مدرب)
 *
 * ── المؤسسة (school/instructor/admin) ────────────────────────────────────
 * GET  /api/live/school            — قائمة حصص المؤسسة
 * POST /api/live/school            — إنشاء حصة جديدة
 * POST /api/live/school/:id/start  — بدء الحصة → emit session{live} + question
 * POST /api/live/school/:id/next   — السؤال التالي → emit question
 * POST /api/live/school/:id/end    — إنهاء الحصة → emit session{ended}
 * GET  /api/live/school/:id/results — نتائج الحصة + drill-down
 *
 * ── الطالب ───────────────────────────────────────────────────────────────
 * GET  /api/live/active            — الحصة الفعّالة لمؤسسة الطالب
 * POST /api/live/:id/join          — الانضمام (first-time approval تلقائي)
 * GET  /api/live/:id/state         — حالة الحصة + السؤال الحالي (REST fallback)
 * POST /api/live/:id/answer        — إرسال إجابة → emit leaderboard
 */

const express = require('express');
const db      = require('../db');
const auth    = require('../auth');
const hub     = require('../services/liveHub');
const { wrap, int, bad } = require('../http');
const { drawExamPublic } = require('../services/liveDraw');

const router = express.Router();
router.use(auth.requireAuth);

// ─── helpers ──────────────────────────────────────────────────────────────────
const isStaff = (req) => ['admin', 'school', 'instructor'].includes(req.user.role);

const sameSchool = (req, schoolId) => {
  if (req.user.role === 'admin') return true;
  return String(req.user.school_id || '') === String(schoolId || '');
};

function getSession(id) {
  return db.get().prepare('SELECT * FROM live_sessions WHERE id = ?').get(id);
}

function tryJson(str, def) {
  try { return JSON.parse(str); } catch { return def; }
}

/**
 * حساب وبث لوحة الترتيب الحية لحصة معيّنة
 * الترتيب حسب: (نقاط صح تنازلياً) ثم (متوسط وقت الإجابة تصاعدياً)
 */
function broadcastLeaderboard(sessionId) {
  const d = db.get();
  const board = d.prepare(`
    SELECT
      lsa.user_id,
      SUM(lsa.is_correct)                        AS score,
      AVG(CASE WHEN lsa.is_correct = 1
            THEN CAST(strftime('%s', lsa.answered_at) AS INTEGER) -
                 CAST(strftime('%s', ls.started_at)  AS INTEGER)
            ELSE NULL END)                         AS avg_seconds
    FROM live_session_answers lsa
    JOIN live_sessions ls ON ls.id = lsa.session_id
    WHERE lsa.session_id = ?
    GROUP BY lsa.user_id
    ORDER BY score DESC, avg_seconds ASC
    LIMIT 20
  `).all(sessionId);

  const ranked = board.map((row, i) => ({
    rank     : i + 1,
    userId   : row.user_id,
    score    : row.score,
    avgSec   : row.avg_seconds ? Math.round(row.avg_seconds) : null,
  }));

  hub.emit(sessionId, 'leaderboard', { board: ranked });
  return ranked;
}

/**
 * بناء payload السؤال الحالي من DB
 */
function buildQuestionPayload(sessionId) {
  const d    = db.get();
  const sess = getSession(sessionId);
  if (!sess || sess.status !== 'live') return null;

  const ids = tryJson(sess.question_ids, []);
  const qid = ids[sess.current_q];
  if (!qid) return null;

  const q = d.prepare(`
    SELECT q.id, q.text, q.image, q.image_alt, q.is_double, q.sub_questions,
           q.options, q.correct, q.explanation, c.name_ar AS cat
    FROM questions q LEFT JOIN categories c ON c.id = q.category_id
    WHERE q.id = ?
  `).get(qid);
  if (!q) return null;

  return {
    sessionId  : sessionId,
    current_q  : sess.current_q,
    total      : ids.length,
    question   : {
      ...q,
      options      : tryJson(q.options, []),
      correct      : tryJson(q.correct, []),    // مرئي للمدرب فقط
      sub_questions: tryJson(q.sub_questions, null),
    },
    connectedCount: hub.connectedCount(sessionId),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
//  SSE STREAM  — نقطة الاشتراك الوحيدة (طلاب + مدربون)
// ══════════════════════════════════════════════════════════════════════════════

router.get('/:id/stream', wrap(async (req, res) => {
  const sessId = int(req.params.id);
  const sess   = getSession(sessId);
  if (!sess) return res.status(404).json({ error: 'not_found' });

  // تحقق الصلاحية
  const d       = db.get();
  const hasStaff = isStaff(req);
  const access   = d.prepare('SELECT 1 FROM live_session_access WHERE user_id=? AND school_id=?')
    .get(req.user.id, sess.school_id);

  if (!hasStaff && !access) return res.status(403).json({ error: 'forbidden' });

  // تسجيل الاتصال
  const cleanup = hub.subscribe(sessId, req.user.id, req.user.role, res);

  // إرسال الحالة الأولية فور الاتصال
  const initPayload = {
    status   : sess.status,
    current_q: sess.current_q,
    total    : tryJson(sess.question_ids, []).length,
  };
  res.write(`event: init\ndata: ${JSON.stringify(initPayload)}\n\n`);

  // إذا الحصة مباشرة → أرسل السؤال الحالي فوراً
  if (sess.status === 'live') {
    const qPayload = buildQuestionPayload(sessId);
    if (qPayload) {
      // للطالب: أخفِ الإجابات الصحيحة
      if (!hasStaff) {
        delete qPayload.question.correct;
        delete qPayload.question.explanation;
      }
      res.write(`event: question\ndata: ${JSON.stringify(qPayload)}\n\n`);
    }
    // إرسال الترتيب الحالي
    const board = d.prepare(`
      SELECT lsa.user_id, SUM(lsa.is_correct) AS score
      FROM live_session_answers lsa
      WHERE lsa.session_id = ? GROUP BY lsa.user_id
      ORDER BY score DESC LIMIT 20
    `).all(sessId).map((r, i) => ({ rank: i + 1, userId: r.user_id, score: r.score }));
    res.write(`event: leaderboard\ndata: ${JSON.stringify({ board })}\n\n`);

    // هل أجاب الطالب على السؤال الحالي؟
    const ids = tryJson(sess.question_ids, []);
    const qid = ids[sess.current_q];
    if (qid && !hasStaff) {
      const myAns = d.prepare(
        'SELECT selected, is_correct FROM live_session_answers WHERE session_id=? AND user_id=? AND question_id=?'
      ).get(sessId, req.user.id, qid);
      if (myAns) {
        const q = d.prepare('SELECT correct FROM questions WHERE id=?').get(qid);
        res.write(`event: answer_ack\ndata: ${JSON.stringify({
          isCorrect: !!myAns.is_correct,
          selected : tryJson(myAns.selected, []),
          correct  : tryJson(q?.correct, []),
        })}\n\n`);
      }
    }
  }

  // إعلام المدرب بمتصل جديد
  hub.emitToInstructors(sessId, 'connected_count', { count: hub.connectedCount(sessId) });

  // تنظيف عند قطع الاتصال
  req.on('close', () => {
    cleanup();
    hub.emitToInstructors(sessId, 'connected_count', { count: hub.connectedCount(sessId) });
  });
}));

// ══════════════════════════════════════════════════════════════════════════════
// SCHOOL / INSTRUCTOR side
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/live/school
router.get('/school', auth.requireRole('school', 'instructor', 'admin'), wrap(async (req, res) => {
  const d   = db.get();
  const sid = req.user.school_id;
  if (!sid && req.user.role !== 'admin') throw bad('no school');

  const rows = d.prepare(`
    SELECT ls.*, u.name AS creator_name
    FROM live_sessions ls JOIN users u ON u.id = ls.created_by
    ${req.user.role === 'admin' ? '' : 'WHERE ls.school_id = ?'}
    ORDER BY ls.created_at DESC LIMIT 20
  `).all(...(req.user.role === 'admin' ? [] : [sid]));

  res.json({ sessions: rows.map(r => ({ ...r, question_ids: tryJson(r.question_ids, []) })) });
}));

// GET /api/live/series — قائمة السلاسل المنشورة (للمؤسسات)
router.get('/series', auth.requireRole('school', 'instructor', 'admin'), wrap(async (req, res) => {
  const d = db.get();
  const rows = d.prepare(`
    SELECT s.id, s.title, s.description, COUNT(sq.question_id) AS question_count
    FROM series s
    LEFT JOIN series_questions sq ON sq.series_id = s.id
    WHERE s.published = 1
    GROUP BY s.id
    ORDER BY s.sort, s.id
  `).all();
  res.json(rows);
}));

// POST /api/live/school
router.post('/school', auth.requireRole('school', 'instructor', 'admin'), wrap(async (req, res) => {
  const d   = db.get();
  const sid = req.user.school_id;
  if (!sid && req.user.role !== 'admin') throw bad('no school');

  const { title = 'حصة جماعية', mode = 'exam', count = 40, school_id, source = 'random', series_id } = req.body;
  let targetSchool = req.user.role === 'admin' ? (school_id || sid) : sid;

  // إذا لم يوجد سجل في schools لهذا المستخدم، ننشئه تلقائياً
  if (targetSchool && req.user.role === 'school') {
    const schoolRow = d.prepare('SELECT id FROM schools WHERE owner_id = ? OR id = ?').get(targetSchool, targetSchool);
    if (!schoolRow) {
      const ins = d.prepare(`INSERT INTO schools (name, code, email, owner_id, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))`
      ).run(req.user.name || 'مؤسسة', `sch_${req.user.id}`, req.user.email || '', req.user.id);
      targetSchool = ins.lastInsertRowid;
      // تحديث school_id في users
      d.prepare('UPDATE users SET school_id = ? WHERE id = ?').run(targetSchool, req.user.id);
    } else {
      targetSchool = schoolRow.id;
    }
  }

  if (!targetSchool) throw bad('school_id required');
  if (!['exam', 'practice'].includes(mode)) throw bad('invalid mode');

  let questionIds;
  if (source === 'series' && series_id) {
    // جلب أسئلة السلسلة المختارة بالترتيب
    const seriesRow = d.prepare('SELECT id FROM series WHERE id = ? AND published = 1').get(Number(series_id));
    if (!seriesRow) throw bad('series_not_found');
    const sqRows = d.prepare('SELECT question_id FROM series_questions WHERE series_id = ? ORDER BY position').all(Number(series_id));
    questionIds = sqRows.map((r) => r.question_id);
    if (!questionIds.length) throw bad('series_empty');
  } else {
    // عشوائي من بنك الأسئلة
    const qCount = Math.min(Math.max(Number(count) || 40, 5), 46);
    questionIds = drawExamPublic(qCount);
    if (!questionIds.length) throw bad('no_questions');
  }

  const info = d.prepare(`
    INSERT INTO live_sessions (school_id, created_by, title, mode, status, question_ids)
    VALUES (?, ?, ?, ?, 'waiting', ?)
  `).run(targetSchool, req.user.id, title, mode, JSON.stringify(questionIds));

  res.status(201).json({ id: info.lastInsertRowid, questionCount: questionIds.length });
}));

// POST /api/live/school/:id/start
router.post('/school/:id/start', auth.requireRole('school', 'instructor', 'admin'), wrap(async (req, res) => {
  const d    = db.get();
  const sess = getSession(int(req.params.id));
  if (!sess) return res.status(404).json({ error: 'not_found' });
  if (!sameSchool(req, sess.school_id)) return res.status(403).json({ error: 'forbidden' });
  if (sess.status !== 'waiting') throw bad('already_started');

  d.prepare(`UPDATE live_sessions SET status='live', started_at=datetime('now'), current_q=0 WHERE id=?`).run(sess.id);

  // SSE: إعلام بتغيير الحالة
  hub.emit(sess.id, 'session', { status: 'live' });

  // SSE: إرسال السؤال الأول
  const qPayload = buildQuestionPayload(sess.id);
  if (qPayload) {
    // للطلاب: بدون إجابات
    const studentPayload = { ...qPayload, question: { ...qPayload.question } };
    delete studentPayload.question.correct;
    delete studentPayload.question.explanation;
    hub.emit(sess.id, 'question', studentPayload);
    // للمدرب: مع الإجابات
    hub.emitToInstructors(sess.id, 'question_full', qPayload);
  }

  res.json({ ok: true });
}));

// POST /api/live/school/:id/next
router.post('/school/:id/next', auth.requireRole('school', 'instructor', 'admin'), wrap(async (req, res) => {
  const d    = db.get();
  const sess = getSession(int(req.params.id));
  if (!sess) return res.status(404).json({ error: 'not_found' });
  if (!sameSchool(req, sess.school_id)) return res.status(403).json({ error: 'forbidden' });
  if (sess.status !== 'live') throw bad('not_live');

  const ids   = tryJson(sess.question_ids, []);
  const nextQ = sess.current_q + 1;
  if (nextQ >= ids.length) throw bad('no_more_questions');

  d.prepare('UPDATE live_sessions SET current_q=? WHERE id=?').run(nextQ, sess.id);

  // SSE: سؤال جديد
  const qPayload = buildQuestionPayload(sess.id);
  if (qPayload) {
    const studentPayload = { ...qPayload, question: { ...qPayload.question } };
    delete studentPayload.question.correct;
    delete studentPayload.question.explanation;
    hub.emit(sess.id, 'question', studentPayload);
    hub.emitToInstructors(sess.id, 'question_full', qPayload);
  }

  // SSE: إرسال الترتيب المحدّث بعد انتهاء السؤال السابق
  broadcastLeaderboard(sess.id);

  res.json({ ok: true, current_q: nextQ });
}));

// POST /api/live/school/:id/end
router.post('/school/:id/end', auth.requireRole('school', 'instructor', 'admin'), wrap(async (req, res) => {
  const d    = db.get();
  const sess = getSession(int(req.params.id));
  if (!sess) return res.status(404).json({ error: 'not_found' });
  if (!sameSchool(req, sess.school_id)) return res.status(403).json({ error: 'forbidden' });

  d.prepare(`UPDATE live_sessions SET status='ended', ended_at=datetime('now') WHERE id=?`).run(sess.id);

  // SSE: الترتيب النهائي ثم الإنهاء
  const finalBoard = broadcastLeaderboard(sess.id);
  hub.emit(sess.id, 'session', { status: 'ended', finalBoard });

  res.json({ ok: true });
}));

// GET /api/live/school/:id/results
router.get('/school/:id/results', auth.requireRole('school', 'instructor', 'admin'), wrap(async (req, res) => {
  const d    = db.get();
  const sess = getSession(int(req.params.id));
  if (!sess) return res.status(404).json({ error: 'not_found' });
  if (!sameSchool(req, sess.school_id)) return res.status(403).json({ error: 'forbidden' });

  const ids          = tryJson(sess.question_ids, []);
  const participants = d.prepare(
    'SELECT DISTINCT user_id FROM live_session_answers WHERE session_id = ?'
  ).all(sess.id).map(r => r.user_id);

  // الأسئلة مرتبة بنسبة الخطأ تنازلياً (للتصحيح الجماعي الذكي)
  const questionStats = ids.map((qid, idx) => {
    const answers = d.prepare(`
      SELECT lsa.user_id, lsa.is_correct, u.name, u.first_name_ar, u.last_name_ar
      FROM live_session_answers lsa JOIN users u ON u.id = lsa.user_id
      WHERE lsa.session_id = ? AND lsa.question_id = ?
    `).all(sess.id, qid);

    const correct    = answers.filter(a => a.is_correct).length;
    const total      = answers.length;
    const errorRate  = total > 0 ? Math.round(100 * (total - correct) / total) : null;
    const wrongStudents = answers
      .filter(a => !a.is_correct)
      .map(a => ({ id: a.user_id, name: a.first_name_ar || a.name }));

    return { idx, question_id: qid, correct, total, errorRate, wrongStudents };
  }).sort((a, b) => (b.errorRate ?? -1) - (a.errorRate ?? -1)); // الأكثر خطأً أولاً

  // لوحة الترتيب النهائية
  const leaderboard = d.prepare(`
    SELECT lsa.user_id,
           SUM(lsa.is_correct)  AS score,
           COUNT(*)             AS answered
    FROM live_session_answers lsa
    WHERE lsa.session_id = ?
    GROUP BY lsa.user_id
    ORDER BY score DESC
    LIMIT 20
  `).all(sess.id).map((r, i) => ({ rank: i + 1, ...r }));

  res.json({
    session      : { ...sess, question_ids: ids },
    participants : participants.length,
    questionStats,
    leaderboard,
  });
}));

// ══════════════════════════════════════════════════════════════════════════════
// STUDENT side
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/live/active
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

  const hasAccess = sess
    ? !!d.prepare('SELECT 1 FROM live_session_access WHERE user_id=? AND school_id=?').get(req.user.id, sid)
    : false;

  res.json({ session: sess, hasAccess });
}));

// POST /api/live/:id/join
router.post('/:id/join', wrap(async (req, res) => {
  const d    = db.get();
  const sess = getSession(int(req.params.id));
  if (!sess) return res.status(404).json({ error: 'not_found' });
  if (!sameSchool(req, sess.school_id)) return res.status(403).json({ error: 'forbidden' });
  if (sess.status === 'ended') throw bad('session_ended');

  d.prepare('INSERT OR IGNORE INTO live_session_access (user_id, school_id) VALUES (?,?)')
    .run(req.user.id, sess.school_id);

  res.json({ ok: true, joined: true, current_q: sess.current_q, status: sess.status });
}));

// GET /api/live/:id/state  (REST fallback — للحالة الأولية بعد الانضمام)
router.get('/:id/state', wrap(async (req, res) => {
  const d    = db.get();
  const sess = getSession(int(req.params.id));
  if (!sess) return res.status(404).json({ error: 'not_found' });

  const access = d.prepare('SELECT 1 FROM live_session_access WHERE user_id=? AND school_id=?')
    .get(req.user.id, sess.school_id);
  if (!access && !isStaff(req)) return res.status(403).json({ error: 'forbidden' });

  const ids = tryJson(sess.question_ids, []);
  const qid = ids[sess.current_q];

  let question = null;
  if (qid && sess.status === 'live') {
    const q = d.prepare(`
      SELECT q.id, q.text, q.image, q.image_alt, q.is_double, q.sub_questions,
             q.options, q.correct, q.explanation, c.name_ar AS cat
      FROM questions q LEFT JOIN categories c ON c.id = q.category_id
      WHERE q.id = ?
    `).get(qid);
    if (q) {
      question = { ...q, options: tryJson(q.options, []), sub_questions: tryJson(q.sub_questions, null) };
      if (!isStaff(req)) { delete question.correct; delete question.explanation; }
      else question.correct = tryJson(q.correct, []);
    }
  }

  const myAnswer = qid ? d.prepare(
    'SELECT selected, is_correct FROM live_session_answers WHERE session_id=? AND user_id=? AND question_id=?'
  ).get(sess.id, req.user.id, qid) : null;

  const answered = qid ? d.prepare(
    'SELECT COUNT(*) AS n FROM live_session_answers WHERE session_id=? AND question_id=?'
  ).get(sess.id, qid).n : 0;

  // لوحة الترتيب
  const board = d.prepare(`
    SELECT user_id, SUM(is_correct) AS score
    FROM live_session_answers WHERE session_id=?
    GROUP BY user_id ORDER BY score DESC LIMIT 20
  `).all(sess.id).map((r, i) => ({ rank: i + 1, userId: r.user_id, score: r.score }));

  res.json({
    status   : sess.status, current_q: sess.current_q, total: ids.length,
    question, answered, board,
    myAnswer : myAnswer
      ? { selected: tryJson(myAnswer.selected, []), isCorrect: !!myAnswer.is_correct }
      : null,
    connectedCount: hub.connectedCount(sess.id),
  });
}));

// POST /api/live/:id/answer
router.post('/:id/answer', wrap(async (req, res) => {
  const d    = db.get();
  const sess = getSession(int(req.params.id));
  if (!sess) return res.status(404).json({ error: 'not_found' });
  if (sess.status !== 'live') throw bad('not_live');

  const access = d.prepare('SELECT 1 FROM live_session_access WHERE user_id=? AND school_id=?')
    .get(req.user.id, sess.school_id);
  if (!access && !isStaff(req)) return res.status(403).json({ error: 'forbidden' });

  const ids = tryJson(sess.question_ids, []);
  const qid = ids[sess.current_q];
  if (!qid) throw bad('no_question');

  const { selected = [] } = req.body;
  if (!Array.isArray(selected)) throw bad('selected must be array');

  // هل سبق وأجاب؟
  const existing = d.prepare(
    'SELECT 1 FROM live_session_answers WHERE session_id=? AND user_id=? AND question_id=?'
  ).get(sess.id, req.user.id, qid);
  if (existing) throw bad('already_answered');

  // حساب الصواب
  const qRow    = d.prepare('SELECT correct FROM questions WHERE id=?').get(qid);
  const correct = tryJson(qRow?.correct, []).map(Number);
  const sel     = selected.map(Number);
  const isCorrect = correct.length > 0
    && correct.every(n => sel.includes(n))
    && sel.every(n => correct.includes(n)) ? 1 : 0;

  d.prepare(`
    INSERT OR IGNORE INTO live_session_answers (session_id, user_id, question_id, selected, is_correct)
    VALUES (?, ?, ?, ?, ?)
  `).run(sess.id, req.user.id, qid, JSON.stringify(sel), isCorrect);

  // SSE: إعلام الطالب بنتيجة إجابته
  hub.emitTo(sess.id, req.user.id, 'answer_ack', {
    isCorrect: !!isCorrect,
    selected : sel,
    correct,
  });

  // SSE: تحديث عداد المجيبين للجميع
  const answeredCount = d.prepare(
    'SELECT COUNT(*) AS n FROM live_session_answers WHERE session_id=? AND question_id=?'
  ).get(sess.id, qid).n;
  hub.emit(sess.id, 'answered_count', { count: answeredCount, questionId: qid });

  // SSE: تحديث لوحة الترتيب (بدون الإجابة الصحيحة)
  broadcastLeaderboard(sess.id);

  res.json({ ok: true, isCorrect: !!isCorrect, correct });
}));

module.exports = router;
