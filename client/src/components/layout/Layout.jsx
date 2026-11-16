import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import Header from './Header.jsx'
import { useStore } from '../../context/store.js'
import { useEffect } from 'react'
import { setLocale } from '../../lib/i18n.js'

export default function Layout() {
  const user = useStore(s => s.user)

  useEffect(() => {
    // Apply user's preferred language
    if (user?.lang) {
      setLocale(user.lang)
    }
  }, [user?.lang])

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <Header />
        <main id="main-content" className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
