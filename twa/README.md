# TWA — Trusted Web Activity للنشر على Play Store

## الخطوات الكاملة لإنشاء تطبيق أندرويد

### 1. المتطلبات
- Android Studio مثبّت
- حساب Google Play Console (25$ مرة واحدة)
- الموقع مرفوع على HTTPS (ضروري)

### 2. إنشاء مشروع TWA بـ Bubblewrap (الأسهل)

#### تثبيت Bubblewrap
```bash
npm install -g @bubblewrap/cli
```

#### إنشاء المشروع
```bash
mkdir code-twa && cd code-twa
bubblewrap init --manifest https://YOUR_DOMAIN/manifest.webmanifest
```

عند السؤال، اختر:
- **Package name**: `ma.code.conduiteauto`
- **App name**: `CODE — رخصة السياقة`
- **Display mode**: `standalone`
- **Status bar color**: `#ea580c`

#### بناء الـ APK
```bash
bubblewrap build
```

سيولّد: `app-release-signed.apk`

---

### 3. ربط التطبيق بالموقع (Digital Asset Links)

بعد بناء التطبيق، احصل على SHA-256 fingerprint:
```bash
keytool -list -v -keystore android.keystore -alias android -storepass android -keypass android
```

انسخ قيمة `SHA256:` وضعها في:
`public/.well-known/assetlinks.json` → `sha256_cert_fingerprints`

ثم ادفع للسيرفر وتحقق:
```
https://YOUR_DOMAIN/.well-known/assetlinks.json
```

---

### 4. النشر على Play Store

1. اذهب لـ [play.google.com/console](https://play.google.com/console)
2. إنشاء تطبيق جديد → Production
3. ارفع `app-release-signed.apk`
4. أكمل بيانات التطبيق:
   - **العنوان**: CODE — رخصة السياقة صنف B
   - **الوصف**: منصة تفاعلية لتعلم الدراسة النظرية...
   - **الفئة**: Education
   - **لقطات الشاشة**: 2 على الأقل (1080x1920)
5. أرسل للمراجعة (3-7 أيام عادةً)

---

### 5. ملفات الأيقونات الجاهزة

موجودة في `public/assets/img/`:
- `icon-192x192.png` — أيقونة التطبيق
- `icon-512x512.png` — أيقونة Play Store

### معلومات التطبيق
- **Package**: `ma.code.conduiteauto`
- **Version**: 1.0.0
- **Min SDK**: 21 (Android 5.0)
- **Target SDK**: 34 (Android 14)
