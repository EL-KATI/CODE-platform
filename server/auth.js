'use strict';
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('./config');
const db = require('./db');

const COOKIE = 'cp_session';

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: config.sessionDays * 24 * 3600 * 1000,
    path: '/',
  };
}

function issueSession(res, user) {
  const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: `${config.sessionDays}d` });
  res.cookie(COOKIE, token, cookieOptions());
}

function clearSession(res) {
  res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
}

const hashPassword = (p) => bcrypt.hash(p, 12);
const checkPassword = (p, hash) => bcrypt.compare(p, hash);

function publicUser(u) {
  if (!u) return null;
  // school_id يُحوَّل إلى INTEGER دائماً (قد يكون TEXT في قواعد البيانات القديمة)
  const rawSchoolId = u.school_id;
  const schoolId = (rawSchoolId === null || rawSchoolId === undefined || rawSchoolId === '')
    ? null
    : Number(rawSchoolId);
  return {
    id: u.id, email: u.email, name: u.name, role: u.role,
    locale: u.locale, examDate: u.exam_date, createdAt: u.created_at,
    schoolId,
    isSuperAdmin: u.is_super_admin === 1,
  };
}

/** الأدوار المتاحة */
const ROLES = ['student', 'instructor', 'admin', 'school'];
module.exports.ROLES = ROLES;

/** Charge l'utilisateur à partir du cookie (si présent et valide). */
function loadUser(req, _res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      const u = db.get().prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(payload.sub);
      if (u) {
        // تطبيع school_id إلى INTEGER (قد يكون TEXT في قواعد البيانات القديمة)
        if (u.school_id !== null && u.school_id !== undefined && u.school_id !== '') {
          u.school_id = Number(u.school_id);
        } else {
          u.school_id = null;
        }
        // حساب المؤسسة ينتمي دائماً لنفسه (school_id = id)
        if (u.role === 'school' && !u.school_id) u.school_id = u.id;
        req.user = u;
      }
    } catch { /* jeton invalide ou expiré : on l'ignore */ }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'auth_required' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'auth_required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}

/**
 * Protection CSRF : en plus du cookie SameSite=Lax, toute requête qui modifie l'état
 * doit porter l'en-tête X-Requested-With (impossible à ajouter depuis un formulaire tiers).
 */
function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'fetch') return res.status(403).json({ error: 'csrf' });
  next();
}

module.exports = { issueSession, clearSession, hashPassword, checkPassword, publicUser, loadUser, requireAuth, requireRole, csrfGuard, ROLES };
