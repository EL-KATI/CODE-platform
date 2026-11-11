'use strict';
/**
 * /api/translate — ترجمة نصوص الأسئلة
 *
 * POST /api/translate
 * body: { text: string, target: 'fr' | 'darija' }
 *
 * يستخدم LibreTranslate (مجاني/مفتوح المصدر).
 * المثيل الافتراضي: https://libretranslate.com (مجاني مع حد يومي)
 * يمكن ضبط LIBRETRANSLATE_URL و LIBRETRANSLATE_KEY في .env لمثيل خاص.
 *
 * الدارجة المغربية: LibreTranslate لا يدعمها رسمياً → نستخدم نموذج
 * "ar → Darija" بسيط مبني على قاموس محلي + ترجمة fr كبديل.
 */

const express = require('express');
const auth    = require('../auth');
const { wrap, bad } = require('../http');

const router = express.Router();
router.use(auth.requireAuth);

// ─── إعداد LibreTranslate ────────────────────────────────────────────────────
const LT_URL = (process.env.LIBRETRANSLATE_URL || 'https://libretranslate.com').replace(/\/$/, '');
const LT_KEY = process.env.LIBRETRANSLATE_KEY || '';

// ─── قاموس تعبيرات الدارجة المغربية الشائعة (حوادث المرور) ──────────────────
// يُطبَّق فوق الترجمة الفرنسية لتقريب النص من الدارجة
const DARIJA_PATCH = [
  [/arrêtez-vous/gi, 'وقفو'],
  [/arrêtez/gi, 'وقف'],
  [/vitesse/gi, 'سرعة'],
  [/signe/gi, 'إشارة'],
  [/feux/gi, 'ضو'],
  [/feu rouge/gi, 'ضو حمر'],
  [/feu vert/gi, 'ضو خضر'],
  [/feu orange/gi, 'ضو برتقالي'],
  [/conducteur/gi, 'السواق'],
  [/véhicule/gi, 'الكار'],
  [/voiture/gi, 'طوموبيل'],
  [/piéton/gi, 'بيدو'],
  [/piétons/gi, 'البيداويين'],
  [/carrefour/gi, 'الكارفور'],
  [/intersection/gi, 'الكارفور'],
  [/priorité/gi, 'أولوية'],
  [/dépassement/gi, 'التفوت'],
  [/dépasser/gi, 'تتفوت'],
  [/stationnement/gi, 'الركن'],
  [/stationner/gi, 'تركن'],
  [/interdiction/gi, 'ممنوع'],
  [/obligatoire/gi, 'واجب'],
  [/danger/gi, 'خطر'],
  [/route/gi, 'الطريق'],
  [/autoroute/gi, 'الأوطوروت'],
  [/panneau/gi, 'اللوحة'],
  [/panneau de signalisation/gi, 'لوحة الإشارة'],
  [/ceinture/gi, 'الحزام'],
  [/ceinture de sécurité/gi, 'حزام الأمان'],
  [/casque/gi, 'الخوذة'],
  [/alcool/gi, 'الكحول'],
  [/alcoolémie/gi, 'نسبة الكحول'],
  [/permis/gi, 'الرخصة'],
  [/assurance/gi, 'التأمين'],
  [/amende/gi, 'الغرامة'],
  [/retrait de permis/gi, 'سحب الرخصة'],
  [/virage/gi, 'اللفة'],
  [/courbe/gi, 'اللفة'],
  [/pente/gi, 'المنحدر'],
  [/montée/gi, 'الصعود'],
  [/descente/gi, 'النزول'],
  [/nuit/gi, 'الليل'],
  [/jour/gi, 'النهار'],
  [/pluie/gi, 'الشتا'],
  [/brouillard/gi, 'الضباب'],
  [/glissant/gi, 'مزلق'],
  [/freinage/gi, 'الكبح'],
  [/frein/gi, 'الفرامل'],
  [/klaxon/gi, 'الكلاكسون'],
  [/gyrophare/gi, 'الضو الدوار'],
  [/ambulance/gi, 'الامبولانس'],
  [/pompiers/gi, 'المطافي'],
  [/gendarmerie/gi, 'الدرك'],
  [/police/gi, 'البوليس'],
  [/vous devez/gi, 'خصك'],
  [/il faut/gi, 'خص'],
  [/il est interdit/gi, 'ممنوع'],
  [/quelle est/gi, 'شنو هي'],
  [/quel est/gi, 'شنو هو'],
  [/que doit/gi, 'شنو خص'],
  [/dans cette situation/gi, 'ف هاد الحالة'],
  [/dans ce cas/gi, 'ف هاد الحالة'],
];

function applyDarijaPatch(text) {
  let result = text;
  for (const [pattern, replacement] of DARIJA_PATCH) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ─── POST /api/translate ─────────────────────────────────────────────────────
router.post('/', wrap(async (req, res) => {
  const { text, target } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return bad(res, 'text required');
  }
  if (!['fr', 'darija'].includes(target)) {
    return bad(res, 'target must be fr or darija');
  }
  if (text.length > 2000) {
    return bad(res, 'text too long (max 2000 chars)');
  }

  try {
    // دائماً نترجم أولاً من العربية إلى الفرنسية
    const body = JSON.stringify({
      q      : text.trim(),
      source : 'ar',
      target : 'fr',
      format : 'text',
      ...(LT_KEY ? { api_key: LT_KEY } : {}),
    });

    const resp = await fetch(`${LT_URL}/translate`, {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body,
      signal  : AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error('[translate] LibreTranslate error:', resp.status, err);
      return res.status(502).json({ error: 'translation_service_unavailable' });
    }

    const data = await resp.json();
    let translated = data.translatedText || '';

    // للدارجة: نطبق قاموس التقريب
    if (target === 'darija') {
      translated = applyDarijaPatch(translated);
    }

    res.json({ translated, source: 'ar', target, engine: 'libretranslate' });

  } catch (err) {
    console.error('[translate] fetch error:', err.message);
    res.status(502).json({ error: 'translation_service_unavailable' });
  }
}));

module.exports = router;
