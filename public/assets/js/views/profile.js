import { html, toast, errorMessage, openDialog } from '../ui.js';
import { t, setLocale } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';

export function profileView(root) {
  const u = store.user;
  root.innerHTML = html`
    <div class="page-head"><div><h1>${t('profile.title')}</h1><p>${u.email} · <span class="pill">${t('role.' + u.role)}</span></p></div>
      <a class="btn btn-secondary" href="/history">${t('history.title')}</a></div>
    <div class="grid grid-2">
      <form class="card" id="info">
        <h2>${t('profile.info')}</h2>
        <div class="field"><label for="name">${t('auth.name')}</label><input id="name" name="name" value="${u.name}" required></div>
        <div class="field"><label for="locale">${t('profile.language')}</label>
          <select id="locale" name="locale"><option value="ar" ${u.locale === 'ar' ? 'selected' : ''}>العربية</option><option value="fr" ${u.locale === 'fr' ? 'selected' : ''}>Français</option></select></div>
        <div class="field"><label for="examDate">${t('profile.examDate')}</label><input id="examDate" name="examDate" type="date" value="${u.examDate || ''}"><span class="hint">${t('profile.examDateHint')}</span></div>
        <button class="btn btn-primary" type="submit">${t('common.save')}</button>
      </form>
      <form class="card" id="pw">
        <h2>${t('profile.password')}</h2>
        <div class="field"><label for="cur">${t('profile.currentPassword')}</label><input id="cur" name="cur" type="password" autocomplete="current-password" required dir="ltr"></div>
        <div class="field"><label for="np">${t('profile.newPassword')}</label><input id="np" name="np" type="password" autocomplete="new-password" required minlength="8" dir="ltr"><span class="hint">${t('auth.passwordHint')}</span></div>
        <button class="btn btn-primary" type="submit">${t('profile.changePassword')}</button>
      </form>
      <section class="card">
        <h2>${t('profile.data')}</h2>
        <p class="muted small">${t('profile.dataHelp')}</p>
        <div class="row"><a class="btn btn-secondary" href="/api/me/export" download>⬇️ ${t('profile.export')}</a>
        <button class="btn btn-danger" id="del" type="button">${t('profile.delete')}</button></div>
      </section>
    </div>`.s;

  root.querySelector('#info').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    try {
      const { user } = await api.patch('/me', { name: f.name.value, locale: f.locale.value, examDate: f.examDate.value || null });
      store.user = user;
      setLocale(user.locale);
      toast(t('common.saved'));
      navigate('/profile', { replace: true });
    } catch (ex) { toast(errorMessage(ex), 'error'); }
  };
  root.querySelector('#pw').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    try {
      await api.post('/me/password', { currentPassword: f.cur.value, newPassword: f.np.value });
      f.reset();
      toast(t('profile.passwordChanged'));
    } catch (ex) { toast(errorMessage(ex), 'error'); }
  };
  root.querySelector('#del').onclick = () => {
    openDialog({
      title: t('profile.delete'),
      body: html`<p>${t('profile.deleteConfirm')}</p><div class="field"><label for="del-pw">${t('profile.deletePassword')}</label><input id="del-pw" type="password" autocomplete="current-password" dir="ltr"></div>`,
      actions: [
        { label: t('common.cancel') },
        { label: t('profile.delete'), class: 'btn-danger', onClick: async (dlg) => {
          try {
            await api.del('/me', { password: dlg.querySelector('#del-pw').value });
            store.user = null;
            toast(t('profile.deleted'));
            navigate('/');
            return true;
          } catch (ex) { toast(errorMessage(ex), 'error'); return false; }
        } },
      ],
    });
  };
}
