'use strict';
/**
 * خدمة إرسال الإيميل — تستعمل nodemailer مع SMTP
 * الإعداد عبر متغيرات البيئة:
 *   SMTP_HOST    — سيرفر SMTP (مثال: smtp.gmail.com)
 *   SMTP_PORT    — البورت (587 للـ TLS أو 465 للـ SSL)
 *   SMTP_USER    — البريد المرسِل
 *   SMTP_PASS    — كلمة سر التطبيق (App Password لـ Gmail)
 *   SMTP_FROM    — عنوان المرسِل (اختياري، يرجع لـ SMTP_USER)
 */

let nodemailer;
try { nodemailer = require('nodemailer'); } catch { nodemailer = null; }

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

/**
 * يرسل إيميل OTP للأدمن
 * @param {string} to — البريد الإلكتروني للمستلم
 * @param {string} code — الرمز المكوّن من 6 أرقام
 */
async function sendOtp(to, code) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const transporter = getTransporter();

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
  .card { background: #fff; border-radius: 12px; padding: 32px; max-width: 480px; margin: 0 auto; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  .logo { text-align: center; margin-bottom: 24px; }
  .logo-box { width: 52px; height: 52px; background: linear-gradient(145deg,#f97316,#c2410c); border-radius: 14px; display: inline-flex; align-items: center; justify-content: center; }
  h2 { color: #111; margin: 0 0 8px; font-size: 1.3rem; text-align: center; }
  p { color: #555; font-size: .95rem; line-height: 1.6; text-align: center; }
  .otp { font-size: 2.4rem; font-weight: 800; letter-spacing: 10px; color: #ea580c; text-align: center; padding: 20px; background: #fff7ed; border-radius: 10px; margin: 20px 0; border: 2px dashed #fed7aa; }
  .footer { color: #aaa; font-size: .8rem; text-align: center; margin-top: 20px; }
</style></head>
<body>
<div class="card">
  <div class="logo">
    <div class="logo-box">
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 15.5V12l1.6-4.2A1.5 1.5 0 0 1 8 6.8h8a1.5 1.5 0 0 1 1.4 1l1.6 4.2v3.5"/>
        <path d="M4.5 15.5h15"/>
        <circle cx="8" cy="15.5" r="1.6" fill="#fff" stroke="none"/>
        <circle cx="16" cy="15.5" r="1.6" fill="#fff" stroke="none"/>
      </svg>
    </div>
  </div>
  <h2>رمز التحقق — منصة CODE</h2>
  <p>تم طلب تسجيل الدخول لحساب المسؤول. استخدم الرمز التالي للمتابعة:</p>
  <div class="otp">${code}</div>
  <p>⏱ هذا الرمز صالح لمدة <strong>10 دقائق</strong> فقط.</p>
  <p>إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة وتأكد من أمان حسابك.</p>
  <div class="footer">منصة تعليم قانون السير — المغرب</div>
</div>
</body>
</html>`;

  await transporter.sendMail({
    from: `"منصة CODE" <${from}>`,
    to,
    subject: `[CODE] رمز التحقق: ${code}`,
    html,
    text: `رمز التحقق الخاص بك هو: ${code}\nصالح لمدة 10 دقائق.`,
  });
}

/**
 * يتحقق إذا كان SMTP مُعدًّا (بدون إرسال)
 */
function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && nodemailer);
}

module.exports = { sendOtp, isConfigured };
