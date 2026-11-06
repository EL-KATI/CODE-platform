// Utilitaires d'interface : échappement HTML, toasts, dialogues, sons, synthèse vocale.
import { t, getLocale } from './i18n.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Gabarit HTML : les valeurs interpolées sont échappées sauf si elles sont marquées raw(). */
const RAW = Symbol('raw');
export const raw = (s) => ({ [RAW]: true, s: String(s ?? '') });
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((str, i) => {
    out += str;
    if (i < vals.length) {
      const v = vals[i];
      if (v && v[RAW]) out += v.s;
      else if (Array.isArray(v)) out += v.map((x) => (x && x[RAW] ? x.s : esc(x))).join('');
      else if (v === false || v === null || v === undefined) out += '';
      else out += esc(v);
    }
  });
  return raw(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(message, type = 'info') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

export function errorMessage(err) {
  const key = `err.${err?.code || 'server_error'}`;
  const msg = t(key);
  return msg === key ? t('err.server_error') : msg;
}

/** Ouvre un <dialog> modal. content = html``; retourne { el, close }. */
export function openDialog({ title, body, actions = [], onClose, wide = false }) {
  const dlg = document.createElement('dialog');
  if (wide) dlg.style.width = 'min(96vw, 980px)';
  dlg.setAttribute('aria-labelledby', 'dlg-title');
  dlg.innerHTML = html`<div class="dialog-body"><h2 id="dlg-title">${title}</h2>${body}</div>
    <div class="dialog-foot">${actions.map((a, i) => html`<button type="button" class="btn ${a.class || 'btn-secondary'}" data-i="${i}">${a.label}</button>`)}</div>`.s;
  document.body.appendChild(dlg);
  const close = () => { dlg.close(); dlg.remove(); onClose && onClose(); };
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.querySelectorAll('.dialog-foot button').forEach((b) => b.addEventListener('click', async () => {
    const a = actions[Number(b.dataset.i)];
    if (a.onClick) { const keep = await a.onClick(dlg); if (keep === false) return; }
    close();
  }));
  dlg.showModal();
  return { el: dlg, close };
}

export function confirmDialog(message, { danger = false, okLabel } = {}) {
  return new Promise((resolve) => {
    let ok = false;
    openDialog({
      title: t('common.confirm'),
      body: html`<p>${message}</p>`,
      actions: [
        { label: t('common.cancel') },
        { label: okLabel || t('common.ok'), class: danger ? 'btn-danger' : 'btn-primary', onClick: () => { ok = true; } },
      ],
      onClose: () => resolve(ok),
    });
  });
}

// --- Sons (Web Audio, désactivables) ---------------------------------------------
let audioCtx;
export const sound = {
  get enabled() { try { return localStorage.getItem('cp_sound') !== 'off'; } catch { return true; } },
  set enabled(v) { try { localStorage.setItem('cp_sound', v ? 'on' : 'off'); } catch { /* ignore */ } },
  play(type) {
    if (!this.enabled) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      const notes = { correct: [660, 880], wrong: [220, 160], tick: [1000], success: [523, 659, 784, 1047], click: [520] }[type] || [440];
      notes.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.frequency.value = f;
        o.type = type === 'wrong' ? 'sawtooth' : 'sine';
        const t0 = audioCtx.currentTime + i * 0.11;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(type === 'tick' ? 0.04 : 0.12, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
        o.connect(g).connect(audioCtx.destination);
        o.start(t0); o.stop(t0 + 0.2);
      });
    } catch { /* audio indisponible */ }
  },
};

// --- Lecture vocale de la question (accessibilité / apprenants peu lecteurs) --------
export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

// Préférence de l'élève : lire chaque question automatiquement (activée par défaut).
export const autoRead = {
  get() { try { return localStorage.getItem('autoRead') !== '0'; } catch { return true; } },
  set(on) { try { localStorage.setItem('autoRead', on ? '1' : '0'); } catch { /* stockage indisponible */ } },
};

export function speak(text, { silent = false } = {}) {
  if (!('speechSynthesis' in window)) { if (!silent) toast(t('quiz.noSpeech'), 'error'); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = getLocale() === 'fr' ? 'fr-FR' : 'ar-MA';
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

export const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString(getLocale() === 'fr' ? 'fr-MA' : 'ar-MA', { dateStyle: 'medium', timeStyle: 'short' });
};

export const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
export const loading = () => html`<div class="loading" role="status"><div class="spinner"></div><span class="sr-only">${t('common.loading')}</span></div>`;
