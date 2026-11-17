'use strict';
/**
 * /api/translate — ترجمة نصوص الأسئلة + واجهة الموقع
 *
 * POST /api/translate
 *   body: { text: string, target: string }          → ترجمة نص واحد
 *
 * POST /api/translate/ui
 *   body: { texts: string[], target: string }        → ترجمة batch لمفاتيح الواجهة
 *   returns: { translations: string[], lang: string, engine: string }
 *
 * GET  /api/translate/languages                      → قائمة اللغات المدعومة
 *
 * المحركات (بالأولوية):
 *   1. Google Translate API  (GOOGLE_TRANSLATE_KEY في .env)
 *   2. LibreTranslate        (LIBRETRANSLATE_URL + LIBRETRANSLATE_KEY)
 *   3. MyMemory              (مجاني بدون مفتاح — 5000 حرف/يوم)
 */

const express = require('express');
const auth    = require('../auth');
const { wrap, bad } = require('../http');

const router = express.Router();

// ─── إعداد المحركات ───────────────────────────────────────────────────────────
const LT_URL       = (process.env.LIBRETRANSLATE_URL || 'https://libretranslate.com').replace(/\/$/, '');
const LT_KEY       = process.env.LIBRETRANSLATE_KEY  || '';
const GOOGLE_KEY   = process.env.GOOGLE_TRANSLATE_KEY || '';

// ─── اللغات المدعومة ──────────────────────────────────────────────────────────
const SUPPORTED_LANGUAGES = [
  { code: 'ar', name: 'العربية',    nameEn: 'Arabic',     flag: '🇲🇦', rtl: true  },
  { code: 'fr', name: 'Français',   nameEn: 'French',     flag: '🇫🇷', rtl: false },
  { code: 'en', name: 'English',    nameEn: 'English',    flag: '🇬🇧', rtl: false },
  { code: 'es', name: 'Español',    nameEn: 'Spanish',    flag: '🇪🇸', rtl: false },
  { code: 'de', name: 'Deutsch',    nameEn: 'German',     flag: '🇩🇪', rtl: false },
  { code: 'it', name: 'Italiano',   nameEn: 'Italian',    flag: '🇮🇹', rtl: false },
  { code: 'pt', name: 'Português',  nameEn: 'Portuguese', flag: '🇵🇹', rtl: false },
  { code: 'nl', name: 'Nederlands', nameEn: 'Dutch',      flag: '🇳🇱', rtl: false },
  { code: 'tr', name: 'Türkçe',     nameEn: 'Turkish',    flag: '🇹🇷', rtl: false },
  { code: 'ru', name: 'Русский',    nameEn: 'Russian',    flag: '🇷🇺', rtl: false },
  { code: 'zh', name: '中文',        nameEn: 'Chinese',    flag: '🇨🇳', rtl: false },
  { code: 'ja', name: '日本語',      nameEn: 'Japanese',   flag: '🇯🇵', rtl: false },
];

// ─── كاش في الذاكرة (server-side) للـ UI batch ───────────────────────────────
// key: `${lang}:${hash}` → { translations, ts }
const uiCache = new Map();
const UI_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

function cacheKey(lang, texts) {
  // hash بسيط
  let h = 0;
  const s = texts.join('|');
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return `${lang}:${h >>> 0}`;
}

