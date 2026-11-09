'use strict';
const db = require('../db');

/**
 * الأجزاء الفرعية للسؤال المزدوج، أو null إذا كانت البنية ناقصة
 * (سؤال قديم بدون options/correct) — حينها يُعامل السؤال كسؤال منفرد بدل ما يطيح العرض.
 */
function parseSubs(row) {
  if (!row.is_double || !row.sub_questions) return null;
  let subs;
  try { subs = JSON.parse(row.sub_questions); } catch { return null; }
  const valid = Array.isArray(subs) && subs.length === 2 && subs.every((sq) => sq && typeof sq.text === 'string'
    && Array.isArray(sq.options) && sq.options.length >= 2
    && Array.isArray(sq.correct) && sq.correct.length
    && sq.correct.every((c) => Number.isInteger(c) && c >= 1 && c <= sq.options.length));
  return valid ? subs : null;
}

/** Convertit une ligne SQL en objet question. includeAnswer=false pour l'envoyer pendant un examen. */
function toQuestion(row, { includeAnswer = false } = {}) {
  const q = {
    id: row.id,
    categoryId: row.category_id,
    text: row.text,
    options: JSON.parse(row.options),
    visual: row.visual ? JSON.parse(row.visual) : null,
    image: row.image || null,
    imageAlt: row.image_alt || '',
    video: row.video || null,
    audioText: row.audio_text || '',
    is_double: 0,
    skill_type: row.skill_type || 'معرفية',
    sub_questions: null,
  };
  // للسؤال المزدوج: إرسال sub_questions بدون الإجابات الصحيحة حال الامتحان
  const subs = parseSubs(row);
  if (subs) {
    q.is_double = 1;
    q.sub_questions = subs.map((sq) => ({ text: sq.text, options: sq.options, ...(includeAnswer ? { correct: sq.correct } : {}) }));
  }
  if (includeAnswer) {
    q.correct = JSON.parse(row.correct);
    q.explanation = row.explanation;
  }
  return q;
}

function getByIds(ids) {
  if (!ids.length) return new Map();
  const rows = db.get().prepare(`SELECT * FROM questions WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  return new Map(rows.map((r) => [r.id, r]));
}

/** Un QCM est juste si l'ensemble des réponses cochées est exactement celui des bonnes réponses. */
function isCorrect(selected, correct) {
  if (selected.length !== correct.length) return false;
  const s = new Set(selected);
  return correct.every((c) => s.has(c));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = { toQuestion, parseSubs, getByIds, isCorrect, shuffle };
