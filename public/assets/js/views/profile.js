import { html, raw, toast, errorMessage, openDialog } from '../ui.js';
import { t, setLocale } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';

export function profileView(root) {
  const render = () => {
    const cu = store.user;
    root.innerHTML = html`
      <div class="pg pg-narrow profile">
        <header class="profile-head">
          <span class="profile-avatar" aria-hidden="true">${(cu.name || '?').trim().charAt(0).toUpperCase()}</span>
          <h1>${cu.name}</h1>
          <p class="muted">${cu.email}</p>
          <span class="pill">${t('role.' + cu.role)}</span>
        </header>
        <a class="card profile-link" href="/history"><span class="cat-icon" aria-hidden="true">🕘</span><strong>${t('history.title')}</strong><span class="row-chevron">${raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>')}</span></a>
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
          <form id="pw-form" novalidate>
            <div class="field">
              <label for="cur-pw">${t('profile.currentPassword')}</label>
              <input id="cur-pw" name="cur" type="password" autocomplete="current-password" required dir="ltr" placeholder="••••••••">
            </div>
            <div class="field">
              <label for="new-pw">${t('profile.newPassword')}</label>
              <input id="new-pw" name="np" type="password" autocomplete="new-password" required minlength="8" dir="ltr" placeholder="••••••••">
              <span class="hint">${t('auth.passwordHint')}</span>
            </div>
            <div class="field">
              <label for="confirm-pw">${t('profile.confirmPassword')}</label>
              <input id="confirm-pw" name="confirm" type="password" autocomplete="new-password" required minlength="8" dir="ltr" placeholder="••••••••">
              <span class="hint pw-mismatch" style="color:var(--danger,#dc2626);display:none">${t('profile.passwordMismatch')}</span>
            </div>
            <button class="btn btn-primary" type="submit" id="btn-change-pw">${t('profile.changePassword')}</button>
          </form>
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

    // §أ نموذج تغيير كلمة السر يدوياً
    const pwForm = root.querySelector('#pw-form');
    const newPwInput   = root.querySelector('#new-pw');
    const confirmInput = root.querySelector('#confirm-pw');
    const matchHint    = root.querySelector('.pw-mismatch');

    // منع اللصق في حقلَي كلمة السر الجديدة والتأكيد
    [newPwInput, confirmInput].forEach((inp) => {
      inp.addEventListener('paste', (e) => { e.preventDefault(); });
    });

    // إخفاء/إظهار تلميح عدم التطابق أثناء الكتابة
    const checkMatch = () => {
      if (!confirmInput.value) { matchHint.style.display = 'none'; return; }
      matchHint.style.display = (newPwInput.value === confirmInput.value) ? 'none' : '';
    };
    newPwInput.addEventListener('input', checkMatch);
    confirmInput.addEventListener('input', checkMatch);

    pwForm.onsubmit = async (e) => {
      e.preventDefault();
      const curPw  = root.querySelector('#cur-pw').value;
      const newPw  = newPwInput.value;
      const confirm = confirmInput.value;
      if (newPw !== confirm) { matchHint.style.display = ''; confirmInput.focus(); return; }
      const btn = root.querySelector('#btn-change-pw');
      btn.disabled = true;
      try {
        await api.post('/me/password', { currentPassword: curPw, newPassword: newPw });
        toast(t('profile.passwordChanged'));
        pwForm.reset();
        matchHint.style.display = 'none';
      } catch (ex) { toast(errorMessage(ex), 'error'); }
      finally { btn.disabled = false; }
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
