/**
 * Exams page — start a new official exam simulation
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStore } from '../context/store.js'
import { api } from '../lib/api.js'

export default function Exams() {
  const { t } = useTranslation()
  const navigate  = useNavigate()
  const getSettings = useStore(s => s.getSettings)
  const user = useStore(s => s.user)

  const [loading, setLoading] = useState(false)
  const [settings, setSettings] = useState(null)
  const [loaded, setLoaded] = useState(false)

  if (!loaded) {
    getSettings().then(s => { setSettings(s); setLoaded(true) }).catch(() => setLoaded(true))
  }

  const n    = settings?.examCount ?? 40
  const pass = settings?.passMark  ?? 35
  const sec  = settings?.secondsPerQuestion ?? 30

  async function startExam() {
    setLoading(true)
    try {
      const att = await api.post('/attempts', { mode: 'exam' })
      navigate(`/quiz/${att.id}`)
    } catch (err) {
      alert(err.data?.error || t('error.generic'))
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 540, margin: '0 auto', textAlign: 'center', paddingTop: '2rem' }}>
      <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🏁</div>
      <h1 style={{ marginBottom: '.5rem' }}>{t('quiz.exam')}</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>
        {t('exam.hint', { n, pass, sec })}
      </p>

      <div className="exam-info-grid">
        <InfoCard icon="❓" value={n} label={t('exam.questions', { defaultValue: 'سؤال' })} />
        <InfoCard icon="✅" value={pass} label={t('exam.passScore', { defaultValue: 'للنجاح' })} />
        <InfoCard icon="⏱" value={`${sec}s`} label={t('exam.perQ', { defaultValue: 'لكل سؤال' })} />
      </div>

      <div style={{ marginTop: '2rem', marginBottom: '1.5rem', fontSize: '.9rem', color: 'var(--muted)', textAlign: 'right', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
        <strong>⚠️ {t('exam.rules', { defaultValue: 'قواعد الامتحان:' })}</strong>
        <ul style={{ marginTop: '.5rem', paddingRight: '1.25rem' }}>
          <li>{t('exam.rule1', { defaultValue: 'لا يمكن العودة للأسئلة السابقة' })}</li>
          <li>{t('exam.rule2', { defaultValue: 'ينتهي السؤال تلقائياً عند انتهاء الوقت' })}</li>
          <li>{t('exam.rule3', { defaultValue: 'النتيجة تظهر فور إنهاء الامتحان' })}</li>
        </ul>
      </div>

      <button className="btn btn-primary btn-lg" onClick={startExam} disabled={loading}>
        {loading ? t('loading') : t('exam.start', { defaultValue: 'ابدأ الامتحان' })}
      </button>

      <style>{`
        .exam-info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: .75rem; }
        .exam-info-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.25rem .5rem; }
        .exam-info-icon { font-size: 1.5rem; }
        .exam-info-val  { font-size: 1.75rem; font-weight: 800; color: var(--primary); }
        .exam-info-lbl  { font-size: .78rem; color: var(--muted); }
      `}</style>
    </div>
  )
}

function InfoCard({ icon, value, label }) {
  return (
    <div className="exam-info-card">
      <div className="exam-info-icon">{icon}</div>
      <div className="exam-info-val">{value}</div>
      <div className="exam-info-lbl">{label}</div>
    </div>
  )
}
