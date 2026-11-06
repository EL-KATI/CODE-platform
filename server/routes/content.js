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

router.get('/lessons', (req, res) => {
  const uid = req.user ? req.user.id : 0;
  res.json(db.get().prepare(`SELECT l.id, l.slug, l.title, l.summary, l.minutes, l.category_id, l.sort,
      EXISTS(SELECT 1 FROM lesson_progress lp WHERE lp.lesson_id = l.id AND lp.user_id = ?) AS completed
    FROM lessons l WHERE l.published = 1 ORDER BY l.sort, l.id`).all(uid));
});

router.get('/lessons/:slug', wrap(async (req, res) => {
  const d = db.get();
  const l = d.prepare('SELECT * FROM lessons WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!l) throw notFound('lesson_not_found');
  const uid = req.user ? req.user.id : 0;
  l.completed = !!d.prepare('SELECT 1 FROM lesson_progress WHERE user_id = ? AND lesson_id = ?').get(uid, l.id);
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
