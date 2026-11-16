import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStore } from '../context/store.js'
import { useEffect, useState } from 'react'

export default function Home() {
  const { t } = useTranslation()
  const user = useStore(s => s.user)
  const getSettings = useStore(s => s.getSettings)
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    getSettings().then(setSettings).catch(() => {})
  }, [])

  const n    = settings?.examCount ?? 40
  const pass = settings?.passMark  ?? 35

  const steps = [
    { key: 'home.s1.t', desc: 'home.s1.d', num: '01' },
    { key: 'home.s2.t', desc: 'home.s2.d', num: '02' },
    { key: 'home.s3.t', desc: 'home.s3.d', num: '03' },
    { key: 'home.s4.t', desc: 'home.s4.d', num: '04' },
  ]

  return (
    <div className="home-page">
      {/* Hero */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge">🇲🇦 {t('home.badge', { defaultValue: 'صنف B — المغرب' })}</div>
          <h1 className="hero-title">{t('home.title')}</h1>
          <p className="hero-subtitle">
            {t('home.subtitle', { n, pass })}
          </p>
          <div className="hero-cta">
            {user ? (
              <Link to="/dashboard" className="btn btn-primary btn-lg">{t('nav.dashboard')}</Link>
            ) : (
              <>
                <Link to="/register" className="btn btn-primary btn-lg">{t('home.cta')}</Link>
                <Link to="/lessons"  className="btn btn-outline btn-lg">{t('home.ctaLessons')}</Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="home-section">
        <h2 className="section-title">{t('home.method', { defaultValue: 'كيف نتعلم؟' })}</h2>
        <div className="steps-grid">
          {steps.map((s, i) => (
            <div key={i} className="step-card">
              <div className="step-num">{s.num}</div>
              <h3>{t(s.key)}</h3>
              <p>{t(s.desc)}</p>
            </div>
          ))}
        </div>
      </section>

      <style>{`
        .home-page { max-width: 900px; margin: 0 auto; }
        .hero { text-align: center; padding: 3rem 1rem 2rem; }
        .hero-badge { display: inline-block; background: var(--primary-soft); color: var(--primary); font-weight: 700; padding: .35rem .9rem; border-radius: 999px; font-size: .85rem; margin-bottom: 1rem; }
        .hero-title { font-size: clamp(1.75rem, 4vw, 2.75rem); margin-bottom: .75rem; }
        .hero-subtitle { color: var(--muted); font-size: 1.05rem; max-width: 560px; margin: 0 auto 2rem; }
        .hero-cta { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
        .home-section { margin-top: 3rem; }
        .section-title { text-align: center; margin-bottom: 1.5rem; }
        .steps-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
        .step-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.5rem; }
        .step-num { font-size: 2rem; font-weight: 900; color: var(--primary); margin-bottom: .5rem; opacity: .3; }
        .step-card h3 { margin-bottom: .35rem; }
        .step-card p { color: var(--muted); font-size: .9rem; margin: 0; }
      `}</style>
    </div>
  )
}
