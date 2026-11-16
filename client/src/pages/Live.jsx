/**
 * Live session page — real-time quiz with instructor
 * Uses socket.io-client
 */
import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStore } from '../context/store.js'
import { io } from 'socket.io-client'
import Spinner from '../components/ui/Spinner.jsx'

export default function Live() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const user = useStore(s => s.user)

  const [state, setState]  = useState('connecting')   // connecting | waiting | question | results | ended
  const [session, setSession] = useState(null)
  const [question, setQuestion] = useState(null)
  const [selected, setSelected] = useState(null)
  const [answered, setAnswered] = useState(false)
  const [leaderboard, setLeaderboard] = useState([])
  const [remaining, setRemaining] = useState(0)

  const socketRef = useRef(null)
  const timerRef  = useRef(null)

  useEffect(() => {
    const sock = io('/', { path: '/socket.io', auth: { sessionId: id } })
    socketRef.current = sock

    sock.on('connect', () => setState('waiting'))
    sock.on('connect_error', () => { setState('error') })

    sock.on('session:info', data => {
      setSession(data)
      setState('waiting')
    })

    sock.on('question:start', data => {
      setQuestion(data.question)
      setSelected(null)
      setAnswered(false)
      setState('question')
      setRemaining(data.seconds || 30)
      clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        setRemaining(r => { if (r <= 1) { clearInterval(timerRef.current); return 0 } return r - 1 })
      }, 1000)
    })

    sock.on('question:end', data => {
      clearInterval(timerRef.current)
      if (data.leaderboard) setLeaderboard(data.leaderboard)
      setState('results')
    })

    sock.on('session:end', () => { clearInterval(timerRef.current); setState('ended') })

    return () => { sock.disconnect(); clearInterval(timerRef.current) }
  }, [id])

  function choose(n) {
    if (answered || state !== 'question') return
    setSelected(n)
    setAnswered(true)
    socketRef.current?.emit('answer', { n, timeMs: remaining })
  }

  if (state === 'connecting') return <Spinner full />

  if (state === 'error') return (
    <div style={{ textAlign: 'center', padding: '4rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
      <h2>{t('live.error', { defaultValue: 'تعذر الاتصال بالجلسة' })}</h2>
      <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>{t('nav.dashboard')}</button>
    </div>
  )

  if (state === 'ended') return (
    <div style={{ textAlign: 'center', padding: '4rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏁</div>
      <h2>{t('live.ended', { defaultValue: 'انتهت الجلسة' })}</h2>
      {leaderboard.length > 0 && (
        <div style={{ maxWidth: 400, margin: '1.5rem auto' }}>
          {leaderboard.slice(0, 5).map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '.5rem', background: 'var(--surface)', borderRadius: 'var(--radius)', marginBottom: '.35rem', border: '1px solid var(--border)' }}>
              <span>{i + 1}. {p.name}</span><span>{p.score}</span>
            </div>
          ))}
        </div>
      )}
      <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>{t('nav.dashboard')}</button>
    </div>
  )

  if (state === 'waiting') return (
    <div style={{ textAlign: 'center', padding: '4rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem', animation: 'pulse 1.5s infinite' }}>📡</div>
      <h2>{t('live.waiting', { defaultValue: 'في انتظار بدء الجلسة...' })}</h2>
      {session?.name && <p style={{ color: 'var(--muted)' }}>{session.name}</p>}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  )

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
      {/* Timer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
        <span style={{ color: 'var(--muted)', fontSize: '.9rem' }}>{session?.name}</span>
        <span className={`badge ${remaining <= 5 ? 'badge-error' : remaining <= 10 ? 'badge-warning' : 'badge-outline'}`}>
          ⏱ {remaining}s
        </span>
      </div>

      {/* Question */}
      {question && (
        <div>
          {question.image && (
            <img src={question.image.startsWith('http') ? question.image : `/uploads/${question.image}`} alt=""
              style={{ maxWidth: '100%', borderRadius: 'var(--radius)', marginBottom: '1rem' }} />
          )}
          <p style={{ fontSize: '1.1rem', marginBottom: '1.5rem', textAlign: 'right' }} dir="rtl">{question.text}</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
            {(question.options || []).map((o, i) => {
              const n = i + 1
              const text = typeof o === 'object' ? o.text : o
              const isSel = selected === n
              return (
                <button key={n}
                  className={`live-opt ${isSel ? 'live-opt-selected' : ''}`}
                  disabled={answered}
                  onClick={() => choose(n)}>
                  <span style={{ fontWeight: 700, marginLeft: '.5rem' }}>{n}</span>
                  {text}
                </button>
              )
            })}
          </div>

          {answered && (
            <div className="alert alert-success" style={{ marginTop: '1rem' }}>
              ✓ {t('live.sent', { defaultValue: 'تم إرسال إجابتك' })}
            </div>
          )}
        </div>
      )}

      <style>{`
        .live-opt { width: 100%; padding: 1rem; background: var(--surface); border: 2px solid var(--border); border-radius: var(--radius); cursor: pointer; font-size: 1rem; text-align: right; transition: border-color .15s; }
        .live-opt:hover:not(:disabled) { border-color: var(--primary); }
        .live-opt-selected { border-color: var(--primary); background: var(--primary-soft); }
      `}</style>
    </div>
  )
}
