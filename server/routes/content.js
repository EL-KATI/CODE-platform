'use strict';
/** Contenu pédagogique public (lecture seule) : thèmes, leçons, séries. */
const express = require('express');
const db = require('../db');
const { wrap, notFound } = require('../http');

const router = express.Router();

router.get('/settings', (req, res) => {
  const s = db.getSettings();
  res.json({ questionCount: s.exam_question_count, passMark: s.exam_pass_mark, secondsPerQuestion: s.exam_seconds_per_question, readinessWindow: s.readiness_window });
});

router.get('/categories', (req, res) => {
  res.json(db.get().prepare(`SELECT c.*, (SELECT COUNT(*) FROM questions q WHERE q.category_id = c.id AND q.status = 'published') AS question_count
    FROM categories c ORDER BY c.sort, c.id`).all());
});

// التكرار المتباعد للدروس: مراجعة بعد 2 ثم 7 ثم 21 يوماً من الإنجاز/آخر مراجعة
const REVIEW_DAYS = [2, 7, 21];
const toMs = (v) => (v ? Date.parse(String(v).replace(' ', 'T') + (/[zZ+]/.test(String(v).slice(10)) ? '' : 'Z')) : NaN);
function reviewDue(completedAt, lastReviewAt, reviews, now = Date.now()) {
  if (reviews >= REVIEW_DAYS.length) return false;
  const base = toMs(lastReviewAt || completedAt);
  return Number.isFinite(base) && now - base >= REVIEW_DAYS[reviews] * 864e5;
}

router.get('/lessons', (req, res) => {
  const uid = req.user ? req.user.id : 0;
  const rows = db.get().prepare(`SELECT l.id, l.slug, l.title, l.summary, l.minutes, l.category_id, l.sort,
      (lp.user_id IS NOT NULL) AS completed, lp.completed_at, lp.reviews, lp.last_review_at,
      (instr(l.body, ':::quiz') > 0 OR instr(l.body, ':::scenario') > 0 OR instr(l.body, ':::reveal') > 0) AS interactive
    FROM lessons l LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = ?
    WHERE l.published = 1 ORDER BY l.sort, l.id`).all(uid);
  const now = Date.now();
  res.json(rows.map(({ completed_at, last_review_at, ...l }) => ({
    ...l,
    reviews: l.reviews || 0,
    reviewDue: !!l.completed && reviewDue(completed_at, last_review_at, l.reviews || 0, now),
  })));
});

router.get('/lessons/:slug', wrap(async (req, res) => {
  const d = db.get();
  const l = d.prepare('SELECT * FROM lessons WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!l) throw notFound('lesson_not_found');
  const uid = req.user ? req.user.id : 0;
  const lp = d.prepare('SELECT completed_at, reviews, last_review_at FROM lesson_progress WHERE user_id = ? AND lesson_id = ?').get(uid, l.id);
  l.completed = !!lp;
  l.reviews = lp ? lp.reviews || 0 : 0;
  l.reviewDue = !!lp && reviewDue(lp.completed_at, lp.last_review_at, lp.reviews || 0);
  const all = d.prepare('SELECT slug, title FROM lessons WHERE published = 1 ORDER BY sort, id').all();
  const i = all.findIndex((x) => x.slug === l.slug);
  l.prev = all[i - 1] || null;
  l.next = all[i + 1] || null;
  res.json(l);
}));

router.get('/series', (req, res) => {
  const uid = req.user ? req.user.id : 0;
  res.json(db.get().prepare(`SELECT s.id, s.title, s.description,
      (SELECT COUNT(*) FROM series_questions sq JOIN questions q ON q.id = sq.question_id AND q.status='published' WHERE sq.series_id = s.id) AS question_count,
      (SELECT MAX(a.score * 100 / a.total) FROM attempts a WHERE a.series_id = s.id AND a.user_id = ? AND a.finished_at IS NOT NULL) AS best
    FROM series s WHERE s.published = 1 ORDER BY s.sort, s.id`).all(uid));
});

module.exports = router;
