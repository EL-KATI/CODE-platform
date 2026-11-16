import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStore } from '../context/store.js'
import { api } from '../lib/api.js'
import Spinner from '../components/ui/Spinner.jsx'

const RING_R = 54
const RING_C = 2 * Math.PI * RING_R

function ScoreRing({ correct, total, passed }) {
  const v = total ? correct / total : 0
  const off = RING_C * (1 - v)
  const pct = Math.round(v * 100)
  return (
    <div className={`rd-ring rd-${passed ? 'pass' : 'fail'} res-ring`} role="img" aria-label={`${correct}/${total}`}>
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <circle className="rd-track" cx="64" cy="64" r={RING_R} />
        <circle className="rd-arc" cx="64" cy="64" r={RING_R}
          strokeDasharray={RING_C.toFixed(1)}
          style={{ strokeDashoffset: off.toFixed(1) }} />
      </svg>
      <div className="rd-ring-label">
        <strong>{correct}<span>/{total}</span></strong>
        <small>{pct}%</small>
      </div>
    </div>
  )
}

function ReviewCard({ q, idx }) {
  const ok = q.answer?.isCorrect === true
  const isDouble = q.is_double && Array.isArray(q.sub_questions) && q.sub_questions.length === 2

  const ReviewOptions = ({ opts, correct, selected }) => (
    <ul className="ans-list">
      {(opts || []).map((o, i) => {
        const n = i + 1
        const isCorr = (correct || []).includes(n)
        const isSel  = (selected || []).includes(n)
        return (
          <li key={n} className={isCorr ? 'ans-c' : isSel && !isCorr ? 'ans-w' : ''}>
            <span className="ans-num">{n}</span>
            <span>{typeof o === 'object' ? o.text : o}</span>
            {isCorr && <span className="ans-mark" style={{ color: 'var(--success)' }}>✓</span>}
            {isSel && !isCorr && <span className="ans-mark" style={{ color: 'var(--danger)' }}>✗</span>}
          </li>
        )
      })}
    </ul>
  )

  return (
    <div className={`review-card ${ok ? 'rc-ok' : 'rc-ko'}`}>
      <div className="review-card-header">
        <span className="q-number">س {idx + 1}</span>
        <span className={ok ? 'review-verdict-ok' : 'review-verdict-ko'}>{ok ? '✓' : '✗'}</span>
      </div>
      <div className="review-card-body">
        {q.image && <img src={q.image.startsWith('http') ? q.image : `/uploads/${q.image}`} alt="" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 12 }} />}
        {isDouble ? (
          <>
            <p className="q-text" dir="rtl">{q.text}</p>
            {q.sub_questions.map((sq, si) => (
              <div key={si} className="sub-q-block" style={{ marginBottom: 12 }}>
                <div className="sub-q-label"><span className="sub-q-dot">{si === 0 ? 'أ' : 'ب'}</span><span>{sq.text}</span></div>
                <ReviewOptions opts={sq.options} correct={sq.correct} selected={q.answer?.selected_double?.[si === 0 ? 'a' : 'b']} />
              </div>
            ))}
          </>
        ) : (
          <>
            <p className="q-text" dir="rtl">{q.text}</p>
            <ReviewOptions opts={q.options} correct={q.correct} selected={q.answer?.selected} />
          </>
        )}
        {q.explanation && (
          <div className="q-explain"><span className="q-explain-icon">💡</span><span dir="rtl">{q.explanation}</span></div>
        )}
      </div>
    </div>
  )
}