// ─── قاموس الدارجة المغربية ───────────────────────────────────────────────────
const DARIJA_PATCH = [
  [/arrêtez-vous/gi,'وقفو'],[/arrêtez/gi,'وقف'],[/vitesse/gi,'سرعة'],
  [/signe/gi,'إشارة'],[/feux/gi,'ضو'],[/feu rouge/gi,'ضو حمر'],
  [/feu vert/gi,'ضو خضر'],[/feu orange/gi,'ضو برتقالي'],
  [/conducteur/gi,'السواق'],[/véhicule/gi,'الكار'],[/voiture/gi,'طوموبيل'],
  [/piéton/gi,'بيدو'],[/piétons/gi,'البيداويين'],[/carrefour/gi,'الكارفور'],
  [/intersection/gi,'الكارفور'],[/priorité/gi,'أولوية'],
  [/dépassement/gi,'التفوت'],[/dépasser/gi,'تتفوت'],
  [/stationnement/gi,'الركن'],[/stationner/gi,'تركن'],
  [/interdiction/gi,'ممنوع'],[/obligatoire/gi,'واجب'],[/danger/gi,'خطر'],
  [/route/gi,'الطريق'],[/autoroute/gi,'الأوطوروت'],[/panneau/gi,'اللوحة'],
  [/ceinture de sécurité/gi,'حزام الأمان'],[/ceinture/gi,'الحزام'],
  [/casque/gi,'الخوذة'],[/alcoolémie/gi,'نسبة الكحول'],[/alcool/gi,'الكحول'],
  [/permis/gi,'الرخصة'],[/assurance/gi,'التأمين'],[/amende/gi,'الغرامة'],
  [/retrait de permis/gi,'سحب الرخصة'],[/virage/gi,'اللفة'],[/courbe/gi,'اللفة'],
  [/pente/gi,'المنحدر'],[/montée/gi,'الصعود'],[/descente/gi,'النزول'],
  [/nuit/gi,'الليل'],[/jour/gi,'النهار'],[/pluie/gi,'الشتا'],
  [/brouillard/gi,'الضباب'],[/glissant/gi,'مزلق'],[/freinage/gi,'الكبح'],
  [/frein/gi,'الفرامل'],[/klaxon/gi,'الكلاكسون'],[/gyrophare/gi,'الضو الدوار'],
  [/ambulance/gi,'الامبولانس'],[/pompiers/gi,'المطافي'],
  [/gendarmerie/gi,'الدرك'],[/police/gi,'البوليس'],
  [/vous devez/gi,'خصك'],[/il faut/gi,'خص'],[/il est interdit/gi,'ممنوع'],
  [/quelle est/gi,'شنو هي'],[/quel est/gi,'شنو هو'],[/que doit/gi,'شنو خص'],
  [/dans cette situation/gi,'ف هاد الحالة'],[/dans ce cas/gi,'ف هاد الحالة'],
];
function applyDarijaPatch(text) {
  let r = text;
  for (const [p, rep] of DARIJA_PATCH) r = r.replace(p, rep);
  return r;
}

// ─── محركات الترجمة ───────────────────────────────────────────────────────────

/** Google Translate API v2 (مدفوع — يتطلب GOOGLE_TRANSLATE_KEY) */
async function translateGoogle(texts, source, target) {
  const url = `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_KEY}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: texts, source, target, format: 'text' }),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`Google Translate ${resp.status}`);
  const data = await resp.json();
  return data.data.translations.map(t => t.translatedText);
}

/** LibreTranslate (مجاني/مفتوح المصدر — يمكن استضافته ذاتياً) */
async function translateLibre(text, source, target) {
  const resp = await fetch(`${LT_URL}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source, target, format: 'text', ...(LT_KEY ? { api_key: LT_KEY } : {}) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`LibreTranslate ${resp.status}`);
  const data = await resp.json();
  return data.translatedText;
}

/** MyMemory (مجاني بدون مفتاح — 5000 حرف/يوم) */
async function translateMyMemory(text, source, target) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${source}|${target}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) throw new Error(`MyMemory ${resp.status}`);
  const data = await resp.json();
  if (data.responseStatus !== 200) throw new Error('MyMemory error: ' + data.responseDetails);
  return data.responseData.translatedText;
}

/** ترجمة batch ذكية — تستخدم أفضل محرك متاح */
async function translateBatch(texts, source, target) {
  // Google: يدعم batch مباشرة
  if (GOOGLE_KEY) {
    const results = await translateGoogle(texts, source, target);
    return { translations: results, engine: 'google' };
  }

  // LibreTranslate: نرسل كل نص على حدة (لا يدعم batch في النسخة المجانية)
  if (LT_URL) {
    try {
      const translations = [];
      for (const text of texts) {
        if (!text || !text.trim()) { translations.push(text); continue; }
        const r = await translateLibre(text, source, target);
        translations.push(r);
      }
      return { translations, engine: 'libretranslate' };
    } catch (e) {
      console.warn('[translate] LibreTranslate failed, falling back to MyMemory:', e.message);
    }
  }

  // MyMemory: fallback مجاني — ندمج النصوص لتقليل الطلبات
  const SEP = ' ⬥ ';
  const chunks = [];
  let cur = [];
  let curLen = 0;
  for (const text of texts) {
    if (curLen + text.length > 400) {
      chunks.push(cur);
      cur = [text]; curLen = text.length;
    } else {
      cur.push(text); curLen += text.length + SEP.length;
    }
  }
  if (cur.length) chunks.push(cur);

  const allTranslated = [];
  for (const chunk of chunks) {
    const joined = chunk.join(SEP);
    const tr = await translateMyMemory(joined, source, target);
    const parts = tr.split(SEP);
    // إذا تغير عدد الأجزاء، نعيد بشكل فردي
    if (parts.length !== chunk.length) {
      for (const t of chunk) {
        try { allTranslated.push(await translateMyMemory(t, source, target)); }
        catch { allTranslated.push(t); }
      }
    } else {
      allTranslated.push(...parts.map(p => p.trim()));
    }
  }
  return { translations: allTranslated, engine: 'mymemory' };
}

