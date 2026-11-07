'use strict';
/**
 * fix_school_users.js
 * ينشئ سجل مؤسسة في جدول schools لكل مستخدم بدور 'school' ليس لديه school_id
 * شغّل مرة واحدة: node fix_school_users.js
 */
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_FILE || path.join(__dirname, 'data', 'platform.db');
const db = new Database(DB_PATH);

// تأكد من وجود جدول schools وأعمدته
db.exec(`CREATE TABLE IF NOT EXISTS schools (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
try { db.exec("ALTER TABLE schools ADD COLUMN email TEXT DEFAULT ''"); } catch(_) {}
try { db.exec('ALTER TABLE schools ADD COLUMN owner_id INTEGER'); } catch(_) {}
try { db.exec("ALTER TABLE schools ADD COLUMN agrement_num TEXT DEFAULT ''"); } catch(_) {}
try { db.exec("ALTER TABLE schools ADD COLUMN raison_sociale TEXT DEFAULT ''"); } catch(_) {}

// جلب المستخدمين بدور school بدون school_id
const orphanSchoolUsers = db.prepare(
  "SELECT id, name, email FROM users WHERE role = 'school' AND (school_id IS NULL OR school_id = '')"
).all();

console.log(`\nوُجد ${orphanSchoolUsers.length} مستخدم(ي) بدور 'school' بدون مؤسسة مرتبطة\n`);

const insertSchool = db.prepare(`
  INSERT OR IGNORE INTO schools (name, code, email, owner_id, created_at)
  VALUES (?, ?, ?, ?, datetime('now'))
`);
const linkUser = db.prepare(`UPDATE users SET school_id = ? WHERE id = ?`);
const updateSchoolOwner = db.prepare(`UPDATE schools SET owner_id = ? WHERE id = ?`);

for (const user of orphanSchoolUsers) {
  // إنشاء code فريد من الاسم
  let baseCode = user.name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 25);
  if (!baseCode) baseCode = 'SCHOOL';

  // تأكد من عدم التكرار
  let code = baseCode;
  let suffix = 1;
  while (db.prepare('SELECT id FROM schools WHERE code = ?').get(code)) {
    code = `${baseCode}_${suffix++}`;
  }

  try {
    const r = insertSchool.run(user.name, code, user.email || '', user.id);
    const schoolId = r.lastInsertRowid;
    linkUser.run(schoolId, user.id);
    updateSchoolOwner.run(user.id, schoolId);
    console.log(`✅ أُنشئت مؤسسة [ID=${schoolId}] "${user.name}" (${code}) ← مستخدم #${user.id} ${user.email}`);
  } catch (e) {
    console.error(`❌ فشل إنشاء مؤسسة لـ "${user.name}":`, e.message);
  }
}

// تحقق نهائي
const allSchools = db.prepare('SELECT id, name, code, email FROM schools ORDER BY id').all();
console.log(`\n📋 المؤسسات في قاعدة البيانات الآن (${allSchools.length}):`);
allSchools.forEach(s => console.log(`  [${s.id}] ${s.name} | ${s.code} | ${s.email || '—'}`));

console.log('\n✅ انتهى — شغّل npm start الآن\n');
db.close();
