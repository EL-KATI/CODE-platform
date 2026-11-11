'use strict';
/**
 * liveHub — محور الأحداث الحية للحصص الجماعية
 *
 * يستخدم SSE (Server-Sent Events) بدل polling:
 *   - السيرفر يدفع الأحداث للعملاء فور وقوعها (Real-time)
 *   - بدون أي library خارجية (native في كل المتصفحات)
 *   - المدرب يرسل أوامر عبر REST API → لiveHub يُعلم الطلاب فوراً
 *
 * الأحداث المدعومة:
 *   question   — سؤال جديد (data: {sessionId, current_q, question, total})
 *   answer_ack — إجابة مقبولة للطالب نفسه (data: {isCorrect, correct})
 *   leaderboard— تحديث الترتيب الحي (data: [{rank, userId, score, avgMs}])
 *   session    — تغيير حالة الحصة (data: {status: 'live'|'ended'|'waiting'})
 *   raise_hand — طالب رفع يده (data: {userId}) — للمدرب فقط
 */

/** Map<sessionId, Map<userId, {res, role}>> */
const rooms = new Map();

/**
 * تسجيل اتصال SSE جديد
 * @param {number} sessionId
 * @param {number} userId
 * @param {string} role  'student' | 'instructor' | 'school' | 'admin'
 * @param {import('express').Response} res
 * @returns {function} cleanup — استدعيها عند قطع الاتصال
 */
function subscribe(sessionId, userId, role, res) {
  // إعداد رؤوس SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx: لا تخزن مؤقتاً
  res.flushHeaders();

  // ضمان وجود الغرفة
  if (!rooms.has(sessionId)) rooms.set(sessionId, new Map());
  const room = rooms.get(sessionId);
  room.set(userId, { res, role });

  // ping كل 25 ثانية لإبقاء الاتصال حياً عبر proxies
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(ping); }
  }, 25_000);

  // دالة التنظيف
  return function cleanup() {
    clearInterval(ping);
    const r = rooms.get(sessionId);
    if (r) {
      r.delete(userId);
      if (r.size === 0) rooms.delete(sessionId);
    }
  };
}

/**
 * إرسال حدث SSE لجميع المشتركين في غرفة
 * @param {number} sessionId
 * @param {string} event  اسم الحدث
 * @param {object} data
 * @param {object} [opts]
 * @param {string} [opts.onlyRole]  إرسال لدور معين فقط
 * @param {number} [opts.onlyUser]  إرسال لمستخدم معين فقط
 */
function emit(sessionId, event, data, opts = {}) {
  const room = rooms.get(sessionId);
  if (!room) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const [uid, { res, role }] of room) {
    if (opts.onlyRole && role !== opts.onlyRole) continue;
    if (opts.onlyUser !== undefined && uid !== opts.onlyUser) continue;
    try { res.write(payload); } catch { /* اتصال مقطوع */ }
  }
}

/**
 * إرسال حدث لمستخدم واحد فقط
 */
function emitTo(sessionId, userId, event, data) {
  emit(sessionId, event, data, { onlyUser: userId });
}

/**
 * إرسال لأدوار المؤسسة فقط (school/instructor/admin)
 */
function emitToInstructors(sessionId, event, data) {
  const room = rooms.get(sessionId);
  if (!room) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [, { res, role }] of room) {
    if (!['school', 'instructor', 'admin'].includes(role)) continue;
    try { res.write(payload); } catch {}
  }
}

/** عدد المتصلين في غرفة */
function connectedCount(sessionId) {
  return rooms.get(sessionId)?.size ?? 0;
}

module.exports = { subscribe, emit, emitTo, emitToInstructors, connectedCount };
