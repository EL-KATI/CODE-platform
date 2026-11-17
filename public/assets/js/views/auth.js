import { html, raw, toast, errorMessage } from '../ui.js';
import { t, getLocale, setLocale } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';

function safeNext(query) {
  const n = query.next || '/dashboard';
  return n.startsWith('/') && !n.startsWith('//') ? n : '/dashboard';
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

// ── الصفحة الموحدة (login + register) ────────────────────────────────────────
function authPageHtml(tab, query) {
  const isLogin = tab === 'login';
  const nextParam = query.next ? `?next=${encodeURIComponent(query.next)}` : '';

  return html`
    <div class="auth-wrap auth-wrap--simple">
      <!-- منطقة النموذج فقط، بدون لوحة ديكور -->
      <div class="auth-form-area">
        <div class="auth-card-box">
          <!-- تبويبات الدخول / التسجيل -->
          <div class="auth-tabs">
            <button class="auth-tab ${isLogin ? 'active' : ''}" data-tab="login">${t('auth.login')}</button>
            <button class="auth-tab ${!isLogin ? 'active' : ''}" data-tab="register">${t('auth.createAccount')}</button>
          </div>

          <!-- ─── نموذج الدخول ───────────────────── -->
          <div id="pane-login" class="auth-pane ${isLogin ? '' : 'hidden'}">
            <div id="err-login" class="form-error" role="alert" hidden></div>
            <form id="f-login" novalidate class="auth-form">
              <div class="field">
                <label for="login-email">${t('auth.email')}</label>
                <input id="login-email" name="email" type="email" autocomplete="email"
                       required dir="ltr" placeholder="example@gmail.com">
              </div>
              <div class="field">
                <label for="login-pass">${t('auth.password')}</label>
                <input id="login-pass" name="password" type="password"
                       autocomplete="current-password" required dir="ltr" placeholder="••••••••">
              </div>
              <button class="btn btn-primary btn-lg auth-submit" type="submit">${t('auth.login')}</button>
            </form>
            <div class="auth-divider"><hr><span>${t('auth.orContinueWith')}</span><hr></div>
            ${googleBtn()}
          </div>

          <!-- ─── نموذج التسجيل ─────────────────── -->
          <div id="pane-register" class="auth-pane ${!isLogin ? '' : 'hidden'}">
            <div id="err-register" class="form-error" role="alert" hidden></div>
            ${googleBtn()}
            <div class="auth-divider"><hr><span>${t('auth.orContinueWith')}</span><hr></div>
            <form id="f-register" novalidate class="auth-form">
              <div class="auth-name-row">
                <div class="field" style="margin:0">
                  <label for="reg-first">${t('auth.firstName')} *</label>
                  <input id="reg-first" class="input" name="first_name" required maxlength="80"
                         placeholder="${t('auth.firstName')}" autocomplete="given-name">
                </div>
                <div class="field" style="margin:0">
                  <label for="reg-last">${t('auth.lastName')} *</label>
                  <input id="reg-last" class="input" name="last_name" required maxlength="80"
                         placeholder="${t('auth.lastName')}" autocomplete="family-name">
                </div>
              </div>
              <div class="field">
                <label for="reg-email">${t('auth.email')} *</label>
                <input id="reg-email" class="input" name="email" type="email"
                       autocomplete="email" required dir="ltr" placeholder="example@gmail.com">
              </div>
              <div class="auth-name-row">
                <div class="field" style="margin:0">
                  <label for="reg-phone">${t('auth.phone')} *</label>
                  <input id="reg-phone" class="input" name="phone" type="tel" required
                         maxlength="20" placeholder="06xxxxxxxx" autocomplete="tel">
                </div>
                <div class="field" style="margin:0">
                  <label for="reg-city">${t('auth.city')}</label>
                  <input id="reg-city" class="input" name="city" maxlength="80"
                         placeholder="Casablanca" autocomplete="address-level2">
                </div>
              </div>
              <div class="auth-pass-hint">🔑 ${t('auth.autoPassword')}</div>
              <label class="check field" style="margin-bottom:16px">
                <input type="checkbox" name="terms" required>
                <span>${t('auth.acceptTerms')} <a href="/privacy" target="_blank">${t('footer.privacy')}</a></span>
              </label>
              <button class="btn btn-primary btn-lg auth-submit" type="submit">${t('auth.createAccount')}</button>
            </form>
          </div>
        </div>
      </div>
    </div>`;

}

// ── View موحد يخدم /login و /register ────────────────────────────────────────
function mountAuthView(root, { query }, defaultTab) {
  root.innerHTML = authPageHtml(defaultTab, query).s;

  // تبديل التبويبات
  root.querySelectorAll('.auth-tab').forEach(btn => {
    btn.onclick = () => {
      const tab = btn.dataset.tab;
      root.querySelectorAll('.auth-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      root.querySelectorAll('.auth-pane').forEach(p => p.classList.toggle('hidden', p.id !== `pane-${tab}`));
      // تحديث URL بدون إعادة تحميل
      const nextParam = query.next ? `?next=${encodeURIComponent(query.next)}` : '';
      history.replaceState(null, '', `/${tab}${nextParam}`);
    };
  });

  // Google buttons (يوجد زران — واحد في كل pane)
  root.querySelectorAll('#btn-google').forEach(btn => {
    btn.onclick = () => { window.location.href = '/api/auth/google'; };
  });

  // ── نموذج الدخول ──
  const fLogin = root.querySelector('#f-login');
  fLogin.onsubmit = async (e) => {
    e.preventDefault();
    const btn = fLogin.querySelector('button[type=submit]');
    const err = root.querySelector('#err-login');
    err.hidden = true; btn.disabled = true; btn.textContent = '…';
    try {
      const result = await api.post('/auth/login', {
        email: fLogin.email.value,
        password: fLogin.password.value,
      });
      if (result.requiresOtp) {
        navigate(`/verify-otp?email=${encodeURIComponent(result.email)}`, { replace: true });
        return;
      }
      store.user = result.user;
      setLocale(result.user.locale || getLocale());
      toast(t('auth.welcome', { name: result.user.name }));
      navigate(safeNext(query), { replace: true });
    } catch (ex) {
      err.textContent = errorMessage(ex); err.hidden = false;
      btn.disabled = false; btn.textContent = t('auth.login');
      fLogin.password.focus();
    }
  };

  // ── نموذج التسجيل ──
  const fReg = root.querySelector('#f-register');
  fReg.onsubmit = async (e) => {
    e.preventDefault();
    const btn = fReg.querySelector('button[type=submit]');
    const err = root.querySelector('#err-register');
    err.hidden = true; btn.disabled = true; btn.textContent = '…';
    try {
      const body = {
        acceptTerms: fReg.terms.checked,
        locale: getLocale(),
        first_name: fReg.first_name.value.trim(),
        last_name: fReg.last_name.value.trim(),
        email: fReg.email.value.trim(),
        phone: fReg.phone.value.trim(),
        city: fReg.city.value.trim() || undefined,
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

export function loginView(root, ctx)    { mountAuthView(root, ctx, 'login'); }
export function registerView(root, ctx) { mountAuthView(root, ctx, 'register'); }

// ── OTP ───────────────────────────────────────────────────────────────────────
export function verifyOtpView(root, { query }) {
  const email = decodeURIComponent(query.email || '');

  root.innerHTML = html`
    <div class="auth-wrap auth-wrap--narrow">
      <div class="auth-card-box auth-card-box--center">
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
        <p class="auth-switch-link"><a href="/login">${t('auth.backToLogin')}</a></p>
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
async function _loadEnrollStatus(root) {
  try {
    const rows = await api.get('/admin/enroll/status');
    const box = root.querySelector('#status-box');
    const form = root.querySelector('#enroll-f');
    if (!box) return;
    if (rows && rows.length) {
      const r = rows[0];
      if (r.status === 'approved') {
        try {
          const meData = await api.get('/auth/me');
          if (meData?.user) store.user = meData.user;
        } catch {}
        box.innerHTML = `
          <div style="text-align:center;padding:24px 0">
            <div style="font-size:2.5rem;margin-bottom:12px">✅</div>
            <h3 style="margin:0 0 6px;color:var(--green-600)">${t('auth.enrollApproved')}</h3>
            <p class="muted small" style="margin:0 0 20px">🏫 <strong>${r.school_name || ''}</strong></p>
            <a class="btn btn-primary" href="/dashboard">${t('nav.home')}</a>
          </div>`;
        if (form) form.style.display = 'none';
      } else if (r.status === 'pending') {
        box.innerHTML = `
          <div style="padding:16px;border-radius:10px;background:var(--surface-2);border:2px solid var(--orange-500);margin-bottom:16px;text-align:center">
            <div style="font-size:1.8rem;margin-bottom:8px">⏳</div>
            <p style="margin:0 0 4px;font-weight:600">🏫 ${r.school_name || ''}</p>
            <p class="muted small" style="margin:0">${t('auth.enrollPending')}</p>
          </div>`;
        if (form) form.style.display = 'none';
      } else {
        box.innerHTML = `
          <div style="padding:12px 14px;border-radius:8px;background:var(--surface-2);border:1.5px solid var(--red-600);margin-bottom:16px;font-size:.9rem">
            🏫 <strong>${r.school_name || ''}</strong> — <span style="color:var(--red-600)">${t('auth.enrollRejected')}</span>
          </div>`;
        if (form) form.style.display = '';
      }
    } else {
      box.innerHTML = '';
      if (form) form.style.display = '';
    }
  } catch { /* لا توجد طلبات */ }
}

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

  await _loadEnrollStatus(root);

  root.querySelector('#enroll-f').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button');
    const err = root.querySelector('#err2');
    err.hidden = true; btn.disabled = true; btn.textContent = '…';
    try {
      const schools = await api.get(`/schools?narsa_num=${encodeURIComponent(f.narsa_num.value.trim())}`);
      if (!schools || !schools.length) throw new Error(t('err.school_not_found'));
      const result = await api.post('/admin/enroll', { school_id: schools[0].id });
      if (result && result.message === 'already_requested') {
        err.textContent = t('err.already_requested') || 'سبق إرسال طلب لهذه المؤسسة.';
        err.hidden = false;
      } else {
        toast(t('auth.enrollPending'));
        f.reset();
        await _loadEnrollStatus(root);
      }
    } catch (ex) {
      err.textContent = ex.message || errorMessage(ex); err.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = t('auth.requestEnroll');
    }
  };
}
