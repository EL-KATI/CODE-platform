/**
 * Global store — mirrors store.js (vanilla) using Zustand.
 */
import { create } from 'zustand'
import { api } from '../lib/api.js'

export const useStore = create((set, get) => ({
  user: null,
  settings: null,
  categories: null,
  loading: true,

  // ── auth ───────────────────────────────────────────────────────────────
  async loadUser() {
    try {
      const { user, reason } = await api.get('/auth/me')
      set({ user, loading: false })
      if (reason === 'session_replaced') {
        window.dispatchEvent(new CustomEvent('session-replaced'))
      }
      return user
    } catch {
      set({ user: null, loading: false })
      return null
    }
  },

  setUser(user) { set({ user }) },

  async logout() {
    try { await api.post('/auth/logout') } catch { /* ignore */ }
    set({ user: null })
  },

  // ── reference data ─────────────────────────────────────────────────────
  async getCategories(force = false) {
    const { categories } = get()
    if (!categories || force) {
      const data = await api.get('/categories')
      set({ categories: data })
      return data
    }
    return categories
  },

  async getSettings(force = false) {
    const { settings } = get()
    if (!settings || force) {
      const data = await api.get('/settings')
      set({ settings: data })
      return data
    }
    return settings
  },

  // ── role helpers ───────────────────────────────────────────────────────
  isStaff()      { const u = get().user; return u && ['admin', 'instructor', 'school'].includes(u.role) },
  isAdmin()      { return get().user?.role === 'admin' },
  isSchool()     { return get().user?.role === 'school' },
  isInstructor() { return get().user?.role === 'instructor' },
  isSuperAdmin() { return get().user?.isSuperAdmin === true },
  isEnrolled()   { const u = get().user; return get().isStaff() || (u && u.schoolId != null) },
}))
