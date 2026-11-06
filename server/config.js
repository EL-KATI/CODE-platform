'use strict';
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const isProd = process.env.NODE_ENV === 'production';

function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (isProd) throw new Error('JWT_SECRET must be set in production');
  // Secret éphémère en développement : les sessions expirent à chaque redémarrage.
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  ROOT,
  isProd,
  port: Number(process.env.PORT) || 3000,
  dbFile: process.env.DB_FILE || path.join(ROOT, 'data', 'platform.db'),
  uploadsDir: process.env.UPLOADS_DIR || path.join(ROOT, 'public', 'uploads'),
  jwtSecret: secret(),
  sessionDays: Number(process.env.SESSION_DAYS) || 7,
  // Paramètres de l'examen théorique (catégorie B, Maroc) – modifiables par l'admin dans « Paramètres ».
  examDefaults: {
    exam_question_count: 40,
    exam_pass_mark: 32,
    exam_seconds_per_question: 30,
    readiness_window: 5,
  },
};
