'use strict';
/**
 * fix_and_seed.js — ينشئ جدول schools إن لم يكن موجوداً ويضيف 3 مؤسسات
 * التشغيل: node fix_and_seed.js
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'app.db');
if (!fs.existsSync(DB_PATH)) {
  console.error('❌ ملف قاعدة البيانات غير موجود:', DB_PATH);
  console.error('   شغّل السيرفر أولاً: npm start');
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('foreign_keys = OFF');
db.pragma('journal_mode = WAL');

console.log('\n🔧 إصلاح قاعدة البيانات...\n');

// 1. إنشاء جدول schools إن لم يكن موجوداً
db.exec(`
  CREATE TABLE IF NOT EXISTS schools (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL,
    code         TEXT NOT NULL UNIQUE,
    email        TEXT DEFAULT '',
    phone        TEXT DEFAULT '',
    address      TEXT DEFAULT '',
    active       INTEGER NOT NULL DEFAULT 1,
    owner_id     INTEGER,
    agrement_num TEXT DEFAULT '',
    raison_sociale TEXT DEFAULT '',
    created_by   INTEGER,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);
console.log('✅ جدول schools جاهز');

// 2. إضافة أعمدة ناقصة إن وجدت
const extraCols = { agrement_num: "TEXT DEFAULT ''", raison_sociale: "TEXT DEFAULT ''", email: "TEXT DEFAULT ''", owner_id: 'INTEGER' };
const existingCols = db.prepare('PRAGMA table_info(schools)').all().map(c => c.name);
for (const [col, def] of Object.entries(extraCols)) {
  if (!existingCols.includes(col)) {
    try { db.exec(`ALTER TABLE schools ADD COLUMN ${col} ${def}`); console.log(`✅ أضيف عمود: ${col}`); }
    catch (e) { console.warn(`⚠️  ${col}:`, e.message); }
  }
}

// 3. إضافة 3 مؤسسات
const schools = [
  { name: 'مدرسة النجاح للسياقة',    code: 'NAJAH_RBT',   email: 'najah@autoecole.ma',   phone: '0537123456', address: 'شارع محمد الخامس، الرباط',      agrement_num: '7163', raison_sociale: 'NAJAH SARL' },
  { name: 'مدرسة الأمان للقيادة',    code: 'AMAN_CAS',    email: 'aman@autoecole.ma',    phone: '0522654321', address: 'بوليفار زركطوني، الدار البيضاء', agrement_num: '8842', raison_sociale: 'AMAN AUTO-ECOLE' },
  { name: 'أكاديمية السائق المحترف', code: 'ACADEMY_FES', email: 'academy@autoecole.ma', phone: '0535987654', address: 'شارع الحسن الثاني، فاس',           agrement_num: '3391', raison_sociale: 'ACADEMY CONDUITE SARL' },
];

console.log('\n🏫 إضافة المؤسسات...\n');
const insert = db.prepare(`
  INSERT OR REPLACE INTO schools (name, code, email, phone, address, agrement_num, raison_sociale)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
for (const s of schools) {
  try {
    const r = insert.run(s.name, s.code, s.email, s.phone, s.address, s.agrement_num, s.raison_sociale);
    console.log(`  ✅ [ID=${r.lastInsertRowid}] ${s.name}`);
  } catch (e) {
    console.error(`  ❌ ${s.name}:`, e.message);
  }
}

// 4. عرض النتيجة
console.log('\n📊 المؤسسات في قاعدة البيانات:\n');
const rows = db.prepare('SELECT id, name, code, agrement_num, raison_sociale, active FROM schools ORDER BY id').all();
for (const r of rows) {
  console.log(`  [${r.id}] ${r.name} | ${r.code} | اعتماد: ${r.agrement_num} | ${r.raison_sociale} | نشط: ${r.active ? 'نعم' : 'لا'}`);
}

db.pragma('foreign_keys = ON');
db.close();
console.log('\n✅ تم بنجاح — الآن شغّل: npm start\n');
