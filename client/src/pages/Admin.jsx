/**
 * Admin panel — full admin dashboard
 * Routes: /admin, /admin/users, /admin/questions, /admin/settings, etc.
 */
import { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStore } from '../context/store.js'
import { api } from '../lib/api.js'
import Spinner from '../components/ui/Spinner.jsx'

// ── Sub-route components ───────────────────────────────────────────────
function AdminOverview() {
  const { t } = useTranslation()
  const [stats, setStats] = useState(null)
  useEffect(() => { api.get('/admin/stats').then(setStats).catch(() => {}) }, [])
  if (!stats) return <Spinner />
  const cards = [
    { label: t('admin.students'), val: stats.students ?? 0, icon: '👥' },
    { label: t('admin.questions'), val: stats.questions ?? 0, icon: '❓' },
    { label: t('admin.attempts'), val: stats.attempts ?? 0, icon: '📝' },
    { label: t('admin.passRate'), val: `${stats.passRate ?? 0}%`, icon: '✅' },
  ]
  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>{t('admin.overview')}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
        {cards.map((c, i) => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.25rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem' }}>{c.icon}</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', margin: '.25rem 0' }}>{c.val}</div>
            <div style={{ fontSize: '.85rem', color: 'var(--muted)' }}>{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AdminUsers() {
  const { t } = useTranslation()
  const [users, setUsers]   = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage]     = useState(1)

  useEffect(() => {
    setLoading(true)
    api.get(`/admin/users?page=${page}&search=${encodeURIComponent(search)}`)
      .then(d => setUsers(Array.isArray(d) ? d : d?.users || []))
      .finally(() => setLoading(false))
  }, [page, search])

  return (
    <div>
      <h2 style={{ marginBottom: '1rem' }}>{t('admin.students')}</h2>
      <div style={{ marginBottom: '1rem' }}>
        <input className="form-input" style={{ maxWidth: 300 }} placeholder={t('admin.search')}
          value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
      </div>
      {loading ? <Spinner /> : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead><tr>
              <th>{t('auth.name')}</th>
              <th>{t('auth.phone')}</th>
              <th>{t('admin.role')}</th>
              <th>{t('admin.joined')}</th>
            </tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u._id}>
                  <td>{u.name}</td>
                  <td>{u.phone || u.email}</td>
                  <td><span className={`badge badge-${u.role === 'admin' ? 'error' : u.role === 'instructor' ? 'warning' : 'outline'}`}>{u.role}</span></td>
                  <td style={{ fontSize: '.82rem', color: 'var(--muted)' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function AdminQuestions() {
  const { t } = useTranslation()
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [catFilter, setCatFilter] = useState('')
  const getCategories = useStore(s => s.getCategories)
  const [cats, setCats] = useState([])

  useEffect(() => { getCategories().then(c => setCats(c || [])).catch(() => {}) }, [])
  useEffect(() => {
    setLoading(true)
    const url = `/admin/questions?page=${page}${catFilter ? `&category=${catFilter}` : ''}`
    api.get(url).then(d => setQuestions(Array.isArray(d) ? d : d?.questions || [])).finally(() => setLoading(false))
  }, [page, catFilter])

  return (
    <div>
      <h2 style={{ marginBottom: '1rem' }}>{t('admin.questions')}</h2>
      <div style={{ display: 'flex', gap: '.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select className="form-input" style={{ maxWidth: 220 }} value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(1) }}>
          <option value="">— {t('admin.allCats')} —</option>
          {cats.map(c => <option key={c._id} value={c._id}>{c.nameAr || c.name}</option>)}
        </select>
      </div>
      {loading ? <Spinner /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          {questions.map((q, i) => (
            <div key={q._id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '.75rem 1rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--muted)', fontSize: '.8rem', minWidth: '2rem' }}>#{q.id || (page - 1) * 20 + i + 1}</span>
              <span dir="rtl" style={{ flex: 1, fontSize: '.9rem' }}>{q.text}</span>
              {q.image && <span>🖼</span>}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem', justifyContent: 'center' }}>
        <button className="btn btn-outline btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>السابق</button>
        <span style={{ padding: '.35rem .75rem', color: 'var(--muted)' }}>{page}</span>
        <button className="btn btn-outline btn-sm" disabled={questions.length < 20} onClick={() => setPage(p => p + 1)}>التالي</button>
      </div>
    </div>
  )
}

function AdminSettings() {
  const { t } = useTranslation()
  const [form, setForm]     = useState({ examCount: 40, passMark: 35, secondsPerQuestion: 30 })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState('')

  useEffect(() => {
    api.get('/admin/settings').then(s => { if (s) setForm(f => ({ ...f, ...s })) }).catch(() => {}).finally(() => setLoaded(true))
  }, [])

  const set = k => e => setForm(f => ({ ...f, [k]: Number(e.target.value) }))

  async function save(e) {
    e.preventDefault(); setSaving(true); setMsg('')
    try { await api.patch('/admin/settings', form); setMsg(t('profile.saved')) }
    catch { setMsg(t('error.generic')) }
    finally { setSaving(false) }
  }

  if (!loaded) return <Spinner />
  return (
    <div style={{ maxWidth: 480 }}>
      <h2 style={{ marginBottom: '1.5rem' }}>{t('admin.settings')}</h2>
      {msg && <div className="alert alert-success">{msg}</div>}
      <form onSubmit={save}>
        {[['examCount', t('admin.examCount', { defaultValue: 'عدد أسئلة الامتحان' }), 10, 100],
          ['passMark', t('admin.passMark', { defaultValue: 'علامة النجاح' }), 1, 100],
          ['secondsPerQuestion', t('admin.secondsPerQ', { defaultValue: 'ثواني لكل سؤال' }), 10, 120],
        ].map(([key, label, min, max]) => (
          <div key={key} className="form-group">
            <label className="form-label">{label}</label>
            <input className="form-input" type="number" min={min} max={max} value={form[key]} onChange={set(key)} />
          </div>
        ))}
        <button className="btn btn-primary" disabled={saving}>{saving ? t('loading') : t('admin.save')}</button>
      </form>
    </div>
  )
}

// ── Main Admin layout ─────────────────────────────────────────────────
const NAV = [
  { to: '/admin',           label: 'admin.overview', end: true },
  { to: '/admin/users',     label: 'admin.students'  },
  { to: '/admin/questions', label: 'admin.questions' },
  { to: '/admin/settings',  label: 'admin.settings'  },
]

export default function Admin() {
  const { t } = useTranslation()
  const isAdmin = useStore(s => s.isAdmin)

  if (!isAdmin?.()) return (
    <div className="alert alert-error">{t('error.noAccess', { defaultValue: 'ليس لديك صلاحية الوصول' })}</div>
  )

  return (
    <div className="admin-layout">
      <nav className="admin-nav">
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}>
            {t(n.label, { defaultValue: n.label })}
          </NavLink>
        ))}
      </nav>

      <div className="admin-content">
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route index element={<AdminOverview />} />
            <Route path="users"     element={<AdminUsers />} />
            <Route path="questions" element={<AdminQuestions />} />
            <Route path="settings"  element={<AdminSettings />} />
          </Routes>
        </Suspense>
      </div>

      <style>{`
        .admin-layout { display: flex; gap: 1.5rem; }
        .admin-nav { display: flex; flex-direction: column; gap: .25rem; min-width: 160px; }
        @media(max-width:640px) { .admin-layout{flex-direction:column} .admin-nav{flex-direction:row;flex-wrap:wrap;min-width:unset} }
        .admin-nav-link { padding: .5rem .75rem; border-radius: var(--radius); text-decoration: none; color: inherit; font-size: .9rem; transition: background .15s; }
        .admin-nav-link:hover { background: var(--border); }
        .admin-nav-link.active { background: var(--primary-soft); color: var(--primary); font-weight: 600; }
        .admin-content { flex: 1; min-width: 0; }
        .table-wrapper { overflow-x: auto; }
        .data-table { width: 100%; border-collapse: collapse; font-size: .9rem; }
        .data-table th, .data-table td { padding: .6rem .75rem; border-bottom: 1px solid var(--border); text-align: right; }
        .data-table th { font-weight: 600; color: var(--muted); background: var(--surface); }
      `}</style>
    </div>
  )
}
