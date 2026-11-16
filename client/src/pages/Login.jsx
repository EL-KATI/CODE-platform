import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStore } from '../context/store.js'
import { api } from '../lib/api.js'

export default function Login() {
  const { t } = useTranslation()
  const navigate  = useNavigate()
  const location  = useLocation()
  const loadUser  = useStore(s => s.loadUser)

  const [form, setForm]     = useState({ identifier: '', password: '' })
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const from = location.state?.from?.pathname || '/dashboard'

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/login', form)
      await loadUser()
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.data?.error || t('error.generic'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">{t('auth.login')}</h1>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">{t('auth.identifier')}</label>
            <input
              className="form-input"
              type="text"
              value={form.identifier}
              onChange={e => setForm(f => ({ ...f, identifier: e.target.value }))}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t('auth.password')}</label>
            <input
              className="form-input"
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required
            />
          </div>

          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? t('loading') : t('auth.login')}
          </button>
        </form>

        <div className="auth-links">
          <Link to="/forgot">{t('auth.forgot')}</Link>
        </div>
      </div>
    </div>
  )
}
