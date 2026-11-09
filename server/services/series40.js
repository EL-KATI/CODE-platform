'use strict';
/**
 * Séries prêtes : chaque série contient exactement 40 questions.
 * - Les questions de chaque محور sont découpées en blocs de 40 (classées par id).
 * - Les restes (blocs incomplets) sont regroupés en séries « مراجعة شاملة ».
 * - La dernière série incomplète est complétée avec d'autres questions pour atteindre 40.
 * Les restes sont entrelacés entre محاور pour que chaque série de révision soit équilibrée.
 * Idempotent : ne fait rien si des séries auto (description = 'auto40') existent déjà.
 * Les anciennes séries sont dépubliées (pas supprimées) pour conserver l'historique.
 */
const SIZE = 40;
const MARK = 'auto40';

function ensureSeries40(d) {
  if (d.prepare("SELECT 1 FROM series WHERE description = ?").get(MARK)) return false;
  const cats = d.prepare('SELECT id, name_ar FROM categories ORDER BY sort, id').all();
  const qs = d.prepare("SELECT id, category_id FROM questions WHERE status = 'published' ORDER BY id").all();
  if (!qs.length) return false;

  const plan = []; // { title, ids }
  const restByCat = [];
  for (const c of cats) {
    const ids = qs.filter((q) => q.category_id === c.id).map((q) => q.id);
    let n = 0;
    for (let i = 0; i + SIZE <= ids.length; i += SIZE) plan.push({ title: `${c.name_ar} — السلسلة ${++n}`, ids: ids.slice(i, i + SIZE) });
    restByCat.push(ids.slice(Math.floor(ids.length / SIZE) * SIZE));
  }
  // توزيع بالتناوب بين المحاور باش كل سلسلة مراجعة تكون متوازنة
  const rest = [];
  for (let i = 0; restByCat.some((l) => i < l.length); i++) for (const l of restByCat) if (i < l.length) rest.push(l[i]);
  let n = 0;
  for (let i = 0; i < rest.length; i += SIZE) {
    const ids = rest.slice(i, i + SIZE);
    if (ids.length < SIZE) {
      const have = new Set(ids);
      for (const q of qs) { if (ids.length >= SIZE) break; if (!have.has(q.id)) { ids.push(q.id); have.add(q.id); } }
    }
    plan.push({ title: `مراجعة شاملة — السلسلة ${++n}`, ids });
  }

  const tx = d.transaction(() => {
    d.prepare('UPDATE series SET published = 0').run();
    const insS = d.prepare('INSERT INTO series (title, description, sort, published) VALUES (?,?,?,1)');
    const insQ = d.prepare('INSERT INTO series_questions (series_id, question_id, position) VALUES (?,?,?)');
    plan.forEach((s, i) => {
      const sid = insS.run(s.title, MARK, i + 1).lastInsertRowid;
      s.ids.forEach((qid, pos) => insQ.run(sid, qid, pos));
    });
  });
  tx();
  return plan.length;
}

module.exports = { ensureSeries40, SERIES_SIZE: SIZE };
