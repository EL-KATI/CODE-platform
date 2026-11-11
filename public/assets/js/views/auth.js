import { html, raw, toast, errorMessage } from '../ui.js';
import { t, getLocale, setLocale } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';

function safeNext(query) {
  const n = query.next || '/dashboard';
  return n.startsWith('/') && !n.startsWith('//') ? n : '/dashboard';
}

// ── لوحة الديكور اليسرى (مشتركة بين login/register) ──────────────────────────
function authPanel(mode) {
  const isLogin = mode === 'login';
  return html`
    <div class="auth-panel">
      <!-- ديكور هندسي -->
      <div class="auth-deco" aria-hidden="true">
        <span class="adeco adeco-tl"></span>
        <span class="adeco adeco-tr"></span>
        <span class="adeco adeco-br"></span>
        <span class="adeco adeco-bl"></span>
        <span class="adeco adeco-c1"></span>
        <span class="adeco adeco-c2"></span>
        <span class="adeco adeco-c3"></span>
      </div>
      <!-- محتوى الديكور -->
      <div class="auth-panel-content">
        <!-- لوغو -->
        <div class="auth-logo">
          <div class="auth-logo-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 15.5V12l1.6-4.2A1.5 1.5 0 0 1 8 6.8h8a1.5 1.5 0 0 1 1.4 1l1.6 4.2v3.5"/>
              <path d="M4.5 15.5h15"/>
              <circle cx="8" cy="15.5" r="1.6" fill="#fff" stroke="none"/>
              <circle cx="16" cy="15.5" r="1.6" fill="#fff" stroke="none"/>
            </svg>
          </div>
          <span class="auth-logo-name">CODE Platform</span>
        </div>
        <!-- نص -->
        <div class="auth-panel-text">
          <h2 class="auth-panel-h">${t(isLogin ? 'auth.panelLoginH' : 'auth.panelRegH')}</h2>
          <p class="auth-panel-p">${t(isLogin ? 'auth.panelLoginP' : 'auth.panelRegP')}</p>
        </div>
        <!-- إحصائيات -->
        <div class="auth-stats">
          <div class="auth-stat"><strong>7</strong><span>${t('auth.statQuestions')}</span></div>
          <div class="auth-stat"><strong>🏆</strong><span>${t('auth.statChamp')}</span></div>
          <div class="auth-stat"><strong>✓</strong><span>${t('auth.statFree')}</span></div>
        </div>
        <!-- tabs التبديل بين login/register -->
        <div class="auth-panel-switch">
          <a href="/login"  class="auth-sw-btn ${isLogin  ? 'active' : ''}">${t('auth.login')}</a>
          <a href="/register" class="auth-sw-btn ${!isLogin ? 'active' : ''}">${t('auth.createAccount')}</a>
        </div>
      </div>
    </div>`;
}

// ── Google Sign-In button ─────────────────────────────────────────────────────
function googleBtn() {
  return raw(`<button type="button" id="btn-google" class="auth-google-btn">
  <svg width="20" height="20" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.2l6.8-6.8C35.8 2.4 30.2 0 24 0 14.7 0 6.7 5.4 2.9 13.3l7.9 6.1C12.6 13.2 17.9 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8C43.9 37.3 46.5 31.3 46.5 24.5z"/>
    <path fill="#FBBC05" d="M10.8 28.6A14.7 14.7 0 0 1 9.5 24c0-1.6.3-3.1.7-4.6l-7.9-6.1A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.5 10.7l8.3-6.1z"/>
    <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2.1 1.4-4.7 2.3-7.7 2.3-6.1 0-11.4-3.7-13.2-9.4l-8.3 6.1C6.7 42.6 14.7 48 24 48z"/>
  </svg>
  ${t('auth.googleSignIn')}
</button>`);
}

// ── Login ─────────────────────────────────────────────────────────────────────
export function loginView(root, { query }) {
  root.innerHTML = html`
    <div class="auth-layout">
      ${authPanel('login')}
      <div class="auth-form-side">
        <div class="auth-form-box">
          <h1 class="auth-form-title">${t('auth.loginTitle')}</h1>
          <p class="muted auth-form-sub">${t('auth.loginSubtitle')}</p>
          <div id="err" class="form-error" role="alert" hidden></div>
          <form id="f" novalidate class="auth-form">
            <div class="field">
              <label for="email">${t('auth.email')}</label>
              <input id="email" name="email" type="email" autocomplete="email" required dir="ltr" placeholder="example@gmail.com">
            </div>
            <div class="field">
              <label for="password">${t('auth.password')}</label>
              <input id="password" name="password" type="password" autocomplete="current-password" required dir="ltr" placeholder="••••••••">
            </div>
            <button class="btn btn-primary btn-lg auth-submit" type="submit">${t('auth.login')}</button>
          </form>
          <div class="auth-divider"><hr><span>${t('auth.orContinueWith')}</span><hr></div>
          ${googleBtn()}
          <p class="auth-switch-link">
            ${t('auth.noAccount')} <a href="/register${query.next ? `?next=${encodeURIComponent(query.next)}` : ''}">${t('auth.createAccount')}</a>
          </p>
        </div>
      </div>
    </div>`.s;

  root.querySelector('#btn-google').onclick = () => { window.location.href = '/api/auth/google'; };

  const f = root.querySelector('#f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button[type=submit]');
    const err = root.querySelector('#err');
    err.hidden = true; btn.disabled = true; btn.textContent = '…';
    try {
      const result = await api.post('/auth/login', { email: f.email.value, password: f.password.value });
      if (result.requiresOtp) { navigate(`/verify-otp?email=${encodeURIComponent(result.email)}`, { replace: true }); return; }
      store.user = result.user;
      setLocale(result.user.locale || getLocale());
      toast(t('auth.welcome', { name: result.user.name }));
      navigate(safeNext(query), { replace: true });
    } catch (ex) {
      err.textContent = errorMessage(ex); err.hidden = false;
      btn.disabled = false; btn.textContent = t('auth.login');
      f.password.focus();
    }
  };
}

