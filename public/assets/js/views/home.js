import { html } from '../ui.js';
import { t } from '../i18n.js';
import { store } from '../store.js';
import { navigate } from '../router.js';

export async function homeView(root) {
  if (store.user) return navigate('/dashboard', { replace: true });
  const s = await store.getSettings();

  const features = [
    ['📚', 'home.f.lessons'],
    ['🎯', 'home.f.practice'],
    ['⏱️', 'home.f.exam'],
    ['🧠', 'home.f.review'],
    ['📊', 'home.f.progress'],
    ['♿', 'home.f.access'],
  ];

  const steps = [1, 2, 3, 4];

  const axes = [
    ['🛣️', 'blue', 'الطريق', 'علامات وإشارات المرور، أنواع الطرق، والسلوك الطرقي السليم.'],
    ['🚦', 'orange', 'قواعد السير', 'التجاوز، الأسبقية، السرعة، ومسافات الأمان.'],
    ['🧑‍✈️', 'purple', 'السائق', 'السلوك، التعب، الكحول، والإسعافات الأولية.'],
    ['🚗', 'green', 'المركبة', 'صيانة المركبة والتجهيزات الإلزامية.'],
    ['⚖️', 'red', 'المخالفات والعقوبات', 'العقوبات والغرامات ونظام نقط الرصيد.'],
  ];

  root.innerHTML = html`
    <div class="pg home">
      <section class="home-hero">
        <span class="home-badge">${t('home.badge')}</span>
        <h1>${t('home.title')}</h1>
        <p>${t('home.subtitle', { n: s.questionCount, pass: s.passMark })}</p>
        <div class="home-cta">
          <a class="btn btn-primary btn-lg" href="/register">${t('home.cta')}</a>
          <a class="btn btn-secondary btn-lg" href="/lessons">${t('home.ctaLessons')}</a>
          <a class="btn btn-ghost btn-lg" href="/champion">🏆 ${t('champ.pageTitle')}</a>
        </div>
        <div class="home-stats">
          <div><strong>${s.questionCount}</strong><small>سؤال في الامتحان</small></div>
          <div><strong>5</strong><small>محاور NARSA</small></div>
          <div><strong>${s.passMark}<span>/${s.questionCount}</span></strong><small>عتبة النجاح</small></div>
        </div>
      </section>

      <section>
        <h2 class="home-h">${t('home.method')}</h2>
        <div class="home-steps">
          ${steps.map((n) => html`<div class="card home-step">
            <span class="series-num" aria-hidden="true">${n}</span>
            <h3>${t(`home.s${n}.t`)}</h3>
            <p class="muted small">${t(`home.s${n}.d`)}</p>
          </div>`)}
        </div>
      </section>

      <section>
        <h2 class="home-h">المحاور الخمسة</h2>
        <p class="home-sub">الإطار الرسمي للدراسة النظرية بالمغرب</p>
        <div class="cat-grid">
          ${axes.map(([icon, tone, name, desc]) => html`<div class="cat-tile home-axis tone-${tone}">
            <span class="cat-tile-icon" aria-hidden="true">${icon}</span>
            <strong>${name}</strong><small>${desc}</small>
          </div>`)}
        </div>
      </section>

      <section>
        <h2 class="home-h">${t('home.features')}</h2>
        <div class="card dash-list home-features">
          ${features.map(([icon, k]) => html`<div class="cat-row">
            <span class="cat-icon" aria-hidden="true">${icon}</span>
            <div class="cat-body"><strong>${t(k + '.t')}</strong><span class="muted small">${t(k + '.d')}</span></div>
          </div>`)}
        </div>
      </section>

      <section class="home-final">
        <h2>ابدأ مسيرتك نحو رخصة السياقة اليوم</h2>
        <p>التسجيل مجاني. لا تحتاج بطاقة بنكية.</p>
        <div class="home-cta">
          <a class="btn btn-primary btn-lg" href="/register">${t('home.cta')}</a>
          <a class="btn btn-lg home-ghost" href="/login">${t('nav.login')}</a>
        </div>
      </section>
    </div>`.s;
}
