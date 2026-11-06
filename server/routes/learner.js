'use strict';
/** Espace élève : tentatives (examens / entraînements), progression, favoris, profil, RGPD. */
const express = require('express');
const db = require('../db');
const auth = require('../auth');
const attempts = require('../services/attempts');
const progress = require('../services/progress');
const { wrap, str, int, bad, notFound, HttpError } = require('../http');
const { password } = require('./auth');

const router = express.Router();
router.use(auth.requireAuth);

// --- Tentatives -----------------------------------------------------------
router.post('/attempts', wrap(async (req, res) => res.status(201).json(attempts.create(req.user, req.body || {}))));
router.get('/attempts', wrap(async (req, res) => res.json(attempts.list(req.user, Math.min(Number(req.query.limit) || 30, 200)))));
router.get('/attempts/:id', wrap(async (req, res) => res.json(attempts.load(req.user, int(req.params.id, { min: 1 })))));
router.post('/attempts/:id/answers', wrap(async (req, res) => res.json(attempts.answer(req.user, int(req.params.id, { min: 1 }), req.body || {}))));
router.post('/attempts/:id/finish', wrap(async (req, res) => res.json(attempts.finish(req.user, int(req.params.id, { min: 1 })))));

// --- Progression ----------------------------------------------------------
router.get('/me/dashboard', (req, res) => res.json(progress.dashboard(req.user.id)));

router.post('/lessons/:id/complete', wrap(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  if (!db.get().prepare('SELECT 1 FROM lessons WHERE id = ?').get(id)) throw notFound('lesson_not_found');
  db.get().prepare('INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)').run(req.user.id, id);
  res.json({ completed: true });
}));
router.delete('/lessons/:id/complete', wrap(async (req, res) => {
  db.get().prepare('DELETE FROM lesson_progress WHERE user_id = ? AND lesson_id = ?').run(req.user.id, int(req.params.id, { min: 1 }));
  res.json({ completed: false });
}));

router.put('/questions/:id/bookmark', wrap(async (req, res) => {
  const qid = int(req.params.id, { min: 1 });
  if (!db.get().prepare('SELECT 1 FROM questions WHERE id = ?').get(qid)) throw notFound();
  const on = req.body && req.body.bookmarked ? 1 : 0;
  db.get().prepare(`INSERT INTO user_questions (user_id, question_id, bookmarked) VALUES (?,?,?)
    ON CONFLICT(user_id, question_id) DO UPDATE SET bookmarked = excluded.bookmarked`).run(req.user.id, qid, on);
  res.json({ bookmarked: !!on });
}));

// Liste des questions ratées (avec correction) pour la page « Mes erreurs ».
router.get('/me/mistakes', (req, res) => {
  const rows = db.get().prepare(`SELECT q.*, uq.wrong, uq.correct AS right_count, uq.bookmarked FROM user_questions uq
    JOIN questions q ON q.id = uq.question_id AND q.status = 'published'
    WHERE uq.user_id = ? AND (uq.last_result = 0 OR uq.bookmarked = 1) ORDER BY uq.updated_at DESC LIMIT 200`).all(req.user.id);
  res.json(rows.map((r) => ({
    id: r.id, categoryId: r.category_id, text: r.text, options: JSON.parse(r.options), correct: JSON.parse(r.correct),
    explanation: r.explanation, visual: r.visual ? JSON.parse(r.visual) : null, image: r.image, imageAlt: r.image_alt,
    wrong: r.wrong, right: r.right_count, bookmarked: !!r.bookmarked,
  })));
});

// --- Profil -----------------------------------------------------------------
router.patch('/me', wrap(async (req, res) => {
  const d = db.get();
  const b = req.body || {};
  if (b.name !== undefined) d.prepare('UPDATE users SET name = ? WHERE id = ?').run(str(b.name, { min: 2, max: 80, field: 'name' }), req.user.id);
  if (b.locale !== undefined) d.prepare('UPDATE users SET locale = ? WHERE id = ?').run(b.locale === 'fr' ? 'fr' : 'ar', req.user.id);
  if (b.examDate !== undefined) {
    const v = b.examDate ? str(b.examDate, { max: 10, field: 'examDate' }) : null;
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad('invalid_field', { field: 'examDate' });
    d.prepare('UPDATE users SET exam_date = ? WHERE id = ?').run(v, req.user.id);
  }
  res.json({ user: auth.publicUser(d.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
}));

router.post('/me/password', wrap(async (req, res) => {
  const cur = str((req.body || {}).currentPassword, { max: 128, field: 'currentPassword' });
  if (!(await auth.checkPassword(cur, req.user.password_hash))) throw new HttpError(401, 'invalid_credentials');
  const next = password(req.body.newPassword);
  db.get().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await auth.hashPassword(next), req.user.id);
  res.json({ ok: true });
}));

// Portabilité des données (loi 09-08 / RGPD).
router.get('/me/export', (req, res) => {
  const d = db.get();
  const u = req.user.id;
  const data = {
    exportedAt: new Date().toISOString(),
    user: auth.publicUser(req.user),
    lessons: d.prepare('SELECT lesson_id, completed_at FROM lesson_progress WHERE user_id = ?').all(u),
    attempts: d.prepare('SELECT * FROM attempts WHERE user_id = ?').all(u),
    answers: d.prepare('SELECT aa.* FROM attempt_answers aa JOIN attempts a ON a.id = aa.attempt_id WHERE a.user_id = ?').all(u),
    questions: d.prepare('SELECT * FROM user_questions WHERE user_id = ?').all(u),
  };
  res.setHeader('Content-Disposition', 'attachment; filename="my-data.json"');
  res.json(data);
});

// Droit à l'effacement.
router.delete('/me', wrap(async (req, res) => {
  const pw = str((req.body || {}).password, { max: 128, field: 'password' });
  if (!(await auth.checkPassword(pw, req.user.password_hash))) throw new HttpError(401, 'invalid_credentials');
  if (req.user.role === 'admin' && db.get().prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n <= 1) {
    throw bad('last_admin');
  }
  db.get().prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  auth.clearSession(res);
  res.json({ ok: true });
}));

module.exports = router;
