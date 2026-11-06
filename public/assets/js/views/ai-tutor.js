'use strict';
/* AI Tutor view – chat with Claude or Gemini Pro */

import { api } from '../api.js';
import { esc, toast } from '../ui.js';

export async function aiTutorView(container) {
  // Check which models are available
  let models = { claude: false, gemini: false };
  try {
    const status = await api.get('/ai/status');
    models = status.models;
  } catch (_) {}

  const noProvider = !models.claude && !models.gemini;

  container.innerHTML = `
    <div class="page-header">
      <h1>🤖 المساعد الذكي</h1>
      <p class="subtitle">اسأل عن أي سؤال في قانون السير</p>
    </div>

    ${noProvider ? `
      <div class="alert alert-warning">
        <strong>لم يتم تكوين مزود الذكاء الاصطناعي.</strong><br>
        أضف <code>ANTHROPIC_API_KEY</code> أو <code>GEMINI_API_KEY</code> في ملف <code>.env</code>
      </div>
    ` : ''}

    <div class="ai-chat-container">
      <div class="ai-model-selector" ${noProvider ? 'hidden' : ''}>
        <label>النموذج:</label>
        <select id="ai-model-select" class="form-select" style="width:auto;display:inline-block">
          <option value="auto">تلقائي</option>
          ${models.claude ? '<option value="claude">Claude (Anthropic)</option>' : ''}
          ${models.gemini ? '<option value="gemini">Gemini Pro (Google)</option>' : ''}
        </select>
      </div>

      <div id="ai-messages" class="ai-messages"></div>

      <form id="ai-form" class="ai-input-row" ${noProvider ? 'hidden' : ''}>
        <textarea id="ai-question" class="form-control" rows="2"
          placeholder="اكتب سؤالك هنا... مثال: ما هو الشوط المطلوب بين سيارتين؟"></textarea>
        <button type="submit" class="btn btn-primary" id="ai-send-btn">إرسال</button>
      </form>
    </div>
  `;

  if (noProvider) return;

  const form      = container.querySelector('#ai-form');
  const input     = container.querySelector('#ai-question');
  const messages  = container.querySelector('#ai-messages');
  const modelSel  = container.querySelector('#ai-model-select');
  const sendBtn   = container.querySelector('#ai-send-btn');

  function addMessage(role, text, modelName) {
    const div = document.createElement('div');
    div.className = `ai-msg ai-msg--${role}`;
    div.innerHTML = `
      <div class="ai-msg__bubble">${esc(text).replace(/\n/g, '<br>')}</div>
      ${modelName ? `<div class="ai-msg__meta">${esc(modelName)}</div>` : ''}
    `;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = input.value.trim();
    if (!question) return;

    addMessage('user', question, '');
    input.value = '';
    sendBtn.disabled = true;
    sendBtn.textContent = '...';

    try {
      const result = await api.post('/ai/ask', {
        question,
        model: modelSel.value,
      });
      const modelLabel = result.model === 'claude' ? 'Claude' : 'Gemini Pro';
      addMessage('assistant', result.answer, modelLabel);
    } catch (err) {
      toast(err.message || 'حدث خطأ', 'error');
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'إرسال';
    }
  });
}
