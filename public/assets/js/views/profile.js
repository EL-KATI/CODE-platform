import { html, raw, toast, errorMessage, openDialog } from '../ui.js';
import { t, setLocale } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { showCredentials, resetBlocked, resetWait, fmtWait } from './admin.js';

export function profileView(root) {
  const u = store.user;
  // pw_reset_at من store (يُحدَّث بعد إعادة التوليد)
  const getUser = () => store.user;

  const render = () => {
    const cu = getUser();
    const blocked = resetBlocked(cu);
    root.innerHTML = html`
      <div class="page-head"><div><h1>${t('profile.title')}</h1><p>${cu.email} · <span class="pill">${t('role.' + cu.role)}</span></p></div>
        <a class="btn btn-secondary" href="/history">${t('history.title')}</a></div>
      <div class="grid grid-2">
        <form class="card" id="info">
          <h2>${t('profile.info')}</h2>
          <div class="field"><label for="name">${t('auth.name')}</label><input id="name" name="name" value="${cu.name}" required></div>
          <div class="field"><label for="locale">${t('profile.language')}</label>
            <select id="locale" name="locale"><option value="ar" ${cu.locale === 'ar' ? 'selected' : ''}>العربية</option><option value="fr" ${cu.locale === 'fr' ? 'selected' : ''}>Français</option></select></div>
          ${cu.schoolId ? '' : html`<div class="field"><label for="examDate">${t('profile.examDate')}</label><input id="examDate" name="examDate" type="date" value="${cu.examDate || ''}"><span class="hint">${t('profile.examDateHint')}</span></div>`}
          <button class="btn btn-primary" type="submit">${t('common.save')}</button>
        </form>
        <section class="card" id="pw-section">
          <h2>${t('profile.password')}</h2>
          <p class="muted small" style="margin-bottom:16px">${t('profile.passwordResetHint')}</p>
          <button class="btn btn-secondary" id="btn-reset-pw" type="button" ${blocked ? raw('disabled') : ''}>
            🔑 ${t('profile.resetPassword')}
          </button>
          ${blocked ? html`<p class="hint" style="margin-top:8px">⏳ ${t('profile.resetWait')}: ${fmtWait(cu.pw_reset_at)}</p>` : ''}
        </section>
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
        const { user } = await api.patch('/me', { name: f.name.value, locale: f.locale.value, examDate: f.examDate ? (f.examDate.value || null) : undefined });
        store.user = user;
        setLocale(user.locale);
        toast(t('common.saved'));
        navigate('/profile', { replace: true });
      } catch (ex) { toast(errorMessage(ex), 'error'); }
    };

    const resetBtn = root.querySelector('#btn-reset-pw');
    if (resetBtn) resetBtn.onclick = async () => {
      resetBtn.disabled = true;
      try {
        const r = await api.post('/me/reset-password');
        // تحديث pw_reset_at في store لتجنب التكرار
        store.user = { ...store.user, pw_reset_at: new Date().toISOString() };
        render();
        await showCredentials({ email: r.email, password: r.generatedPassword, name: r.name });
      } catch (ex) {
        if (ex.code === 'reset_limit') {
          toast(`مسموح مرة واحدة كل 24 ساعة. جرّب بعد ${fmtWait(ex.details?.retryAt)}`, 'error');
          store.user = { ...store.user, pw_reset_at: new Date(Date.now() - 23 * 3600 * 1000).toISOString() };
        } else toast(errorMessage(ex), 'error');
        render();
      }
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
  };
  render();
}
