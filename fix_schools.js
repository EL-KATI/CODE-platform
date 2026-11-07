'use strict';
/**
 * fix_schools.js — سكريبت إصلاح مباشر لقاعدة البيانات
 * يُصلح مشاكل جدول schools وعمود school_id في users
 * شغّله على السيرفر: node fix_schools.js
 */
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.argv[2]
  || process.env.DB_FILE
  || path.join(__dirname, 'data', 'platform.db');

console.log('=== fix_schools.js ===');
console.log('DB:', dbPath);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF'); // نوقفها مؤقتاً للمigration

// ─── 1. فحص الجداول الموجودة ───────────────────────────────────────────────
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
console.log('\n[1] Tables:', tables.join(', '));

// ─── 2. إنشاء جدول schools إذا لم يكن موجوداً ────────────────────────────
if (!tables.includes('schools')) {
  db.exec(`CREATE TABLE schools (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL,
    code       TEXT    NOT NULL UNIQUE,
    email      TEXT    DEFAULT '',
    phone      TEXT    NOT NULL DEFAULT '',
    address    TEXT    NOT NULL DEFAULT '',
    active     INTEGER NOT NULL DEFAULT 1,
    owner_id   INTEGER,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  )`);
  console.log('[2] ✅ Created schools table');
} else {
  console.log('[2] schools table exists');
  // إضافة الأعمدة الناقصة
  const cols = db.prepare('PRAGMA table_info(schools)').all().map(c => c.name);
  console.log('    columns:', cols.join(', '));
  if (!cols.includes('email')) {
    db.exec("ALTER TABLE schools ADD COLUMN email TEXT DEFAULT ''");
    console.log('    ✅ Added email column');
  }
  if (!cols.includes('owner_id')) {
    db.exec('ALTER TABLE schools ADD COLUMN owner_id INTEGER');
    console.log('    ✅ Added owner_id column');
  }
}

// ─── 3. فحص عمود school_id في users ──────────────────────────────────────
const userCols = db.prepare('PRAGMA table_info(users)').all();
const schoolIdCol = userCols.find(c => c.name === 'school_id');
console.log('\n[3] users.school_id type:', schoolIdCol ? schoolIdCol.type : 'NOT FOUND');

if (!schoolIdCol) {
  db.exec('ALTER TABLE users ADD COLUMN school_id INTEGER');
  console.log('    ✅ Added school_id column');
} else if (schoolIdCol.type.toUpperCase() !== 'INTEGER') {
  console.log('    ⚠️  school_id is TEXT — rebuilding users table...');
  // تحقق من صحة CHECK constraint للـ role
  const userTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get()?.sql || '';
  const hasSchoolRole = userTableSql.includes("'school'");

  db.exec(`
    BEGIN;
    ALTER TABLE users RENAME TO _users_migration;
    CREATE TABLE users (
      id            INTEGER PRIMARY KEY,
      email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      name          TEXT    NOT NULL,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'student'
                    CHECK (role IN ('student','instructor','admin','school')),
      locale        TEXT    NOT NULL DEFAULT 'ar',
      exam_date     TEXT,
      active        INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT,
      school_id     INTEGER REFERENCES schools(id) ON DELETE SET NULL
    );
    INSERT INTO users
      SELECT id, email, name, password_hash,
        CASE WHEN role IN ('student','instructor','admin','school') THEN role ELSE 'student' END,
        locale, exam_date, active, created_at, last_login_at,
        CASE WHEN school_id IS NULL OR school_id = '' THEN NULL
             ELSE CAST(school_id AS INTEGER) END
      FROM _users_migration;
    DROP TABLE _users_migration;
    COMMIT;
  `);
  console.log('    ✅ Rebuilt users table with school_id INTEGER');
}

// ─── 4. تنظيف الجداول المؤقتة المتبقية من migrations فاشلة ──────────────
const tmpTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '_users_%'").all();
if (tmpTables.length) {
  tmpTables.forEach(t => {
    db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
    console.log('[4] ✅ Cleaned tmp table:', t.name);
  });
} else {
  console.log('\n[4] No leftover tmp tables');
}

// ─── 5. حذف المستخدمين اليتامى (school بدون school_id) ──────────────────
const orphans = db.prepare(
  "SELECT id, email, name FROM users WHERE role='school' AND (school_id IS NULL OR CAST(school_id AS TEXT) = '')"
).all();
console.log('\n[5] Orphan school users:', orphans.length);
if (orphans.length) {
  orphans.forEach(u => console.log('    Deleting:', u.email, '(id:', u.id + ')'));
  db.prepare("DELETE FROM users WHERE role='school' AND (school_id IS NULL OR CAST(school_id AS TEXT) = '')").run();
  console.log('    ✅ Deleted', orphans.length, 'orphan users');
}

// ─── 6. فحص المؤسسات الموجودة ────────────────────────────────────────────
const schools = db.prepare('SELECT id, name, code, email, owner_id FROM schools').all();
console.log('\n[5] Schools:', schools.length);
schools.forEach(s => console.log('   ', s.id, s.name, '| email:', s.email, '| owner_id:', s.owner_id));

// ─── 7. إعادة تفعيل foreign_keys ──────────────────────────────────────────
db.pragma('foreign_keys = ON');

// ─── 8. تقرير نهائي ───────────────────────────────────────────────────────
console.log('\n=== تقرير نهائي ===');
const finalCols = db.prepare('PRAGMA table_info(users)').all().find(c => c.name === 'school_id');
const finalSchoolsCols = db.prepare('PRAGMA table_info(schools)').all().map(c => c.name);
console.log('users.school_id type:', finalCols?.type);
console.log('schools columns:', finalSchoolsCols.join(', '));
console.log('\n✅ تم الإصلاح. أعد تشغيل الخادم الآن.');

db.close();