// ── Register ──────────────────────────────────────────────────────────────────
export function registerView(root, { query }) {
  root.innerHTML = html`
    <div class="auth-layout">
      ${authPanel('register')}
      <div class="auth-form-side">
        <div class="auth-form-box">
          <h1 class="auth-form-title">${t('auth.registerTitle')}</h1>
          <p class="muted auth-form-sub">${t('auth.registerSubtitle')}</p>
          <div id="err" class="form-error" role="alert" hidden></div>
          ${googleBtn()}
          <div class="auth-divider"><hr><span>${t('auth.orContinueWith')}</span><hr></div>
          <form id="f" novalidate class="auth-form">
            <div class="auth-name-row">
              <div class="field" style="margin:0">
                <label for="first_name">${t('auth.firstName')} *</label>
                <input id="first_name" class="input" name="first_name" required maxlength="80" placeholder="الاسم" autocomplete="given-name">
              </div>
              <div class="field" style="margin:0">
                <label for="last_name">${t('auth.lastName')} *</label>
                <input id="last_name" class="input" name="last_name" required maxlength="80" placeholder="النسب" autocomplete="family-name">
              </div>
            </div>
            <div class="field">
              <label for="email">${t('auth.email')} *</label>
              <input id="email" class="input" name="email" type="email" autocomplete="email" required dir="ltr" placeholder="example@gmail.com">
            </div>
            <div class="auth-name-row">
              <div class="field" style="margin:0">
                <label for="phone">${t('auth.phone')} *</label>
                <input id="phone" class="input" name="phone" type="tel" required maxlength="20" placeholder="06xxxxxxxx" autocomplete="tel">
              </div>
              <div class="field" style="margin:0">
                <label for="city">${t('auth.city')}</label>
                <input id="city" class="input" name="city" maxlength="80" placeholder="Casablanca" autocomplete="address-level2">
              </div>
            </div>
            <div class="auth-pass-hint">🔑 ${t('auth.autoPassword')}</div>
            <label class="check field" style="margin-bottom:16px">
              <input type="checkbox" name="terms" required>
              <span>${t('auth.acceptTerms')} <a href="/privacy" target="_blank">${t('footer.privacy')}</a></span>
            </label>
            <button class="btn btn-primary btn-lg auth-submit" type="submit">${t('auth.createAccount')}</button>
          </form>
          <p class="auth-switch-link">
            ${t('auth.haveAccount')} <a href="/login">${t('auth.login')}</a>
          </p>
        </div>
      </div>
    </div>`.s;

  root.querySelector('#btn-google').onclick = () => { window.location.href = '/api/auth/google'; };

  const f = root.querySelector('#f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button[type=submit]');
    const err = root.querySelector('#err');
    err.hidden = true; btn.disabled = true; btn.textContent = '…';
    try {
      const body = {
        acceptTerms: f.terms.checked, locale: getLocale(),
        first_name: f.first_name.value.trim(), last_name: f.last_name.value.trim(),
        email: f.email.value.trim(), phone: f.phone.value.trim(),
        city: f.city.value.trim() || undefined,
      };
      const { user, generatedPassword } = await api.post('/auth/register', body);
      store.user = user;
      navigate(safeNext(query), { replace: true });
      const { showCredentials } = await import('./admin.js');
      await showCredentials({ email: user.email, password: generatedPassword, name: user.name });
    } catch (ex) {
      err.textContent = errorMessage(ex); err.hidden = false;
      btn.disabled = false; btn.textContent = t('auth.createAccount');
    }
  };
}

