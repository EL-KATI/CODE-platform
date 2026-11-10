'use strict';
/**
 * يحمّل ملف .env (جذر المشروع) في process.env قبل أي شيء آخر.
 * المتغيرات المعرّفة مسبقاً في النظام لها الأولوية. بدون مكتبة خارجية.
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', '.env');
if (fs.existsSync(file)) {
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    process.env[m[1]] = v; // .env دائماً يغلب على متغيرات النظام
  }
}
