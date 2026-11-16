import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api.js'

export default function AiTutor() {
  const { t } = useTranslation()
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const userMsg = { role: 'user', content: text }
    setMessages(m => [...m, userMsg])
    setLoading(true)
    try {
      const res = await api.post('/ai/chat', { message: text, history: messages.slice(-10) })
      setMessages(m => [...m, { role: 'assistant', content: res.reply || res.message || '...' }])
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: t('error.generic'), error: true }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ai-tutor">
      <div className="ai-header">
        <h1>🤖 {t('nav.ai')}</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>
          {t('ai.subtitle', { defaultValue: 'اسألني أي سؤال عن قانون السير والسلامة المرورية' })}
        </p>
      </div>

      <div className="ai-messages">
        {messages.length === 0 && (
          <div className="ai-empty">
            <div style={{ fontSize: '3rem', marginBottom: '.75rem' }}>🤖</div>
            <p>{t('ai.empty', { defaultValue: 'ابدأ بسؤالك الأول!' })}</p>
            <div className="ai-suggestions">
              {[
                t('ai.s1', { defaultValue: 'ما هي قواعد الأولوية في التقاطعات؟' }),
                t('ai.s2', { defaultValue: 'ما هي المسافة الكافية للتوقف؟' }),
                t('ai.s3', { defaultValue: 'متى يجب استخدام الأضواء الكاملة؟' }),
              ].map((s, i) => (
                <button key={i} className="ai-suggestion" onClick={() => setInput(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role} ${m.error ? 'is-error' : ''}`}>
            <div className="ai-bubble">{m.content}</div>
          </div>
        ))}

        {loading && (
          <div className="ai-msg assistant">
            <div className="ai-bubble ai-typing">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form className="ai-input-row" onSubmit={send}>
        <input
          className="form-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={t('ai.placeholder', { defaultValue: 'اكتب سؤالك هنا...' })}
          disabled={loading}
          dir="rtl"
        />
        <button className="btn btn-primary" type="submit" disabled={loading || !input.trim()}>
          {t('ai.send', { defaultValue: 'إرسال' })}
        </button>
      </form>

      <style>{`
        .ai-tutor { display: flex; flex-direction: column; height: calc(100vh - 120px); max-width: 760px; margin: 0 auto; }
        .ai-header { margin-bottom: 1rem; }
        .ai-messages { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: .75rem; padding: .5rem 0; }
        .ai-empty { text-align: center; margin: auto; color: var(--muted); }
        .ai-suggestions { display: flex; flex-direction: column; gap: .5rem; margin-top: 1rem; align-items: center; }
        .ai-suggestion { background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: .4rem 1rem; cursor: pointer; font-size: .9rem; color: inherit; transition: border-color .15s; }
        .ai-suggestion:hover { border-color: var(--primary); }
        .ai-msg { display: flex; }
        .ai-msg.user     { justify-content: flex-start; }
        .ai-msg.assistant { justify-content: flex-end; }
        .ai-bubble { max-width: 80%; padding: .75rem 1rem; border-radius: 16px; white-space: pre-wrap; line-height: 1.6; }
        .ai-msg.user     .ai-bubble { background: var(--primary); color: #fff; border-radius: 16px 16px 16px 4px; }
        .ai-msg.assistant .ai-bubble { background: var(--surface); border: 1px solid var(--border); border-radius: 16px 16px 4px 16px; }
        .ai-msg.is-error .ai-bubble { background: rgba(239,68,68,.1); border-color: var(--danger); }
        .ai-typing { display: flex; gap: 4px; align-items: center; padding: .75rem 1rem; }
        .ai-typing span { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); animation: bounce .6s ease infinite; }
        .ai-typing span:nth-child(2) { animation-delay: .15s; }
        .ai-typing span:nth-child(3) { animation-delay: .3s; }
        @keyframes bounce { 0%,80%,100%{transform:scale(1)} 40%{transform:scale(1.3)} }
        .ai-input-row { display: flex; gap: .5rem; padding-top: .75rem; border-top: 1px solid var(--border); margin-top: .5rem; }
        .ai-input-row .form-input { flex: 1; }
      `}</style>
    </div>
  )
}
