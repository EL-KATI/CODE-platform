import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../context/store.js'
import { api } from '../lib/api.js'

export default function Profile() {
  const { t } = useTranslation()
  const user    = useStore(s => s.user)
  const setUser = useStore(s => s.setUser)

  const [form, setForm]     = useState({ name: user?.name || '', phone: user?.phone || '', password: '', confirm: '' })
  const [msg, setMsg]       = useState('')
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function save(e) {
    e.preventDefault()
    setMsg(''); setError('')
    if (form.password && form.password !== form.confirm) { setError(t('auth.mismatch')); return }
    setLoading(true)
    const body = { name: form.name }
    if (form.password) body.password = form.password
    try {
      const updated = await api.patch('/students/me', body)
      setUser(updated)
      setMsg(t('profile.saved', { defaultValue: 'تم الحفظ بنجاح' }))
      setForm(f => ({ ...f, password: '', confirm: '' }))
    } catch (err) {
      setError(err.data?.error || t('error.generic'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <h1 style={{ marginBottom: '1.5rem' }}>{t('nav.profile')}</h1>

      {msg   && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="avatar-row" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', fontWeight: 700 }}>
          {(user?.name || '?')[0].toUpperCase()}
        </div>
        <div>
          <div style={{ fontWeight: 600 }}>{user?.name}</div>
          <div style={{ fontSize: '.85rem', color: 'var(--muted)' }}>{user?.phone || user?.email}</div>
          {user?.license_cat && <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>{t('profile.cat')}: {user.license_cat}</div>}
        </div>
      </div>

      <form onSubmit={save}>
        <div className="form-group">
          <label className="form-label">{t('auth.name')}</label>
          <input className="form-input" type="text" value={form.name} onChange={set('name')} required />
        </div>
        <div className="form-group">
          <label className="form-label">{t('auth.phone')}</label>
          <input className="form-input" type="tel" value={form.phone} disabled />
        </div>
        <div className="form-group">
          <label className="form-label">{t('profile.newPass', { defaultValue: 'كلمة مرور جديدة (اختياري)' })}</label>
          <input className="form-input" type="password" value={form.password} onChange={set('password')} minLength={6} />
        </div>
        {form.password && (
          <div className="form-group">
            <label className="form-label">{t('auth.confirm')}</label>
            <input className="form-input" type="password" value={form.confirm} onChange={set('confirm')} minLength={6} />
          </div>
        )}
        <button className="btn btn-primary" disabled={loading}>
          {loading ? t('loading') : t('profile.save', { defaultValue: 'حفظ التغييرات' })}
        </button>
      </form>
    </div>
  )
}
