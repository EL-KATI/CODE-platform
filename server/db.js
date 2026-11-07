'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','instructor','admin')),
  locale        TEXT NOT NULL DEFAULT 'ar',
  exam_date     TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name_ar     TEXT NOT NULL,
  name_fr     TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT '',
  exam_weight INTEGER NOT NULL DEFAULT 1,
  exam_count  INTEGER,                     -- NULL = use global exam_question_count
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS questions (
  id          INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  text        TEXT NOT NULL,
  options     TEXT NOT NULL,               -- JSON array of strings
  correct     TEXT NOT NULL,               -- JSON array of 1-based indexes
  explanation TEXT NOT NULL DEFAULT '',
  visual      TEXT,                        -- JSON {type, sub} for built-in SVG scenes
  image       TEXT,                        -- URL of a photo (uploaded or external)
  image_alt   TEXT NOT NULL DEFAULT '',
  video       TEXT,                        -- uploaded video, direct https video URL or YouTube embed URL
  audio_text  TEXT NOT NULL DEFAULT '',    -- narration text read aloud (speech synthesis)
  difficulty  INTEGER NOT NULL DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 3),
  status      TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  is_double     INTEGER NOT NULL DEFAULT 0 CHECK (is_double IN (0,1)),   -- 0=منفرد 1=مزدوج
  sub_questions TEXT,                                                    -- JSON [{text,options,correct}] when is_double=1
  skill_type    TEXT NOT NULL DEFAULT 'معرفية' CHECK (skill_type IN ('معرفية','سلوكية','اجتماعية')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_questions_cat ON questions(category_id, status);

CREATE TABLE IF NOT EXISTS series (
  id          INTEGER PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort        INTEGER NOT NULL DEFAULT 0,
  published   INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS series_questions (
  series_id   INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  PRIMARY KEY (series_id, question_id)
);

CREATE TABLE IF NOT EXISTS lessons (
  id          INTEGER PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  summary     TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',    -- Markdown
  minutes     INTEGER NOT NULL DEFAULT 5,
  sort        INTEGER NOT NULL DEFAULT 0,
  published   INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id    INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS attempts (
  id                   INTEGER PRIMARY KEY,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode                 TEXT NOT NULL CHECK (mode IN ('exam','series','category','review','bookmarks')),
  practice             INTEGER NOT NULL DEFAULT 0,  -- 1 = immediate feedback, 0 = exam conditions
  series_id            INTEGER REFERENCES series(id) ON DELETE SET NULL,
  category_id          INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  question_ids         TEXT NOT NULL,                -- JSON array (order of presentation)
  seconds_per_question INTEGER NOT NULL DEFAULT 0,   -- 0 = untimed
  pass_mark            INTEGER,
  started_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at          TEXT,
  score                INTEGER,
  total                INTEGER NOT NULL,
  passed               INTEGER
);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id, finished_at);

CREATE TABLE IF NOT EXISTS attempt_answers (
  attempt_id  INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL,
  selected    TEXT NOT NULL,       -- JSON array of 1-based indexes (empty = no answer / timeout)
  is_correct  INTEGER NOT NULL,
  time_ms     INTEGER,
  answered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (attempt_id, question_id)
);

-- Suivi par question et par élève : répétition espacée (système de Leitner) + favoris.
CREATE TABLE IF NOT EXISTS user_questions (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  seen        INTEGER NOT NULL DEFAULT 0,
  correct     INTEGER NOT NULL DEFAULT 0,
  wrong       INTEGER NOT NULL DEFAULT 0,
  box         INTEGER NOT NULL DEFAULT 0,  -- 0 = jamais vu, 1..5 = boîte de Leitner
  due_at      TEXT,
  last_result INTEGER,
  bookmarked  INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, question_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id        INTEGER PRIMARY KEY,
  user_id   INTEGER,
  action    TEXT NOT NULL,
  entity    TEXT NOT NULL,
  entity_id INTEGER,
  details   TEXT,
  at        TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

let db;

function open(file = config.dbFile) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  const cols = db.prepare('PRAGMA table_info(questions)').all().map((c) => c.name);
  if (!cols.includes('video')) db.exec('ALTER TABLE questions ADD COLUMN video TEXT');
  if (!cols.includes('audio_text')) db.exec("ALTER TABLE questions ADD COLUMN audio_text TEXT NOT NULL DEFAULT ''");
  // Migration: add exam_count to categories (NULL = use global setting)
  const catCols = db.prepare('PRAGMA table_info(categories)').all().map((c) => c.name);
  if (!catCols.includes('exam_count')) db.exec('ALTER TABLE categories ADD COLUMN exam_count INTEGER');
  // Migration: add NARSA is_double / sub_questions / skill_type to questions
  if (!cols.includes('question_type')) db.exec("ALTER TABLE questions ADD COLUMN question_type TEXT NOT NULL DEFAULT '3/../'"); // legacy – kept for safety
  if (!cols.includes('is_double')) db.exec('ALTER TABLE questions ADD COLUMN is_double INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('sub_questions')) db.exec('ALTER TABLE questions ADD COLUMN sub_questions TEXT');
  if (!cols.includes('skill_type')) db.exec("ALTER TABLE questions ADD COLUMN skill_type TEXT NOT NULL DEFAULT 'معرفية'")
  return db;
}

function get() {
  if (!db) open();
  return db;
}

function getSettings() {
  const out = { ...config.examDefaults };
  for (const row of get().prepare('SELECT key, value FROM settings').all()) {
    out[row.key] = Number.isNaN(Number(row.value)) ? row.value : Number(row.value);
  }
  return out;
}

function audit(userId, action, entity, entityId, details) {
  get().prepare('INSERT INTO audit_log (user_id, action, entity, entity_id, details) VALUES (?,?,?,?,?)')
    .run(userId || null, action, entity, entityId ?? null, details ? JSON.stringify(details) : null);
}

module.exports = { open, get, getSettings, audit };
