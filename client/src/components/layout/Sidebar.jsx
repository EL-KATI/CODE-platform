import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStore } from '../../context/store.js'

const NAV_LINKS = [
  { to: '/',          key: 'nav.home',      icon: '🏠', public: true },
  { to: '/dashboard', key: 'nav.dashboard', icon: '📊' },
  { to: '/lessons',   key: 'nav.lessons',   icon: '📚' },
  { to: '/practice',  key: 'nav.practice',  icon: '🎯' },
  { to: '/champion',  key: 'champ.title',   icon: '🏆', public: true },
  { to: '/mistakes',  key: 'nav.mistakes',  icon: '📝' },
  { to: '/bookings',  key: 'nav.bookings',  icon: '📅', enrolled: true },
  { to: '/ai',        key: 'nav.ai',        icon: '🤖' },
]

const STAFF_LINKS = [
  { to: '/admin',   key: 'nav.admin',   icon: '⚙️' },
  { to: '/schools', key: 'admin.schools', icon: '🏫', adminOnly: true },
]

export default function Sidebar() {
  const { t } = useTranslation()
  const { user, logout, isAdmin, isEnrolled } = useStore()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/')
  }

  const isStaff = user && ['admin', 'instructor', 'school'].includes(user.role)

  return (
    <nav className="sidebar" aria-label={t('a11y.menu')}>
      <div className="sidebar-brand">
        <span className="brand-name">{t('brand.name')}</span>
      </div>

      <ul className="sidebar-nav">
        {NAV_LINKS.map(link => {
          if (!link.public && !user) return null
          if (link.enrolled && !isEnrolled()) return null
          return (
            <li key={link.to}>
              <NavLink
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}
              >
                <span className="sidebar-icon" aria-hidden="true">{link.icon}</span>
                <span className="sidebar-label">{t(link.key)}</span>
              </NavLink>
            </li>
          )
        })}

        {isStaff && STAFF_LINKS.map(link => {
          if (link.adminOnly && !isAdmin()) return null
          return (
            <li key={link.to}>
              <NavLink
                to={link.to}
                className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}
              >
                <span className="sidebar-icon" aria-hidden="true">{link.icon}</span>
                <span className="sidebar-label">{t(link.key)}</span>
              </NavLink>
            </li>
          )
        })}
      </ul>

      <div className="sidebar-footer">
        {user ? (
          <>
            <NavLink to="/profile" className="sidebar-link">
              <span className="sidebar-icon" aria-hidden="true">👤</span>
              <span className="sidebar-label">{t('nav.profile')}</span>
            </NavLink>
            <button className="sidebar-link sidebar-btn" onClick={handleLogout}>
              <span className="sidebar-icon" aria-hidden="true">🚪</span>
              <span className="sidebar-label">{t('nav.logout')}</span>
            </button>
          </>
        ) : (
          <NavLink to="/login" className="sidebar-link">
            <span className="sidebar-icon" aria-hidden="true">🔑</span>
            <span className="sidebar-label">{t('nav.login')}</span>
          </NavLink>
        )}
      </div>
    </nav>
  )
}
