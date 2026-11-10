// الدروس التفاعلية (التعلم النشط): تقسيم الدرس إلى خطوات + أنشطة داخل نص Markdown.
//
// الصيغة داخل نص الدرس:
//   :::quiz            سؤال سريع (جواب واحد أو أكثر)
//   ? نص السؤال
//   - [ ] خيار خاطئ
//   - [x] خيار صحيح
//   ! الشرح بعد الجواب
//   :::
//   :::scenario        موقف من الطريق: كل خيار له تعليل بعد «::»
//   ? وصف الموقف
//   - [x] خيار :: لماذا هو صحيح
//   - [ ] خيار :: لماذا هو خاطئ
//   :::
//   :::reveal          فكّر ثم اكشف
//   ? السؤال
//   الجواب (Markdown)
//   :::
//   :::summary         الخلاصة (قائمة)
//   - نقطة
//   :::
import { renderMarkdown, inline } from './markdown.js';
import { esc } from './ui.js';
import { t } from './i18n.js';

const TYPES = new Set(['quiz', 'scenario', 'reveal', 'summary']);

function parseBlock(type, lines, id) {
  if (type === 'summary') {
    return { type, items: lines.filter((l) => /^\s*[-*]\s+/.test(l)).map((l) => l.replace(/^\s*[-*]\s+/, '')) };
  }
  const q = [];
  const options = [];
  const rest = [];
  let explain = '';
  for (const l of lines) {
    let m;
    if ((m = /^\?\s?(.*)$/.exec(l)) && !options.length && !rest.length) q.push(m[1]);
    else if (type !== 'reveal' && (m = /^\s*-\s*\[( |x|X)\]\s*(.*)$/.exec(l))) {
      const [text, why] = m[2].split(/\s+::\s+/);
      options.push({ text: text.trim(), correct: m[1].toLowerCase() === 'x', why: (why || '').trim() });
    } else if (type !== 'reveal' && (m = /^!\s?(.*)$/.exec(l))) explain += (explain ? '\n' : '') + m[1];
    else rest.push(l);
  }
  const block = { type, id, question: q.join('\n') };
  if (type === 'reveal') block.answer = rest.join('\n').trim();
  else {
    block.options = options;
    block.multi = options.filter((o) => o.correct).length > 1;
    block.explain = explain;
  }
  return block;
}

/** نص الدرس ← خطوات { title, parts: [{type:'md', src} | block] } + خلاصة */
export function parseLesson(body) {
  const lines = String(body || '').replace(/\r/g, '').split('\n');
  const steps = [];
  const summary = [];
  let cur = { title: '', parts: [] };
  let md = [];
  let n = 0;
  const flushMd = () => { if (md.join('').trim()) cur.parts.push({ type: 'md', src: md.join('\n') }); md = []; };
  const pushStep = () => { flushMd(); if (cur.parts.length || cur.title) steps.push(cur); };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const open = /^:::\s*(\w+)\s*$/.exec(line);
    if (open && TYPES.has(open[1])) {
      const buf = [];
      i++;
      while (i < lines.length && !/^:::\s*$/.test(lines[i])) buf.push(lines[i++]);
      flushMd();
      const b = parseBlock(open[1], buf, `b${n++}`);
      if (b.type === 'summary') summary.push(...b.items);
      else cur.parts.push(b);
      continue;
    }
    const h = /^##\s+(.*)$/.exec(line);
    if (h) { pushStep(); cur = { title: h[1].trim(), parts: [] }; continue; }
    md.push(line);
  }
  pushStep();
  return { steps, summary, interactive: n > 0 };
}

export const isGraded = (p) => p.type === 'quiz' || p.type === 'scenario';

const icon = {
  quiz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>',
  scenario: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17h14M7 17V9l5-4 5 4v8"/><path d="M10 17v-4h4v4"/></svg>',
  reveal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/></svg>',
};

