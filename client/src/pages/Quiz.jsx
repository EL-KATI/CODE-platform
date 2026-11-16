/**
 * Quiz / Exam simulator — NARSA-style layout
 * Migrated from vanilla quiz.js → React
 */
import { useEffect, useRef, useCallback, useReducer } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStore } from '../context/store.js'
import { api } from '../lib/api.js'
import Spinner from '../components/ui/Spinner.jsx'

// ── small helpers ─────────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const norm = arr => (arr || []).map(c => (typeof c === 'string' && c.startsWith('opt_') ? Number(c.replace('opt_', '')) : Number(c))).filter(Boolean)
const optText = o => (o && typeof o === 'object') ? (o.text || '') : String(o ?? '')

function modeLabel(a, t) {
  if (a.mode === 'exam') return t('mode.exam')
  if (a.mode === 'series') return a.series_title || a.seriesTitle || t('mode.series')
  if (a.mode === 'category') return t('mode.category')
  if (a.mode === 'review') return t('mode.review')
  if (a.mode === 'bookmarks') return t('mode.bookmarks')
  return a.mode || ''
}

// ── SVG icons ─────────────────────────────────────────────────────────
const IcoCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4.5 12.5l5 5L19.5 7"/>
  </svg>
)
const IcoNext = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 5l-7 7 7 7"/>
  </svg>
)
const IcoVol = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>
  </svg>
)
const IcoMute = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>
  </svg>
)
const IcoHome = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>
  </svg>
)

// ── initial state ─────────────────────────────────────────────────────
const initState = {
  attempt: null,
  idx: 0,
  selected: new Set(),       // for double: { a: Set, b: Set }
  busy: false,
  reading: false,
  remaining: 0,
  finished: false,
  error: '',
  translateCache: {},
  translateResult: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'LOAD':          return { ...state, attempt: action.attempt, idx: action.idx, selected: new Set() }
    case 'SET_IDX':       return { ...state, idx: action.idx, selected: new Set(), translateResult: null }
    case 'SET_SELECTED':  return { ...state, selected: action.selected }
    case 'SET_BUSY':      return { ...state, busy: action.busy }
    case 'SET_READING':   return { ...state, reading: action.reading }
    case 'SET_REMAINING': return { ...state, remaining: action.remaining }
    case 'SET_FINISHED':  return { ...state, finished: action.finished }
    case 'SET_ERROR':     return { ...state, error: action.error }
    case 'ANSWER_Q': {
      const a = { ...state.attempt, questions: state.attempt.questions.map((q, i) => i === state.idx ? { ...q, ...action.patch } : q) }
      return { ...state, attempt: a, busy: false }
    }
    case 'TRANSLATE_RESULT': return { ...state, translateResult: action.text, translateCache: { ...state.translateCache, [action.key]: action.text } }
    default: return state
  }
}

