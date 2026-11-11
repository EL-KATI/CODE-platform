'use strict';
/**
 * liveDraw — سحب أسئلة عشوائية للحصص الجماعية
 * يستخدم نفس منطق الامتحانات العامة (questions published)
 */
const db = require('../db');

/**
 * سحب `count` سؤال عشوائي من الأسئلة المنشورة
 * @param {number} count
 * @returns {number[]} question IDs
 */
function drawExamPublic(count = 40) {
  const d = db.get();
  count = Math.min(Math.max(Number(count) || 40, 5), 46);

  const rows = d.prepare(`
    SELECT id FROM questions
    WHERE status = 'published'
    ORDER BY RANDOM()
    LIMIT ?
  `).all(count);

  return rows.map(r => r.id);
}

module.exports = { drawExamPublic };
