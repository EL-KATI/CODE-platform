import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStore } from '../context/store.js'
import { api } from '../lib/api.js'
import { catName } from '../lib/i18n.js'
import Spinner from '../components/ui/Spinner.jsx'

export default function Lessons() {
  const { t, i18n } = useTranslation()
  const getCategories = useStore(s => s.getCategories)
  const lang = i18n.language

  const [cats, setCats]       = useState([])
  const [selected, setSelected] = useState(null)
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingL, setLoadingL] = useState(false)

  useEffect(() => {
    getCategories().then(c => {
      setCats(c || [])
      if (c?.length) setSelected(c[0]._id)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selected) return
    setLoadingL(true)
    api.get(`/lessons?category=${selected}`)
      .then(d => setLessons(Array.isArray(d) ? d : d?.lessons || []))
      .catch(() => setLessons([]))
      .finally(() => setLoadingL(false))
  }, [selected])

  if (loading) return <Spinner full />

  return (
    <div className="lessons-page">
      <h1>{t('nav.lessons')}</h1>

      {/* Category tabs */}
      <div className="cat-tabs">
        {cats.map(c => (
          <button
            key={c._id}
            className={`cat-tab ${selected === c._id ? 'active' : ''}`}
            onClick={() => setSelected(c._id)}
          >
            {catName(c, lang)}
          </button>
        ))}
      </div>

      {/* Lessons grid */}
      {loadingL ? <Spinner /> : (
        <div className="lessons-grid">
          {lessons.length === 0 && (
            <p style={{ color: 'var(--muted)' }}>{t('lessons.empty', { defaultValue: 'لا توجد دروس في هذا القسم' })}</p>
          )}
          {lessons.map(l => (
            <Link key={l._id} to={`/lessons/${l._id}`} className="lesson-card">
              {l.thumbnail && (
                <div className="lesson-thumb">
                  <img src={`/uploads/${l.thumbnail}`} alt="" loading="lazy" />
                </div>
              )}
              <div className="lesson-body">
                <h3 className="lesson-title">{lang === 'ar' ? l.titleAr : l.titleFr}</h3>
                {l.description && <p className="lesson-desc">{lang === 'ar' ? l.descriptionAr : l.descriptionFr}</p>}
                <div className="lesson-meta">
                  {l.duration && <span>⏱ {l.duration} {t('lessons.min', { defaultValue: 'د' })}</span>}
                  <span className={`badge badge-${l.level === 'easy' ? 'success' : l.level === 'hard' ? 'error' : 'warning'}`}>
                    {t(`level.${l.level}`, { defaultValue: l.level })}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <style>{`
        .lessons-page h1 { margin-bottom: 1.5rem; }
        .cat-tabs { display: flex; gap: .5rem; flex-wrap: wrap; margin-bottom: 1.5rem; padding-bottom: .75rem; border-bottom: 1px solid var(--border); }
        .cat-tab { padding: .4rem 1rem; border: 1px solid var(--border); border-radius: 999px; background: transparent; cursor: pointer; font-size: .9rem; color: inherit; transition: all .15s; }
        .cat-tab.active, .cat-tab:hover { background: var(--primary); color: #fff; border-color: var(--primary); }
        .lessons-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }
        .lesson-card { text-decoration: none; color: inherit; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; transition: border-color .15s, transform .1s; }
        .lesson-card:hover { border-color: var(--primary); transform: translateY(-2px); }
        .lesson-thumb img { width: 100%; height: 160px; object-fit: cover; }
        .lesson-body { padding: 1rem; }
        .lesson-title { font-size: 1rem; font-weight: 600; margin-bottom: .35rem; }
        .lesson-desc { font-size: .85rem; color: var(--muted); margin-bottom: .75rem; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .lesson-meta { display: flex; gap: .5rem; align-items: center; font-size: .8rem; color: var(--muted); }
      `}</style>
    </div>
  )
}
