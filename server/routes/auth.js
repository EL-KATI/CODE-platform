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

const crypto = require('crypto');
const PW_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function generatePassword(len = 12) {
  let out = '';
  for (let i = 0; i < len; i++) out += PW_ALPHABET[crypto.randomInt(PW_ALPHABET.length)];
  return out;
}
module.exports.generatePassword = generatePassword;

const clean = (v, max) => (v === undefined || v === null ? null : (String(v).trim().slice(0, max) || null));

router.post('/register', limiter, wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.acceptTerms) throw bad('terms_required');

  // ── البريد الإلكتروني ──
  const email = str(b.email, { min: 5, max: 160, field: 'email' }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw bad('invalid_email');

  // ── الحقول الإلزامية ──
  const first_name_fr = clean(b.first_name_fr, 80);
  const last_name_fr  = clean(b.last_name_fr,  80);
  const cin           = clean(b.cin, 20);
  const phone         = clean(b.phone, 30);
  if (!first_name_fr) throw bad('invalid_field', { field: 'first_name_fr' });
  if (!last_name_fr)  throw bad('invalid_field', { field: 'last_name_fr'  });
  if (!cin)           throw bad('invalid_field', { field: 'cin'           });
  if (!phone)         throw bad('invalid_field', { field: 'phone'         });
  const id_type = ['CIN', 'CD', 'CS'].includes(b.id_type) ? b.id_type : 'CIN';
  const gender  = ['M', 'F'].includes(b.gender) ? b.gender : null;

  // ── الاسم المعروض ──
  const name = `${first_name_fr} ${last_name_fr}`.trim();

  // ── الحقول الاختيارية ──
  const extra = {
    gender, id_type, cin, phone,
    first_name_fr, last_name_fr,
    first_name_ar:  clean(b.first_name_ar,  80),
    last_name_ar:   clean(b.last_name_ar,   80),
    nationality:    clean(b.nationality,    50),
    birth_date:     clean(b.birth_date,     10),
    birth_place_fr: clean(b.birth_place_fr, 100),
    birth_place_ar: clean(b.birth_place_ar, 100),
    city:           clean(b.city,           80),
    address_fr:     clean(b.address_fr,     200),
    address_ar:     clean(b.address_ar,     200),
    license_cat:    clean(b.license_cat,    20),
    registration_center: clean(b.registration_center, 100),
    license_num:    clean(b.license_num,    30),
    valid_categories: clean(b.valid_categories, 100),
  };

  // ── البحث عن المؤسسة بـ narsa_num (اختياري) ──
  const narsa_num = clean(b.school_narsa_num, 40);
  let school_id = null;
  if (narsa_num) {
    const school = db.get().prepare("SELECT id FROM users WHERE role = 'school' AND narsa_num = ? AND active = 1 LIMIT 1").get(narsa_num);
    if (!school) throw bad('school_not_found');
    school_id = school.id;
  }

  const locale = ['fr', 'ar', 'ar-dialect'].includes(b.locale) ? b.locale : 'ar';
  const pw   = generatePassword();
  const hash = await auth.hashPassword(pw);

  const d = db.get();
  if (d.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'email_taken');

  const extraCols  = Object.keys(extra);
  const extraVals  = Object.values(extra);
  const baseCols   = ['email', 'name', 'password_hash', 'locale', 'role', ...extraCols];
  const baseVals   = [email, name, hash, locale, 'student', ...extraVals];
  if (school_id !== null) { baseCols.push('school_id'); baseVals.push(school_id); }

  const info = d.prepare(`INSERT INTO users (${baseCols.join(',')}) VALUES (${baseCols.map(() => '?').join(',')})`)
    .run(...baseVals);
  const user = d.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  auth.issueSession(res, user);
  res.status(201).json({ user: auth.publicUser(user), generatedPassword: pw });
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
