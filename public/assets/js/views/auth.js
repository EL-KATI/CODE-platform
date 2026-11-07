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
    <div style="max-width:440px;margin:32px auto">
      <!-- Brand mark -->
      <div style="text-align:center;margin-bottom:28px">
        <div style="width:52px;height:52px;background:linear-gradient(145deg,var(--orange-500),var(--orange-700));border-radius:14px;display:grid;place-items:center;margin:0 auto 14px;box-shadow:0 4px 16px rgb(234 88 12 / .3)">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 15.5V12l1.6-4.2A1.5 1.5 0 0 1 8 6.8h8a1.5 1.5 0 0 1 1.4 1l1.6 4.2v3.5"/>
            <path d="M4.5 15.5h15"/>
            <circle cx="8" cy="15.5" r="1.6" fill="#fff" stroke="none"/>
            <circle cx="16" cy="15.5" r="1.6" fill="#fff" stroke="none"/>
          </svg>
        </div>
        <h1 style="margin-bottom:4px">${t('auth.loginTitle')}</h1>
        <p class="muted" style="margin:0">${t('auth.loginSubtitle')}</p>
      </div>

      <div class="card" style="padding:28px">
        <div id="err" class="form-error" role="alert" hidden></div>
        <form id="f" novalidate>
          <div class="field">
            <label for="email">${t('auth.email')}</label>
            <input id="email" name="email" type="email" autocomplete="email" required dir="ltr" placeholder="example@gmail.com">
          </div>
          <div class="field">
            <label for="password">${t('auth.password')}</label>
            <input id="password" name="password" type="password" autocomplete="current-password" required dir="ltr" placeholder="••••••••">
          </div>
          <button class="btn btn-primary btn-lg" style="width:100%;margin-top:6px" type="submit">${t('auth.login')}</button>
        </form>
        <p class="small" style="margin-top:18px;text-align:center;color:var(--muted)">
          ${t('auth.noAccount')} <a href="/register${query.next ? `?next=${encodeURIComponent(query.next)}` : ''}" style="color:var(--primary);font-weight:700">${t('auth.createAccount')}</a>
        </p>
      </div>
    </div>`.s;

  const f = root.querySelector('#f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button[type=submit]');
    const err = root.querySelector('#err');
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = '…';
    try {
      const { user } = await api.post('/auth/login', { email: f.email.value, password: f.password.value });
      store.user = user;
      setLocale(user.locale || getLocale());
      toast(t('auth.welcome', { name: user.name }));
      navigate(safeNext(query), { replace: true });
    } catch (ex) {
      err.textContent = errorMessage(ex);
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = t('auth.login');
      f.password.focus();
    }
  };
}

export function registerView(root, { query }) {
  root.innerHTML = html`
    <div style="max-width:440px;margin:32px auto">
      <!-- Brand mark -->
      <div style="text-align:center;margin-bottom:28px">
        <div style="width:52px;height:52px;background:linear-gradient(145deg,var(--orange-500),var(--orange-700));border-radius:14px;display:grid;place-items:center;margin:0 auto 14px;box-shadow:0 4px 16px rgb(234 88 12 / .3)">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 15.5V12l1.6-4.2A1.5 1.5 0 0 1 8 6.8h8a1.5 1.5 0 0 1 1.4 1l1.6 4.2v3.5"/>
            <path d="M4.5 15.5h15"/>
            <circle cx="8" cy="15.5" r="1.6" fill="#fff" stroke="none"/>
            <circle cx="16" cy="15.5" r="1.6" fill="#fff" stroke="none"/>
          </svg>
        </div>
        <h1 style="margin-bottom:4px">${t('auth.registerTitle')}</h1>
        <p class="muted" style="margin:0">${t('auth.registerSubtitle')}</p>
      </div>

      <div class="card" style="padding:28px">
        <div id="err" class="form-error" role="alert" hidden></div>
        <form id="f" novalidate>
          <div class="field">
            <label for="name">${t('auth.name')}</label>
            <input id="name" name="name" autocomplete="name" required minlength="2" maxlength="80" placeholder="محمد الأمين">
          </div>
          <div class="field">
            <label for="email">${t('auth.email')}</label>
            <input id="email" name="email" type="email" autocomplete="email" required dir="ltr" placeholder="example@gmail.com">
          </div>
          <div class="field">
            <label for="password">${t('auth.password')}</label>
            <input id="password" name="password" type="password" autocomplete="new-password" required minlength="8" dir="ltr" aria-describedby="pw-hint" placeholder="••••••••">
            <span class="hint" id="pw-hint">${t('auth.passwordHint')}</span>
          </div>
          <label class="check field" style="margin-bottom:20px">
            <input type="checkbox" name="terms" required>
            <span>${t('auth.acceptTerms')} <a href="/privacy" target="_blank" style="color:var(--primary)">${t('footer.privacy')}</a></span>
          </label>
          <button class="btn btn-primary btn-lg" style="width:100%" type="submit">${t('auth.createAccount')}</button>
        </form>
        <p class="small" style="margin-top:18px;text-align:center;color:var(--muted)">
          ${t('auth.haveAccount')} <a href="/login" style="color:var(--primary);font-weight:700">${t('auth.login')}</a>
        </p>
      </div>
    </div>`.s;

  const f = root.querySelector('#f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button[type=submit]');
    const err = root.querySelector('#err');
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = '…';
    try {
      const { user } = await api.post('/auth/register', {
        name: f.name.value, email: f.email.value, password: f.password.value,
        acceptTerms: f.terms.checked, locale: getLocale(),
      });
      store.user = user;
      toast(t('auth.welcome', { name: user.name }));
      navigate(safeNext(query), { replace: true });
    } catch (ex) {
      err.textContent = errorMessage(ex);
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = t('auth.createAccount');
    }
  };
}