/** HTML لجزء واحد (نص أو نشاط). answers: { [id]: { picked:[i], correct:bool } } */
export function renderPart(p, answers = {}) {
  if (p.type === 'md') return `<div class="prose" lang="ar" dir="rtl">${renderMarkdown(p.src)}</div>`;
  const q = p.question.split('\n').map(inline).join('<br>');
  if (p.type === 'reveal') {
    const open = answers[p.id]?.revealed;
    return `<section class="lx lx-reveal ${open ? 'is-open' : ''}" data-id="${p.id}">
      <div class="lx-tag">${icon.reveal}<span>${esc(t('lx.reveal'))}</span></div>
      <p class="lx-q">${q}</p>
      <button class="btn btn-secondary lx-reveal-btn" type="button" aria-expanded="${open ? 'true' : 'false'}">${esc(t('lx.revealBtn'))}</button>
      <div class="lx-answer prose" lang="ar" dir="rtl" ${open ? '' : 'hidden'}>${renderMarkdown(p.answer)}</div>
    </section>`;
  }
  const a = answers[p.id];
  const done = !!a;
  const opts = p.options.map((o, i) => {
    const picked = done && a.picked.includes(i);
    const cls = done ? (o.correct ? 'is-correct' : picked ? 'is-wrong' : 'is-muted') : '';
    const why = done && o.why && (picked || o.correct) ? `<span class="lx-why">${inline(o.why)}</span>` : '';
    return `<button class="lx-opt ${cls} ${picked ? 'is-picked' : ''}" type="button" role="${p.multi ? 'checkbox' : 'radio'}" aria-checked="${picked ? 'true' : 'false'}" data-i="${i}" ${done ? 'disabled' : ''}>
      <span class="lx-mark" aria-hidden="true"></span><span class="lx-opt-body"><span>${inline(o.text)}</span>${why}</span></button>`;
  }).join('');
  const verdict = done ? `<div class="lx-verdict ${a.correct ? 'ok' : 'ko'}" role="status"><strong>${esc(a.correct ? t('lx.correct') : t('lx.wrong'))}</strong>${p.explain ? `<span>${inline(p.explain)}</span>` : ''}</div>` : '';
  return `<section class="lx lx-${p.type} ${done ? 'is-done' : ''}" data-id="${p.id}">
    <div class="lx-tag">${icon[p.type]}<span>${esc(t(p.type === 'quiz' ? 'lx.quiz' : 'lx.scenario'))}</span></div>
    <p class="lx-q">${q}</p>
    ${p.multi && !done ? `<p class="lx-hint">${esc(t('lx.multi'))}</p>` : ''}
    <div class="lx-opts" role="${p.multi ? 'group' : 'radiogroup'}">${opts}</div>
    ${p.multi && !done ? `<button class="btn btn-primary lx-confirm" type="button" disabled>${esc(t('lx.confirm'))}</button>` : ''}
    ${verdict}
  </section>`;
}

/** تفعيل الأنشطة داخل حاوية. onChange(id, state) يُستدعى بعد كل جواب/كشف ليعيد الرسم */
export function wireParts(root, parts, answers, onChange) {
  const byId = new Map(parts.filter((p) => p.type !== 'md').map((p) => [p.id, p]));
  root.querySelectorAll('.lx').forEach((el) => {
    const p = byId.get(el.dataset.id);
    if (!p) return;
    if (p.type === 'reveal') {
      const btn = el.querySelector('.lx-reveal-btn');
      btn.onclick = () => { answers[p.id] = { revealed: true }; onChange(p.id); };
      return;
    }
    if (answers[p.id]) return;
    const sel = new Set();
    const confirm = el.querySelector('.lx-confirm');
    const submit = () => {
      const picked = [...sel].sort((x, y) => x - y);
      const good = p.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
      answers[p.id] = { picked, correct: picked.length === good.length && picked.every((i, k) => i === good[k]) };
      onChange(p.id);
    };
    el.querySelectorAll('.lx-opt').forEach((b) => {
      b.onclick = () => {
        const i = Number(b.dataset.i);
        if (!p.multi) { sel.clear(); sel.add(i); submit(); return; }
        if (sel.has(i)) sel.delete(i); else sel.add(i);
        b.classList.toggle('is-picked', sel.has(i));
        b.setAttribute('aria-checked', String(sel.has(i)));
        confirm.disabled = sel.size === 0;
      };
    });
    if (confirm) confirm.onclick = submit;
  });
}
