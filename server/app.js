'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const config = require('./config');
const auth = require('./auth');
const { HttpError } = require('./http');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
        'style-src-attr': ["'unsafe-inline'"],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:', 'https:'],
        'media-src': ["'self'", 'https:'],
        'frame-src': ['https://www.youtube-nocookie.com'],
        'connect-src': ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://libretranslate.com'],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'upgrade-insecure-requests': config.isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  app.use(express.json({ limit: '4mb' }));
  app.use(cookieParser());
  app.use(auth.loadUser);

  const api = express.Router();
  api.use(auth.csrfGuard);
  api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  api.get('/health', (req, res) => res.json({ ok: true }));
  // بحث عن مؤسسة بـ narsa_num (عام — بدون تسجيل دخول)
  api.get('/schools', (req, res) => {
    const { narsa_num } = req.query;
    const db = require('./db');
    if (!narsa_num) return res.json([]);
    const rows = db.get().prepare(
      "SELECT id, school_name, city, narsa_num FROM users WHERE role='school' AND active=1 AND narsa_num=? LIMIT 5"
    ).all(String(narsa_num).trim());
    res.json(rows);
  });
  api.use('/auth', require('./routes/auth'));
  api.use('/', require('./routes/content'));
  api.use('/admin', require('./routes/admin'));
  api.use('/', require('./routes/learner'));
  api.use('/challenge', require('./routes/challenge'));
  api.use('/ai', require('./routes/ai'));
  api.use('/bookings', require('./routes/bookings'));
  api.use('/exams', require('./routes/exams'));
  api.use('/notifications', require('./routes/notifications'));
  api.use('/translate', require('./routes/translate'));
  api.use('/live', require('./routes/live-sessions'));
  api.use((req, res) => res.status(404).json({ error: 'not_found' }));
  app.use('/api', api);

  // alias: Google OAuth callback يوصل بدون /api/ prefix
  app.use('/auth', require('./routes/auth'));

  const pub = path.join(config.ROOT, 'public');
  app.use('/uploads', express.static(config.uploadsDir, { maxAge: '30d', immutable: true }));
  app.use('/audio', express.static(path.join(config.ROOT, 'public', 'audio'), { maxAge: '30d' }));
  // ملفات JS/CSS: no-cache في dev، short-revalidate في prod (ETag يضمن التحديث الفوري)
  app.use('/assets', express.static(path.join(pub, 'assets'), {
    maxAge: 0,
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      if (config.isProd && /\.(js|css)$/.test(filePath)) {
        // يسمح للمتصفح بالتخزين لكن يُجبره على إعادة التحقق في كل مرة
        res.set('Cache-Control', 'no-cache');
      }
    },
  }));
  app.use(express.static(pub, { maxAge: config.isProd ? '1h' : 0, index: 'index.html' }));
  // Application monopage : toutes les autres URL renvoient index.html (routage côté client).
  app.get(/^\/(?!api\/|uploads\/|assets\/).*/, (req, res) => res.sendFile(path.join(pub, 'index.html')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, details: err.details });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large' });
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  });

  return app;
}

module.exports = { createApp };
