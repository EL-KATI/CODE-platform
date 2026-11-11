'use strict';

const express = require('express');
const db      = require('../db');
const auth    = require('../auth');
const { wrap, int, bad } = require('../http');

const router = express.Router();
router.use(auth.requireAuth);

const CHALLENGE_SIZE = 7;

// ── GET /api/challenge/today ─────────────────────────────────────────────────
// حالة المترشح اليوم + بطل الكود العام + صدارة المؤسسة
router.get('/today', wrap(async (req, res) => {
  const d    = db.get();
  const uid  = req.user.id;
  const sid  = req.user.school_id || null;
  const today = new Date().toISOString().slice(0, 10);

  // هل أجرى اليوم تحدياً؟
  const mine = d.prepare(
    `SELECT score, time_taken FROM daily_challenges WHERE user_id=? AND challenge_date=?`
  ).get(uid, today) || null;

  // بطل الكود العام (أعلى نقطة، أقل وقت)
  const globalChamp = d.prepare(`
    SELECT dc.score, dc.time_taken, u.name, u.google_picture AS picture
    FROM daily_challenges dc
    JOIN users u ON u.id = dc.user_id
    WHERE dc.challenge_date = ?
    ORDER BY dc.score DESC, dc.time_taken ASC
    LIMIT 1
  `).get(today) || null;

  // صدارة المؤسسة (أعلى 10)
  const schoolBoard = sid ? d.prepare(`
    SELECT dc.score, dc.time_taken, dc.user_id,
           u.name, u.google_picture AS picture,
           ROW_NUMBER() OVER (ORDER BY dc.score DESC, dc.time_taken ASC) AS rank
    FROM daily_challenges dc
    JOIN users u ON u.id = dc.user_id
    WHERE dc.school_id = ? AND dc.challenge_date = ?
    ORDER BY dc.score DESC, dc.time_taken ASC
    LIMIT 10
  `).all(sid, today) : [];

  // ترتيب المترشح في العام
  const globalRank = mine ? (d.prepare(`
    SELECT COUNT(*)+1 AS rank FROM daily_challenges
    WHERE challenge_date=? AND (score > ? OR (score=? AND time_taken < ?))
  `).get(today, mine.score, mine.score, mine.time_taken)?.rank || null) : null;

  res.json({ today, mine, globalChamp, schoolBoard, globalRank });
}));

// ── POST /api/challenge/start ────────────────────────────────────────────────
// يسحب 7 أسئلة عشوائية — يرفض إذا أجرى اليوم بالفعل
router.post('/start', wrap(async (req, res) => {
  const d    = db.get();
  const uid  = req.user.id;
  const today = new Date().toISOString().slice(0, 10);

  const done = d.prepare(
    `SELECT id FROM daily_challenges WHERE user_id=? AND challenge_date=?`
  ).get(uid, today);
  if (done) throw bad('already_done_today');

  const questions = d.prepare(`
    SELECT id, text, options, correct, image, audio_file, is_double, sub_questions
    FROM questions
    WHERE status='published'
    ORDER BY RANDOM()
    LIMIT ?
  `).all(CHALLENGE_SIZE);

  if (questions.length < CHALLENGE_SIZE) throw bad('not_enough_questions');

  // نرسل الأسئلة بدون الإجابات الصحيحة
  const safe = questions.map(({ id, text, options, image, audio_file, is_double, sub_questions }) => ({
    id, text,
    options: JSON.parse(options),
    image: image || null,
    audioFile: audio_file || null,
    isDouble: !!is_double,
    subQuestions: is_double && sub_questions ? JSON.parse(sub_questions) : null,
  }));

  // نخزن IDs + corrects في session مؤقتة (cookie مشفرة)
  const sessionData = questions.map((q) => ({ id: q.id, correct: JSON.parse(q.correct) }));
  res.cookie('ch_session', Buffer.from(JSON.stringify(sessionData)).toString('base64'), {
    httpOnly: true, sameSite: 'strict', maxAge: 30 * 60 * 1000, // 30 دقيقة
  });

  res.json({ questions: safe, size: CHALLENGE_SIZE });
}));

// ── POST /api/challenge/submit ───────────────────────────────────────────────
// يستقبل { answers: [{id, selected:[]}], time_taken }
router.post('/submit', wrap(async (req, res) => {
  const d    = db.get();
  const uid  = req.user.id;
  const sid  = req.user.school_id || null;
  const today = new Date().toISOString().slice(0, 10);

  // تحقق: لم يُسجّل بعد
  const done = d.prepare(
    `SELECT id FROM daily_challenges WHERE user_id=? AND challenge_date=?`
  ).get(uid, today);
  if (done) throw bad('already_done_today');

  // استرجاع session الأسئلة
  const raw = req.cookies?.ch_session;
  if (!raw) throw bad('no_challenge_session');
  let sessionData;
  try { sessionData = JSON.parse(Buffer.from(raw, 'base64').toString()); }
  catch { throw bad('invalid_session'); }

  const timeTaken = int(req.body?.time_taken ?? 0, { min: 0, max: 3600, field: 'time_taken' });
  const answers   = req.body?.answers;
  if (!Array.isArray(answers)) throw bad('missing_answers');

  // تصحيح
  let score = 0;
  const correctMap = new Map(sessionData.map((s) => [s.id, s.correct]));
  for (const ans of answers) {
    const correct = correctMap.get(ans.id);
    if (!correct) continue;
    const sel = Array.isArray(ans.selected) ? ans.selected.map(Number).sort().join(',') : '';
    const exp = correct.map(Number).sort().join(',');
    if (sel === exp) score++;
  }

  // تسجيل النتيجة
  d.prepare(
    `INSERT INTO daily_challenges (user_id, school_id, score, time_taken, challenge_date)
     VALUES (?,?,?,?,?)`
  ).run(uid, sid, score, timeTaken, today);

  res.clearCookie('ch_session');

  // ترتيب المترشح في العام
  const globalRank = d.prepare(`
    SELECT COUNT(*)+1 AS rank FROM daily_challenges
    WHERE challenge_date=? AND (score > ? OR (score=? AND time_taken < ?))
  `).get(today, score, score, timeTaken)?.rank || null;

  res.json({ score, total: CHALLENGE_SIZE, timeTaken, globalRank });
}));

// ── GET /api/challenge/leaderboard ──────────────────────────────────────────
// لوحة الصدارة العامة (أعلى 20)
router.get('/leaderboard', wrap(async (req, res) => {
  const d    = db.get();
  const today = new Date().toISOString().slice(0, 10);

  const global = d.prepare(`
    SELECT dc.score, dc.time_taken, dc.user_id,
           u.name, u.google_picture AS picture,
           s.name AS school_name,
           ROW_NUMBER() OVER (ORDER BY dc.score DESC, dc.time_taken ASC) AS rank
    FROM daily_challenges dc
    JOIN users u ON u.id = dc.user_id
    LEFT JOIN schools s ON s.id = dc.school_id
    WHERE dc.challenge_date = ?
    ORDER BY dc.score DESC, dc.time_taken ASC
    LIMIT 20
  `).all(today);

  res.json({ date: today, leaderboard: global });
}));

module.exports = router;
