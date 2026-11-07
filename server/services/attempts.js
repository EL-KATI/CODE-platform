'use strict';
const db = require('../db');
const { bad, notFound, HttpError } = require('../http');
const { toQuestion, getByIds, isCorrect, shuffle } = require('./questions');
const progress = require('./progress');

const GRACE_SECONDS = 10; // tolérance réseau par question

const published = () => db.get().prepare("SELECT id, category_id FROM questions WHERE status = 'published'").all();

/**
 * Tirage d'un examen blanc selon le « blueprint » : nombre de questions par thème
 * proportionnel au poids exam_weight de chaque catégorie (comme les examens officiels).
 * Si une catégorie a exam_count défini, ce nombre est utilisé à la place du global.
 * (Ex: catégorie B → 40 questions, autres catégories → 46 questions)
 */
function drawExam(defaultCount, categoryId) {
  const d = db.get();
  // Si un categoryId est fourni, on tire uniquement pour cette catégorie
  const cats = categoryId
    ? d.prepare('SELECT id, exam_weight, exam_count FROM categories WHERE id = ? AND exam_weight > 0').all(categoryId)
    : d.prepare('SELECT id, exam_weight, exam_count FROM categories WHERE exam_weight > 0').all();
  const pool = published();
  const byCat = new Map(cats.map((c) => [c.id, shuffle(pool.filter((q) => q.category_id === c.id).map((q) => q.id))]));

  // Determine total count: use category-specific count if single category, else default
  let count = defaultCount;
  if (cats.length === 1 && cats[0].exam_count != null) {
    count = cats[0].exam_count;
  }

  const totalWeight = cats.reduce((s, c) => s + c.exam_weight, 0) || 1;

  // Méthode du plus fort reste pour que la somme fasse exactement `count`.
  const quotas = cats.map((c) => {
    const exact = (count * c.exam_weight) / totalWeight;
    return { id: c.id, n: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let missing = count - quotas.reduce((s, q) => s + q.n, 0);
  [...quotas].sort((a, b) => b.rest - a.rest).forEach((q) => { if (missing > 0) { q.n++; missing--; } });

  const picked = [];
  for (const q of quotas) picked.push(...(byCat.get(q.id) || []).splice(0, q.n));
  // Si un thème n'a pas assez de questions, on complète avec le reste de la banque.
  if (picked.length < count) {
    const used = new Set(picked);
    picked.push(...shuffle(pool.map((q) => q.id).filter((id) => !used.has(id))).slice(0, count - picked.length));
  }
  return shuffle(picked);
}

/** Questions d'un thème : priorité aux questions jamais vues puis aux plus faibles. */
function drawCategory(userId, categoryId, count) {
  return db.get().prepare(`
    SELECT q.id FROM questions q
    LEFT JOIN user_questions uq ON uq.question_id = q.id AND uq.user_id = ?
    WHERE q.category_id = ? AND q.status = 'published'
    ORDER BY COALESCE(uq.box, 0) ASC, RANDOM() LIMIT ?`).all(userId, categoryId, count).map((r) => r.id);
}

function create(user, body) {
  const d = db.get();
  const settings = db.getSettings();
  const mode = body.mode;
  let practice = body.practice !== false;
  let questionIds = [];
  let seriesId = null;
  let categoryId = null;
  let passMark = null;

  switch (mode) {
    case 'exam': {
      practice = false;
      // Support d'un categoryId optionnel pour les examens par catégorie (ex: cat B = 40 q, autres = 46 q)
      const examCatId = body.categoryId ? Number(body.categoryId) : null;
      if (examCatId) {
        const catRow = d.prepare('SELECT id FROM categories WHERE id = ?').get(examCatId);
        if (!catRow) throw notFound('category_not_found');
        categoryId = examCatId;
      }
      questionIds = drawExam(settings.exam_question_count, examCatId);
      passMark = Math.round((settings.exam_pass_mark / settings.exam_question_count) * questionIds.length);
      break;
    }
    case 'series': {
      seriesId = Number(body.seriesId);
      const s = d.prepare('SELECT id FROM series WHERE id = ? AND published = 1').get(seriesId);
      if (!s) throw notFound('series_not_found');
      questionIds = d.prepare(`SELECT sq.question_id AS id FROM series_questions sq
        JOIN questions q ON q.id = sq.question_id AND q.status = 'published'
        WHERE sq.series_id = ? ORDER BY sq.position`).all(seriesId).map((r) => r.id);
      passMark = Math.ceil((settings.exam_pass_mark / settings.exam_question_count) * questionIds.length);
      break;
    }
    case 'category': {
      categoryId = Number(body.categoryId);
      if (!d.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId)) throw notFound('category_not_found');
      questionIds = drawCategory(user.id, categoryId, Math.min(Number(body.count) || 15, 40));
      break;
    }
    case 'review':
      questionIds = progress.dueQuestionIds(user.id, 20);
      break;
    case 'bookmarks':
      questionIds = d.prepare(`SELECT uq.question_id AS id FROM user_questions uq JOIN questions q ON q.id = uq.question_id
        WHERE uq.user_id = ? AND uq.bookmarked = 1 AND q.status = 'published' ORDER BY RANDOM() LIMIT 40`).all(user.id).map((r) => r.id);
      break;
    default:
      throw bad('invalid_mode');
  }
  if (!questionIds.length) throw bad('no_questions');

  const spq = practice ? 0 : settings.exam_seconds_per_question;
  const info = d.prepare(`INSERT INTO attempts (user_id, mode, practice, series_id, category_id, question_ids, seconds_per_question, pass_mark, total)
                          VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(user.id, mode, practice ? 1 : 0, seriesId, categoryId, JSON.stringify(questionIds), spq, passMark, questionIds.length);
  return load(user, info.lastInsertRowid);
}

function getOwned(user, id) {
  const a = db.get().prepare('SELECT * FROM attempts WHERE id = ?').get(id);
  if (!a || a.user_id !== user.id) throw notFound('attempt_not_found');
  return a;
}

function deadline(a) {
  if (!a.seconds_per_question) return null;
  return new Date(Date.parse(a.started_at) + a.total * (a.seconds_per_question + GRACE_SECONDS) * 1000);
}

function answer(user, attemptId, body) {
  const d = db.get();
  const a = getOwned(user, attemptId);
  if (a.finished_at) throw new HttpError(409, 'attempt_finished');
  const qid = Number(body.questionId);
  const ids = JSON.parse(a.question_ids);
  if (!ids.includes(qid)) throw bad('question_not_in_attempt');
  if (d.prepare('SELECT 1 FROM attempt_answers WHERE attempt_id = ? AND question_id = ?').get(a.id, qid)) {
    throw new HttpError(409, 'already_answered');
  }
  const row = getByIds([qid]).get(qid);
  const options = JSON.parse(row.options);
  const dl = deadline(a);
  const late = dl && Date.now() > dl.getTime();
  const timeMs = Number.isFinite(Number(body.timeMs)) ? Math.max(0, Math.round(Number(body.timeMs))) : null;

  let selected, ok, correct, selectedStored;

  if (row.is_double && row.sub_questions) {
    // --- سؤال مزدوج: التحقق من كلا الجزأين ---
    const sqs = JSON.parse(row.sub_questions);
    const sdRaw = body.selected_double || { a: [], b: [] };
    const cleanSub = (arr, opts) => {
      if (late) return [];
      return [...new Set((Array.isArray(arr) ? arr : []).map(Number))]
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= opts.length).sort((x, y) => x - y);
    };
    const selA = cleanSub(sdRaw.a, sqs[0].options);
    const selB = cleanSub(sdRaw.b, sqs[1].options);
    const okA = isCorrect(selA, sqs[0].correct);
    const okB = isCorrect(selB, sqs[1].correct);
    ok = okA && okB;
    correct = JSON.parse(row.correct); // إجابة الجزء الرئيسي (للتوافق)
    selected = []; // لا يُستخدم للمزدوج
    selectedStored = JSON.stringify({ a: selA, b: selB });
  } else {
    // --- سؤال منفرد ---
    selected = Array.isArray(body.selected) ? [...new Set(body.selected.map(Number))] : [];
    selected = selected.filter((n) => Number.isInteger(n) && n >= 1 && n <= options.length).sort((x, y) => x - y);
    if (late) selected = [];
    correct = JSON.parse(row.correct);
    ok = isCorrect(selected, correct);
    selectedStored = JSON.stringify(selected);
  }

  d.prepare('INSERT INTO attempt_answers (attempt_id, question_id, selected, is_correct, time_ms) VALUES (?,?,?,?,?)')
    .run(a.id, qid, selectedStored, ok ? 1 : 0, timeMs);
  progress.recordResult(user.id, qid, ok);

  if (a.practice) return { recorded: true, isCorrect: ok, correct, explanation: row.explanation, late: !!late };
  return { recorded: true, late: !!late };
}

function finish(user, attemptId) {
  const d = db.get();
  const a = getOwned(user, attemptId);
  if (!a.finished_at) {
    const tx = d.transaction(() => {
      const ids = JSON.parse(a.question_ids);
      const answered = new Set(d.prepare('SELECT question_id FROM attempt_answers WHERE attempt_id = ?').all(a.id).map((r) => r.question_id));
      const ins = d.prepare("INSERT INTO attempt_answers (attempt_id, question_id, selected, is_correct) VALUES (?, ?, '[]', 0)");
      for (const qid of ids) {
        if (!answered.has(qid)) { ins.run(a.id, qid); progress.recordResult(user.id, qid, false); }
      }
      const score = d.prepare('SELECT COUNT(*) AS n FROM attempt_answers WHERE attempt_id = ? AND is_correct = 1').get(a.id).n;
      const passed = a.pass_mark === null ? null : score >= a.pass_mark ? 1 : 0;
      d.prepare("UPDATE attempts SET finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), score = ?, passed = ? WHERE id = ?").run(score, passed, a.id);
    });
    tx();
  }
  return load(user, a.id);
}

/** État complet d'une tentative. Les bonnes réponses ne sont révélées qu'en entraînement ou après la fin. */
function load(user, attemptId) {
  const d = db.get();
  const a = getOwned(user, attemptId);
  const ids = JSON.parse(a.question_ids);
  const rows = getByIds(ids);
  const answers = new Map(d.prepare('SELECT * FROM attempt_answers WHERE attempt_id = ?').all(a.id).map((r) => [r.question_id, r]));
  const bookmarks = new Set(d.prepare(`SELECT question_id FROM user_questions WHERE user_id = ? AND bookmarked = 1
    AND question_id IN (${ids.map(() => '?').join(',')})`).all(user.id, ...ids).map((r) => r.question_id));
  const finished = !!a.finished_at;

  const questions = ids.filter((id) => rows.has(id)).map((id) => {
    const ans = answers.get(id);
    const reveal = finished || (a.practice && ans);
    const q = toQuestion(rows.get(id), { includeAnswer: reveal });
    q.bookmarked = bookmarks.has(id);
    if (ans) {
      const rawSel = ans.selected;
      let parsedSel;
      try { parsedSel = JSON.parse(rawSel); } catch { parsedSel = []; }
      if (q.is_double && parsedSel && typeof parsedSel === 'object' && !Array.isArray(parsedSel)) {
        // سؤال مزدوج: selected مخزن كـ {a:[..], b:[..]}
        q.answer = { selected: [], selected_double: parsedSel };
      } else {
        q.answer = { selected: Array.isArray(parsedSel) ? parsedSel : [] };
      }
      if (reveal) q.answer.isCorrect = !!ans.is_correct;
    }
    return q;
  });

  const out = {
    id: a.id,
    mode: a.mode,
    practice: !!a.practice,
    seriesId: a.series_id,
    categoryId: a.category_id,
    secondsPerQuestion: a.seconds_per_question,
    passMark: a.pass_mark,
    total: a.total,
    startedAt: a.started_at,
    finishedAt: a.finished_at,
    questions,
  };
  if (a.series_id) out.seriesTitle = (d.prepare('SELECT title FROM series WHERE id = ?').get(a.series_id) || {}).title;
  if (finished) {
    out.score = a.score;
    out.passed = a.passed === null ? null : !!a.passed;
    const byCat = {};
    for (const q of questions) {
      const c = (byCat[q.categoryId] ||= { categoryId: q.categoryId, total: 0, correct: 0 });
      c.total++;
      if (q.answer && q.answer.isCorrect) c.correct++;
    }
    out.byCategory = Object.values(byCat);
  }
  return out;
}

function list(user, limit = 30) {
  return db.get().prepare(`
    SELECT a.id, a.mode, a.practice, a.score, a.total, a.passed, a.pass_mark, a.started_at, a.finished_at, s.title AS series_title, c.name_ar AS category_name
    FROM attempts a LEFT JOIN series s ON s.id = a.series_id LEFT JOIN categories c ON c.id = a.category_id
    WHERE a.user_id = ? ORDER BY a.started_at DESC LIMIT ?`).all(user.id, limit);
}

module.exports = { create, answer, finish, load, list, drawExam };
