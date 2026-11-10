'use strict';
/**
 * خدمة إرسال الإيميل — ELCODE MAROC
 * الإعداد عبر متغيرات البيئة:
 *   SMTP_HOST    — سيرفر SMTP (مثال: smtp.gmail.com)
 *   SMTP_PORT    — البورت (587 للـ TLS أو 465 للـ SSL)
 *   SMTP_USER    — البريد المرسِل
 *   SMTP_PASS    — كلمة سر التطبيق (App Password لـ Gmail)
 *   SMTP_FROM    — عنوان المرسِل (اختياري، يرجع لـ SMTP_USER)
 *   APP_URL      — رابط التطبيق (لروابط إعادة تعيين كلمة السر)
 */

let nodemailer;
try { nodemailer = require('nodemailer'); } catch { nodemailer = null; }

const BRAND = 'ELCODE MAROC';
const BRAND_COLOR = '#ea580c';

function getTransporter() {
  if (!nodemailer) {
    throw new Error('nodemailer غير منصوب — قم بتشغيل: npm install');
  }
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error('إعداد SMTP ناقص — أضف SMTP_HOST / SMTP_USER / SMTP_PASS في .env');
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587', 10),
    secure: parseInt(SMTP_PORT || '587', 10) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

/** قالب HTML مشترك للإيميلات */
function emailLayout(title, body) {
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 24px 16px; }
  .wrap { max-width: 520px; margin: 0 auto; }
  .header { background: linear-gradient(135deg,${BRAND_COLOR},#c2410c); border-radius: 14px 14px 0 0; padding: 28px 32px; text-align: center; }
  .logo-box { width: 56px; height: 56px; background: rgba(255,255,255,.18); border-radius: 14px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px; }
  .brand { color: #fff; font-size: 1.3rem; font-weight: 800; letter-spacing: 1px; margin: 0; }
  .tagline { color: rgba(255,255,255,.8); font-size: .82rem; margin: 4px 0 0; }
  .body { background: #fff; padding: 32px; border-radius: 0 0 14px 14px; box-shadow: 0 4px 20px rgba(0,0,0,.08); }
  h2 { color: #111; margin: 0 0 10px; font-size: 1.2rem; text-align: center; }
  p { color: #555; font-size: .93rem; line-height: 1.65; text-align: center; margin: 0 0 14px; }
  .otp { font-size: 2.6rem; font-weight: 900; letter-spacing: 12px; color: ${BRAND_COLOR}; text-align: center; padding: 22px; background: #fff7ed; border-radius: 10px; margin: 20px 0; border: 2px dashed #fed7aa; }
  .btn { display: block; width: fit-content; margin: 20px auto; padding: 14px 36px; background: ${BRAND_COLOR}; color: #fff !important; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 1rem; }
  .notice { background: #fef9ec; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; font-size: .82rem; color: #92400e; text-align: center; margin: 16px 0 0; }
  .footer { color: #aaa; font-size: .78rem; text-align: center; margin-top: 20px; }
</style></head>
<body>
<div class="wrap">
  <div class="header">
    <div class="logo-box">
      <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 15.5V12l1.6-4.2A1.5 1.5 0 0 1 8 6.8h8a1.5 1.5 0 0 1 1.4 1l1.6 4.2v3.5"/>
        <path d="M4.5 15.5h15"/>
        <circle cx="8" cy="15.5" r="1.6" fill="#fff" stroke="none"/>
        <circle cx="16" cy="15.5" r="1.6" fill="#fff" stroke="none"/>
      </svg>
    </div>
    <p class="brand">${BRAND}</p>
    <p class="tagline">منصة تعليم قانون السير — المغرب</p>
  </div>
  <div class="body">
    <h2>${title}</h2>
    ${body}
    <div class="footer">${BRAND} · جميع الحقوق محفوظة</div>
  </div>
</div>
</body>
</html>`;
}

/**
 * يرسل إيميل OTP للأدمن (2FA عند تسجيل الدخول)
 */
async function sendOtp(to, code) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const transporter = getTransporter();

  const html = emailLayout('رمز التحقق بخطوتين', `
    <p>تم طلب تسجيل الدخول لحساب المسؤول.<br>استخدم الرمز التالي للمتابعة:</p>
    <div class="otp">${code}</div>
    <p>⏱ هذا الرمز صالح لمدة <strong>10 دقائق</strong> فقط.</p>
    <div class="notice">إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة فوراً وتأكد من أمان حسابك.</div>
  `);

  await transporter.sendMail({
    from: `"${BRAND}" <${from}>`,
    to,
    subject: `[${BRAND}] رمز التحقق: ${code}`,
    html,
    text: `رمز التحقق: ${code}\nصالح لمدة 10 دقائق.\n— ${BRAND}`,
  });
}

/**
 * يرسل إيميل إعادة تعيين كلمة السر
 * @param {string} to — البريد الإلكتروني للمستلم
 * @param {string} name — اسم المستخدم
 * @param {string} resetUrl — رابط إعادة التعيين الكامل
 */
async function sendPasswordReset(to, name, resetUrl) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const transporter = getTransporter();

  const html = emailLayout('إعادة تعيين كلمة السر', `
    <p>مرحباً <strong>${name}</strong>،</p>
    <p>تلقينا طلباً لإعادة تعيين كلمة السر الخاصة بحسابك على منصة <strong>${BRAND}</strong>.</p>
    <p>انقر على الزر أدناه لإعادة تعيين كلمة السر:</p>
    <a href="${resetUrl}" class="btn">إعادة تعيين كلمة السر</a>
    <p class="small" style="font-size:.82rem;color:#888;margin-top:8px">
      أو انسخ هذا الرابط في المتصفح:<br>
      <span dir="ltr" style="word-break:break-all;color:#666">${resetUrl}</span>
    </p>
    <div class="notice">⏱ هذا الرابط صالح لمدة <strong>30 دقيقة</strong> فقط.<br>إذا لم تطلب إعادة التعيين، تجاهل هذه الرسالة. حسابك بأمان.</div>
  `);

  await transporter.sendMail({
    from: `"${BRAND}" <${from}>`,
    to,
    subject: `[${BRAND}] إعادة تعيين كلمة السر`,
    html,
    text: `إعادة تعيين كلمة السر\n\nانقر على الرابط التالي:\n${resetUrl}\n\nصالح لمدة 30 دقيقة.\n— ${BRAND}`,
  });
}

/**
 * يتحقق إذا كان SMTP مُعدًّا
 */
function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && nodemailer);
}

module.exports = { sendOtp, sendPasswordReset, isConfigured };
