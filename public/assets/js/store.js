// État global partagé : utilisateur connecté et données de référence en cache.
import { api } from './api.js';

export const store = {
  user: null,
  settings: null,
  categories: null,
  async loadUser() {
    const { user } = await api.get('/auth/me');
    this.user = user;
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
  isStaff() { return this.user && ['admin', 'instructor'].includes(this.user.role); },
  isAdmin() { return this.user && this.user.role === 'admin'; },
};
