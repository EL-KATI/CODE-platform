import { html, raw } from '../ui.js';
import { t } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';

// ── صفحة بطل الكود العامة (/champion) ────────────────────────────────────────
// تظهر لأي زائر، لكن التحدي يتطلب تسجيل الدخول
export async function championView(root) {
  root.innerHTML = html`<div class="champ-page-wrap"><div class="champ-page-loading muted">${t('common.loading')}</div></div>`.s;

  const today = new Date().toISOString().slice(0, 10);
  const loc   = document.documentElement.lang === 'fr' ? 'fr-MA' : 'ar-MA';
  const dateLabel = new Date().toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' });

  // نجيب البيانات — إذا مسجل دخول نجيب /challenge/today، إلا نجيب /challenge/leaderboard فقط
  let chData = null;
  let lbData  = [];
  const isAuth = !!store.user;

  try {
    if (isAuth) {
      chData = await api.get('/challenge/today');
      lbData = chData ? [] : [];
      const lb = await api.get('/challenge/leaderboard');
      lbData = lb.leaderboard || [];
    } else {
      const lb = await api.get('/challenge/leaderboard');
      lbData = lb.leaderboard || [];
    }
  } catch { lbData = []; }

  const champ = chData?.globalChamp || (lbData.length ? lbData[0] : null);
  const mine  = chData?.mine || null;
  const myRank = chData?.globalRank || null;

  root.innerHTML = html`
    <div class="champ-page">

      <!-- Hero -->
      <div class="champ-page-hero">
        <div class="champ-page-hero-deco" aria-hidden="true">
          <span class="cpd cpd-1"></span><span class="cpd cpd-2"></span>
          <span class="cpd cpd-3"></span><span class="cpd cpd-4"></span>
        </div>
        <div class="champ-page-hero-content">
          <div class="champ-page-badge">${raw('🏆')} ${t('champ.title')}</div>
          <h1 class="champ-page-title">${t('champ.pageTitle')}</h1>
          <p class="champ-page-sub">${t('champ.pageSub')}</p>
          <div class="champ-page-date">${dateLabel}</div>

          <!-- بطل اليوم -->
          ${champ ? html`
            <div class="champ-page-winner">
              ${champ.picture ? html`<img src="${champ.picture}" class="champ-page-av" alt="">` : html`<div class="champ-page-av champ-page-av-ph">👤</div>`}
              <div>
                <div class="champ-page-crown">${raw('👑')} ${t('champ.grandChamp')}</div>
                <div class="champ-page-wname">${champ.name}</div>
                ${champ.school_name ? html`<div class="champ-page-school muted small">${champ.school_name}</div>` : html``}
                <div class="champ-page-wscore">${champ.score}/7 · ${champ.time_taken}s</div>
              </div>
            </div>` : html`
            <div class="champ-page-nochamp">${t('champ.noChampYet')}</div>`}

          <!-- CTA -->
          ${!isAuth ? html`
            <div class="champ-page-cta">
              <p class="champ-page-cta-hint">${t('champ.loginToPlay')}</p>
              <div class="champ-page-cta-btns">
                <a href="/login" class="btn btn-primary btn-lg">${t('auth.login')}</a>
                <a href="/register" class="btn btn-secondary btn-lg">${t('auth.createAccount')}</a>
              </div>
            </div>` : mine ? html`
            <div class="champ-page-mine">
              ${t('champ.yourScore')}: <strong>${mine.score}/7</strong> · ${mine.time_taken}s
              ${myRank ? html` · 🏅 ${t('champ.rank')} ${myRank}` : html``}
            </div>` : html`
            <div class="champ-page-cta">
              <p class="champ-page-cta-hint">${t('champ.joinToday')}</p>
              <button class="btn btn-primary btn-lg" id="cp-start">${raw('⚡')} ${t('champ.start')}</button>
            </div>`}
        </div>
      </div>

      <!-- لوحة الصدارة -->
      <div class="champ-page-lb">
        <h2 class="champ-page-lb-title">${t('champ.globalBoard')}</h2>
        ${lbData.length ? html`
          <div class="champ-page-lb-list">
            ${lbData.map((r) => html`
              <div class="champ-board-row ${store.user && r.user_id === store.user.id ? 'is-me' : ''}">
                <span class="champ-rank">${r.rank === 1 ? raw('🥇') : r.rank === 2 ? raw('🥈') : r.rank === 3 ? raw('🥉') : r.rank}</span>
                <span class="champ-mini-av">👤</span>
                <span class="champ-board-name">${t('champ.candidate')} #${r.user_id}</span>
                <span class="champ-board-score">${r.score}/7</span>
                <span class="champ-board-time muted small">${r.time_taken}s</span>
              </div>`)}
          </div>` : html`
          <div class="champ-page-empty muted">${t('champ.noEntries')}</div>`}

        ${!isAuth ? html`
          <div style="text-align:center;margin-top:28px">
            <a href="/register" class="btn btn-primary">${t('champ.joinCTA')}</a>
          </div>` : html``}
      </div>

    </div>`.s;

  // زر بدء التحدي (للمسجل دخول فقط)
  const startBtn = root.querySelector('#cp-start');
  if (startBtn) {
    startBtn.onclick = async () => {
      const { openChallengeFromPage } = await import('./dashboard.js');
      openChallengeFromPage(root);
    };
  }
}
