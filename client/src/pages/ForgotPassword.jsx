import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api.js'

export default function ForgotPassword() {
  const { t } = useTranslation()
  const [phone, setPhone]   = useState('')
  const [sent, setSent]     = useState(false)
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/forgot', { phone })
      setSent(true)
    } catch (err) {
      setError(err.data?.error || t('error.generic'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">{t('auth.forgot')}</h1>

        {sent ? (
          <div>
            <div className="alert alert-success">{t('auth.forgotSent')}</div>
            <div className="auth-links"><Link to="/login">{t('auth.login')}</Link></div>
          </div>
        ) : (
          <>
            {error && <div className="alert alert-error">{error}</div>}
            <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>{t('auth.forgotHint')}</p>
            <form onSubmit={submit}>
              <div className="form-group">
                <label className="form-label">{t('auth.phone')}</label>
                <input className="form-input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} required autoFocus />
              </div>
              <button className="btn btn-primary btn-block" disabled={loading}>
                {loading ? t('loading') : t('auth.send')}
              </button>
            </form>
            <div className="auth-links"><Link to="/login">{t('auth.login')}</Link></div>
          </>
        )}
      </div>
    </div>
  )
}
