'use strict';
const config = require('./config');
const db = require('./db');
const { seedContent, ensureAdmin } = require('./seed');
const { createApp } = require('./app');

const d = db.open();
if (seedContent(d)) console.log('Base initialisée avec le contenu pédagogique par défaut.');
ensureAdmin(d);

const server = createApp().listen(config.port, () => {
  console.log(`Plateforme disponible sur http://localhost:${config.port}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { server.close(() => { d.close(); process.exit(0); }); });
}
