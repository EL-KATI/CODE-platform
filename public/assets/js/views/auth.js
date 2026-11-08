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
    <div style="max-width:600px;margin:32px auto">
      <!-- Brand mark -->
      <div style="text-align:center;margin-bottom:24px">
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

          <!-- §1 الهوية -->
          <fieldset style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px">
            <legend style="font-weight:700;padding:0 6px;font-size:.9rem">🪪 ${t('auth.sectionIdentity')}</legend>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div class="field" style="margin:0">
                <label>${t('auth.idType')}</label>
                <select class="input" name="id_type" required>
                  <option value="CIN">CIN</option>
                  <option value="CD">CD (جواز السفر)</option>
                  <option value="CS">CS (بطاقة الإقامة)</option>
                </select>
              </div>
              <div class="field" style="margin:0">
                <label>${t('auth.cinNum')} *</label>
                <input class="input" name="cin" required maxlength="20" placeholder="AB123456" style="text-transform:uppercase">
              </div>
              <div class="field" style="margin:0">
                <label>${t('auth.firstNameFr')} *</label>
                <input class="input" name="first_name_fr" required maxlength="80" placeholder="Prénom">
              </div>
              <div class="field" style="margin:0">
                <label>${t('auth.lastNameFr')} *</label>
                <input class="input" name="last_name_fr" required maxlength="80" placeholder="Nom">
              </div>
              <div class="field" style="margin:0">
                <label>${t('auth.firstNameAr')}</label>
                <input class="input" name="first_name_ar" maxlength="80" placeholder="الاسم الشخصي">
              </div>
              <div class="field" style="margin:0">
                <label>${t('auth.lastNameAr')}</label>
                <input class="input" name="last_name_ar" maxlength="80" placeholder="الاسم العائلي">
              </div>
              <div class="field" style="margin:0">
                <label>${t('auth.gender')}</label>
                <select class="input" name="gender">
                  <option value="M">ذكر</option>
                  <option value="F">أنثى</option>
                </select>
              </div>
              <div class="field" style="margin:0">
                <label>${t('auth.nationality')}</label>
                <input class="input" name="nationality" value="MAROCAINE" maxlength="50">
              </div>
              <div class="field" style="margin:0">
                <label>${t('auth.birthDate')}</label>
                <input class="input" name="birth_date" type="date">
              </div>
              <div class="field" style="margin:0">
                <label>${t('auth.birthPlaceFr')}</label>
                <input class="input" name="birth_place_fr" maxlength="100" placeholder="Lieu de naissance">
              </div>
            </div>
          </fieldset>

          <!-- §2 التواصل -->
          <fieldset style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px">
            <legend style="font-weight:700;padding:0 6px;font-size:.9rem">📞 ${t('auth.sectionContact')}</legend>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div class="field" style="grid-column:1/-1;margin:0">
                <label>${t('auth.email')} *</label>
                <input class="input" name="email" type="email" autocomplete="email" required dir="ltr" placeholder="example@gmail.com">
              </div>
              <div class="field" style="margin:0">
                <label>${t('auth.phone')} *</label>
                <input class="input" name="phone" type="tel" required maxlength="20" placeholder="06xxxxxxxx">
              </div>
              <div class="field" style="margin:0">
                <label>${t('auth.city')}</label>
                <input class="input" name="city" maxlength="80" placeholder="Casablanca">
              </div>
            </div>
          </fieldset>

          <!-- §3 المؤسسة (اختياري) -->
          <fieldset style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px">
            <legend style="font-weight:700;padding:0 6px;font-size:.9rem">🏫 ${t('auth.sectionSchool')}</legend>
            <p class="muted small" style="margin:0 0 10px">${t('auth.schoolHint')}</p>
            <div class="field" style="margin:0">
              <label>${t('auth.schoolNarsaNum')}</label>
              <input class="input" name="school_narsa_num" maxlength="40" dir="ltr" placeholder="رقم رخصة المؤسسة في NARSA">
            </div>
          </fieldset>

          <!-- كلمة السر -->
          <div style="padding:10px 12px;background:var(--surface-alt,#f8fafc);border-radius:8px;border:1px solid var(--border);margin-bottom:14px;font-size:.88rem">
            🔑 ${t('auth.autoPassword')}
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
      const fd = new FormData(f);
      const body = { acceptTerms: f.terms.checked, locale: getLocale() };
      for (const [k, v] of fd.entries()) {
        if (k === 'terms') continue;
        const val = v.trim();
        if (val) body[k] = val;
      }
      const { user, generatedPassword } = await api.post('/auth/register', body);
      store.user = user;
      navigate(safeNext(query), { replace: true });
      // عرض بيانات الدخول مرة واحدة — يجب حفظها
      const { showCredentials } = await import('./admin.js');
      await showCredentials({ email: user.email, password: generatedPassword, name: user.name });
    } catch (ex) {
      err.textContent = errorMessage(ex);
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = t('auth.createAccount');
    }
  };
}
