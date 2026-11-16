import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api.js'
import Spinner from '../components/ui/Spinner.jsx'

export default function Champion() {
  const { t } = useTranslation()
  const [leaders, setLeaders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/leaderboard').then(d => setLeaders(Array.isArray(d) ? d : d?.leaderboard || [])).finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner full />

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: '4rem', marginBottom: '.5rem' }}>🏆</div>
      <h1 style={{ marginBottom: '.5rem' }}>{t('nav.champion', { defaultValue: 'المتصدرون' })}</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>
        {t('champion.subtitle', { defaultValue: 'أعلى المتعلمين نجاحاً' })}
      </p>

      {leaders.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>{t('champion.empty', { defaultValue: 'لا توجد بيانات بعد' })}</p>
      ) : (
        <div>
          {/* Top 3 podium */}
          {leaders.length >= 3 && (
            <div className="podium">
              <PodiumStep user={leaders[1]} rank={2} />
              <PodiumStep user={leaders[0]} rank={1} />
              <PodiumStep user={leaders[2]} rank={3} />
            </div>
          )}

          {/* Rest */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginTop: '1.5rem' }}>
            {leaders.slice(3).map((u, i) => (
              <div key={u._id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.75rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                <span style={{ color: 'var(--muted)', fontWeight: 700, minWidth: '2rem' }}>#{i + 4}</span>
                <span style={{ flex: 1, textAlign: 'right' }}>{u.name}</span>
                <span className="badge badge-outline">{u.score || u.passedExams || 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .podium { display: flex; align-items: flex-end; justify-content: center; gap: .5rem; padding: 1rem 0; }
        .podium-step { display: flex; flex-direction: column; align-items: center; gap: .4rem; min-width: 100px; }
        .podium-avatar { width: 52px; height: 52px; border-radius: 50%; background: var(--primary); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; font-weight: 700; border: 3px solid transparent; }
        .podium-step[data-rank="1"] .podium-avatar { width: 64px; height: 64px; font-size: 1.6rem; border-color: gold; }
        .podium-step[data-rank="2"] .podium-avatar { border-color: silver; }
        .podium-step[data-rank="3"] .podium-avatar { border-color: #cd7f32; }
        .podium-name { font-size: .8rem; font-weight: 600; }
        .podium-score { font-size: .75rem; color: var(--muted); }
        .podium-bar { width: 100%; background: var(--border); border-radius: 6px 6px 0 0; }
        .podium-step[data-rank="1"] .podium-bar { height: 80px; background: var(--primary); }
        .podium-step[data-rank="2"] .podium-bar { height: 60px; background: rgba(var(--primary-rgb,59,130,246),.5); }
        .podium-step[data-rank="3"] .podium-bar { height: 44px; background: rgba(var(--primary-rgb,59,130,246),.3); }
      `}</style>
    </div>
  )
}

function PodiumStep({ user, rank }) {
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' }
  return (
    <div className="podium-step" data-rank={rank}>
      <div className="podium-avatar">{(user.name || '?')[0].toUpperCase()}</div>
      <div className="podium-name">{medals[rank]} {user.name}</div>
      <div className="podium-score">{user.score || user.passedExams || 0}</div>
      <div className="podium-bar" />
    </div>
  )
}
