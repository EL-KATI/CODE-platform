// Fragments réutilisés par plusieurs vues.
import { html, toast, errorMessage } from '../ui.js';
import { t, catName } from '../i18n.js';
import { api } from '../api.js';
import { navigate } from '../router.js';

export function progressBar(value, label) {
  const cls = value >= 80 ? '' : value >= 50 ? 'warn' : 'bad';
  return html`<div class="progress ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}" aria-label="${label || ''}"><span style="width:${value}%"></span></div>`;
}

export function ring(value, label, color) {
  return html`<div class="ring" style="--v:${value};${color ? `--c:${color}` : ''}" role="img" aria-label="${label}: ${value}%"><div>${value}%<small>${label}</small></div></div>`;
}

export function modeLabel(a) {
  if (a.mode === 'exam') return t('mode.exam');
  if (a.mode === 'series') return a.series_title || a.seriesTitle || t('mode.series');
  if (a.mode === 'category') return t('mode.category');
  if (a.mode === 'review') return t('mode.review');
  if (a.mode === 'bookmarks') return t('mode.bookmarks');
  return a.mode;
}

export function scorePill(a) {
  if (a.score === null || a.score === undefined) return html`<span class="pill">${t('history.inProgress')}</span>`;
  const cls = a.passed === 1 || a.passed === true ? 'pill-success' : a.passed === 0 || a.passed === false ? 'pill-danger' : 'pill-info';
  return html`<span class="pill ${cls}">${a.score}/${a.total}</span>`;
}

/** Démarre une tentative et ouvre le simulateur. */
export async function startAttempt(body, btn) {
  if (btn) btn.disabled = true;
  try {
    const a = await api.post('/attempts', body);
    navigate(`/quiz/${a.id}`);
  } catch (e) {
    toast(e.code === 'no_questions' ? t('err.no_questions') : errorMessage(e), 'error');
    if (btn) btn.disabled = false;
  }
}

export { catName };

/** Vidéo d'une question : fichier (<video>) ou YouTube (<iframe>). */
export function videoBlock(q) {
  if (!q.video) return '';
  if (q.video.startsWith('https://www.youtube-nocookie.com/embed/')) {
    return html`<div class="scene" style="margin:0 0 16px;aspect-ratio:16/9"><iframe src="${q.video}" title="video" style="width:100%;height:100%;border:0" allow="encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
  }
  return html`<video class="scene" src="${q.video}" controls preload="metadata" playsinline style="width:100%;max-height:380px;margin:0 0 16px;background:#000"></video>`;
}

/** Texte lu à voix haute : narration de l'auteur, sinon énoncé + choix. */
// Texte lu à voix haute, avec les numéros des choix en darija (« الجواب واحد… »)
// pour que la voix arabe ne les lise pas comme de simples chiffres.
const DARIJA_NUM = ['واحد', 'جوج', 'تلاتة', 'ربعة'];
export function speechText(q) {
  if (q.audioText) return q.audioText;
  return `${q.text}. ${q.options.map((o, i) => `الجواب ${DARIJA_NUM[i] || i + 1}: ${o}`).join('. ')}.`;
}
