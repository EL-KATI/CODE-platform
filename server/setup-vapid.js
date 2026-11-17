#!/usr/bin/env node
'use strict';
/**
 * سكريبت إعداد VAPID keys وحفظها في قاعدة البيانات
 * يُنفَّذ مرة واحدة عند نشر المشروع:
 *
 *   node server/setup-vapid.js
 *
 * أو لتجاوز الـ keys الموجودة:
 *
 *   node server/setup-vapid.js --force
 */

require('./env');
const crypto = require('crypto');
const db = require('./db');

const force = process.argv.includes('--force');
const d = db.open();

// تحقق من وجود مفاتيح
const existing = d.prepare("SELECT key FROM app_secrets WHERE key IN ('vapid_public_key','vapid_private_key')").all();

if (existing.length === 2 && !force) {
  console.log('✅ VAPID keys already configured. Use --force to regenerate.');
  const pub = d.prepare("SELECT value FROM app_secrets WHERE key='vapid_public_key'").get();
  console.log('Public key:', pub.value);
  d.close();
  process.exit(0);
}

// توليد مفاتيح EC P-256
const { privateKey: privDer, publicKey: pubDer } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  publicKeyEncoding:  { type: 'spki', format: 'der' },
  privateKeyEncoding: { type: 'sec1', format: 'der' },
});

// استخراج المفاتيح الخام بصيغة base64url
const rawPub  = pubDer.slice(26);           // 65 bytes (uncompressed point)
const rawPriv = privDer.slice(7, 39);       // 32 bytes

function toBase64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const vapidPublic  = toBase64url(rawPub);
const vapidPrivate = toBase64url(rawPriv);

// حفظ في DB
const upsert = d.prepare(`
  INSERT INTO app_secrets (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
`);

upsert.run('vapid_public_key',  vapidPublic);
upsert.run('vapid_private_key', vapidPrivate);

console.log('✅ VAPID keys generated and saved to database.');
console.log('');
console.log('Public key (copy to .env.example if needed):');
console.log(vapidPublic);
console.log('');
console.log('⚠️  Private key is stored securely in the database only.');
console.log('   Restart the server to activate Push Notifications.');

d.close();
