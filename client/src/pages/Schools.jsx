/**
 * Schools management page (staff/admin only)
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../context/store.js'
import { api } from '../lib/api.js'
import Spinner from '../components/ui/Spinner.jsx'

export default function Schools() {
  const { t } = useTranslation()
  const isStaff = useStore(s => s.isStaff)

  const [schools, setSchools] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(1)

  useEffect(() => {
    setLoading(true)
    api.get(`/schools?page=${page}&search=${encodeURIComponent(search)}`)
      .then(d => setSchools(Array.isArray(d) ? d : d?.schools || []))
      .finally(() => setLoading(false))
  }, [page, search])

  if (!isStaff?.()) return (
    <div className="alert alert-error">{t('error.noAccess', { defaultValue: 'ليس لديك صلاحية الوصول' })}</div>
  )

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <h1>{t('nav.schools', { defaultValue: 'المدارس' })}</h1>
        <input className="form-input" style={{ maxWidth: 260 }}
          placeholder={t('admin.search', { defaultValue: 'بحث...' })}
          value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
      </div>

      {loading ? <Spinner /> : (
        <>
          {schools.length === 0 ? (
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '3rem' }}>{t('schools.empty', { defaultValue: 'لا توجد مدارس' })}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
              {schools.map(s => (
                <div key={s._id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem 1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '.5rem' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{s.name}</div>
                      {s.city && <div style={{ fontSize: '.85rem', color: 'var(--muted)' }}>{s.city}</div>}
                      {s.phone && <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>{s.phone}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: '.5rem', flex: 'wrap' }}>
                      <span className="badge badge-outline">{s.studentCount ?? 0} {t('admin.students')}</span>
                      <span className={`badge ${s.active ? 'badge-success' : 'badge-error'}`}>{s.active ? t('schools.active', { defaultValue: 'نشط' }) : t('schools.inactive', { defaultValue: 'غير نشط' })}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '.5rem', marginTop: '1.5rem', justifyContent: 'center' }}>
            <button className="btn btn-outline btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>السابق</button>
            <span style={{ padding: '.35rem .75rem', color: 'var(--muted)' }}>{page}</span>
            <button className="btn btn-outline btn-sm" disabled={schools.length < 20} onClick={() => setPage(p => p + 1)}>التالي</button>
          </div>
        </>
      )}
    </div>
  )
}
