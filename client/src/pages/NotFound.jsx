import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function NotFound() {
  const { t } = useTranslation()
  return (
    <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
      <div style={{ fontSize: '5rem', marginBottom: '1rem' }}>🚦</div>
      <h1 style={{ fontSize: '2rem', marginBottom: '.5rem' }}>404</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>
        {t('notFound', { defaultValue: 'الصفحة غير موجودة' })}
      </p>
      <Link to="/" className="btn btn-primary">{t('home.cta', { defaultValue: 'الرئيسية' })}</Link>
    </div>
  )
}
