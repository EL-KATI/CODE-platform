'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const config = require('./config');
const auth = require('./auth');
const { HttpError } = require('./http');

// Origins مقبولة للتطبيق (Capacitor Android + المتصفح العادي)
const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'http://localhost',
  'http://10.0.2.2:3000',   // محاكي Android
  'capacitor://localhost',   // Capacitor Android
  'https://localhost',       // Capacitor iOS (مستقبلاً)
]);

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // CORS — يجب أن يكون قبل helmet حتى يعمل preflight
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Requested-With,Authorization');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'", 'capacitor://localhost'],
        'script-src': ["'self'", 'capacitor://localhost'],
        'style-src': ["'self'", 'capacitor://localhost', 'https://fonts.googleapis.com', "'unsafe-inline'"],
        'style-src-attr': ["'unsafe-inline'"],
        'font-src': ["'self'", 'capacitor://localhost', 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'capacitor://localhost', 'data:', 'https:'],
        'media-src': ["'self'", 'capacitor://localhost', 'https:'],
        'frame-src': ['https://www.youtube-nocookie.com'],
        'connect-src': ["'self'", 'capacitor://localhost', 'http://10.0.2.2:3000', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://libretranslate.com'],
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
  app.use(auth.injectCapacitorToken);

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
  api.use('/push', require('./routes/push'));
  api.use('/translate', require('./routes/translate'));
  api.use('/live', require('./routes/live-sessions'));
  api.use('/signs', require('./routes/signs'));
  api.use((req, res) => res.status(404).json({ error: 'not_found' }));
  app.use('/api', api);

  // alias: Google OAuth callback يوصل بدون /api/ prefix
  app.use('/auth', require('./routes/auth'));

  const pub = path.join(config.ROOT, 'public');
  app.use('/uploads', express.static(config.uploadsDir, { maxAge: '30d', immutable: true }));
  app.use('/audio', express.static(path.join(config.ROOT, 'public', 'audio'), { maxAge: '30d' }));
  // ملفات JS/CSS: no-store دائماً — يمنع كاش ES modules في المتصفح
  app.use('/assets', express.static(path.join(pub, 'assets'), {
    maxAge: 0,
    etag: false,
    lastModified: false,
    setHeaders(res, filePath) {
      if (/\.(js|css)$/.test(filePath)) {
        res.set('Cache-Control', 'no-store');
      }
    },
  }));
  // index.html: مُولَّد ديناميكياً مع version لكسر كاش المتصفح
  const fs = require('fs');
  const BUILD_VERSION = Date.now().toString(36); // يتغير مع كل إعادة تشغيل
  // بناء import map لكسر كاش ES modules في المتصفح
  function buildImportMap(assetsDir, version) {
    const imports = {};
    function walk(dir, base) {
      try {
        fs.readdirSync(dir).forEach(f => {
          const full = path.join(dir, f);
          const rel = base + '/' + f;
          if (fs.statSync(full).isDirectory()) walk(full, rel);
          else if (f.endsWith('.js')) imports[rel] = `${rel}?v=${version}`;
        });
      } catch {}
    }
    walk(path.join(assetsDir, 'js'), '/assets/js');
    return JSON.stringify({ imports }, null, 2);
  }
  let _indexHtml = null;
  function getIndexHtml() {
    if (!_indexHtml) {
      const raw = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
      const importMapScript = `<script type="importmap">\n${buildImportMap(path.join(pub, 'assets'), BUILD_VERSION)}\n</script>`;
      _indexHtml = raw
        .replace(/(src="\/assets\/js\/[^"]+\.js)(")/g, `$1?v=${BUILD_VERSION}$2`)
        .replace(/(href="\/assets\/css\/[^"]+\.css)(")/g, `$1?v=${BUILD_VERSION}$2`)
        .replace('<script type="module"', `${importMapScript}\n  <script type="module"`);
    }
    return _indexHtml;
  }
  app.use(express.static(pub, { maxAge: config.isProd ? '1h' : 0, index: false }));
  // Application monopage : toutes les autres URL renvoient index.html (routage côté client).
  app.get(/^\/(?!api\/|uploads\/|assets\/).*/, (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.send(getIndexHtml());
  });

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
