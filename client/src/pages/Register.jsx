import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStore } from '../context/store.js'
import { api } from '../lib/api.js'

export default function Register() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loadUser = useStore(s => s.loadUser)

  const [form, setForm]     = useState({ name: '', phone: '', password: '', confirm: '' })
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) { setError(t('auth.mismatch')); return }
    setLoading(true)
    try {
      await api.post('/auth/register', { name: form.name, phone: form.phone, password: form.password })
      await loadUser()
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.data?.error || t('error.generic'))
    } finally {
      setLoading(false)
    }
  }

  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">{t('auth.register')}</h1>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">{t('auth.name')}</label>
            <input className="form-input" type="text" value={form.name} onChange={set('name')} required autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">{t('auth.phone')}</label>
            <input className="form-input" type="tel" value={form.phone} onChange={set('phone')} required />
          </div>
          <div className="form-group">
            <label className="form-label">{t('auth.password')}</label>
            <input className="form-input" type="password" value={form.password} onChange={set('password')} required minLength={6} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('auth.confirm')}</label>
            <input className="form-input" type="password" value={form.confirm} onChange={set('confirm')} required minLength={6} />
          </div>

          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? t('loading') : t('auth.register')}
          </button>
        </form>

        <div className="auth-links">
          <span>{t('auth.haveAccount')} </span>
          <Link to="/login">{t('auth.login')}</Link>
        </div>
      </div>
    </div>
  )
}
