'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../auth');
const { wrap, str, HttpError } = require('../http');
const { askAI, availableModels } = require('../services/ai');

const router = express.Router();

// 10 requests per minute per user
const aiLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: req => req.user?.id ?? req.ip,
  message: { error: 'Too many AI requests, please wait a minute.' },
});

// GET /api/ai/status – which models are configured
router.get('/status', wrap(async (req, res) => {
  res.json({ models: availableModels() });
}));

// POST /api/ai/ask – ask the AI tutor a question
router.post('/ask', requireAuth, aiLimit, wrap(async (req, res) => {
  const question = str(req.body, 'question', 1, 1000);
  const context  = req.body.context  ? str(req.body, 'context',  0, 2000) : '';
  const model    = req.body.model    ? str(req.body, 'model',    1, 20)   : 'auto';

  if (!['auto', 'claude', 'gemini'].includes(model)) {
    throw new HttpError(400, 'model must be auto, claude, or gemini');
  }

  const result = await askAI(question, context, model);
  res.json(result);
}));

module.exports = router;
