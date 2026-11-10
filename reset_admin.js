/**
 * إعادة تعيين كلمة سر حساب أدمين واحد — يُشغَّل من طرفية الخادم (حيث توجد قاعدة البيانات).
 *
 *   node reset_admin.js                 → الأدمين الأكبر (أو الأدمين الوحيد)
 *   node reset_admin.js admin@site.ma   → حساب أدمين محدد بالبريد
 *
 * يولّد كلمة سر عشوائية قوية ويعرضها مرة واحدة فقط. لا يغيّر أي حساب آخر.
 * بعد الدخول، غيّر كلمة السر من صفحة «حسابي».
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./server/db');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const generate = (len = 14) => Array.from({ length: len }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');

db.open();
const d = db.get();
const wanted = (process.argv[2] || '').trim().toLowerCase();
const admins = d.prepare("SELECT id, email, name, is_super_admin FROM users WHERE role = 'admin' ORDER BY is_super_admin DESC, id").all();

if (!admins.length) {
  console.error('لا يوجد أي حساب أدمين في قاعدة البيانات.');
  process.exit(1);
}
const target = wanted ? admins.find((a) => a.email.toLowerCase() === wanted) : admins[0];
if (!target) {
  console.error(`لا يوجد أدمين بالبريد: ${wanted}`);
  console.error('حسابات الأدمين الموجودة:');
  for (const a of admins) console.error(`  - ${a.email}${a.is_super_admin ? '  (الأدمين الأكبر)' : ''}`);
  process.exit(1);
}

const password = generate();
d.prepare('UPDATE users SET password_hash = ?, active = 1 WHERE id = ?').run(bcrypt.hashSync(password, 12), target.id);
try { db.audit(target.id, 'reset_password_cli', 'user', target.id, { via: 'reset_admin.js' }); } catch { /* سجل التدقيق اختياري */ }

console.log('تمت إعادة تعيين كلمة السر.');
console.log(`  البريد      : ${target.email}`);
console.log(`  كلمة السر   : ${password}`);
console.log('احفظها الآن: لن تُعرض مرة أخرى. غيّرها بعد الدخول من صفحة «حسابي».');
