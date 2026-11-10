'use strict';
/**
 * مفاتيح API التي يديرها الأدمين من «الإعدادات».
 * - تُخزَّن مشفّرة (AES-256-GCM) في جدول app_secrets.
 * - مفتاح التشفير: SECRETS_KEY من .env، وإلا ملف data/.secrets.key يُنشأ مرة واحدة (data/ خارج git).
 * - لا تُعاد القيمة الكاملة للواجهة أبداً؛ فقط نسخة مقنّعة.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const db = require('../db');

let encKey = null;
function key() {
  if (encKey) return encKey;
  if (process.env.SECRETS_KEY && process.env.SECRETS_KEY.length >= 16) {
    encKey = crypto.createHash('sha256').update(process.env.SECRETS_KEY).digest();
    return encKey;
  }
  const file = path.join(path.dirname(config.dbFile), '.secrets.key');
  try {
    encKey = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
    if (encKey.length !== 32) throw new Error('bad key');
  } catch {
    encKey = crypto.randomBytes(32);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, encKey.toString('hex'), { mode: 0o600 });
  }
  return encKey;
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}

function decrypt(blob) {
  try {
    const [v, iv, tag, data] = String(blob).split(':');
    if (v !== 'v1') return null;
    const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  } catch { return null; } // مفتاح تشفير تغيّر → نعتبره غير موجود
}

// ذاكرة مؤقتة صغيرة: askAI يقرأ المفاتيح مع كل سؤال
let cache = null;
function all() {
  if (cache) return cache;
  cache = {};
  try {
    for (const r of db.get().prepare('SELECT key, value, updated_at FROM app_secrets').all()) {
      const val = decrypt(r.value);
      if (val !== null) cache[r.key] = { value: val, updatedAt: r.updated_at };
    }
  } catch { /* الجدول غير موجود بعد */ }
  return cache;
}

const get = (k) => (all()[k] ? all()[k].value : null);
const meta = (k) => all()[k] || null;

function set(k, value) {
  db.get().prepare(`INSERT INTO app_secrets (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(k, encrypt(value));
  cache = null;
}

function remove(k) {
  db.get().prepare('DELETE FROM app_secrets WHERE key = ?').run(k);
  cache = null;
}

const mask = (v) => {
  const s = String(v || '');
  if (!s) return '';
  return s.length <= 10 ? '••••' : `${s.slice(0, 4)}••••••${s.slice(-4)}`;
};

module.exports = { get, meta, set, remove, mask };
