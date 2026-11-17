'use strict';
/**
 * /api/push — Web Push Subscriptions & Sending
 *
 * GET  /api/push/vapid-public-key   — مفتاح VAPID العام (للـ frontend)
 * POST /api/push/subscribe          — تسجيل اشتراك جديد
 * DELETE /api/push/subscribe        — إلغاء اشتراك
 * GET  /api/push/status             — هل هذا الجهاز مشترك؟
 * POST /api/push/send               — إرسال إشعار (admin فقط)
 * POST /api/push/broadcast          — broadcast لكل المستخدمين (admin فقط)
 * POST /api/push/test               — إشعار تجريبي للمستخدم نفسه
 */

const express = require('express');
const db      = require('../db');
const auth    = require('../auth');
const push    = require('../services/pushService');
const { wrap, bad } = require('../http');

const router = express.Router();

// ── GET /api/push/vapid-public-key (عام) ─────────────────────────────────────
router.get('/vapid-public-key', (req, res) => {
  const d = db.get();
  const row = d.prepare("SELECT value FROM app_secrets WHERE key = 'vapid_public_key'").get();
  if (!row) return res.status(503).json({ error: 'push_not_configured' });
  res.json({ publicKey: row.value });
});

// ── كل الـ routes التالية تحتاج تسجيل دخول ──────────────────────────────────
router.use(auth.requireAuth);

// ── GET /api/push/status ─────────────────────────────────────────────────────
router.get('/status', wrap(async (req, res) => {
  const d = db.get();
  const { endpoint } = req.query;
  if (!endpoint) return res.json({ subscribed: false });

  const row = d.prepare(
    'SELECT id FROM push_subscriptions WHERE endpoint = ? AND user_id = ?'
  ).get(endpoint, req.user.id);

  res.json({ subscribed: !!row });
}));

// ── POST /api/push/subscribe ──────────────────────────────────────────────────
router.post('/subscribe', wrap(async (req, res) => {
  const d = db.get();
  const { endpoint, keys } = req.body || {};

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return bad(res, 'endpoint, keys.p256dh and keys.auth are required');
  }

  const ua = req.headers['user-agent']?.slice(0, 200) || '';

  // upsert — نحدّث إذا كان الـ endpoint موجوداً
  d.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      user_id    = excluded.user_id,
      p256dh     = excluded.p256dh,
      auth       = excluded.auth,
      user_agent = excluded.user_agent,
      last_used  = datetime('now')
  `).run(req.user.id, endpoint, keys.p256dh, keys.auth, ua);

  res.json({ ok: true });
}));

// ── DELETE /api/push/subscribe ────────────────────────────────────────────────
router.delete('/subscribe', wrap(async (req, res) => {
  const d = db.get();
  const { endpoint } = req.body || {};
  if (!endpoint) return bad(res, 'endpoint required');

  d.prepare(
    'DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?'
  ).run(endpoint, req.user.id);

  res.json({ ok: true });
}));

// ── POST /api/push/test — إشعار تجريبي للمستخدم نفسه ─────────────────────────
router.post('/test', wrap(async (req, res) => {
  const d = db.get();
  const result = await push.sendToUser(d, req.user.id, {
    title: 'CODE — اختبار الإشعارات ✅',
    body:  'الإشعارات تعمل على هاتفك!',
    url:   '/dashboard',
    tag:   'test',
  });
  res.json(result);
}));

// ── POST /api/push/send — إرسال لمستخدم بعينه (admin/school) ─────────────────
router.post('/send', wrap(async (req, res) => {
  if (!['admin', 'school'].includes(req.user.role)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const d = db.get();
  const { user_id, title_ar, body_ar, url } = req.body || {};

  if (!user_id || !title_ar) return bad(res, 'user_id and title_ar required');

  const result = await push.sendToUser(d, user_id, {
    title: title_ar,
    body:  body_ar || '',
    url:   url || '/',
  });

  res.json(result);
}));

// ── POST /api/push/broadcast — إرسال لكل المستخدمين (admin فقط) ───────────────
router.post('/broadcast', wrap(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }

  const d = db.get();
  const { title_ar, title_fr, body_ar, body_fr, url } = req.body || {};

  if (!title_ar || !body_ar) return bad(res, 'title_ar and body_ar required');

  const locale = req.user.locale || 'ar';
  const result = await push.broadcast(d, {
    title: locale === 'fr' ? (title_fr || title_ar) : title_ar,
    body:  locale === 'fr' ? (body_fr  || body_ar)  : body_ar,
    url:   url || '/',
  });

  // حفظ في جدول notifications أيضاً (للتاريخ)
  d.prepare(`
    INSERT INTO notifications (user_id, type, title_ar, title_fr, body_ar, body_fr, link)
    VALUES (NULL, 'admin', ?, ?, ?, ?, ?)
  `).run(title_ar, title_fr || '', body_ar, body_fr || '', url || null);

  res.json(result);
}));

module.exports = router;
