import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api.js'
import Spinner from '../components/ui/Spinner.jsx'

export default function Bookings() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [bookings, setBookings] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  useEffect(() => {
    api.get('/bookings')
      .then(d => setBookings(Array.isArray(d) ? d : d?.bookings || []))
      .catch(err => setError(err.data?.error || t('error.generic')))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner full />

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ marginBottom: '1.5rem' }}>{t('nav.bookings')}</h1>

      {error && <div className="alert alert-error">{error}</div>}

      {bookings.length === 0 && !error && (
        <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '3rem 0' }}>
          {t('bookings.empty', { defaultValue: 'لا توجد حجوزات حتى الآن' })}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
        {bookings.map(b => (
          <div key={b._id} className="booking-card">
            <div className="booking-info">
              <div className="booking-type">{b.type || t('bookings.session', { defaultValue: 'جلسة' })}</div>
              <div className="booking-date">
                {new Date(b.date || b.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-MA' : 'fr-MA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
              {b.instructor && <div className="booking-instructor">{b.instructor}</div>}
            </div>
            <span className={`badge ${b.status === 'confirmed' ? 'badge-success' : b.status === 'cancelled' ? 'badge-error' : 'badge-warning'}`}>
              {t(`booking.${b.status}`, { defaultValue: b.status })}
            </span>
          </div>
        ))}
      </div>

      <style>{`
        .booking-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem 1.25rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
        .booking-type { font-weight: 600; margin-bottom: .2rem; }
        .booking-date { font-size: .85rem; color: var(--muted); }
        .booking-instructor { font-size: .8rem; color: var(--muted); margin-top: .15rem; }
      `}</style>
    </div>
  )
}
