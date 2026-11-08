'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name            TEXT NOT NULL,          -- الاسم الكامل (fr)
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','instructor','admin','school')),
  locale          TEXT NOT NULL DEFAULT 'ar',
  exam_date       TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at   TEXT,
  school_id       TEXT,                   -- معرّف مدرسة القيادة
  -- حقول NARSA للمترشح
  gender          TEXT DEFAULT 'M' CHECK (gender IN ('M','F') OR gender IS NULL),
  cin             TEXT DEFAULT '',        -- رقم بطاقة التعريف الوطنية
  first_name_fr   TEXT DEFAULT '',        -- الاسم الشخصي بالفرنسية
  last_name_fr    TEXT DEFAULT '',        -- النسب بالفرنسية
  first_name_ar   TEXT DEFAULT '',        -- الاسم الشخصي بالعربية
  last_name_ar    TEXT DEFAULT '',        -- النسب بالعربية
  birth_date      TEXT DEFAULT '',        -- تاريخ الميلاد YYYY-MM-DD
  birth_place_fr  TEXT DEFAULT '',        -- مكان الميلاد بالفرنسية
  birth_place_ar  TEXT DEFAULT '',        -- مكان الميلاد بالعربية
  address_fr      TEXT DEFAULT '',        -- العنوان بالفرنسية
  address_ar      TEXT DEFAULT '',        -- العنوان بالعربية
  city            TEXT DEFAULT '',        -- المدينة
  phone           TEXT DEFAULT '',        -- رقم الهاتف
  license_cat     TEXT DEFAULT 'B',       -- فئة الرخصة المطلوبة
  -- حقول NARSA — طلب الترشح (Demandes en cours)
  narsa_request_num TEXT DEFAULT '',      -- رقم الطلب (ex: 7163-KB251477-6412)
  narsa_status    INTEGER DEFAULT 0,      -- الحالة (1=مقبول 2=جاري 3=مرفوض ...)
  narsa_date_saisie TEXT DEFAULT '',      -- تاريخ التسجيل YYYY-MM-DD
  narsa_date_cloture TEXT DEFAULT '',     -- تاريخ الإغلاق YYYY-MM-DD
  narsa_date_examen  TEXT DEFAULT '',     -- تاريخ الامتحان YYYY-MM-DD
  -- حقول التمديد إلى صنف آخر
  id_type         TEXT DEFAULT 'CIN' CHECK (id_type IN ('CIN','CD','CS') OR id_type IS NULL),
  nationality     TEXT DEFAULT 'MAROCAINE', -- الجنسية
  license_num     TEXT DEFAULT '',        -- رقم رخصة السياقة (Numéro du permis)
  valid_categories TEXT DEFAULT '',       -- الفئات المرخصة حالياً JSON: ["A","B",...]
  registration_center TEXT DEFAULT '',    -- Centre Immatriculateur de dépôt
  -- حقول المدرب (Moniteur)
  pc_num          TEXT DEFAULT '',        -- رقم الملف (PC)
  cap_num         TEXT DEFAULT '',        -- رقم التأهيل (CAP)
  instructor_categories TEXT DEFAULT ''  -- فئات تأهيل المدرب JSON: ["A","B","C",...]
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

