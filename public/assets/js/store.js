// État global partagé : utilisateur connecté et données de référence en cache.
import { api } from './api.js';

export const store = {
  user: null,
  settings: null,
  categories: null,
  async loadUser() {
    const { user, reason } = await api.get('/auth/me');
    this.user = user;
    if (reason === 'session_replaced') window.dispatchEvent(new CustomEvent('session-replaced', { detail: { boot: true } }));
    return user;
  },
  async getCategories(force = false) {
    if (!this.categories || force) this.categories = await api.get('/categories');
    return this.categories;
  },
  async getSettings(force = false) {
    if (!this.settings || force) this.settings = await api.get('/settings');
    return this.settings;
  },
  isStaff()      { return this.user && ['admin', 'instructor', 'school'].includes(this.user.role); },
  isAdmin()      { return this.user && this.user.role === 'admin'; },
  isSchool()     { return this.user && this.user.role === 'school'; },
  isInstructor() { return this.user && this.user.role === 'instructor'; },
  isSuperAdmin() { return this.user && this.user.isSuperAdmin === true; },
  // المتعلم المرتبط بمدرسة قيادة (school_id غير null) أو أي عضو من الطاقم
  isEnrolled()   { return this.isStaff() || (this.user && this.user.schoolId != null); },
};
