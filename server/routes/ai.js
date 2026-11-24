'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;
const { requireAuth } = require('../auth');
const { wrap, str, HttpError } = require('../http');
const { askAI, availableModels } = require('../services/ai');
const { findReferences } = require('../services/aiContext');
const db = require('../db');

const router = express.Router();

// 10 requests per minute per user (rate limit per window)
const aiLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req) => (req.user ? `u${req.user.id}` : ipKeyGenerator(req.ip)),
  message: { error: 'Too many AI requests, please wait a minute.' },
});

// --- Helpers ---------------------------------------------------------------
function getSetting(key, def) {
  try {
    const r = db.get().prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return r ? r.value : def;
  } catch { return def; }
}

function getTodayUsage(userId) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const r = db.get().prepare('SELECT count FROM ai_daily_usage WHERE user_id = ? AND date = ?').get(userId, today);
    return { used: r ? r.count : 0, today };
  } catch { return { used: 0, today }; }
}

function incrementUsage(userId, today) {
  try {
    db.get().prepare(`
      INSERT INTO ai_daily_usage (user_id, date, count) VALUES (?, ?, 1)
      ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1
    `).run(userId, today);
  } catch { /* non-critical */ }
}

// GET /api/ai/status – which models are configured + feature flag + quota (if logged in)
router.get('/status', wrap(async (req, res) => {
  const enabled = getSetting('ai_enabled', '1') !== '0';
  const limit = parseInt(getSetting('ai_daily_limit', '15'), 10);
  const payload = { models: availableModels(), enabled, dailyLimit: limit };
  if (req.user) {
    const { used } = getTodayUsage(req.user.id);
    payload.dailyUsed = used;
  }
  res.json(payload);
}));

// POST /api/ai/ask – ask the AI tutor a question
router.post('/ask', requireAuth, aiLimit, wrap(async (req, res) => {
  // 1. Feature flag check
  if (getSetting('ai_enabled', '1') === '0') {
    throw new HttpError(403, 'ai_disabled');
  }

  // 2. Daily quota check
  const limit = parseInt(getSetting('ai_daily_limit', '15'), 10);
  const { used, today } = getTodayUsage(req.user.id);
  if (used >= limit) {
    return res.status(429).json({ error: 'ai_quota_exceeded', used, limit });
  }

  const question = str(req.body.question, { min: 1, max: 1000, field: 'question' });
  const context  = req.body.context  ? str(req.body.context, { max: 2000, field: 'context' }) : '';
  const model    = req.body.model    ? str(req.body.model, { min: 1, max: 20, field: 'model' })   : 'auto';

  if (!['auto', 'claude', 'gemini'].includes(model)) {
    throw new HttpError(400, 'invalid_field', { field: 'model' });
  }

  // مراجع من دروس المنصة وشروح الأسئلة الأقرب للسؤال (قد تكون فارغة)
  let refs = { text: '', sources: [] };
  try { refs = findReferences(question); } catch (e) { console.error('[ai] references:', e.message); }
  const fullContext = [context, refs.text].filter(Boolean).join('\n\n');

  let result;
  try {
    result = await askAI(question, fullContext, model);
  } catch (e) {
    const status = e.status || e.statusCode || (/\b(401|403)\b/.test(String(e.message)) ? 401 : undefined);
    console.error(`[Monitor AI] ${model} → ${status || ''} ${String(e.message).split('\n')[0].slice(0, 300)}`);
    throw new HttpError(502, status === 401 || status === 403 ? 'ai_auth' : 'ai_unavailable');
  }

  // 3. Increment daily usage counter after success
  incrementUsage(req.user.id, today);

  res.json({ answer: result.answer, model: result.model, sources: refs.sources, dailyUsed: used + 1, dailyLimit: limit });
}));

module.exports = router;
