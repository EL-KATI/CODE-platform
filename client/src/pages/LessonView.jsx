import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api.js'
import Spinner from '../components/ui/Spinner.jsx'

export default function LessonView() {
  const { id } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const lang = i18n.language

  const [lesson, setLesson] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  useEffect(() => {
    api.get(`/lessons/${id}`)
      .then(setLesson)
      .catch(err => setError(err.data?.error || t('error.generic')))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <Spinner full />
  if (error)   return <div className="alert alert-error">{error}</div>
  if (!lesson) return null

  const title = lang === 'ar' ? lesson.titleAr : lesson.titleFr
  const body  = lang === 'ar' ? lesson.bodyAr  : lesson.bodyFr

  return (
    <div className="lesson-view">
      <button className="btn btn-ghost back-btn" onClick={() => navigate(-1)}>← {t('back')}</button>

      <article className="lesson-article">
        <h1>{title}</h1>

        {lesson.videoUrl && (
          <div className="lesson-video">
            <video controls src={lesson.videoUrl} style={{ width: '100%', borderRadius: 'var(--radius)' }} />
          </div>
        )}

        {lesson.images?.length > 0 && (
          <div className="lesson-images">
            {lesson.images.map((img, i) => (
              <img key={i} src={`/uploads/${img}`} alt="" loading="lazy" />
            ))}
          </div>
        )}

        {body && (
          <div
            className="lesson-content"
            dangerouslySetInnerHTML={{ __html: body }}
          />
        )}
      </article>

      <style>{`
        .lesson-view { max-width: 760px; margin: 0 auto; }
        .back-btn { margin-bottom: 1.5rem; }
        .lesson-article h1 { margin-bottom: 1.5rem; }
        .lesson-video { margin-bottom: 1.5rem; }
        .lesson-images { display: flex; flex-wrap: wrap; gap: .75rem; margin-bottom: 1.5rem; }
        .lesson-images img { max-width: 100%; border-radius: var(--radius); border: 1px solid var(--border); }
        .lesson-content { line-height: 1.8; }
        .lesson-content img { max-width: 100%; border-radius: var(--radius); }
        .lesson-content table { border-collapse: collapse; width: 100%; }
        .lesson-content td, .lesson-content th { border: 1px solid var(--border); padding: .5rem .75rem; }
      `}</style>
    </div>
  )
}
