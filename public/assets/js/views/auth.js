import { html, toast, errorMessage } from '../ui.js';
import { t, getLocale, setLocale } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';

function safeNext(query) {
  const n = query.next || '/dashboard';
  return n.startsWith('/') && !n.startsWith('//') ? n : '/dashboard';
}

export function loginView(root, { query }) {
  root.innerHTML = html`
    <div class="card auth-card">
      <h1>${t('auth.loginTitle')}</h1>
      <p class="muted">${t('auth.loginSubtitle')}</p>
      <div id="err" class="form-error" role="alert" hidden></div>
      <form id="f" novalidate>
        <div class="field"><label for="email">${t('auth.email')}</label><input id="email" name="email" type="email" autocomplete="email" required dir="ltr"></div>
        <div class="field"><label for="password">${t('auth.password')}</label><input id="password" name="password" type="password" autocomplete="current-password" required dir="ltr"></div>
        <button class="btn btn-primary" style="width:100%" type="submit">${t('auth.login')}</button>
      </form>
      <p class="small" style="margin-top:16px">${t('auth.noAccount')} <a href="/register${query.next ? `?next=${encodeURIComponent(query.next)}` : ''}">${t('auth.createAccount')}</a></p>
    </div>`.s;
  const f = root.querySelector('#f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const err = root.querySelector('#err');
    err.hidden = true;
    try {
      const { user } = await api.post('/auth/login', { email: f.email.value, password: f.password.value });
      store.user = user;
      setLocale(user.locale || getLocale());
      toast(t('auth.welcome', { name: user.name }));
      navigate(safeNext(query), { replace: true });
    } catch (ex) {
      err.textContent = errorMessage(ex);
      err.hidden = false;
      f.password.focus();
    }
  };
}

export function registerView(root, { query }) {
  root.innerHTML = html`
    <div class="card auth-card">
      <h1>${t('auth.registerTitle')}</h1>
      <p class="muted">${t('auth.registerSubtitle')}</p>
      <div id="err" class="form-error" role="alert" hidden></div>
      <form id="f" novalidate>
        <div class="field"><label for="name">${t('auth.name')}</label><input id="name" name="name" autocomplete="name" required minlength="2" maxlength="80"></div>
        <div class="field"><label for="email">${t('auth.email')}</label><input id="email" name="email" type="email" autocomplete="email" required dir="ltr"></div>
        <div class="field"><label for="password">${t('auth.password')}</label><input id="password" name="password" type="password" autocomplete="new-password" required minlength="8" dir="ltr" aria-describedby="pw-hint"><span class="hint" id="pw-hint">${t('auth.passwordHint')}</span></div>
        <label class="check field"><input type="checkbox" name="terms" required> <span>${t('auth.acceptTerms')} <a href="/privacy" target="_blank">${t('footer.privacy')}</a></span></label>
        <button class="btn btn-primary" style="width:100%" type="submit">${t('auth.createAccount')}</button>
      </form>
      <p class="small" style="margin-top:16px">${t('auth.haveAccount')} <a href="/login">${t('auth.login')}</a></p>
    </div>`.s;
  const f = root.querySelector('#f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const err = root.querySelector('#err');
    err.hidden = true;
    try {
      const { user } = await api.post('/auth/register', {
        name: f.name.value, email: f.email.value, password: f.password.value, acceptTerms: f.terms.checked, locale: getLocale(),
      });
      store.user = user;
      toast(t('auth.welcome', { name: user.name }));
      navigate(safeNext(query), { replace: true });
    } catch (ex) {
      err.textContent = errorMessage(ex);
      err.hidden = false;
    }
  };
}
