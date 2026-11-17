'use strict';
/**
 * Push Notifications Service — Web Push (VAPID)
 *
 * يستخدم مكتبة web-push لإرسال إشعارات للمتصفح عبر بروتوكول Web Push.
 * المفاتيح تُخزَّن في app_secrets (مشفّرة في DB).
 */

let webpush = null;
let initialized = false;

/**
 * تهيئة web-push بمفاتيح VAPID
 * يُستدعى مرة واحدة عند بدء الخادم
 */
function init(vapidPublic, vapidPrivate, mailto) {
  try {
    webpush = require('web-push');
    webpush.setVapidDetails(
      `mailto:${mailto || 'admin@code-platform.ma'}`,
      vapidPublic,
      vapidPrivate
    );
    initialized = true;
    console.log('[Push] Service initialized');
  } catch (err) {
    console.warn('[Push] web-push not available:', err.message);
    initialized = false;
  }
}

/**
 * إرسال إشعار لاشتراك واحد
 * @param {object} subscription - { endpoint, keys: { p256dh, auth } }
 * @param {object} payload - { title, body, url, icon, badge, tag }
 * @returns {Promise<boolean>}
 */
async function sendToOne(subscription, payload) {
  if (!initialized || !webpush) return false;

  const payloadStr = JSON.stringify({
    title:  payload.title  || 'CODE',
    body:   payload.body   || '',
    url:    payload.url    || '/',
    icon:   payload.icon   || '/assets/img/icon-192x192.png',
    badge:  payload.badge  || '/assets/img/icon-72x72.png',
    tag:    payload.tag    || 'code-notification',
    dir:    'rtl',
    lang:   'ar',
  });

  try {
    await webpush.sendNotification(subscription, payloadStr, {
      TTL: 86400, // 24 ساعة
      urgency: 'normal',
    });
    return true;
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // الاشتراك انتهت صلاحيته
      return 'expired';
    }
    console.warn('[Push] Send failed:', err.message);
    return false;
  }
}

/**
 * إرسال إشعار لقائمة اشتراكات
 * @param {Array} subscriptions - مصفوفة من { endpoint, p256dh, auth, user_id }
 * @param {object} payload
 * @returns {Promise<{ sent: number, failed: number, expired: number[] }>}
 */
async function sendToMany(subscriptions, payload) {
  const expiredEndpoints = [];
  let sent = 0, failed = 0;

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const result = await sendToOne(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      if (result === true)      sent++;
      else if (result === 'expired') expiredEndpoints.push(sub.endpoint);
      else                      failed++;
    })
  );

  return { sent, failed, expired: expiredEndpoints };
}

/**
 * إرسال لكل مستخدمي المنصة (broadcast)
 * @param {object} db - better-sqlite3 instance
 * @param {object} payload
 */
async function broadcast(db, payload) {
  const subs = db.prepare(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions'
  ).all();

  if (!subs.length) return { sent: 0, failed: 0, expired: [] };

  const result = await sendToMany(subs, payload);

  // حذف الاشتراكات المنتهية
  if (result.expired.length) {
    const del = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');
    result.expired.forEach((ep) => del.run(ep));
  }

  return result;
}

/**
 * إرسال لمستخدم واحد (بكل أجهزته)
 * @param {object} db
 * @param {number} userId
 * @param {object} payload
 */
async function sendToUser(db, userId, payload) {
  const subs = db.prepare(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?'
  ).all(userId);

  if (!subs.length) return { sent: 0, failed: 0, expired: [] };

  const result = await sendToMany(subs, payload);

  if (result.expired.length) {
    const del = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');
    result.expired.forEach((ep) => del.run(ep));
  }

  return result;
}

module.exports = { init, sendToOne, sendToMany, broadcast, sendToUser };
