import { useTranslation } from 'react-i18next'
import { setLocale } from '../../lib/i18n.js'
import { useStore } from '../../context/store.js'

export default function Header() {
  const { t, i18n } = useTranslation()
  const user = useStore(s => s.user)
  const lang = i18n.language

  function toggleLang() {
    const next = lang === 'ar' ? 'fr' : 'ar'
    setLocale(next)
  }

  return (
    <header className="app-header">
      <div className="header-left">
        <span className="brand-tagline">{t('brand.tagline')}</span>
      </div>
      <div className="header-right">
        <button
          className="icon-btn"
          onClick={toggleLang}
          aria-label={t('a11y.language')}
          title={lang === 'ar' ? 'Français' : 'عربية'}
        >
          {lang === 'ar' ? 'FR' : 'AR'}
        </button>
      </div>
    </header>
  )
}
