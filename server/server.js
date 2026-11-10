'use strict';
require('./env'); // .env أولاً: مفاتيح Monitor AI، JWT_SECRET، PORT…
const config = require('./config');
const db = require('./db');
const { seedContent, ensureAdmin } = require('./seed');
const { ensureSeries40 } = require('./services/series40');
const { applyContentUpdates } = require('./services/contentUpdate');
const { createApp } = require('./app');

const d = db.open();
if (seedContent(d)) console.log('Base initialisée avec le contenu pédagogique par défaut.');
const upd = applyContentUpdates(d);
if (upd) console.log(`Mise à jour du contenu : ${upd.drafted} question(s) illisible(s) passée(s) en brouillon, ${upd.added} ajoutée(s).`);
const nSeries = ensureSeries40(d);
if (nSeries) console.log('Séries de 40 questions créées :', nSeries);
ensureAdmin(d);

const server = createApp().listen(config.port, () => {
  console.log(`Plateforme disponible sur http://localhost:${config.port}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { server.close(() => { d.close(); process.exit(0); }); });
}
