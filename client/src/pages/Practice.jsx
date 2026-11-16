/**
 * Practice mode — start a practice attempt
 * Mirrors the vanilla practice.js view
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStore } from '../context/store.js'
import { api } from '../lib/api.js'
import { catName } from '../lib/i18n.js'
import Spinner from '../components/ui/Spinner.jsx'

const MODES = ['category', 'series', 'review', 'bookmarks']

export default function Practice() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const getCategories = useStore(s => s.getCategories)
  const lang = i18n.language

  const [cats, setCats]     = useState([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  const [mode, setMode]     = useState('category')
  const [catId, setCatId]   = useState('')
  const [seriesId, setSeriesId] = useState('')
  const [series, setSeries] = useState([])

  useEffect(() => {
    getCategories().then(c => {
      setCats(c || [])
      if (c?.length) setCatId(c[0]._id)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (mode !== 'series') return
    api.get('/series').then(d => setSeries(Array.isArray(d) ? d : d?.series || [])).catch(() => {})
  }, [mode])

  async function start() {
    setStarting(true)
    const body = { practice: true, mode }
    if (mode === 'category') body.category = catId
    if (mode === 'series')   body.series   = seriesId
    try {
      const att = await api.post('/attempts', body)
      navigate(`/quiz/${att.id}`)
    } catch (err) {
      alert(err.data?.error || t('error.generic'))
      setStarting(false)
    }
  }

  if (loading) return <Spinner full />

  return (
    <div className="practice-page">
      <h1>{t('nav.practice')}</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>{t('practice.subtitle', { defaultValue: 'تمرين بدون ضغط الوقت' })}</p>

      {/* Mode selector */}
      <div className="mode-tabs">
        {MODES.map(m => (
          <button key={m} className={`mode-tab ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>
            {t(`mode.${m}`, { defaultValue: m })}
          </button>
        ))}
      </div>

      {/* Options */}
      <div className="practice-opts">
        {mode === 'category' && cats.length > 0 && (
          <div className="form-group">
            <label className="form-label">{t('practice.category', { defaultValue: 'القسم' })}</label>
            <select className="form-input" value={catId} onChange={e => setCatId(e.target.value)}>
              {cats.map(c => <option key={c._id} value={c._id}>{catName(c, lang)}</option>)}
            </select>
          </div>
        )}

        {mode === 'series' && (
          <div className="form-group">
            <label className="form-label">{t('practice.series', { defaultValue: 'السلسلة' })}</label>
            {series.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>{t('practice.noSeries', { defaultValue: 'لا توجد سلاسل متاحة' })}</p>
            ) : (
              <select className="form-input" value={seriesId} onChange={e => setSeriesId(e.target.value)}>
                <option value="">— {t('practice.pickSeries', { defaultValue: 'اختر سلسلة' })} —</option>
                {series.map(s => <option key={s._id} value={s._id}>{s.title || s.titleAr}</option>)}
              </select>
            )}
          </div>
        )}

        {mode === 'review' && (
          <p style={{ color: 'var(--muted)' }}>{t('practice.reviewHint', { defaultValue: 'مراجعة الأسئلة التي أخطأت فيها سابقاً' })}</p>
        )}

        {mode === 'bookmarks' && (
          <p style={{ color: 'var(--muted)' }}>{t('practice.bookmarksHint', { defaultValue: 'الأسئلة المحفوظة' })}</p>
        )}
      </div>

      <button className="btn btn-primary btn-lg" onClick={start} disabled={starting || (mode === 'series' && !seriesId)}>
        {starting ? t('loading') : t('practice.start', { defaultValue: 'ابدأ التمرين' })}
      </button>

      <style>{`
        .practice-page { max-width: 540px; margin: 0 auto; }
        .mode-tabs { display: flex; gap: .5rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
        .mode-tab { padding: .4rem 1rem; border: 1px solid var(--border); border-radius: 999px; background: transparent; cursor: pointer; color: inherit; transition: all .15s; }
        .mode-tab.active, .mode-tab:hover { background: var(--primary); color: #fff; border-color: var(--primary); }
        .practice-opts { margin-bottom: 2rem; min-height: 80px; }
      `}</style>
    </div>
  )
}
