'use strict';
require('./env'); // .env أولاً: مفاتيح Monitor AI، JWT_SECRET، PORT…
const config = require('./config');
const db = require('./db');
const { seedContent, ensureAdmin } = require('./seed');
const { ensureSeries40 } = require('./services/series40');
const { applyContentUpdates, syncLessons } = require('./services/contentUpdate');
const push = require('./services/pushService');
const { createApp } = require('./app');

const d = db.open();
if (seedContent(d)) console.log('Base initialisée avec le contenu pédagogique par défaut.');
const upd = applyContentUpdates(d);
if (upd) console.log(`Mise à jour du contenu : ${upd.drafted} question(s) illisible(s) passée(s) en brouillon, ${upd.added} ajoutée(s).`);
const lessonsUpd = syncLessons(d);
if (lessonsUpd && lessonsUpd.updated) console.log(`Leçons interactives : ${lessonsUpd.updated} leçon(s) mise(s) à jour.`);
const nSeries = ensureSeries40(d);
if (nSeries) console.log('Séries de 40 questions créées :', nSeries);
ensureAdmin(d);

// تهيئة Push Notifications (VAPID)
try {
  const pubRow  = d.prepare("SELECT value FROM app_secrets WHERE key='vapid_public_key'").get();
  const privRow = d.prepare("SELECT value FROM app_secrets WHERE key='vapid_private_key'").get();
  if (pubRow && privRow) {
    push.init(pubRow.value, privRow.value, 'admin@code-platform.ma');
  } else {
    console.log('[Push] VAPID keys not configured — run: node server/setup-vapid.js');
  }
} catch (e) {
  console.warn('[Push] Init skipped:', e.message);
}

const server = createApp().listen(config.port, () => {
  console.log(`Plateforme disponible sur http://localhost:${config.port}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { server.close(() => { d.close(); process.exit(0); }); });
}