export default function Results() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [attempt, setAttempt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showReview, setShowReview] = useState(false)
  const [filter, setFilter]   = useState('all')

  useEffect(() => {
    if (!id || id === 'all') { setLoading(false); return }
    api.get(`/attempts/${id}`)
      .then(setAttempt)
      .catch(() => navigate('/dashboard'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <Spinner full />

  // ── History list ──────────────────────────────────────────────────
  if (id === 'all') return <HistoryList />

  if (!attempt) return null

  const correct = attempt.questions.filter(q => q.answer?.isCorrect).length
  const total   = attempt.questions.length
  const passed  = attempt.passed

  const filtered = showReview
    ? attempt.questions.filter(q => filter === 'all' || (filter === 'wrong' && !q.answer?.isCorrect) || (filter === 'right' && q.answer?.isCorrect))
    : []

  return (
    <div className="results-page">
      {/* Verdict */}
      <div className={`results-verdict ${passed ? 'verdict-pass' : 'verdict-fail'}`}>
        <div className="verdict-emoji">{passed ? '🎉' : '😔'}</div>
        <h1>{passed ? t('results.passed') : t('results.failed')}</h1>
        <ScoreRing correct={correct} total={total} passed={passed} />
        <div className="results-meta">
          {attempt.mode !== 'practice' && (
            <span className="badge badge-outline">{t(`mode.${attempt.mode}`, { defaultValue: attempt.mode })}</span>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="results-stats">
        <div className="res-stat"><div className="res-stat-val">{correct}</div><div className="res-stat-lbl">{t('results.correct')}</div></div>
        <div className="res-stat"><div className="res-stat-val">{total - correct}</div><div className="res-stat-lbl">{t('results.wrong')}</div></div>
        <div className="res-stat"><div className="res-stat-val">{total}</div><div className="res-stat-lbl">{t('results.total')}</div></div>
      </div>

      {/* Actions */}
      <div className="results-actions">
        <button className="btn btn-outline" onClick={() => setShowReview(r => !r)}>
          {showReview ? t('results.hideReview') : t('results.review')}
        </button>
        <Link to="/practice" className="btn btn-primary">{t('results.retry')}</Link>
        <Link to="/dashboard" className="btn btn-ghost">{t('nav.dashboard')}</Link>
      </div>

      {/* Review */}
      {showReview && (
        <div className="review-section">
          <div className="review-filters">
            {['all', 'wrong', 'right'].map(f => (
              <button key={f} className={`btn ${filter === f ? 'btn-primary' : 'btn-outline'} btn-sm`}
                onClick={() => setFilter(f)}>
                {t(`results.filter.${f}`, { defaultValue: f })}
              </button>
            ))}
          </div>
          {filtered.map((q, i) => <ReviewCard key={q._id || i} q={q} idx={i} />)}
        </div>
      )}

      <style>{`
        .results-page { max-width: 760px; margin: 0 auto; }
        .results-verdict { text-align: center; padding: 2rem 1rem; }
        .verdict-emoji { font-size: 3rem; margin-bottom: .5rem; }
        .verdict-pass h1 { color: var(--success); }
        .verdict-fail h1 { color: var(--danger); }
        .results-meta { margin-top: .75rem; display: flex; gap: .5rem; justify-content: center; flex-wrap: wrap; }
        .res-ring { margin: 1rem auto; }
        .rd-ring { position: relative; width: 128px; height: 128px; display: inline-block; }
        .rd-track { fill: none; stroke: var(--border); stroke-width: 10; }
        .rd-arc { fill: none; stroke: var(--primary); stroke-width: 10; stroke-linecap: round; transform: rotate(-90deg); transform-origin: 50% 50%; transition: stroke-dashoffset .6s ease; }
        .rd-pass .rd-arc { stroke: var(--success); }
        .rd-fail .rd-arc { stroke: var(--danger); }
        .rd-ring-label { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .rd-ring-label strong { font-size: 1.5rem; font-weight: 800; }
        .rd-ring-label span { font-size: .9rem; }
        .rd-ring-label small { color: var(--muted); font-size: .8rem; }
        .results-stats { display: flex; justify-content: center; gap: 2rem; margin: 1.5rem 0; flex-wrap: wrap; }
        .res-stat { text-align: center; }
        .res-stat-val { font-size: 2rem; font-weight: 800; color: var(--primary); }
        .res-stat-lbl { font-size: .85rem; color: var(--muted); }
        .results-actions { display: flex; gap: .75rem; justify-content: center; flex-wrap: wrap; margin-bottom: 2rem; }
        .review-filters { display: flex; gap: .5rem; margin-bottom: 1rem; }
        .review-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 1rem; overflow: hidden; }
        .rc-ok { border-left: 4px solid var(--success); }
        .rc-ko { border-left: 4px solid var(--danger); }
        .review-card-header { display: flex; justify-content: space-between; padding: .75rem 1rem; border-bottom: 1px solid var(--border); font-size: .9rem; }
        .review-verdict-ok { color: var(--success); font-weight: 700; }
        .review-verdict-ko { color: var(--danger); font-weight: 700; }
        .review-card-body { padding: 1rem; }
        .q-text { margin-bottom: .75rem; font-size: 1rem; }
        .ans-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .35rem; }
        .ans-list li { display: flex; gap: .5rem; align-items: center; padding: .3rem .5rem; border-radius: 4px; }
        .ans-c { background: rgba(var(--success-rgb,34,197,94),.1); }
        .ans-w { background: rgba(var(--danger-rgb,239,68,68),.1); }
        .ans-num { font-weight: 700; min-width: 1.2rem; color: var(--muted); }
        .ans-mark { margin-right: auto; font-size: 1.1rem; }
        .q-explain { margin-top: .75rem; display: flex; gap: .5rem; padding: .5rem .75rem; background: var(--surface-alt,var(--surface)); border-radius: 6px; font-size: .9rem; color: var(--muted); border: 1px solid var(--border); }
        .q-explain-icon { font-size: 1.1rem; flex-shrink: 0; }
        .sub-q-block { margin-bottom: 12px; }
        .sub-q-label { display: flex; gap: .5rem; margin-bottom: .4rem; font-weight: 600; }
        .sub-q-dot { width: 1.4rem; height: 1.4rem; border-radius: 50%; background: var(--primary); color: #fff; display: flex; align-items: center; justify-content: center; font-size: .8rem; flex-shrink: 0; }
      `}</style>
    </div>
  )
}

function HistoryList() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  useEffect(() => {
    api.get(`/results?page=${page}&limit=20`)
      .then(d => setItems(prev => page === 1 ? (d.results || d) : [...prev, ...(d.results || d)]))
      .finally(() => setLoading(false))
  }, [page])

  if (loading && page === 1) return <Spinner full />

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ marginBottom: '1.5rem' }}>{t('results.history', { defaultValue: 'سجل الامتحانات' })}</h1>
      <div className="results-list">
        {items.map(r => (
          <Link key={r._id} to={`/results/${r._id}`} className="result-row">
            <div className="result-info">
              <span className="result-type">{r.practice ? t('nav.practice') : t('quiz.exam')}</span>
              <span className="result-date">{new Date(r.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-MA' : 'fr-MA')}</span>
            </div>
            <span className={`badge ${r.passed ? 'badge-success' : 'badge-error'}`}>{r.score}/{r.total}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
