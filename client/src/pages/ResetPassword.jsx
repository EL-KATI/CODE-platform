import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api.js'

export default function ResetPassword() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') || ''

  const [form, setForm]     = useState({ password: '', confirm: '' })
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (form.password !== form.confirm) { setError(t('auth.mismatch')); return }
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/reset', { token, password: form.password })
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err.data?.error || t('error.generic'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">{t('auth.reset')}</h1>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">{t('auth.newPass')}</label>
            <input className="form-input" type="password" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={6} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">{t('auth.confirm')}</label>
            <input className="form-input" type="password" value={form.confirm}
              onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} required minLength={6} />
          </div>
          <button className="btn btn-primary btn-block" disabled={loading || !token}>
            {loading ? t('loading') : t('auth.save')}
          </button>
        </form>
      </div>
    </div>
  )
}