// ── Main component ────────────────────────────────────────────────────
export default function Quiz() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const user = useStore(s => s.user)

  const [state, dispatch] = useReducer(reducer, initState)
  const { attempt: a, idx, selected, busy, reading, remaining, finished, error } = state

  const timerRef   = useRef(null)
  const shownAtRef = useRef(Date.now())
  const audioRef   = useRef(null)
  const busyRef    = useRef(false)

  busyRef.current = busy

  // ── Load attempt ──────────────────────────────────────────────────
  useEffect(() => {
    api.get(`/attempts/${id}`)
      .then(att => {
        if (att.finishedAt) { navigate(`/results/${att.id}`, { replace: true }); return }
        const startIdx = Math.max(0, att.questions.findIndex(q => !q.answer))
        const finalIdx = att.questions.every(q => q.answer) ? att.questions.length - 1 : startIdx
        dispatch({ type: 'LOAD', attempt: att, idx: finalIdx })
      })
      .catch(() => navigate('/dashboard', { replace: true }))
  }, [id])

  const q = a?.questions[idx]
  const exam = a && !a.practice
  const isDouble = q?.is_double && Array.isArray(q?.sub_questions) && q?.sub_questions.length === 2

  // ── Timer ─────────────────────────────────────────────────────────
  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  const startTimer = useCallback((from) => {
    stopTimer()
    const total = a?.secondsPerQuestion || 30
    let rem = from ?? total
    dispatch({ type: 'SET_REMAINING', remaining: rem })
    timerRef.current = setInterval(() => {
      rem--
      dispatch({ type: 'SET_REMAINING', remaining: rem })
      if (rem <= 0) { stopTimer(); validateAnswer({ timeout: true }) }
    }, 1000)
  }, [a, stopTimer])

  // ── Audio ─────────────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 }
    window.speechSynthesis?.cancel?.()
  }, [])

  // ── Validate ──────────────────────────────────────────────────────
  const validateAnswer = useCallback(async ({ timeout = false, reveal = false } = {}) => {
    if (!q || busyRef.current) return
    if (q.answer) return
    const hasAnswer = isDouble
      ? ((selected.a?.size || 0) > 0 || (selected.b?.size || 0) > 0)
      : selected.size > 0
    if (!hasAnswer && !timeout && !reveal && !exam) return

    dispatch({ type: 'SET_BUSY', busy: true })
    stopTimer()
    stopAudio()

    try {
      const payload = isDouble
        ? { questionId: q.id, selected: [], selected_double: { a: [...(selected.a || [])], b: [...(selected.b || [])] }, timeMs: Date.now() - shownAtRef.current }
        : { questionId: q.id, selected: [...selected], timeMs: Date.now() - shownAtRef.current }

      const res = await api.post(`/attempts/${a.id}/answers`, payload)

      const patch = isDouble
        ? { answer: { selected: [], selected_double: { a: [...(selected.a || [])], b: [...(selected.b || [])] }, isCorrect: res.isCorrect }, correct: res.correct, explanation: res.explanation }
        : { answer: { selected: [...selected], isCorrect: res.isCorrect }, correct: res.correct, explanation: res.explanation }

      if (isDouble && Array.isArray(res.subCorrect)) {
        patch.sub_questions = q.sub_questions.map((sq, i) => ({ ...sq, correct: res.subCorrect[i] }))
      }

      dispatch({ type: 'ANSWER_Q', patch })
    } catch (err) {
      if (err.code === 'already_answered' || err.code === 'attempt_finished') {
        navigate(`/quiz/${a.id}`, { replace: true })
      }
      dispatch({ type: 'SET_BUSY', busy: false })
    }
  }, [q, a, selected, exam, isDouble, stopTimer, stopAudio])

  // ── Next ──────────────────────────────────────────────────────────
  const next = useCallback(() => {
    if (!a || !q) return
    if (exam && !q.answer) return
    const firstOpen = a.questions.findIndex((x, i) => i > idx && !x.answer)
    if (idx < a.questions.length - 1) {
      dispatch({ type: 'SET_IDX', idx: exam ? (firstOpen === -1 ? idx + 1 : firstOpen) : idx + 1 })
    } else {
      const pending = a.questions.findIndex(x => !x.answer)
      if (pending !== -1 && !exam) dispatch({ type: 'SET_IDX', idx: pending })
      else finishAttempt()
    }
  }, [a, q, idx, exam])

  const finishAttempt = useCallback(async () => {
    if (finished || !a) return
    dispatch({ type: 'SET_FINISHED', finished: true })
    stopTimer()
    try {
      await api.post(`/attempts/${a.id}/finish`)
      navigate(`/results/${a.id}`, { replace: true })
    } catch {
      dispatch({ type: 'SET_FINISHED', finished: false })
    }
  }, [a, finished, stopTimer, navigate])

  // ── Go to index ───────────────────────────────────────────────────
  const goTo = useCallback((i) => {
    if (!a || i < 0 || i >= a.questions.length) return
    if (exam && i < idx) return
    if (exam && i !== idx && !q?.answer) return
    stopTimer()
    stopAudio()
    dispatch({ type: 'SET_IDX', idx: i })
  }, [a, idx, q, exam, stopTimer, stopAudio])

  // ── Toggle choice ─────────────────────────────────────────────────
  const toggle = useCallback((n, prefix) => {
    if (!q || q.answer) return
    if (prefix) {
      const newSel = { a: new Set(selected.a || []), b: new Set(selected.b || []) }
      const set = newSel[prefix]
      if (set.has(n)) set.delete(n); else set.add(n)
      dispatch({ type: 'SET_SELECTED', selected: newSel })
    } else {
      const ns = new Set(selected)
      if (ns.has(n)) ns.delete(n); else ns.add(n)
      dispatch({ type: 'SET_SELECTED', selected: ns })
    }
  }, [q, selected])

  // ── Keyboard handler ──────────────────────────────────────────────
  useEffect(() => {
    const onKey = e => {
      if (e.target.closest('input, textarea, select')) return
      if (/^[1-4]$/.test(e.key)) { e.preventDefault(); toggle(Number(e.key)) }
      else if (e.key === 'Enter') { e.preventDefault(); q?.answer ? next() : validateAnswer() }
      else if (!exam && e.key === 'ArrowRight') goTo(idx + 1)
      else if (!exam && e.key === 'ArrowLeft')  goTo(idx - 1)
    }
    const onUnload = e => { if (exam && !finished) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onUnload)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onUnload) }
  }, [toggle, next, validateAnswer, goTo, q, exam, finished, idx])

  // ── Start timer when question changes ─────────────────────────────
  useEffect(() => {
    if (!a || !q) return
    shownAtRef.current = Date.now()
    if (exam && !q.answer) startTimer()
    return () => stopTimer()
  }, [idx, a])

  // ── Close / lock scroll ───────────────────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // ── Translate ─────────────────────────────────────────────────────
  const handleTranslate = async (tgt, text) => {
    const key = `${tgt}:${text}`
    if (state.translateCache[key]) {
      dispatch({ type: 'TRANSLATE_RESULT', key, text: state.translateCache[key] })
      return
    }
    try {
      const data = await api.post('/translate', { text, target: tgt })
      if (data?.translated) dispatch({ type: 'TRANSLATE_RESULT', key, text: data.translated })
    } catch {}
  }

  // ── Loading / error ───────────────────────────────────────────────
  if (error) return <div className="alert alert-error" style={{ margin: '2rem' }}>{error}</div>
  if (!a || !q) return <div className="nrs-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>

  // ── Computed display values ───────────────────────────────────────
  const ans = q.answer
  const reveal = !exam && !!ans
  const answered = a.questions.filter(x => x.answer).length
  const pct = Math.round(((idx + 1) / a.questions.length) * 100)

  const getState = (n, pref) => {
    if (!reveal) return pref ? (selected[pref]?.has(n) ? 'sub-on' : '') : (selected.has(n) ? 'sub-on' : '')
    if (pref) {
      const sq = q.sub_questions[pref === 'a' ? 0 : 1]
      const corr = new Set(norm(sq?.correct))
      const on = selected[pref]?.has(n)
      return corr.has(n) ? 'sub-ok' : on ? 'sub-wrong' : ''
    }
    const corr = new Set(norm(q.correct))
    const on = selected.has(n)
    return corr.has(n) ? 'sub-ok' : on ? 'sub-wrong' : ''
  }

  const options = isDouble ? [] : (q.options || [])
  const mainText = isDouble ? (String(q.text || '').split('\n')[0].trim()) : q.text

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="nrs-overlay" role="dialog" aria-modal="true">
      <div className="nrs-window">

        {/* ── Top bar (mobile/tablet) ── */}
        <header className="nrs-topbar">
          <button className="nrs-tb-btn" type="button" aria-label={t('quiz.close')}
            onClick={() => navigate(exam ? '/exam' : '/practice')}><IcoHome /></button>

          <div className="nrs-tb-pills">
            {exam && (
              <span className={`nrs-tb-pill nrs-tb-timer ${remaining <= 5 ? 'timer-low' : remaining <= 10 ? 'timer-warn' : ''}`}>
                {remaining}<small>s</small>
              </span>
            )}
            <span className="nrs-tb-pill nrs-tb-title">{modeLabel(a, t)}</span>
            <span className="nrs-tb-pill nrs-tb-count">{idx + 1}/{a.questions.length}</span>
          </div>

          <button className="nrs-tb-btn" type="button" aria-label={t('quiz.readAloud')}
            aria-pressed={reading} onClick={() => dispatch({ type: 'SET_READING', reading: !reading })}>
            {reading ? <IcoVol /> : <IcoMute />}
          </button>

          <div className="nrs-tb-progress" aria-hidden="true">
            <i style={{ width: `${pct}%` }} />
          </div>
        </header>

        {/* ── Content row ── */}
        <div className="nrs-content-row">

          {/* ── Sidebar (left) ── */}
          <aside className="nrs-side">
            <div className="nrs-ctrl-col">

              {/* Stop / Reveal btn */}
              <button className="nrs-btn-stop" type="button"
                disabled={!exam && !!ans}
                onClick={async () => {
                  if (exam) {
                    const left = a.questions.length - answered
                    if (left > 0 && !window.confirm(t('quiz.confirmFinish', { n: left }))) return
                    finishAttempt()
                  } else {
                    if (!q.answer) validateAnswer({ reveal: true })
                  }
                }}>
                {exam ? t('quiz.stop', { defaultValue: 'إيقاف' }) : t('quiz.correct', { defaultValue: 'تصحيح' })}
              </button>

              {/* Indicators */}
              <div className="nrs-indicators" aria-hidden="true">
                {[1, 2, 3, 4].map(n => {
                  const pref = isDouble ? (n <= 2 ? 'a' : 'b') : null
                  const local = isDouble ? (n <= 2 ? n : n - 2) : n
                  const on = isDouble ? (selected[pref]?.has(local)) : selected.has(n)
                  let corr = false
                  if (reveal && isDouble) {
                    const sq = q.sub_questions[pref === 'a' ? 0 : 1]
                    corr = new Set(norm(sq?.correct)).has(local)
                  } else if (reveal) {
                    corr = new Set(norm(q.correct)).has(n)
                  }
                  let cls = 'nrs-ind'
                  if (on) cls += ' nrs-ind-on'
                  if (reveal && corr) cls += ' nrs-ind-ok'
                  else if (reveal && on && !corr) cls += ' nrs-ind-wrong'
                  return <span key={n} className={cls}>{(on || (reveal && corr)) ? n : ''}</span>
                })}
              </div>

              {/* Choice buttons panel */}
              <div className="nrs-panel">
                <button className="nrs-btn-correct" type="button" disabled={!!ans}
                  onClick={() => {
                    if (ans) return
                    dispatch({ type: 'SET_SELECTED', selected: isDouble ? { a: new Set(), b: new Set() } : new Set() })
                  }}>
                  تصحيح ✕
                </button>

                <div className="nrs-choices">
                  {isDouble ? (
                    [
                      { n: 1, pref: 'a', local: 1 },
                      { n: 2, pref: 'a', local: 2 },
                      { n: 3, pref: 'b', local: 1 },
                      { n: 4, pref: 'b', local: 2 },
                    ].map(({ n, pref, local }) => {
                      const pressed = selected[pref]?.has(local)
                      const sq = q.sub_questions[pref === 'a' ? 0 : 1]
                      const corr = new Set(norm(sq?.correct))
                      let cls = 'nrs-choice-btn'
                      if (n === 3) cls += ' nrs-choice-sep'
                      if (ans) {
                        if (corr.has(local)) cls += ' choice-correct'
                        else if (pressed) cls += ' choice-wrong'
                      } else if (pressed) cls += ' choice-on'
                      return (
                        <button key={n} className={cls} disabled={!!ans}
                          onClick={() => toggle(local, pref)}>
                          <span className="nrs-choice-num">{n}</span>
                          <span className="nrs-choice-sq" />
                        </button>
                      )
                    })
                  ) : (
                    Array.from({ length: 4 }, (_, i) => {
                      const n = i + 1
                      const hasOpt = n <= optOptions(q)
                      const pressed = selected.has(n)
                      const corr = new Set(norm(q.correct))
                      let cls = 'nrs-choice-btn'
                      if (!hasOpt) cls += ' choice-inactive'
                      else if (ans) {
                        if (corr.has(n)) cls += ' choice-correct'
                        else if (pressed) cls += ' choice-wrong'
                      } else if (pressed) cls += ' choice-on'
                      return (
                        <button key={n} className={cls} disabled={!!ans || !hasOpt}
                          onClick={() => toggle(n)}>
                          <span className="nrs-choice-num">{n}</span>
                          <span className="nrs-choice-sq" />
                        </button>
                      )
                    })
                  )}
                </div>

                {/* OK / Next button */}
                <button className={`nrs-btn-ok ${ans ? 'is-next' : ''}`} type="button"
                  onClick={() => ans ? next() : validateAnswer()}>
                  <span className="ok-ic" aria-hidden="true">{ans ? <IcoNext /> : <IcoCheck />}</span>
                  <span className="ok-lbl">
                    {ans ? (idx < a.questions.length - 1 ? 'التالي' : 'النتائج') : 'موافق'}
                  </span>
                </button>
              </div>

            </div>

            {/* Info box */}
            <div className="nrs-info-box">
              <div className="nrs-info-school">{user?.school_name || user?.name || ''}</div>
              <div className="nrs-info-cat">{a.licenseCategory || user?.license_cat || 'B'}</div>
              <div className="nrs-info-num">#{q.id || (idx + 1)}</div>
            </div>

            {/* Close button */}
            <button className="nrs-btn-close" type="button" title={t('quiz.close')}
              onClick={() => navigate(exam ? '/exam' : '/practice')}>✕</button>
          </aside>

          {/* ── Main area ── */}
          <div className="nrs-main">
            {/* Media */}
            <div className="nrs-media">
              <MediaArea q={q} />
            </div>

            {/* Text panel */}
            <div className={`nrs-text-panel ${reveal ? 'has-result' : ''}`}>
              {/* Main question text */}
              {mainText && (
                <div className="nrs-q-main" dir="rtl">{mainText}</div>
              )}

              <div className="nrs-block" dir="rtl">
                {isDouble ? (
                  q.sub_questions.map((sq, si) => {
                    const corr = new Set(norm(sq.correct))
                    const labels = (sq.options || []).map(optText)
                    const inline = labels.every(l => l.length <= 14)
                    const pref = si === 0 ? 'a' : 'b'
                    return (
                      <div key={si}>
                        <div className="nrs-sub-label" dir="rtl">{sq.text}</div>
                        <div className={inline ? 'nrs-opts-row' : 'nrs-opts-list'}>
                          {labels.map((lbl, i) => {
                            const n = i + 1 + si * 2
                            const st = getState(i + 1, pref)
                            return <OptRow key={n} n={n} text={lbl} state={st} />
                          })}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="nrs-opts-list">
                    {optOptions_arr(q).map((o, i) => (
                      <OptRow key={i} n={i + 1} text={optText(o)} state={getState(i + 1)} />
                    ))}
                  </div>
                )}

                {/* Feedback */}
                {reveal && (
                  <Feedback
                    isCorrect={ans.isCorrect}
                    correct={isDouble
                      ? q.sub_questions.flatMap((sq, si) => norm(sq.correct).map(n => n + si * 2))
                      : [...new Set(norm(q.correct))]}
                    explanation={q.explanation}
                  />
                )}
              </div>

              {/* Translate bar */}
              {mainText && mainText.trim().length >= 5 && (
                <TranslateBar text={mainText} onTranslate={handleTranslate} result={state.translateResult} />
              )}
            </div>
          </div>

        </div>

        {/* ── Footer ── */}
        <footer className="nrs-footer">
          <div className="nrs-footer-item">
            <span className="nrs-footer-label">صنف التكوين</span>
            <span className="nrs-footer-val">{a.licenseCategory || user?.license_cat || 'B'}</span>
          </div>
          <div className="nrs-footer-item nrs-vol">
            <span className="nrs-footer-label">Volume</span>
            <div className="nrs-vol-dots">
              {[0, 1, 2].map(v => (
                <button key={v} className={`nrs-vol-dot ${v === 2 ? 'on' : ''}`}>{v === 2 ? '●' : '○'}</button>
              ))}
            </div>
          </div>
          <div className="nrs-footer-item">
            <span className="nrs-footer-label">سؤال</span>
            <span className="nrs-footer-val">{idx + 1}/{a.questions.length}</span>
          </div>
          {exam && (
            <div className="nrs-footer-item nrs-timer-wrap">
              <span className="nrs-footer-label">الوقت المتبقي</span>
              <span className={`nrs-footer-val nrs-timer-val ${remaining <= 5 ? 'timer-low' : remaining <= 10 ? 'timer-warn' : ''}`}>
                {remaining}
              </span>
            </div>
          )}
        </footer>

      </div>
    </div>
  )
}

// ── Helper to get option count ────────────────────────────────────────
function optOptions(q)     { return (q?.options || []).length }
function optOptions_arr(q) { return q?.options || [] }

// ── Option row ────────────────────────────────────────────────────────
function OptRow({ n, text, state }) {
  return (
    <div className={`nrs-opt ${state || ''}`}>
      <span className="nrs-opt-n">{n}</span>
      <div className="nrs-opt-dots" aria-hidden="true" />
      <span className="nrs-opt-text">{text}</span>
    </div>
  )
}

// ── Feedback row ──────────────────────────────────────────────────────
function Feedback({ isCorrect, correct, explanation }) {
  const nums = [...new Set(correct)].sort((a, b) => a - b).join('، ')
  return (
    <>
      <div className={`nrs-fb ${isCorrect ? 'is-ok' : 'is-ko'}`}>
        {isCorrect ? '✓ إجابة صحيحة' : `✗ إجابة خاطئة${nums ? ` — الجواب الصحيح: ${nums}` : ''}`}
      </div>
      {explanation && <div className="nrs-fb-text">{explanation}</div>}
    </>
  )
}

// ── Media area ────────────────────────────────────────────────────────
function MediaArea({ q }) {
  if (q.video) {
    if (q.video.startsWith('https://www.youtube-nocookie.com/embed/')) {
      return (
        <div className="scene" style={{ margin: 0, aspectRatio: '16/9' }}>
          <iframe src={q.video} title="video" style={{ width: '100%', height: '100%', border: 0 }}
            allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
        </div>
      )
    }
    return (
      <video className="scene" src={q.video} controls preload="metadata" playsInline
        style={{ width: '100%', maxHeight: 380, background: '#000' }} />
    )
  }
  if (q.image) {
    return (
      <div className="nrs-img-wrap">
        <img src={q.image.startsWith('http') ? q.image : `/uploads/${q.image}`} alt="" loading="lazy" />
      </div>
    )
  }
  return <div className="nrs-no-media"><span>🚗</span></div>
}

// ── Translate bar ─────────────────────────────────────────────────────
function TranslateBar({ text, onTranslate, result }) {
  const { t } = useTranslation()
  const [active, setActive] = useReducer((_, v) => v, null)

  const click = async (tgt) => {
    if (active === tgt) { setActive(null); return }
    setActive(tgt)
    await onTranslate(tgt, text)
  }

  return (
    <div className="translate-bar">
      <span style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.55)', flex: 1 }}>{t('translate.btn', { defaultValue: 'ترجمة' })}: </span>
      <button className={`translate-btn ${active === 'fr' ? 'active' : ''}`} onClick={() => click('fr')}>🇫🇷 {t('translate.fr', { defaultValue: 'الفرنسية' })}</button>
      <button className={`translate-btn ${active === 'darija' ? 'active' : ''}`} onClick={() => click('darija')}>🇲🇦 {t('translate.darija', { defaultValue: 'الدارجة' })}</button>
      {active && result && <div className="translate-result">{result}</div>}
    </div>
  )
}
