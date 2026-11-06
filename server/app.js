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
        'style-src': ["'self'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:', 'https:'],
        'connect-src': ["'self'"],
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
  api.use('/auth', require('./routes/auth'));
  api.use('/', require('./routes/content'));
  api.use('/admin', require('./routes/admin'));
  api.use('/', require('./routes/learner'));
  api.use((req, res) => res.status(404).json({ error: 'not_found' }));
  app.use('/api', api);

  const pub = path.join(config.ROOT, 'public');
  app.use('/uploads', express.static(config.uploadsDir, { maxAge: '30d', immutable: true }));
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
