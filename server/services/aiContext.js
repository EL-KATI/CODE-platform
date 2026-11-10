'use strict';
/**
 * مراجع Monitor AI: مقاطع من محتوى المنصة (الدروس المنشورة وشروح الأسئلة المنشورة) الأقرب لسؤال المتعلم.
 * بحث بسيط بالكلمات المفتاحية (بدون خدمة خارجية): يكفي لبنك من مئات المقاطع.
 * الهدف: أن يبني المساعد جوابه على محتوى راجعته المنصة بدل الاعتماد على ذاكرته فقط.
 */
const db = require('../db');

const STOP = new Set(('في من على الى إلى عن مع هل ما ماذا متى كيف اين أين هو هي هذا هذه ذلك التي الذي ان أن او أو لا نعم كان يكون عند بعد قبل كل شي واش شنو كيفاش فين علاش ديال هاد لي اللي '
  + 'le la les un une des de du et ou est que qui quoi quand comment pour par sur dans avec sans au aux ce cette ces je il elle on ne pas plus').split(' '));

// صيغ شائعة في الأسئلة والدروس تُرجع لجذر واحد (ممنوع / يمنع → منع …)
const ROOTS = Object.fromEntries([
  ['منع', 'ممنوع ممنوعه يمنع تمنع منع'], ['سمح', 'مسموح مسموحه يسمح تسمح سمح'], ['وجب', 'واجب يجب وجوب اجباري الزامي'],
  ['تجاوز', 'تجاوز يتجاوز التجاوز تتجاوز'], ['وقوف', 'وقوف يقف توقف التوقف الوقوف'], ['سرعه', 'سرعه السرعه سرعات'],
].flatMap(([root, forms]) => forms.split(' ').map((f) => [f, root])));

/** توحيد النص العربي/الفرنسي: حذف التشكيل، توحيد الألف والياء والتاء المربوطة، حذف «ال» التعريف */
function tokens(text) {
  const norm = String(text || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')            // accents français
    .replace(/[ً-ْـ]/g, '')                        // تشكيل + تطويل
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[^a-z0-9ء-ي]+/g, ' ');
  const out = [];
  for (let w of norm.split(' ')) {
    if (w.length > 4 && /^(وال|بال|كال|فال)/.test(w)) w = w.slice(3);
    else if (w.length > 3 && w.startsWith('ال')) w = w.slice(2);
    else if (w.length > 4 && w.startsWith('لل')) w = w.slice(2);
    w = ROOTS[w] || w;
    if (w.length >= 3 && !STOP.has(w)) out.push(w);
  }
  return out;
}

/** تقطيع درس Markdown إلى مقاطع حسب العناوين */
function lessonSections(lesson) {
  const parts = String(lesson.body || '').split(/\n(?=#{2,3} )/);
  return parts.map((p) => p.trim()).filter((p) => p.length > 40).map((p) => ({
    source: `درس: ${lesson.title}`,
    text: p.replace(/[*_`>#]/g, '').replace(/\n{2,}/g, '\n').slice(0, 900),
  }));
}

let cache = { at: 0, items: [] };
const TTL_MS = 5 * 60 * 1000;

function corpus() {
  if (Date.now() - cache.at < TTL_MS && cache.items.length) return cache.items;
  const d = db.get();
  const items = [];
  for (const l of d.prepare('SELECT title, body FROM lessons WHERE published = 1').all()) items.push(...lessonSections(l));
  const qs = d.prepare("SELECT text, explanation FROM questions WHERE status = 'published' AND explanation IS NOT NULL AND length(explanation) > 20").all();
  for (const q of qs) items.push({ source: 'شرح سؤال من بنك الأسئلة', text: `${q.text.split('\n')[0]}\n${q.explanation}`.slice(0, 600) });
  for (const it of items) it.tok = new Set(tokens(it.text));
  cache = { at: Date.now(), items };
  return items;
}

/**
 * @returns {{ text: string, sources: string[] }} مقاطع مرجعية (حتى ~2800 حرف) وعناوين الدروس المستعملة
 */
function findReferences(question, { max: maxItems = 5, budget = 2800 } = {}) {
  let max = maxItems;
  const q = [...new Set(tokens(question))];
  if (!q.length) return { text: '', sources: [] };
  const all = [];
  for (const it of corpus()) {
    let hits = 0;
    for (const w of q) if (it.tok.has(w)) hits += 1;
    if (hits) all.push({ it, hits, score: hits / Math.sqrt(it.tok.size + 8) });
  }
  // كلمتان مشتركتان على الأقل؛ وإلا (سؤال قصير بصيغة مختلفة عن الدرس) نقبل كلمة واحدة لأقرب 3 مقاطع
  let scored = all.filter((x) => x.hits >= Math.min(2, q.length));
  if (!scored.length) { scored = all; max = Math.min(max, 3); }
  scored.sort((a, b) => b.score - a.score);
  const picked = [];
  let used = 0;
  for (const { it } of scored) {
    if (picked.length >= max || used + it.text.length > budget) break;
    picked.push(it); used += it.text.length;
  }
  return {
    text: picked.map((p, i) => `[${i + 1}] (${p.source})\n${p.text}`).join('\n\n'),
    sources: [...new Set(picked.map((p) => p.source).filter((s) => s.startsWith('درس')))],
  };
}

module.exports = { findReferences, tokens };
