'use strict';
/**
 * Remplit la base avec le contenu initial (catégories, questions, séries, leçons)
 * et crée le compte administrateur.  Idempotent : ne fait rien si la base contient déjà des questions.
 *   node server/seed.js            -> seed si vide
 *   node server/seed.js --force    -> efface le contenu pédagogique et le recharge
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');
const config = require('./config');

const SEED_DIR = path.join(config.ROOT, 'seed');

const CATEGORIES = [
  { slug: 'signs', name_ar: 'التشوير الطرقي', name_fr: 'Signalisation', icon: '🚸', exam_weight: 8 },
  { slug: 'priority', name_ar: 'الأسبقية والملتقيات', name_fr: 'Priorités et intersections', icon: '🔀', exam_weight: 8 },
  { slug: 'speed-distance', name_ar: 'السرعة والمسافات', name_fr: 'Vitesse et distances', icon: '⏱️', exam_weight: 7 },
  { slug: 'overtaking', name_ar: 'التجاوز والتقابل', name_fr: 'Dépassement et croisement', icon: '🚗', exam_weight: 6 },
  { slug: 'driver-offences', name_ar: 'السائق والمخالفات', name_fr: 'Conducteur et infractions', icon: '🪪', exam_weight: 6 },
  { slug: 'vehicle-safety', name_ar: 'الميكانيك والسلامة', name_fr: 'Véhicule, sécurité et secours', icon: '🛠️', exam_weight: 5 },
];

function parseLesson(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`Front-matter manquant: ${file}`);
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { ...meta, body: m[2].trim() };
}

function seedContent(d, { force = false } = {}) {
  const count = d.prepare('SELECT COUNT(*) AS n FROM questions').get().n;
  if (count > 0 && !force) return false;

  const tx = d.transaction(() => {
    if (force) {
      d.exec('DELETE FROM series_questions; DELETE FROM series; DELETE FROM lessons; DELETE FROM user_questions; DELETE FROM questions; DELETE FROM categories;');
    }
    const catIds = {};
    const insCat = d.prepare('INSERT INTO categories (slug, name_ar, name_fr, icon, exam_weight, sort) VALUES (?,?,?,?,?,?)');
    CATEGORIES.forEach((c, i) => {
      catIds[c.slug] = insCat.run(c.slug, c.name_ar, c.name_fr, c.icon, c.exam_weight, i).lastInsertRowid;
    });

    const questions = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'questions.json'), 'utf8'));
    const insQ = d.prepare(`INSERT INTO questions (id, category_id, text, options, correct, explanation, visual, image)
                            VALUES (?,?,?,?,?,?,?,?)`);
    for (const q of questions) {
      insQ.run(q.id, catIds[q.category], q.text, JSON.stringify(q.options), JSON.stringify(q.correct),
        q.explanation || '', q.visual ? JSON.stringify(q.visual) : null, q.image || null);
    }

    const series = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'series.json'), 'utf8'));
    const insS = d.prepare('INSERT INTO series (id, title, sort) VALUES (?,?,?)');
    const insSQ = d.prepare('INSERT INTO series_questions (series_id, question_id, position) VALUES (?,?,?)');
    for (const s of series) {
      insS.run(s.id, s.title, s.id);
      s.questionIds.forEach((qid, pos) => insSQ.run(s.id, qid, pos));
    }

    const lessonDir = path.join(SEED_DIR, 'lessons');
    const insL = d.prepare(`INSERT INTO lessons (category_id, slug, title, summary, body, minutes, sort)
                            VALUES (?,?,?,?,?,?,?)`);
    fs.readdirSync(lessonDir).filter((f) => f.endsWith('.md')).sort().forEach((f, i) => {
      const l = parseLesson(path.join(lessonDir, f));
      insL.run(l.category ? catIds[l.category] : null, l.slug, l.title, l.summary || '', l.body, Number(l.minutes) || 5, i);
    });
  });
  tx();
  return true;
}

function ensureAdmin(d) {
  const exists = d.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (exists) return null;
  const email = process.env.ADMIN_EMAIL || 'admin@example.com';
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  d.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?,?,?, 'admin')")
    .run(email, 'Administrateur', bcrypt.hashSync(password, 12));
  if (generated) {
    console.log('\n================ COMPTE ADMINISTRATEUR CRÉÉ ================');
    console.log(`  email    : ${email}`);
    console.log(`  password : ${password}`);
    console.log('  → Changez ce mot de passe après la première connexion.');
    console.log('=============================================================\n');
  }
  return { email };
}

module.exports = { seedContent, ensureAdmin, CATEGORIES };

if (require.main === module) {
  const d = db.open();
  const seeded = seedContent(d, { force: process.argv.includes('--force') });
  console.log(seeded ? 'Contenu pédagogique chargé.' : 'La base contient déjà des questions (utilisez --force pour recharger).');
  ensureAdmin(d);
}
