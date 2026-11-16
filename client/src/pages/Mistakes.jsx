import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api.js'
import Spinner from '../components/ui/Spinner.jsx'

export default function Mistakes() {
  const { t } = useTranslation()
  const [questions, setQuestions] = useState([])
  const [loading, setLoading]     = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    api.get(`/mistakes?page=${page}&limit=20`)
      .then(d => {
        const list = Array.isArray(d) ? d : d?.questions || []
        setQuestions(prev => page === 1 ? list : [...prev, ...list])
        setHasMore(d?.hasMore || false)
      })
      .finally(() => setLoading(false))
  }, [page])

  if (loading && page === 1) return <Spinner full />

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ marginBottom: '.5rem' }}>{t('nav.mistakes')}</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
        {t('mistakes.hint', { defaultValue: 'الأسئلة التي أخطأت فيها — راجعها لتتجنب تكرار الخطأ' })}
      </p>

      {questions.length === 0 && !loading && (
        <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '3rem 0' }}>
          🎉 {t('mistakes.empty', { defaultValue: 'لا توجد أخطاء! أحسنت.' })}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {questions.map((q, i) => <MistakeCard key={q._id || i} q={q} idx={i} />)}
      </div>

      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button className="btn btn-outline" onClick={() => setPage(p => p + 1)} disabled={loading}>
            {loading ? t('loading') : t('mistakes.more', { defaultValue: 'تحميل المزيد' })}
          </button>
        </div>
      )}
    </div>
  )
}

function MistakeCard({ q, idx }) {
  const isDouble = q.is_double && Array.isArray(q.sub_questions) && q.sub_questions.length === 2

  return (
    <div className="review-card rc-ko">
      <div className="review-card-header">
        <span className="q-number">س {idx + 1}</span>
        <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>✗ خطأ</span>
      </div>
      <div className="review-card-body">
        {q.image && (
          <img src={q.image.startsWith('http') ? q.image : `/uploads/${q.image}`} alt=""
            style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 12 }} />
        )}
        <p className="q-text" dir="rtl">{q.text}</p>

        {isDouble ? (
          q.sub_questions.map((sq, si) => (
            <div key={si} className="sub-q-block" style={{ marginBottom: 12 }}>
              <div className="sub-q-label">
                <span className="sub-q-dot">{si === 0 ? 'أ' : 'ب'}</span>
                <span>{sq.text}</span>
              </div>
              <OptionsList opts={sq.options} correct={sq.correct} selected={[]} />
            </div>
          ))
        ) : (
          <OptionsList opts={q.options} correct={q.correct} selected={q.answer?.selected || []} />
        )}

        {q.explanation && (
          <div className="q-explain">
            <span className="q-explain-icon">💡</span>
            <span dir="rtl">{q.explanation}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function OptionsList({ opts, correct, selected }) {
  return (
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
}
