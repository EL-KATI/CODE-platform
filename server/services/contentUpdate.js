'use strict';
/**
 * Mises à jour ponctuelles du contenu pour les bases déjà installées (suivi par PRAGMA user_version).
 *
 * v1 — nettoyage de la banque de questions :
 *   - les questions du seed marquées « draft » (texte OCR illisible, ids 39–249) passent en brouillon
 *     si l'admin ne les a pas modifiées (même id + même texte) : masquées aux candidats, conservées en base ;
 *   - les nouvelles questions du seed (id >= 250) sont ajoutées si leur texte n'existe pas déjà ;
 *   - les séries automatiques sont retirées pour être reconstruites par ensureSeries40.
 * Exécuté une seule fois : une question republiée ensuite par l'admin n'est plus touchée.
 */
const fs = require('fs');
const path = require('path');

const VERSION = 1;
const FIRST_NEW_ID = 250;

function applyContentUpdates(d, seedFile = path.join(__dirname, '..', '..', 'seed', 'questions.json')) {
  if (d.pragma('user_version', { simple: true }) >= VERSION) return null;
  let seed;
  try { seed = JSON.parse(fs.readFileSync(seedFile, 'utf8')); } catch { return null; }

  const cats = new Map(d.prepare('SELECT id, slug FROM categories').all().map((c) => [c.slug, c.id]));
  const toDraft = d.prepare("UPDATE questions SET status = 'draft', updated_at = datetime('now') WHERE id = ? AND text = ? AND status = 'published'");
  const exists = d.prepare('SELECT 1 FROM questions WHERE text = ?');
  const ins = d.prepare(`INSERT INTO questions (category_id, text, options, correct, explanation, is_double, sub_questions, skill_type, difficulty)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  let drafted = 0;
  let added = 0;
  d.transaction(() => {
    for (const q of seed) {
      if (q.status === 'draft') { drafted += toDraft.run(q.id, q.text).changes; continue; }
      if (q.id < FIRST_NEW_ID || !cats.has(q.category) || exists.get(q.text)) continue;
      ins.run(cats.get(q.category), q.text, JSON.stringify(q.options), JSON.stringify(q.correct), q.explanation || '',
        q.is_double ? 1 : 0, q.sub_questions ? JSON.stringify(q.sub_questions) : null, q.skill_type || 'معرفية', q.difficulty || 2);
      added++;
    }
    // Les séries auto contiennent les anciennes questions : on les archive, ensureSeries40 les reconstruit.
    if (drafted || added) d.prepare("UPDATE series SET published = 0, description = 'auto40-v0' WHERE description = 'auto40'").run();
    d.pragma(`user_version = ${VERSION}`);
  })();
  return { drafted, added };
}

module.exports = { applyContentUpdates };
