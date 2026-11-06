# CODE — منصة تعلم الدراسة النظرية لرخصة السياقة (صنف B)

Node.js + Express + SQLite، واجهة SPA بالعربية والفرنسية.

## التشغيل
1. ثبّت **Node.js 20 أو 22 LTS** (تجنب الإصدارات الجديدة جدا مثل 26 لأن `better-sqlite3` يحتاج Visual Studio لبنائها).
2. `npm install`
3. (اختياري) انسخ `.env.example` إلى `.env` وضع `ADMIN_PASSWORD` ومفاتيح الذكاء الاصطناعي.
4. `npm start` ثم افتح http://localhost:3000

عند أول تشغيل يُنشأ حساب مدير `admin@example.com`؛ كلمة المرور تظهر في الطرفية
(أو هي قيمة `ADMIN_PASSWORD` إن حددتها). غيّرها بعد الدخول.
