'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;
const { requireAuth } = require('../auth');
const { wrap, str, HttpError } = require('../http');
const { askAI, availableModels } = require('../services/ai');

const router = express.Router();

// 10 requests per minute per user
const aiLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req) => (req.user ? `u${req.user.id}` : ipKeyGenerator(req.ip)),
  message: { error: 'Too many AI requests, please wait a minute.' },
});

// GET /api/ai/status – which models are configured
router.get('/status', wrap(async (req, res) => {
  res.json({ models: availableModels() });
}));

// POST /api/ai/ask – ask the AI tutor a question
router.post('/ask', requireAuth, aiLimit, wrap(async (req, res) => {
  const question = str(req.body.question, { min: 1, max: 1000, field: 'question' });
  const context  = req.body.context  ? str(req.body.context, { max: 2000, field: 'context' }) : '';
  const model    = req.body.model    ? str(req.body.model, { min: 1, max: 20, field: 'model' })   : 'auto';

  if (!['auto', 'claude', 'gemini'].includes(model)) {
    throw new HttpError(400, 'invalid_field', { field: 'model' });
  }

  const result = await askAI(question, context, model);
  res.json(result);
}));

module.exports = router;