// ── OTP ───────────────────────────────────────────────────────────────────────
export function verifyOtpView(root, { query }) {
  const email = decodeURIComponent(query.email || '');

  root.innerHTML = html`
    <div class="auth-layout">
      ${authPanel('login')}
      <div class="auth-form-side">
        <div class="auth-form-box">
          <div class="auth-otp-icon">🔐</div>
          <h1 class="auth-form-title">${t('auth.otpTitle')}</h1>
          <p class="muted auth-form-sub">${t('auth.otpSubtitle', { email })}</p>
          <div id="err" class="form-error" role="alert" hidden></div>
          <form id="f" novalidate class="auth-form">
            <div class="field" style="margin-bottom:20px">
              <label for="code">${t('auth.otpCode')}</label>
              <input id="code" name="code" type="text" inputmode="numeric" pattern="[0-9]{6}"
                maxlength="6" autocomplete="one-time-code" required dir="ltr"
                placeholder="● ● ● ● ● ●" class="auth-otp-input">
            </div>
            <button class="btn btn-primary btn-lg auth-submit" type="submit">${t('auth.otpVerify')}</button>
          </form>
          <div style="margin-top:16px;text-align:center">
            <button id="btn-resend" class="btn btn-ghost btn-sm">${t('auth.otpResend')}</button>
          </div>
          <p id="timer" class="small muted" style="text-align:center;margin-top:8px"></p>
        </div>
      </div>
    </div>`.s;

  const f = root.querySelector('#f');
  const err = root.querySelector('#err');
  const timer = root.querySelector('#timer');
  const btnSend = root.querySelector('#btn-resend');
  const codeIn = root.querySelector('#code');
  codeIn.focus();

  let seconds = 10 * 60;
  const tick = setInterval(() => {
    seconds--;
    if (seconds <= 0) {
      clearInterval(tick); timer.textContent = t('auth.otpExpired');
      f.querySelector('button[type=submit]').disabled = true;
    } else {
      const m = String(Math.floor(seconds / 60)).padStart(2, '0');
      const s = String(seconds % 60).padStart(2, '0');
      timer.textContent = t('auth.otpTimer', { time: `${m}:${s}` });
    }
  }, 1000);

  codeIn.oninput = () => { codeIn.value = codeIn.value.replace(/\D/g, '').slice(0, 6); };

  f.onsubmit = async (e) => {
    e.preventDefault();
    err.hidden = true;
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = '…';
    try {
      const { user } = await api.post('/auth/verify-otp', { email, code: codeIn.value.trim() });
      clearInterval(tick); store.user = user;
      setLocale(user.locale || getLocale());
      toast(t('auth.welcome', { name: user.name }));
      navigate('/admin', { replace: true });
    } catch (ex) {
      err.textContent = errorMessage(ex); err.hidden = false;
      btn.disabled = false; btn.textContent = t('auth.otpVerify');
      codeIn.value = ''; codeIn.focus();
    }
  };

  btnSend.onclick = async () => {
    btnSend.disabled = true; btnSend.textContent = '…';
    try { await api.post('/auth/send-otp', { email }); toast(t('auth.otpResent')); seconds = 10 * 60; }
    catch (ex) { toast(errorMessage(ex)); }
    finally { btnSend.disabled = false; btnSend.textContent = t('auth.otpResend'); }
  };
}

// ── Enroll ────────────────────────────────────────────────────────────────────
export async function enrollView(root) {
  root.innerHTML = html`
    <div style="max-width:480px;margin:32px auto">
      <div class="card" style="padding:28px">
        <h2 style="margin:0 0 6px">${t('auth.enrollTitle')}</h2>
        <p class="muted small" style="margin:0 0 20px">${t('auth.enrollHint')}</p>
        <div id="status-box"></div>
        <form id="enroll-f" novalidate>
          <div class="field">
            <label>${t('auth.schoolNarsaNum')} *</label>
            <input class="input" name="narsa_num" required maxlength="40" dir="ltr" placeholder="رقم رخصة المؤسسة">
          </div>
          <div id="err2" class="form-error" role="alert" hidden></div>
          <button class="btn btn-primary" style="width:100%" type="submit">${t('auth.requestEnroll')}</button>
        </form>
      </div>
    </div>`.s;

  try {
    const rows = await api.get('/admin/enroll/status');
    if (rows.length) {
      const r = rows[0];
      const color = r.status === 'approved' ? 'var(--green-600)' : r.status === 'rejected' ? 'var(--red-600)' : 'var(--orange-500)';
      const label = r.status === 'approved' ? t('auth.enrollApproved') : r.status === 'rejected' ? t('auth.enrollRejected') : t('auth.enrollPending');
      root.querySelector('#status-box').innerHTML = `<div style="padding:12px 14px;border-radius:8px;background:var(--surface-2);border:1.5px solid ${color};margin-bottom:16px;font-size:.9rem">🏫 <strong>${r.school_name || ''}</strong> — <span style="color:${color}">${label}</span></div>`;
    }
  } catch { /* ماعنده طلبات */ }

  root.querySelector('#enroll-f').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button');
    const err = root.querySelector('#err2');
    err.hidden = true; btn.disabled = true; btn.textContent = '…';
    try {
      const schools = await api.get(`/api/schools?narsa_num=${encodeURIComponent(f.narsa_num.value.trim())}`);
      if (!schools || !schools.length) throw new Error(t('err.school_not_found'));
      await api.post('/admin/enroll', { school_id: schools[0].id });
      toast(t('auth.enrollPending')); f.reset();
    } catch (ex) {
      err.textContent = ex.message || errorMessage(ex); err.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = t('auth.requestEnroll');
    }
  };
}
