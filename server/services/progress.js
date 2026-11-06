'use strict';
const db = require('../db');

// Système de Leitner : intervalle (en jours) avant la prochaine révision selon la boîte atteinte.
const LEITNER_DAYS = { 1: 1, 2: 3, 3: 7, 4: 16, 5: 35 };
const MASTERED_BOX = 3;

function addDays(days) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

/** Met à jour la fiche de révision d'une question après une réponse. */
function recordResult(userId, questionId, correct) {
  const d = db.get();
  const cur = d.prepare('SELECT box FROM user_questions WHERE user_id = ? AND question_id = ?').get(userId, questionId);
  const box = correct ? Math.min((cur ? cur.box : 0) + 1, 5) : 1;
  // Une erreur est à revoir tout de suite ; une bonne réponse repousse la révision.
  const due = correct ? addDays(LEITNER_DAYS[box]) : new Date().toISOString();
  d.prepare(`INSERT INTO user_questions (user_id, question_id, seen, correct, wrong, box, due_at, last_result, updated_at)
             VALUES (@u, @q, 1, @c, @w, @box, @due, @r, datetime('now'))
             ON CONFLICT(user_id, question_id) DO UPDATE SET
               seen = seen + 1, correct = correct + @c, wrong = wrong + @w,
               box = @box, due_at = @due, last_result = @r, updated_at = datetime('now')`)
    .run({ u: userId, q: questionId, c: correct ? 1 : 0, w: correct ? 0 : 1, box, due, r: correct ? 1 : 0 });
}

function dueQuestionIds(userId, limit = 20) {
  return db.get().prepare(`
    SELECT uq.question_id AS id FROM user_questions uq
    JOIN questions q ON q.id = uq.question_id AND q.status = 'published'
    WHERE uq.user_id = ? AND uq.due_at <= ? AND uq.box < 5
    ORDER BY uq.last_result ASC, uq.due_at ASC LIMIT ?`).all(userId, new Date().toISOString(), limit).map((r) => r.id);
}

