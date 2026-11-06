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
const staff = auth.requireRole('instructor', 'admin');
const adminOnly = auth.requireRole('admin');
router.use(staff);

const VISUAL_TYPES = ['sign', 'junction', 'driver', 'overtake', 'distance', 'road', 'parking', 'speed', 'dashboard', 'lights', 'mechanic', 'firstaid', 'safety', 'photo'];

// --- Statistiques -------------------------------------------------------------
router.get('/stats', (req, res) => {
  const d = db.get();
  const s = db.getSettings();
  res.json({
    users: d.prepare('SELECT role, COUNT(*) AS n FROM users GROUP BY role').all(),
    newUsers30: d.prepare("SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now','-30 days')").get().n,
    activeUsers7: d.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM attempts WHERE started_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')").get().n,
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

// --- Élèves -------------------------------------------------------------------
router.get('/students', (req, res) => {
  const q = `%${(req.query.q || '').toString().slice(0, 80)}%`;
  res.json(db.get().prepare(`SELECT u.id, u.name, u.email, u.created_at, u.last_login_at, u.exam_date, u.active,
      (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.finished_at IS NOT NULL) AS attempts,
      (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.mode='exam' AND a.passed = 1) AS exams_passed,
      (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.mode='exam' AND a.finished_at IS NOT NULL) AS exams,
      (SELECT MAX(a.finished_at) FROM attempts a WHERE a.user_id = u.id) AS last_activity
    FROM users u WHERE u.role = 'student' AND (u.name LIKE ? OR u.email LIKE ?) ORDER BY last_activity DESC NULLS LAST, u.id DESC LIMIT 500`).all(q, q));
});

router.get('/students/:id', wrap(async (req, res) => {
  const u = db.get().prepare('SELECT * FROM users WHERE id = ?').get(int(req.params.id, { min: 1 }));
  if (!u) throw notFound();
  res.json({ user: auth.publicUser(u), dashboard: progress.dashboard(u.id) });
}));

// --- Questions ----------------------------------------------------------------
function rowToAdmin(r) {
  return { ...r, options: JSON.parse(r.options), correct: JSON.parse(r.correct), visual: r.visual ? JSON.parse(r.visual) : null };
}

function validateQuestion(b) {
  const d = db.get();
  const categoryId = int(b.categoryId, { min: 1, field: 'categoryId' });
  if (!d.prepare('SELECT 1 FROM categories WHERE id = ?').get(categoryId)) throw bad('invalid_field', { field: 'categoryId' });
  if (!Array.isArray(b.options)) throw bad('invalid_field', { field: 'options' });
  const options = b.options.map((o) => str(o, { min: 1, max: 300, field: 'options' }));
  if (options.length < 2 || options.length > 4) throw bad('options_count');
  if (!Array.isArray(b.correct) || !b.correct.length) throw bad('correct_required');
  const correct = [...new Set(b.correct.map(Number))].sort((x, y) => x - y);
  if (correct.some((c) => !Number.isInteger(c) || c < 1 || c > options.length)) throw bad('invalid_field', { field: 'correct' });
  let visual = null;
  if (b.visual && b.visual.type) {
    if (!VISUAL_TYPES.includes(b.visual.type)) throw bad('invalid_field', { field: 'visual' });
    visual = { type: b.visual.type, sub: str(b.visual.sub || '', { max: 60, field: 'visual' }) };
  }
  let image = null;
  if (b.image) {
    image = str(b.image, { max: 500, field: 'image' });
    if (!/^(\/uploads\/[\w.-]+|https:\/\/[^\s"'<>]+)$/.test(image)) throw bad('invalid_field', { field: 'image' });
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
    question_type: ['½', '½½', '3/../', '4/../'].includes(b.question_type) ? b.question_type : '3/../',
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

router.post('/questions', wrap(async (req, res) => {
  const v = validateQuestion(req.body || {});
  const info = db.get().prepare(`INSERT INTO questions (category_id, text, options, correct, explanation, visual, image, image_alt, video, audio_text, difficulty, status, question_type, skill_type)
    VALUES (@category_id, @text, @options, @correct, @explanation, @visual, @image, @image_alt, @video, @audio_text, @difficulty, @status, @question_type, @skill_type)`).run(v);
  db.audit(req.user.id, 'create', 'question', info.lastInsertRowid);
  res.status(201).json(rowToAdmin(db.get().prepare('SELECT * FROM questions WHERE id = ?').get(info.lastInsertRowid)));
}));

router.put('/questions/:id', wrap(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  if (!db.get().prepare('SELECT 1 FROM questions WHERE id = ?').get(id)) throw notFound();
  const v = validateQuestion(req.body || {});
  db.get().prepare(`UPDATE questions SET category_id=@category_id, text=@text, options=@options, correct=@correct, explanation=@explanation,
    visual=@visual, image=@image, image_alt=@image_alt, video=@video, audio_text=@audio_text, difficulty=@difficulty, status=@status,
    question_type=@question_type, skill_type=@skill_type, updated_at=datetime('now') WHERE id=@id`).run({ ...v, id });
  db.audit(req.user.id, 'update', 'question', id);
  res.json(rowToAdmin(db.get().prepare('SELECT * FROM questions WHERE id = ?').get(id)));
}));

router.delete('/questions/:id', wrap(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  const d = db.get();
  // Une question déjà utilisée dans des tentatives est archivée (pour garder l'historique), sinon supprimée.
  const used = d.prepare('SELECT 1 FROM attempt_answers WHERE question_id = ? LIMIT 1').get(id);
  if (used) d.prepare("UPDATE questions SET status = 'archived', updated_at = datetime('now') WHERE id = ?").run(id);
  else d.prepare('DELETE FROM questions WHERE id = ?').run(id);
  db.audit(req.user.id, used ? 'archive' : 'delete', 'question', id);
  res.json({ ok: true, archived: !!used });
}));

router.get('/questions-export', (req, res) => {
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

router.post('/questions-import', wrap(async (req, res) => {
  const list = Array.isArray(req.body) ? req.body : (req.body && req.body.questions);
  if (!Array.isArray(list) || !list.length) throw bad('invalid_import');
  if (list.length > 5000) throw bad('import_too_large');
  const d = db.get();
  const cats = new Map(d.prepare('SELECT id, slug FROM categories').all().map((c) => [c.slug, c.id]));
  const ins = d.prepare(`INSERT INTO questions (category_id, text, options, correct, explanation, visual, image, image_alt, difficulty, status)
    VALUES (@category_id, @text, @options, @correct, @explanation, @visual, @image, @image_alt, @difficulty, @status)`);
  let created = 0;
  const errors = [];
  d.transaction(() => {
    list.forEach((raw, i) => {
      try {
        const categoryId = raw.categoryId || cats.get(raw.category);
        ins.run(validateQuestion({ ...raw, categoryId }));
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
router.post('/uploads', wrap(async (req, res) => {
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
router.post('/uploads-video', express.raw({ type: ['video/mp4', 'video/webm'], limit: '30mb' }), wrap(async (req, res) => {
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

router.post('/series', wrap(async (req, res) => res.status(201).json({ id: saveSeries(null, req.body || {}, req.user.id) })));
router.put('/series/:id', wrap(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  if (!db.get().prepare('SELECT 1 FROM series WHERE id = ?').get(id)) throw notFound();
  res.json({ id: saveSeries(id, req.body || {}, req.user.id) });
}));
router.delete('/series/:id', wrap(async (req, res) => {
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

router.post('/lessons', wrap(async (req, res) => res.status(201).json({ id: saveLesson(null, req.body || {}, req.user.id) })));
router.put('/lessons/:id', wrap(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  if (!db.get().prepare('SELECT 1 FROM lessons WHERE id = ?').get(id)) throw notFound();
  res.json({ id: saveLesson(id, req.body || {}, req.user.id) });
}));
router.delete('/lessons/:id', wrap(async (req, res) => {
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
router.get('/users', adminOnly, (req, res) => {
  const q = `%${(req.query.q || '').toString().slice(0, 80)}%`;
  res.json(db.get().prepare(`SELECT id, name, email, role, active, locale, created_at, last_login_at FROM users
    WHERE name LIKE ? OR email LIKE ? ORDER BY id DESC LIMIT 500`).all(q, q));
});

router.post('/users', adminOnly, wrap(async (req, res) => {
  const { password } = require('./auth');
  const body = req.body || {};
  const name = str(body.name, { min: 2, max: 80, field: 'name' });
  const email = str(body.email, { min: 5, max: 160, field: 'email' }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw bad('invalid_email');
  const pw = password(body.password);
  const role = body.role && ['student', 'instructor', 'admin'].includes(body.role) ? body.role : 'student';
  const locale = body.locale === 'fr' ? 'fr' : 'ar';
  const d = db.get();
  if (d.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'email_taken');
  const info = d.prepare('INSERT INTO users (email, name, password_hash, role, locale) VALUES (?,?,?,?,?)')
    .run(email, name, await auth.hashPassword(pw), role, locale);
  db.audit(req.user.id, 'create', 'user', info.lastInsertRowid, { name, email, role });
  res.status(201).json({ id: info.lastInsertRowid, name, email, role, active: 1 });
}));

router.patch('/users/:id', adminOnly, wrap(async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  const d = db.get();
  const u = d.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) throw notFound();
  const b = req.body || {};
  if (id === req.user.id && (b.role && b.role !== 'admin' || b.active === false)) throw bad('cannot_demote_self');
  if (b.role !== undefined) {
    if (!['student', 'instructor', 'admin'].includes(b.role)) throw bad('invalid_field', { field: 'role' });
    d.prepare('UPDATE users SET role = ? WHERE id = ?').run(b.role, id);
  }
  if (b.active !== undefined) d.prepare('UPDATE users SET active = ? WHERE id = ?').run(b.active ? 1 : 0, id);
  db.audit(req.user.id, 'update', 'user', id, { role: b.role, active: b.active });
  res.json({ ok: true });
}));

router.delete('/users/:id', adminOnly, wrap(async (req, res) => {
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

router.get('/audit', adminOnly, (req, res) => {
  res.json(db.get().prepare(`SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 200`).all());
});

module.exports = router;
