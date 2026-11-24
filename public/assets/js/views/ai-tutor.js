/* Monitor AI – محادثة حول مدونة السير المغربية (Claude أو Gemini من جهة الخادم) */
import { api } from '../api.js';
import { html, esc, toast, errorMessage } from '../ui.js';
import { t } from '../i18n.js';

export async function aiTutorView(root) {
  let status = { models: { claude: false, gemini: false }, enabled: true, dailyLimit: 15, dailyUsed: 0 };
  try { status = { ...status, ...(await api.get('/ai/status')) }; } catch { /* يُعرض تنبيه «غير مفعّل» */ }

  const models = status.models || { claude: false, gemini: false };
  const noProvider = !models.claude && !models.gemini;
  const disabled = !status.enabled;
  const quotaLeft = Math.max(0, (status.dailyLimit || 15) - (status.dailyUsed || 0));
  const quotaExhausted = quotaLeft <= 0;
  const showChat = !noProvider && !disabled && !quotaExhausted;
  const examples = [t('ai.ex1'), t('ai.ex2'), t('ai.ex3')];

  const unavailableCard = (msg) => html`<div class="card empty"><div class="big">🤖</div><p>${msg}</p></div>`;

  root.innerHTML = html`
    <div class="pg pg-narrow chat-page">
      <header class="pg-head"><h1>${t('nav.ai')}</h1><p>${t('ai.subtitle')}</p></header>
      ${noProvider ? unavailableCard(t('ai.unavailable'))
        : disabled ? unavailableCard(t('ai.disabledByAdmin'))
        : quotaExhausted ? unavailableCard(t('ai.quotaExhausted'))
        : html`
      <div class="chat">
        <div class="chat-bar" ${models.claude && models.gemini ? '' : 'hidden'}>
          <label class="small muted" for="ai-model">${t('ai.model')}</label>
          <select id="ai-model">
            <option value="auto">${t('ai.auto')}</option>
            ${models.claude ? html`<option value="claude">Claude</option>` : ''}
            ${models.gemini ? html`<option value="gemini">Gemini</option>` : ''}
          </select>
        </div>
        <div id="ai-messages" class="chat-messages" aria-live="polite">
          <div class="ai-empty">
            <span class="chat-avatar" aria-hidden="true">✦</span>
            <p class="muted">${t('ai.empty')}</p>
            <div class="ai-examples">${examples.map((e) => html`<button type="button" class="chip" data-ex="${e}">${e}</button>`)}</div>
          </div>
        </div>
        <form id="ai-form" class="chat-composer">
          <textarea id="ai-question" rows="1" maxlength="1000" placeholder="${t('ai.placeholder')}" aria-label="${t('ai.placeholder')}"></textarea>
          <button type="submit" class="chat-send" id="ai-send" aria-label="${t('ai.send')}" title="${t('ai.send')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>
          </button>
        </form>
        <p class="chat-note chat-quota" id="ai-quota">${t('ai.disclaimer')} · <span>${t('ai.quotaRemaining', { n: quotaLeft, max: status.dailyLimit || 15 })}</span></p>
      </div>`}
    </div>`.s;

  if (!showChat) return;

  const form = root.querySelector('#ai-form');
  const input = root.querySelector('#ai-question');
  const messages = root.querySelector('#ai-messages');
  const modelSel = root.querySelector('#ai-model');
  const sendBtn = root.querySelector('#ai-send');
  const quotaEl = root.querySelector('#ai-quota span');
  let dailyUsed = status.dailyUsed || 0;
  const dailyLimit = status.dailyLimit || 15;

  function updateQuota(used) {
    dailyUsed = used;
    const left = Math.max(0, dailyLimit - dailyUsed);
    if (quotaEl) quotaEl.textContent = t('ai.quotaRemaining', { n: left, max: dailyLimit });
    if (left <= 0 && sendBtn) {
      sendBtn.disabled = true;
      toast(t('ai.quotaExhausted'), 'error');
    }
  }

  function addMessage(role, text, meta) {
    messages.querySelector('.ai-empty')?.remove();
    const div = document.createElement('div');
    div.className = `msg msg-${role}`;
    div.innerHTML = text === null
      ? '<div class="msg-bubble msg-typing"><i></i><i></i><i></i></div>'
      : `<div class="msg-bubble">${esc(text).replace(/\n/g, '<br>')}</div>${meta ? `<div class="msg-meta">${esc(meta)}</div>` : ''}`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  // حقل الكتابة يكبر مع النص (حتى 5 أسطر تقريباً)
  const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 140)}px`; };
  input.addEventListener('input', grow);

  async function ask(question) {
    if (!question || sendBtn.disabled) return;
    addMessage('user', question);
    input.value = '';
    grow();
    sendBtn.disabled = true;
    const pending = addMessage('assistant', null);
    try {
      const res = await api.post('/ai/ask', { question, model: modelSel.value });
      pending.remove();
      const src = Array.isArray(res.sources) && res.sources.length ? ` · ${t('ai.sources')} ${res.sources.map((s) => s.replace(/^درس:\s*/, '')).join('، ')}` : '';
      addMessage('assistant', res.answer, `Monitor AI${src}`);
      if (res.dailyUsed !== undefined) updateQuota(res.dailyUsed);
    } catch (err) {
      pending.remove();
      // Handle quota exceeded (429) gracefully
      if (err.status === 429 || (err.body && err.body.error === 'ai_quota_exceeded')) {
        updateQuota(dailyLimit);
        return;
      }
      toast(errorMessage(err), 'error');
    } finally {
      if (dailyUsed < dailyLimit) sendBtn.disabled = false;
      input.focus();
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); ask(input.value.trim()); });
  // Entrée = envoyer, Maj+Entrée = retour à la ligne
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  messages.querySelectorAll('[data-ex]').forEach((b) => (b.onclick = () => ask(b.dataset.ex)));
}