// ─── GET /api/translate/languages ────────────────────────────────────────────
router.get('/languages', (req, res) => {
  res.json({ languages: SUPPORTED_LANGUAGES });
});

// ─── POST /api/translate/ui  (ترجمة batch لمفاتيح الواجهة) ──────────────────
// مفتوح للجميع (بدون auth) لأن المستخدم قد لا يكون مسجلاً بعد
router.post('/ui', wrap(async (req, res) => {
  const { texts, target, source = 'ar' } = req.body;

  if (!Array.isArray(texts) || texts.length === 0) return bad(res, 'texts array required');
  if (!target || typeof target !== 'string') return bad(res, 'target lang required');
  if (texts.length > 500) return bad(res, 'max 500 texts per request');

  const lang = SUPPORTED_LANGUAGES.find(l => l.code === target);
  if (!lang) return bad(res, `unsupported language: ${target}`);

  // إذا كانت الترجمة المطلوبة هي نفس المصدر، أرجع النصوص كما هي
  if (target === source) {
    return res.json({ translations: texts, lang: target, engine: 'passthrough' });
  }

  // تحقق من الكاش
  const key = cacheKey(target, texts);
  const cached = uiCache.get(key);
  if (cached && (Date.now() - cached.ts < UI_CACHE_TTL)) {
    return res.json({ translations: cached.translations, lang: target, engine: cached.engine, cached: true });
  }

  try {
    const { translations, engine } = await translateBatch(texts, source, target);

    // حفظ في الكاش
    uiCache.set(key, { translations, engine, ts: Date.now() });
    // تنظيف الكاش القديم
    if (uiCache.size > 100) {
      const oldest = [...uiCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
      uiCache.delete(oldest[0]);
    }

    res.json({ translations, lang: target, engine });
  } catch (err) {
    console.error('[translate/ui]', err.message);
    res.status(502).json({ error: 'translation_service_unavailable', detail: err.message });
  }
}));

// ─── POST /api/translate  (ترجمة نص واحد — للأسئلة، يتطلب auth) ─────────────
router.post('/', auth.requireAuth, wrap(async (req, res) => {
  const { text, target } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) return bad(res, 'text required');
  if (!target || typeof target !== 'string') return bad(res, 'target required');
  if (text.length > 2000) return bad(res, 'text too long (max 2000 chars)');

  const isDarija = target === 'darija';
  const ltTarget = isDarija ? 'fr' : target;

  try {
    let translated;
    let engine;

    if (GOOGLE_KEY && !isDarija) {
      [translated] = (await translateGoogle([text], 'ar', target)).translations ?? [text];
      engine = 'google';
    } else {
      translated = await translateLibre(text, 'ar', ltTarget);
      engine = 'libretranslate';
    }

    if (isDarija) translated = applyDarijaPatch(translated);

    res.json({ translated, source: 'ar', target, engine });
  } catch (err) {
    // fallback إلى MyMemory
    try {
      const translated = await translateMyMemory(text, 'ar', isDarija ? 'fr' : target);
      res.json({ translated: isDarija ? applyDarijaPatch(translated) : translated, source: 'ar', target, engine: 'mymemory' });
    } catch (e) {
      console.error('[translate]', e.message);
      res.status(502).json({ error: 'translation_service_unavailable' });
    }
  }
}));

module.exports = router;
