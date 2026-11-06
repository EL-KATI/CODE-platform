'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const auth = require('../auth');
const { wrap, str, bad, EMAIL_RE, HttpError } = require('../http');

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'too_many_requests' } });

function password(v) {
  const p = str(v, { min: 8, max: 128, field: 'password' });
  if (!/[A-Za-z؀-ۿ]/.test(p) || !/\d/.test(p)) throw bad('weak_password');
  return p;
}

router.post('/register', limiter, wrap(async (req, res) => {
  const name = str(req.body.name, { min: 2, max: 80, field: 'name' });
  const email = str(req.body.email, { min: 5, max: 160, field: 'email' }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw bad('invalid_email');
  const pw = password(req.body.password);
  if (!req.body.acceptTerms) throw bad('terms_required');
  const locale = req.body.locale === 'fr' ? 'fr' : 'ar';
  const d = db.get();
  if (d.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'email_taken');
  const info = d.prepare('INSERT INTO users (email, name, password_hash, locale) VALUES (?,?,?,?)')
    .run(email, name, await auth.hashPassword(pw), locale);
  const user = d.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  auth.issueSession(res, user);
  res.status(201).json({ user: auth.publicUser(user) });
}));

router.post('/login', limiter, wrap(async (req, res) => {
  const email = str(req.body.email, { max: 160, field: 'email' }).toLowerCase();
  const pw = str(req.body.password, { max: 128, field: 'password' });
  const d = db.get();
  const user = d.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !user.active || !(await auth.checkPassword(pw, user.password_hash))) {
    throw new HttpError(401, 'invalid_credentials');
  }
  d.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  auth.issueSession(res, user);
  res.json({ user: auth.publicUser(user) });
}));

router.post('/logout', (req, res) => {
  auth.clearSession(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => res.json({ user: auth.publicUser(req.user) }));

module.exports = router;
module.exports.password = password;