/* ── مؤسسات تعليم السياقة ────────────────────────────────────────────────
   يقوم الأدمين بإضافة المؤسسات، وتستخدم school_id في جدول users للربط.
   school_id في users = id من هذا الجدول (INTEGER, وليس TEXT).
   ─────────────────────────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS schools (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  code        TEXT    NOT NULL UNIQUE,   -- رمز المؤسسة (مختصر فريد)
  email       TEXT    DEFAULT '',        -- بريد حساب المؤسسة (للدخول)
  phone       TEXT    NOT NULL DEFAULT '',
  address     TEXT    NOT NULL DEFAULT '',
  active      INTEGER NOT NULL DEFAULT 1,
  owner_id    INTEGER,                   -- حساب المؤسسة (FK يُضاف بعد users)
  agrement_num TEXT   NOT NULL DEFAULT '', -- رقم الاعتماد (Numéro d'agrément)
  raison_sociale TEXT NOT NULL DEFAULT '', -- الاسم التجاري (Raison sociale)
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

/* ── مسار امتحان رخصة السياقة ──────────────────────────────────────────
   مراحل الامتحان (صنف B — المغرب):
     theory_1   : الامتحان النظري الأول
     theory_2   : الامتحان النظري الاستدراكي (إذا رسب في theory_1)
     practical_1: الامتحان التطبيقي الأول
     practical_2: الامتحان التطبيقي الثاني (إذا رسب في practical_1)
   النتيجة النهائية (archived_status):
     licensed   : حصل على الرخصة
     failed     : لم يحصل على الرخصة
   ─────────────────────────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS exam_journey (
  id              INTEGER PRIMARY KEY,
  student_id      INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  school_id       INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE, -- مؤسسة القيادة

  -- الامتحان النظري الأول
  theory1_date    TEXT,                          -- YYYY-MM-DD
  theory1_result  TEXT CHECK (theory1_result IN ('passed','failed') OR theory1_result IS NULL),

  -- الامتحان النظري الاستدراكي (فقط إذا رسب في theory_1)
  theory2_date    TEXT,
  theory2_result  TEXT CHECK (theory2_result IN ('passed','failed') OR theory2_result IS NULL),

  -- الامتحان التطبيقي الأول
  practical1_date TEXT,
  practical1_result TEXT CHECK (practical1_result IN ('passed','failed') OR practical1_result IS NULL),

  -- الامتحان التطبيقي الثاني (فقط إذا رسب في practical_1)
  practical2_date TEXT,
  practical2_result TEXT CHECK (practical2_result IN ('passed','failed') OR practical2_result IS NULL),

  -- الحالة العامة
  status          TEXT    NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','archived')),
  archived_status TEXT    CHECK (archived_status IN ('licensed','failed') OR archived_status IS NULL),
  note            TEXT,

  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

/* ── حجوزات حصص التدريب التطبيقي ─────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS training_slots (
  id          INTEGER PRIMARY KEY,
  slot_date   TEXT    NOT NULL,          -- YYYY-MM-DD
  slot_hour   INTEGER NOT NULL,          -- 9 | 11 | 15 | 17
  capacity    INTEGER NOT NULL DEFAULT 3,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (slot_date, slot_hour)
);

CREATE TABLE IF NOT EXISTS training_bookings (
  id          INTEGER PRIMARY KEY,
  slot_id     INTEGER NOT NULL REFERENCES training_slots(id) ON DELETE CASCADE,
  student_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT    NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | cancelled | rescheduled
  note        TEXT,                                -- ملاحظة المدرب/المشرف
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (slot_id, student_id)
);

CREATE TABLE IF NOT EXISTS booking_notifications (
  id          INTEGER PRIMARY KEY,
  booking_id  INTEGER NOT NULL REFERENCES training_bookings(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT    NOT NULL,   -- booking_requested | booking_approved | booking_rejected | booking_rescheduled | booking_cancelled
  message     TEXT    NOT NULL,
  read        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
`;

let db;

function open(file = config.dbFile) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF');

  // تنظيف جداول migration قديمة تعطلت وبقيت في DB
  const tableNames = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  if (tableNames.includes('_users_old')) {
    // migration فاشلة قديمة — نعيد بناء users من _users_old
    if (!tableNames.includes('users')) {
      db.exec('ALTER TABLE _users_old RENAME TO users');
      console.log('[db] recovered users from _users_old');
    } else {
      db.exec('DROP TABLE _users_old');
      console.log('[db] cleaned up stale _users_old table');
    }
  }
  if (tableNames.includes('_users_migrate_sid')) {
    if (!tableNames.includes('users')) {
      db.exec('ALTER TABLE _users_migrate_sid RENAME TO users');
      console.log('[db] recovered users from _users_migrate_sid');
    } else {
      db.exec('DROP TABLE _users_migrate_sid');
      console.log('[db] cleaned up stale _users_migrate_sid table');
    }
  }

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
  if (!cols.includes('skill_type')) db.exec("ALTER TABLE questions ADD COLUMN skill_type TEXT NOT NULL DEFAULT 'معرفية'");
  // Migration: add school_id + NARSA fields to users if missing
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userCols.includes('school_id'))     db.exec('ALTER TABLE users ADD COLUMN school_id INTEGER');
  if (!userCols.includes('gender'))        db.exec("ALTER TABLE users ADD COLUMN gender TEXT DEFAULT 'M'");
  if (!userCols.includes('cin'))           db.exec("ALTER TABLE users ADD COLUMN cin TEXT DEFAULT ''");
  if (!userCols.includes('first_name_fr')) db.exec("ALTER TABLE users ADD COLUMN first_name_fr TEXT DEFAULT ''");
  if (!userCols.includes('last_name_fr'))  db.exec("ALTER TABLE users ADD COLUMN last_name_fr TEXT DEFAULT ''");
  if (!userCols.includes('first_name_ar')) db.exec("ALTER TABLE users ADD COLUMN first_name_ar TEXT DEFAULT ''");
  if (!userCols.includes('last_name_ar'))  db.exec("ALTER TABLE users ADD COLUMN last_name_ar TEXT DEFAULT ''");
  if (!userCols.includes('birth_date'))    db.exec("ALTER TABLE users ADD COLUMN birth_date TEXT DEFAULT ''");
  if (!userCols.includes('birth_place_fr'))db.exec("ALTER TABLE users ADD COLUMN birth_place_fr TEXT DEFAULT ''");
  if (!userCols.includes('birth_place_ar'))db.exec("ALTER TABLE users ADD COLUMN birth_place_ar TEXT DEFAULT ''");
  if (!userCols.includes('address_fr'))    db.exec("ALTER TABLE users ADD COLUMN address_fr TEXT DEFAULT ''");
  if (!userCols.includes('address_ar'))    db.exec("ALTER TABLE users ADD COLUMN address_ar TEXT DEFAULT ''");
  if (!userCols.includes('city'))          db.exec("ALTER TABLE users ADD COLUMN city TEXT DEFAULT ''");
  if (!userCols.includes('phone'))         db.exec("ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''");
  if (!userCols.includes('address'))       db.exec("ALTER TABLE users ADD COLUMN address TEXT DEFAULT ''");
  if (!userCols.includes('license_cat'))        db.exec("ALTER TABLE users ADD COLUMN license_cat TEXT DEFAULT 'B'");
  if (!userCols.includes('narsa_request_num'))  db.exec("ALTER TABLE users ADD COLUMN narsa_request_num TEXT DEFAULT ''");
  if (!userCols.includes('narsa_status'))       db.exec("ALTER TABLE users ADD COLUMN narsa_status INTEGER DEFAULT 0");
  if (!userCols.includes('narsa_date_saisie'))  db.exec("ALTER TABLE users ADD COLUMN narsa_date_saisie TEXT DEFAULT ''");
  if (!userCols.includes('narsa_date_cloture')) db.exec("ALTER TABLE users ADD COLUMN narsa_date_cloture TEXT DEFAULT ''");
  if (!userCols.includes('narsa_date_examen'))      db.exec("ALTER TABLE users ADD COLUMN narsa_date_examen TEXT DEFAULT ''");
  // حقول التمديد إلى صنف آخر
  if (!userCols.includes('id_type'))                db.exec("ALTER TABLE users ADD COLUMN id_type TEXT DEFAULT 'CIN'");
  if (!userCols.includes('nationality'))            db.exec("ALTER TABLE users ADD COLUMN nationality TEXT DEFAULT 'MAROCAINE'");
  if (!userCols.includes('license_num'))            db.exec("ALTER TABLE users ADD COLUMN license_num TEXT DEFAULT ''");
  if (!userCols.includes('valid_categories'))       db.exec("ALTER TABLE users ADD COLUMN valid_categories TEXT DEFAULT ''");
  if (!userCols.includes('registration_center'))    db.exec("ALTER TABLE users ADD COLUMN registration_center TEXT DEFAULT ''");
  // حقول المدرب
  if (!userCols.includes('pc_num'))                 db.exec("ALTER TABLE users ADD COLUMN pc_num TEXT DEFAULT ''");
  if (!userCols.includes('cap_num'))                db.exec("ALTER TABLE users ADD COLUMN cap_num TEXT DEFAULT ''");
  if (!userCols.includes('instructor_categories'))  db.exec("ALTER TABLE users ADD COLUMN instructor_categories TEXT DEFAULT ''");
  if (!userCols.includes('pw_reset_at'))     db.exec('ALTER TABLE users ADD COLUMN pw_reset_at TEXT');
  // حقول مؤسسة تعليم السياقة
  if (!userCols.includes('school_name'))     db.exec("ALTER TABLE users ADD COLUMN school_name TEXT DEFAULT ''");
  if (!userCols.includes('manager_name'))    db.exec("ALTER TABLE users ADD COLUMN manager_name TEXT DEFAULT ''");
  if (!userCols.includes('tax_id'))          db.exec("ALTER TABLE users ADD COLUMN tax_id TEXT DEFAULT ''");
  if (!userCols.includes('pro_license_num')) db.exec("ALTER TABLE users ADD COLUMN pro_license_num TEXT DEFAULT ''");
  if (!userCols.includes('narsa_num'))       db.exec("ALTER TABLE users ADD COLUMN narsa_num TEXT DEFAULT ''");
  // Migration: نظّف كل الجداول المؤقتة تُركت من migrations فاشلة سابقة
  try {
    const tmpTables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '_users_old%' OR name LIKE '_users_migrate%' OR name = '_users_old')"
    ).all();
    for (const t of tmpTables) {
      db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
      console.log('[db] migration: cleaned up tmp table', t.name);
    }
    // تنظيف صريح للجداول المعروفة
    db.exec('DROP TABLE IF EXISTS _users_old');
    db.exec('DROP TABLE IF EXISTS _users_migrate_sid');
  } catch (e) { console.warn('[db] cleanup tmp tables:', e.message); }

  // ملاحظة: exam_journey و schools جداول مستخدمة في routes/exams.js — لا تحذفهم

  // Migration (une seule fois) : les questions laissées sans réponse à la fin d'une tentative
  // étaient comptées « vues » et « fausses » → on recalcule user_questions depuis les vraies réponses.
  try {
    const done = db.prepare("SELECT 1 FROM settings WHERE key = 'stats_fix_v1'").get();
    if (!done) {
      db.transaction(() => {
        db.exec(`
CREATE TEMP TABLE _real AS
  SELECT a.user_id AS u, aa.question_id AS q, aa.is_correct AS ok, aa.answered_at AS t
  FROM attempt_answers aa JOIN attempts a ON a.id = aa.attempt_id
  WHERE aa.selected NOT IN ('[]', '{"a":[],"b":[]}');
UPDATE user_questions SET
  seen    = (SELECT COUNT(*) FROM _real r WHERE r.u = user_questions.user_id AND r.q = user_questions.question_id),
  correct = (SELECT COALESCE(SUM(r.ok), 0) FROM _real r WHERE r.u = user_questions.user_id AND r.q = user_questions.question_id),
  wrong   = (SELECT COUNT(*) - COALESCE(SUM(r.ok), 0) FROM _real r WHERE r.u = user_questions.user_id AND r.q = user_questions.question_id),
  last_result = (SELECT r.ok FROM _real r WHERE r.u = user_questions.user_id AND r.q = user_questions.question_id ORDER BY r.t DESC LIMIT 1);
DELETE FROM user_questions WHERE seen = 0 AND bookmarked = 0;
UPDATE user_questions SET box = 0, due_at = NULL, last_result = NULL WHERE seen = 0;
UPDATE user_questions SET box = 1 WHERE seen > 0 AND correct = 0;
DROP TABLE _real;
`);
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('stats_fix_v1', '1')").run();
      })();
      console.log('[db] statistiques recalculées à partir des vraies réponses');
    }
  } catch (e) { console.warn('[db] stats_fix_v1:', e.message); }

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
