import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStore } from '../context/store.js'
import { api } from '../lib/api.js'
import Spinner from '../components/ui/Spinner.jsx'

export default function Dashboard() {
  const { t, i18n } = useTranslation()
  const user     = useStore(s => s.user)
  const isStaff  = useStore(s => s.isStaff)
  const lang     = i18n.language

  const [stats, setStats]   = useState(null)
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/students/stats').catch(() => null),
      api.get('/results?limit=5').catch(() => []),
    ]).then(([s, r]) => {
      setStats(s)
      setRecent(Array.isArray(r) ? r : r?.results || [])
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner full />

  const pct = stats ? Math.round((stats.totalCorrect / (stats.totalAnswered || 1)) * 100) : 0
  const passedExams = stats?.examsPassed ?? 0

  return (
    <div className="dashboard-page">
      <div className="dash-welcome">
        <h1>{t('dash.hello', { name: user?.name?.split(' ')[0] || '' })}</h1>
        <p style={{ color: 'var(--muted)' }}>{t('dash.subtitle')}</p>
      </div>

      {/* Quick actions */}
      <div className="dash-actions">
        <Link to="/quiz" className="dash-action-card primary">
          <span className="dash-icon">🎯</span>
          <span>{t('nav.quiz')}</span>
        </Link>
        <Link to="/practice" className="dash-action-card">
          <span className="dash-icon">📝</span>
          <span>{t('nav.practice')}</span>
        </Link>
        <Link to="/lessons" className="dash-action-card">
          <span className="dash-icon">📚</span>
          <span>{t('nav.lessons')}</span>
        </Link>
        <Link to="/mistakes" className="dash-action-card">
          <span className="dash-icon">🔁</span>
          <span>{t('nav.mistakes')}</span>
        </Link>
      </div>

      {/* Stats */}
      {stats && (
        <div className="dash-stats">
          <div className="stat-card">
            <div className="stat-val">{stats.totalAnswered ?? 0}</div>
            <div className="stat-lbl">{t('dash.answered')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{pct}%</div>
            <div className="stat-lbl">{t('dash.accuracy')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{passedExams}</div>
            <div className="stat-lbl">{t('dash.passed')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{stats.streak ?? 0}</div>
            <div className="stat-lbl">{t('dash.streak')}</div>
          </div>
        </div>
      )}

      {/* Recent results */}
      {recent.length > 0 && (
        <div className="dash-recent">
          <h2>{t('dash.recent')}</h2>
          <div className="results-list">
            {recent.map(r => (
              <Link key={r._id} to={`/results/${r._id}`} className="result-row">
                <div className="result-info">
                  <span className="result-type">{r.type === 'exam' ? t('quiz.exam') : t('quiz.practice')}</span>
                  <span className="result-date">{new Date(r.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-MA' : 'fr-MA')}</span>
                </div>
                <div className="result-score">
                  <span className={r.passed ? 'badge badge-success' : 'badge badge-error'}>
                    {r.score}/{r.total}
                  </span>
                </div>
              </Link>
            ))}
          </div>
          <Link to="/results/all" className="link-more">{t('dash.seeAll')}</Link>
        </div>
      )}

      <style>{`
        .dashboard-page { max-width: 760px; margin: 0 auto; }
        .dash-welcome { margin-bottom: 2rem; }
        .dash-actions { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: .75rem; margin-bottom: 2rem; }
        .dash-action-card { display: flex; flex-direction: column; align-items: center; gap: .5rem; padding: 1.25rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); text-decoration: none; color: inherit; transition: border-color .15s; }
        .dash-action-card:hover { border-color: var(--primary); }
        .dash-action-card.primary { border-color: var(--primary); background: var(--primary-soft); color: var(--primary); }
        .dash-icon { font-size: 1.75rem; }
        .dash-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: .75rem; margin-bottom: 2rem; }
        @media (max-width: 600px) { .dash-stats { grid-template-columns: repeat(2, 1fr); } }
        .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; text-align: center; }
        .stat-val { font-size: 1.75rem; font-weight: 800; color: var(--primary); }
        .stat-lbl { font-size: .8rem; color: var(--muted); margin-top: .25rem; }
        .dash-recent h2 { margin-bottom: 1rem; }
        .results-list { display: flex; flex-direction: column; gap: .5rem; }
        .result-row { display: flex; justify-content: space-between; align-items: center; padding: .75rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); text-decoration: none; color: inherit; }
        .result-row:hover { border-color: var(--primary); }
        .result-info { display: flex; gap: 1rem; align-items: center; }
        .result-type { font-weight: 600; }
        .result-date { font-size: .85rem; color: var(--muted); }
        .link-more { display: inline-block; margin-top: .75rem; color: var(--primary); font-size: .9rem; }
      `}</style>
    </div>
  )
}
