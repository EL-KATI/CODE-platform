'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const https   = require('https');
const db = require('../db');
const auth = require('../auth');
const mailer = require('../services/mailer');
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

// ── مساعد 2FA: إنشاء وإرسال OTP للأدمن ──────────────────────────────────────
async function issueAdminOtp(user) {
  const d = db.get();
  // إلغاء كل الرموز القديمة لهذا المستخدم
  d.prepare('DELETE FROM otp_codes WHERE user_id = ?').run(user.id);
  // رمز 6 أرقام
  const code = String(crypto.randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  d.prepare('INSERT INTO otp_codes (user_id, code, expires_at) VALUES (?,?,?)').run(user.id, code, expiresAt);
  await mailer.sendOtp(user.email, code);
  return code; // للتسجيل فقط في وضع التطوير
}

const clean = (v, max) => (v === undefined || v === null ? null : (String(v).trim().slice(0, max) || null));

// ── تسجيل مبسط: الاسم، النسب، email، هاتف، مدينة ──────────────────────────
router.post('/register', limiter, wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.acceptTerms) throw bad('terms_required');

  const email = str(b.email, { min: 5, max: 160, field: 'email' }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw bad('invalid_email');

  const first_name = clean(b.first_name, 80);
  const last_name  = clean(b.last_name,  80);
  const phone      = clean(b.phone, 30);
  if (!first_name) throw bad('invalid_field', { field: 'first_name' });
  if (!last_name)  throw bad('invalid_field', { field: 'last_name'  });
  if (!phone)      throw bad('invalid_field', { field: 'phone'      });

  const city   = clean(b.city, 80);
  const locale = ['fr', 'ar', 'ar-dialect'].includes(b.locale) ? b.locale : 'ar';
  const name   = `${first_name} ${last_name}`.trim();
  const pw     = generatePassword();
  const hash   = await auth.hashPassword(pw);

  const d = db.get();
  if (d.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'email_taken');

  // إنشاء المتعلم (بدون school_id — طلب الانتساب منفصل)
  const info = d.prepare(
    `INSERT INTO users (email, name, password_hash, locale, role, first_name_fr, last_name_fr, phone, city)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(email, name, hash, locale, 'student', first_name, last_name, phone, city);

  const user = d.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  auth.issueSession(res, user);
  res.status(201).json({ user: auth.publicUser(user), generatedPassword: pw });
}));

// ── Google OAuth ──────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI || '';

function googleFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', ...options }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// 1) إعادة التوجيه إلى Google
router.get('/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'google_not_configured' });
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 300_000 });
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// 2) استقبال الـ callback من Google
router.get('/google/callback', wrap(async (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.redirect('/login?error=google_not_configured');

  const { code, state, error } = req.query;
  if (error) return res.redirect(`/login?error=${encodeURIComponent(error)}`);

  const storedState = req.cookies?.oauth_state;
  res.clearCookie('oauth_state');
  if (!state || state !== storedState) return res.redirect('/login?error=invalid_state');

  // تبادل الكود بـ access token
  const tokenRes = await googleFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI, grant_type: 'authorization_code',
    }).toString(),
  });
  if (tokenRes.status !== 200) return res.redirect('/login?error=token_exchange_failed');

  const { access_token, id_token } = tokenRes.body;

  // جلب معلومات المستخدم من Google
  const infoRes = await googleFetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (infoRes.status !== 200) return res.redirect('/login?error=userinfo_failed');

  const { id: google_id, email, name: google_name, picture } = infoRes.body;
  if (!email || !google_id) return res.redirect('/login?error=missing_email');

  const d = db.get();
  let user = d.prepare('SELECT * FROM users WHERE google_id = ? LIMIT 1').get(google_id)
          || d.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').get(email.toLowerCase());

  if (user) {
    // ربط الحساب بـ Google + تفعيل تلقائي (Google OAuth = تأكيد هوية كافٍ)
    d.prepare('UPDATE users SET google_id=?, google_name=?, google_picture=?, active=1 WHERE id=?')
      .run(google_id, google_name, picture, user.id);
    user = d.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  } else {
    // إنشاء حساب جديد مع وصول فوري (active=1)
    const locale = 'ar';
    const nameParts = (google_name || email).split(' ');
    const first_name_fr = nameParts[0] || '';
    const last_name_fr  = nameParts.slice(1).join(' ') || '';
    // password_hash مطلوب فـ schema — نحطو قيمة random لأن Google users ما عندهمش password
    const fakeHash = '$google$' + crypto.randomBytes(32).toString('hex');
    const info = d.prepare(
      `INSERT INTO users (email, name, locale, role, google_id, google_name, google_picture, first_name_fr, last_name_fr, active, password_hash)
       VALUES (?,?,?,?,?,?,?,?,?,1,?)`
    ).run(email.toLowerCase(), google_name || email, locale, 'student', google_id, google_name, picture, first_name_fr, last_name_fr, fakeHash);
    user = d.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  }

  // 2FA للأدمن: إذا كان admin نعيد توجيهه لصفحة OTP
  if (user.role === 'admin') {
    if (mailer.isConfigured()) {
      try {
        await issueAdminOtp(user);
        return res.redirect(`/verify-otp?email=${encodeURIComponent(user.email)}&via=google`);
      } catch (e) {
        console.error('[2FA] فشل إرسال OTP:', e.message);
        return res.redirect('/login?error=otp_send_failed');
      }
    } else {
      console.warn('[2FA] SMTP غير مُعدّ — تخطي 2FA للأدمن Google', user.email);
    }
  }

  d.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  auth.issueSession(res, user);
  // توجيه مباشر للوحة التحكم بعد المصادقة بجوجل
  const dest = user.role === 'admin' || user.role === 'instructor' ? '/admin' : '/dashboard';
  res.redirect(dest);
}));

// ── تسجيل الدخول ──────────────────────────────────────────────────────────────
router.post('/login', limiter, wrap(async (req, res) => {
  const email = str(req.body.email, { max: 160, field: 'email' }).toLowerCase();
  const pw = str(req.body.password, { max: 128, field: 'password' });
  const d = db.get();
  const user = d.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !user.active || !(await auth.checkPassword(pw, user.password_hash))) {
    throw new HttpError(401, 'invalid_credentials');
  }
  // 2FA للأدمن: نرسل OTP ولا نفتح الجلسة مباشرة
  if (user.role === 'admin') {
    if (!mailer.isConfigured()) {
      // SMTP غير مُعدّ — نسجّل الدخول بدون 2FA مع تحذير
      console.warn('[2FA] SMTP غير مُعدّ — تخطي 2FA للأدمن', user.email);
    } else {
      await issueAdminOtp(user);
      return res.json({ requiresOtp: true, email: user.email });
    }
  }
  d.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  auth.issueSession(res, user);
  res.json({ user: auth.publicUser(user) });
}));

// ── إرسال OTP للأدمن (endpoint مستقل) ──────────────────────────────────────
router.post('/send-otp', limiter, wrap(async (req, res) => {
  const email = str(req.body.email, { max: 160, field: 'email' }).toLowerCase();
  const d = db.get();
  const user = d.prepare('SELECT * FROM users WHERE email = ? AND role = ? AND active = 1').get(email, 'admin');
  if (!user) throw new HttpError(404, 'not_found');
  if (!mailer.isConfigured()) throw new HttpError(503, 'smtp_not_configured');
  await issueAdminOtp(user);
  res.json({ ok: true });
}));

// ── التحقق من OTP ─────────────────────────────────────────────────────────────
router.post('/verify-otp', limiter, wrap(async (req, res) => {
  const email = str(req.body.email, { max: 160, field: 'email' }).toLowerCase();
  const code  = str(req.body.code,  { max: 10,  field: 'code'  }).trim();
  const d = db.get();
  const user = d.prepare('SELECT * FROM users WHERE email = ? AND role = ? AND active = 1').get(email, 'admin');
  if (!user) throw new HttpError(401, 'invalid_otp');

  const otp = d.prepare(
    `SELECT * FROM otp_codes
     WHERE user_id = ? AND used = 0 AND expires_at > datetime('now')
     ORDER BY created_at DESC LIMIT 1`
  ).get(user.id);

  if (!otp || otp.code !== code) throw new HttpError(401, 'invalid_otp');

  // إلغاء الرمز بعد الاستخدام
  d.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(otp.id);
  d.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);

  auth.issueSession(res, user);
  res.json({ user: auth.publicUser(user) });
}));

router.post('/logout', (req, res) => {
  auth.endSession(req);
  auth.clearSession(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => res.json({ user: auth.publicUser(req.user), ...(req.sessionReplaced ? { reason: 'session_replaced' } : {}) }));


module.exports = router;
module.exports.password = password;
