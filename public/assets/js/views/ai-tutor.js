/* المساعد الذكي – محادثة مع Claude أو Gemini حول قانون السير */
import { api } from '../api.js';
import { html, esc, toast, errorMessage } from '../ui.js';
import { t } from '../i18n.js';

export async function aiTutorView(root) {
  let models = { claude: false, gemini: false };
  try { models = (await api.get('/ai/status')).models || models; } catch { /* يُعرض تنبيه «غير مفعّل» */ }
  const noProvider = !models.claude && !models.gemini;
  const examples = [t('ai.ex1'), t('ai.ex2'), t('ai.ex3')];

  root.innerHTML = html`
    <div class="pg pg-narrow chat-page">
      <header class="pg-head"><h1>${t('nav.ai')}</h1><p>${t('ai.subtitle')}</p></header>
      ${noProvider ? html`<div class="card empty"><div class="big">🤖</div><p>${t('ai.unavailable')}</p></div>` : html`
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
        <p class="chat-note">${t('ai.disclaimer')}</p>
      </div>`}
    </div>`.s;

  if (noProvider) return;

  const form = root.querySelector('#ai-form');
  const input = root.querySelector('#ai-question');
  const messages = root.querySelector('#ai-messages');
  const modelSel = root.querySelector('#ai-model');
  const sendBtn = root.querySelector('#ai-send');

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
      addMessage('assistant', res.answer, res.model === 'claude' ? 'Claude' : 'Gemini');
    } catch (err) {
      pending.remove();
      toast(errorMessage(err), 'error');
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); ask(input.value.trim()); });
  // Entrée = envoyer, Maj+Entrée = retour à la ligne
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  messages.querySelectorAll('[data-ex]').forEach((b) => (b.onclick = () => ask(b.dataset.ex)));
}