function streakDays(userId) {
  const days = db.get().prepare(`
    SELECT DISTINCT substr(aa.answered_at, 1, 10) AS d FROM attempt_answers aa
    JOIN attempts a ON a.id = aa.attempt_id WHERE a.user_id = ? ORDER BY d DESC LIMIT 400`).all(userId).map((r) => r.d);
  if (!days.length) return 0;
  let streak = 0;
  const cursor = new Date();
  const fmt = (dt) => dt.toISOString().slice(0, 10);
  if (days[0] !== fmt(cursor)) cursor.setUTCDate(cursor.getUTCDate() - 1); // la série reste valable si on n'a pas encore étudié aujourd'hui
  for (const d of days) {
    if (d !== fmt(cursor)) break;
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

/** Tableau de bord complet d'un élève (utilisé par l'élève lui-même et par les moniteurs). */
function dashboard(userId) {
  const d = db.get();
  const settings = db.getSettings();

  const categories = d.prepare(`
    SELECT c.id, c.slug, c.name_ar, c.name_fr, c.icon,
      (SELECT COUNT(*) FROM questions q WHERE q.category_id = c.id AND q.status = 'published') AS total,
      (SELECT COUNT(*) FROM user_questions uq JOIN questions q ON q.id = uq.question_id
         WHERE uq.user_id = @u AND q.category_id = c.id AND q.status = 'published') AS seen,
      (SELECT COUNT(*) FROM user_questions uq JOIN questions q ON q.id = uq.question_id
         WHERE uq.user_id = @u AND q.category_id = c.id AND q.status = 'published' AND uq.box >= ${MASTERED_BOX}) AS mastered,
      (SELECT COALESCE(SUM(uq.correct), 0) FROM user_questions uq JOIN questions q ON q.id = uq.question_id
         WHERE uq.user_id = @u AND q.category_id = c.id) AS correct,
      (SELECT COALESCE(SUM(uq.wrong), 0) FROM user_questions uq JOIN questions q ON q.id = uq.question_id
         WHERE uq.user_id = @u AND q.category_id = c.id) AS wrong
    FROM categories c ORDER BY c.sort`).all({ u: userId }).map((c) => ({
    ...c,
    accuracy: c.correct + c.wrong ? Math.round((100 * c.correct) / (c.correct + c.wrong)) : null,
    mastery: c.total ? Math.round((100 * c.mastered) / c.total) : 0,
  }));

  const lessons = d.prepare(`SELECT
      (SELECT COUNT(*) FROM lessons WHERE published = 1) AS total,
      (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id AND l.published = 1 WHERE lp.user_id = ?) AS done`).get(userId);

  const recent = d.prepare(`
    SELECT a.id, a.mode, a.practice, a.score, a.total, a.passed, a.finished_at, a.series_id, a.category_id, s.title AS series_title
    FROM attempts a LEFT JOIN series s ON s.id = a.series_id
    WHERE a.user_id = ? AND a.finished_at IS NOT NULL ORDER BY a.finished_at DESC LIMIT 8`).all(userId);

  const window = settings.readiness_window;
  const lastExams = d.prepare(`SELECT score, total, passed FROM attempts
    WHERE user_id = ? AND mode = 'exam' AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT ?`).all(userId, window);
  const examsPassed = lastExams.filter((e) => e.passed).length;
  const avgExam = lastExams.length ? Math.round((10 * lastExams.reduce((s, e) => s + (e.score * settings.exam_question_count) / e.total, 0)) / lastExams.length) / 10 : null;
  const minMastery = categories.length ? Math.min(...categories.map((c) => c.mastery)) : 0;

  // Indice de préparation (0–100) : 50 % examens blancs, 35 % maîtrise des thèmes, 15 % cours.
  const examPart = Math.min(examsPassed / Math.max(window - 1, 1), 1);
  const masteryPart = categories.length ? categories.reduce((s, c) => s + c.mastery, 0) / (100 * categories.length) : 0;
  const lessonPart = lessons.total ? lessons.done / lessons.total : 0;
  const readinessScore = Math.round(100 * (0.5 * examPart + 0.35 * masteryPart + 0.15 * lessonPart));
  const ready = lastExams.length >= window && examsPassed >= window - 1 && minMastery >= 60;

  const seriesProgress = d.prepare(`
    SELECT s.id, s.title, (SELECT COUNT(*) FROM series_questions sq WHERE sq.series_id = s.id) AS questions,
      (SELECT MAX(CAST(a.score AS REAL) / a.total) FROM attempts a WHERE a.user_id = @u AND a.series_id = s.id AND a.finished_at IS NOT NULL) AS best,
      (SELECT COUNT(*) FROM attempts a WHERE a.user_id = @u AND a.series_id = s.id AND a.finished_at IS NOT NULL) AS attempts
    FROM series s WHERE s.published = 1 ORDER BY s.sort, s.id`).all({ u: userId })
    .map((s) => ({ ...s, best: s.best === null ? null : Math.round(s.best * 100) }));

  const counts = d.prepare(`SELECT
      (SELECT COUNT(*) FROM user_questions uq JOIN questions q ON q.id = uq.question_id AND q.status='published'
        WHERE uq.user_id = @u AND uq.due_at <= @now AND uq.box < 5) AS due,
      (SELECT COUNT(*) FROM user_questions WHERE user_id = @u AND bookmarked = 1) AS bookmarks,
      (SELECT COUNT(*) FROM user_questions WHERE user_id = @u AND last_result = 0) AS mistakes,
      (SELECT COUNT(*) FROM attempts WHERE user_id = @u AND finished_at IS NOT NULL) AS attempts,
      (SELECT COUNT(*) FROM questions WHERE status='published') AS questions,
      (SELECT COUNT(*) FROM user_questions uq JOIN questions q ON q.id = uq.question_id AND q.status='published' WHERE uq.user_id = @u) AS seen`)
    .get({ u: userId, now: new Date().toISOString() });

  return {
    settings: { questionCount: settings.exam_question_count, passMark: settings.exam_pass_mark, secondsPerQuestion: settings.exam_seconds_per_question, readinessWindow: window },
    readiness: { score: readinessScore, ready, examsTaken: lastExams.length, examsPassed, averageExamScore: avgExam, minMastery },
    lessons,
    counts,
    streak: streakDays(userId),
    categories,
    series: seriesProgress,
    recent,
  };
}

module.exports = { recordResult, dueQuestionIds, dashboard, LEITNER_DAYS };
