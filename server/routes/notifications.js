'use strict';
/**
 * /api/notifications — نظام الإشعارات العام
 *
 * GET  /api/notifications         — قائمة الإشعارات (آخر 30) + عدد غير المقروءة
 * PATCH /api/notifications/:id/read — تعليم إشعار كمقروء
 * PATCH /api/notifications/read-all — تعليم الكل كمقروء
 * POST  /api/notifications        — إنشاء إشعار (admin/school فقط)
 */

const express = require('express');
const db      = require('../db');
const auth    = require('../auth');
const { wrap, int, bad } = require('../http');

const router = express.Router();
router.use(auth.requireAuth);

// ── GET /api/notifications ───────────────────────────────────────────────────
router.get('/', wrap(async (req, res) => {
  const d   = db.get();
  const uid = req.user.id;

  // إشعارات المستخدم + الإشعارات العامة (broadcast)
  const rows = d.prepare(`
    SELECT id, type, title_ar, title_fr, body_ar, body_fr, link, read, created_at
    FROM notifications
    WHERE user_id = ? OR user_id IS NULL
    ORDER BY created_at DESC
    LIMIT 30
  `).all(uid);

  const unread = d.prepare(`
    SELECT COUNT(*) AS n FROM notifications
    WHERE (user_id = ? OR user_id IS NULL) AND read = 0
  `).get(uid).n;

  res.json({ notifications: rows, unread });
}));

// ── PATCH /api/notifications/read-all ───────────────────────────────────────
router.patch('/read-all', wrap(async (req, res) => {
  const d   = db.get();
  const uid = req.user.id;

  d.prepare(`UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0`).run(uid);
  // الإشعارات العامة: نضيف نسخة "مقروءة" للمستخدم (أو نتجاهلها — نختار التجاهل هنا)
  res.json({ ok: true });
}));

// ── PATCH /api/notifications/:id/read ───────────────────────────────────────
router.patch('/:id/read', wrap(async (req, res) => {
  const d   = db.get();
  const uid = req.user.id;
  const nid = int(req.params.id);

  if (!nid) return bad(res, 'invalid id');

  // يمكن تعليم الإشعار الخاص أو العام
  d.prepare(`
    UPDATE notifications SET read = 1
    WHERE id = ? AND (user_id = ? OR user_id IS NULL)
  `).run(nid, uid);

  res.json({ ok: true });
}));

// ── POST /api/notifications — إنشاء إشعار (admin/school فقط) ────────────────
router.post('/', wrap(async (req, res) => {
  if (!['admin', 'school', 'instructor'].includes(req.user.role)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const d = db.get();
  const {
    user_id = null,   // null = broadcast لكل المستخدمين
    type    = 'info',
    title_ar, title_fr = '',
    body_ar,  body_fr  = '',
    link    = null,
  } = req.body;

  if (!title_ar || !body_ar) return bad(res, 'title_ar and body_ar required');

  const VALID_TYPES = ['info', 'success', 'warning', 'challenge', 'result', 'admin'];
  if (!VALID_TYPES.includes(type)) return bad(res, 'invalid type');

  const info = d.prepare(`
    INSERT INTO notifications (user_id, type, title_ar, title_fr, body_ar, body_fr, link)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(user_id, type, title_ar, title_fr, body_ar, body_fr, link);

  res.json({ ok: true, id: info.lastInsertRowid });
}));

module.exports = router;
