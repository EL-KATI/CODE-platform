'use strict';
/**
 * test_schools.js — اختبار إضافة وعرض وتعديل 3 مؤسسات
 * التشغيل: node test_schools.js
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_FILE || path.join(__dirname, 'data', 'platform.db');
let db;
try {
  db = new Database(DB_PATH);
} catch (e) {
  console.error('❌ لا يمكن فتح قاعدة البيانات:', e.message);
  console.error('   تأكد من تشغيل السيرفر مرة واحدة أولاً لإنشاء الجداول.');
  process.exit(1);
}

db.pragma('foreign_keys = OFF'); // نتجنب قيود FK في الاختبار

const cols = db.prepare('PRAGMA table_info(schools)').all().map(c => c.name);
console.log('\n📋 أعمدة جدول schools:', cols.join(', '));

const missing = ['agrement_num', 'raison_sociale', 'email', 'owner_id'].filter(c => !cols.includes(c));
if (missing.length) {
  console.warn('⚠️  أعمدة ناقصة:', missing.join(', '), '— سيتم إضافتها...');
  for (const col of missing) {
    try {
      db.exec(`ALTER TABLE schools ADD COLUMN ${col} TEXT DEFAULT ''`);
      console.log('   ✅ أضيف:', col);
    } catch (e) {
      console.warn('   ⚠️  فشل إضافة', col, ':', e.message);
    }
  }
}

// ── إضافة 3 مؤسسات ──────────────────────────────────────────────────────────
const schools = [
  { name: 'مدرسة النجاح للسياقة',    code: 'NAJAH_RBT',  email: 'najah@autoecole.ma',    phone: '0537123456', address: 'شارع محمد الخامس، الرباط',     agrement_num: '7163', raison_sociale: 'NAJAH SARL' },
  { name: 'مدرسة الأمان للقيادة',    code: 'AMAN_CAS',   email: 'aman@autoecole.ma',     phone: '0522654321', address: 'بوليفار زركطوني، الدار البيضاء', agrement_num: '8842', raison_sociale: 'AMAN AUTO-ECOLE' },
  { name: 'أكاديمية السائق المحترف', code: 'ACADEMY_FES', email: 'academy@autoecole.ma', phone: '0535987654', address: 'شارع الحسن الثاني، فاس',           agrement_num: '3391', raison_sociale: 'ACADEMY CONDUITE SARL' },
];

console.log('\n🏫 إضافة 3 مؤسسات...\n');
const insertedIds = [];

for (const s of schools) {
  // حذف مؤسسة بنفس الكود إن وجدت (للاختبار المتكرر)
  db.prepare('DELETE FROM schools WHERE code = ?').run(s.code);

  const insertCols = ['name', 'code', 'phone', 'address'];
  const insertVals = [s.name, s.code, s.phone, s.address];
  const colsNow = db.prepare('PRAGMA table_info(schools)').all().map(c => c.name);
  if (colsNow.includes('email'))          { insertCols.push('email');          insertVals.push(s.email); }
  if (colsNow.includes('agrement_num'))   { insertCols.push('agrement_num');   insertVals.push(s.agrement_num); }
  if (colsNow.includes('raison_sociale')) { insertCols.push('raison_sociale'); insertVals.push(s.raison_sociale); }

  const ph = insertCols.map(() => '?').join(', ');
  try {
    const r = db.prepare(`INSERT INTO schools (${insertCols.join(', ')}) VALUES (${ph})`).run(...insertVals);
    insertedIds.push(r.lastInsertRowid);
    console.log(`  ✅ أضيفت: [ID=${r.lastInsertRowid}] ${s.name} (${s.code})`);
  } catch (e) {
    console.error(`  ❌ فشل إدراج ${s.name}:`, e.message);
  }
}

// ── عرض المؤسسات ─────────────────────────────────────────────────────────────
console.log('\n📊 عرض جميع المؤسسات في الجدول:\n');
const allSchools = db.prepare(`
  SELECT s.*,
    (SELECT COUNT(*) FROM users u WHERE CAST(u.school_id AS TEXT) = CAST(s.id AS TEXT) AND u.role = 'student') AS students_count,
    (SELECT COUNT(*) FROM users u WHERE CAST(u.school_id AS TEXT) = CAST(s.id AS TEXT) AND u.role = 'instructor') AS instructors_count
  FROM schools s ORDER BY s.name
`).all();

if (!allSchools.length) {
  console.log('  ⚠️  لا توجد مؤسسات في الجدول!');
} else {
  for (const s of allSchools) {
    console.log(`  🏫 [ID=${s.id}] ${s.name}`);
    console.log(`     الكود: ${s.code} | الهاتف: ${s.phone || '—'}`);
    console.log(`     الاعتماد: ${s.agrement_num || '—'} | الاسم التجاري: ${s.raison_sociale || '—'}`);
    console.log(`     البريد: ${s.email || '—'} | نشط: ${s.active ? 'نعم' : 'لا'}`);
    console.log(`     الطلاب: ${s.students_count} | المدربون: ${s.instructors_count}`);
    console.log();
  }
}

// ── تعديل المؤسسة الأولى ──────────────────────────────────────────────────────
if (insertedIds.length > 0) {
  const idToEdit = insertedIds[0];
  console.log(`✏️  تعديل المؤسسة ID=${idToEdit}...\n`);
  try {
    db.prepare('UPDATE schools SET name = ?, phone = ?, agrement_num = ?, raison_sociale = ? WHERE id = ?')
      .run('مدرسة النجاح المتطورة للسياقة', '0537999888', '7163-UPDATED', 'NAJAH SARL UPDATED', idToEdit);
    const updated = db.prepare('SELECT * FROM schools WHERE id = ?').get(idToEdit);
    console.log('  ✅ تم التعديل بنجاح:');
    console.log(`     الاسم الجديد: ${updated.name}`);
    console.log(`     الهاتف الجديد: ${updated.phone}`);
    console.log(`     الاعتماد الجديد: ${updated.agrement_num}`);
    console.log(`     الاسم التجاري الجديد: ${updated.raison_sociale}`);
  } catch (e) {
    console.error('  ❌ فشل التعديل:', e.message);
  }
}

// ── تقرير الأعمدة النهائي ─────────────────────────────────────────────────────
console.log('\n🔍 تقرير الأعمدة النهائي:');
const finalCols = db.prepare('PRAGMA table_info(schools)').all();
for (const c of finalCols) {
  console.log(`   ${c.name.padEnd(20)} ${c.type.padEnd(10)} DEFAULT: ${c.dflt_value ?? 'NULL'} ${c.notnull ? 'NOT NULL' : ''}`);
}

db.close();
console.log('\n✅ انتهى الاختبار.\n');
