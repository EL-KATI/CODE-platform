'use strict';
/**
 * seed_school.js — إضافة مؤسسة تجريبية مباشرة في قاعدة البيانات
 * شغّله: node seed_school.js
 */
const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const dbPath = process.argv[2]
  || process.env.DB_FILE
  || path.join(__dirname, 'data', 'platform.db');

console.log('DB:', dbPath);
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

// بيانات المؤسسة التجريبية
const SCHOOL = {
  name:    'AUTO ECOLE NFISSI',
  code:    'NFISSI',
  email:   'nfissi@autoecole.ma',
  phone:   '0695561365',
  address: 'TANGER',
  password: 'Nfissi2024',
};

(async () => {
  // 1. تنظيف orphan school users
  const orphans = db.prepare(
    "SELECT id, email FROM users WHERE role='school' AND school_id IS NULL"
  ).all();
  if (orphans.length) {
    db.prepare("DELETE FROM users WHERE role='school' AND school_id IS NULL").run();
    console.log('🗑️  Deleted', orphans.length, 'orphan school users:', orphans.map(u => u.email).join(', '));
  }

  // 2. حذف المؤسسة القديمة بنفس الكود إن وُجدت
  const existing = db.prepare('SELECT id FROM schools WHERE code = ?').get(SCHOOL.code);
  if (existing) {
    db.prepare('UPDATE users SET school_id = NULL WHERE school_id = ?').run(existing.id);
    db.prepare('DELETE FROM schools WHERE id = ?').run(existing.id);
    console.log('🗑️  Removed existing school with code', SCHOOL.code);
  }

  // 3. حذف المستخدم بنفس الإيميل إن وُجد
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(SCHOOL.email);
  if (existingUser) {
    db.prepare('DELETE FROM users WHERE id = ?').run(existingUser.id);
    console.log('🗑️  Removed existing user', SCHOOL.email);
  }

  // 4. إنشاء مستخدم المؤسسة
  const hash = await bcrypt.hash(SCHOOL.password, 10);
  const userRes = db.prepare(
    `INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'school')`
  ).run(SCHOOL.email, SCHOOL.name, hash);
  const ownerId = userRes.lastInsertRowid;
  console.log('✅ Created school user  → id:', ownerId, '| email:', SCHOOL.email);

  // 5. إنشاء المؤسسة
  const schoolRes = db.prepare(
    `INSERT INTO schools (name, code, email, phone, address, owner_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(SCHOOL.name, SCHOOL.code, SCHOOL.email, SCHOOL.phone, SCHOOL.address, ownerId, 1);
  const schoolId = schoolRes.lastInsertRowid;
  console.log('✅ Created school       → id:', schoolId, '| code:', SCHOOL.code);

  // 6. ربط المستخدم بالمؤسسة
  db.prepare('UPDATE users SET school_id = ? WHERE id = ?').run(schoolId, ownerId);
  console.log('✅ Linked user ↔ school');

  // 7. ملخص
  console.log('\n══════════════════════════════════════');
  console.log('  بيانات الدخول للمؤسسة:');
  console.log('  البريد    :', SCHOOL.email);
  console.log('  كلمة السر:', SCHOOL.password);
  console.log('══════════════════════════════════════');

  db.close();
})();
