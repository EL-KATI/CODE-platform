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

  root.innerHTML = html`
    <!-- ── Hero ──────────────────────────────────────────── -->
    <section class="hero" style="margin-bottom:36px">
      <span class="pill" style="margin-bottom:16px">${t('home.badge')}</span>
      <h1 style="margin-bottom:14px">${t('home.title')}</h1>
      <p style="margin-bottom:24px;font-size:1.1rem">${t('home.subtitle', { n: s.questionCount, pass: s.passMark })}</p>
      <div class="row" style="gap:12px">
        <a class="btn btn-primary btn-lg" href="/register">${t('home.cta')}</a>
        <a class="btn btn-secondary btn-lg" href="/lessons" style="background:rgb(255 255 255 / .08);border-color:rgb(255 255 255 / .2);color:#fff">${t('home.ctaLessons')}</a>
      </div>
      <!-- Stats rapides -->
      <div class="row" style="margin-top:28px;gap:24px">
        <div style="text-align:center">
          <div style="font-size:1.6rem;font-weight:800;color:#fb923c">${s.questionCount}+</div>
          <div style="font-size:.8rem;color:#a8a29e;font-weight:600">سؤال تدريبي</div>
        </div>
        <div style="width:1px;background:rgb(255 255 255 / .1);height:40px"></div>
        <div style="text-align:center">
          <div style="font-size:1.6rem;font-weight:800;color:#fb923c">5</div>
          <div style="font-size:.8rem;color:#a8a29e;font-weight:600">محاور NARSA</div>
        </div>
        <div style="width:1px;background:rgb(255 255 255 / .1);height:40px"></div>
        <div style="text-align:center">
          <div style="font-size:1.6rem;font-weight:800;color:#fb923c">${s.passMark}/${s.questionCount}</div>
          <div style="font-size:.8rem;color:#a8a29e;font-weight:600">عتبة النجاح</div>
        </div>
      </div>
    </section>

    <!-- ── الطريقة البيداغوجية ─────────────────────────── -->
    <div class="page-head" style="margin-bottom:20px">
      <div>
        <h2 style="margin:0">${t('home.method')}</h2>
        <p class="muted" style="margin:4px 0 0;font-size:.95rem">منهجية التعلم الفعّال — مبنية على علم النفس التعليمي</p>
      </div>
    </div>
    <div class="grid grid-4 steps-grid" style="margin-bottom:36px">
      ${steps.map((n) => html`
        <div class="card step-card" style="padding-top:22px;border-top:3px solid ${n === 1 ? 'var(--primary)' : n === 2 ? '#1d4ed8' : n === 3 ? '#15803d' : '#7c3aed'}">
          <h3 style="margin-bottom:6px">${t(`home.s${n}.t`)}</h3>
          <p class="muted small" style="margin:0;line-height:1.6">${t(`home.s${n}.d`)}</p>
        </div>`)}
    </div>

    <!-- ── محاور NARSA ──────────────────────────────────── -->
    <div class="page-head" style="margin-bottom:20px">
      <div>
        <h2 style="margin:0">المحاور الخمسة — NARSA</h2>
        <p class="muted" style="margin:4px 0 0;font-size:.95rem">الإطار الرسمي للدراسة النظرية بالمغرب</p>
      </div>
    </div>
    <div class="grid grid-3" style="margin-bottom:36px">
      <div class="card" style="border-inline-start:4px solid #c2410c">
        <span class="pill" style="background:#fff7ed;color:#c2410c;border-color:#fed7aa;margin-bottom:10px">🛣️ الطريق</span>
        <h3 style="margin-bottom:6px">قواعد الطريق</h3>
        <p class="muted small" style="margin:0">علامات وإشارات المرور، الأولوية، والسلوك الطرقي السليم.</p>
      </div>
      <div class="card" style="border-inline-start:4px solid #1d4ed8">
        <span class="pill" style="background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe;margin-bottom:10px">🚦 الحركة</span>
        <h3 style="margin-bottom:6px">قواعد السير</h3>
        <p class="muted small" style="margin:0">قواعد التجاوز، الأسبقية، السرعة، ومسافات الأمان.</p>
      </div>
      <div class="card" style="border-inline-start:4px solid #15803d">
        <span class="pill" style="background:#f0fdf4;color:#15803d;border-color:#bbf7d0;margin-bottom:10px">👤 السائق</span>
        <h3 style="margin-bottom:6px">السائق والسلامة</h3>
        <p class="muted small" style="margin:0">السلوك، التعب، الكحول، والإسعافات الأولية.</p>
      </div>
      <div class="card" style="border-inline-start:4px solid #7c3aed">
        <span class="pill" style="background:#faf5ff;color:#7c3aed;border-color:#e9d5ff;margin-bottom:10px">🚗 المركبة</span>
        <h3 style="margin-bottom:6px">ميكانيك المركبة</h3>
        <p class="muted small" style="margin:0">صيانة المركبة والتجهيزات الإلزامية.</p>
      </div>
      <div class="card" style="border-inline-start:4px solid #be123c">
        <span class="pill" style="background:#fff1f2;color:#be123c;border-color:#fecdd3;margin-bottom:10px">⚖️ المخالفات</span>
        <h3 style="margin-bottom:6px">المخالفات والعقوبات</h3>
        <p class="muted small" style="margin:0">العقوبات والغرامات ونظام نقط الرصيد.</p>
      </div>
      <div class="card" style="border-inline-start:4px solid var(--primary);background:var(--primary-soft)">
        <span class="pill pill-primary" style="margin-bottom:10px">📝 الامتحان</span>
        <h3 style="margin-bottom:6px">هيكل الامتحان</h3>
        <p class="muted small" style="margin:0">${s.questionCount} سؤالا — النجاح بـ ${s.passMark} إجابة صحيحة.</p>
      </div>
    </div>

    <!-- ── مميزات المنصة ────────────────────────────────── -->
    <div class="page-head" style="margin-bottom:20px">
      <h2 style="margin:0">${t('home.features')}</h2>
    </div>
    <div class="grid grid-3" style="margin-bottom:40px">
      ${features.map(([icon, k]) => html`
        <div class="card" style="display:flex;align-items:flex-start;gap:16px;padding:20px">
          <div style="font-size:1.6rem;flex:none;width:48px;height:48px;background:var(--primary-soft);border-radius:12px;display:grid;place-items:center;border:1px solid var(--primary-mid)">${icon}</div>
          <div>
            <h3 style="margin-bottom:4px;font-size:1rem">${t(k + '.t')}</h3>
            <p class="muted small" style="margin:0;line-height:1.6">${t(k + '.d')}</p>
          </div>
        </div>`)}
    </div>

    <!-- ── CTA final ────────────────────────────────────── -->
    <div class="card" style="text-align:center;padding:40px 24px;background:linear-gradient(135deg,#0c0a09,#1c1917);border:1px solid rgb(234 88 12 / .3)">
      <h2 style="color:#fff;margin-bottom:10px">ابدأ مسيرتك نحو رخصة السياقة اليوم</h2>
      <p style="color:#a8a29e;margin-bottom:24px;max-width:500px;margin-inline:auto">التسجيل مجاني. لا تحتاج بطاقة بنكية.</p>
      <div class="row" style="justify-content:center;gap:12px">
        <a class="btn btn-primary btn-lg" href="/register">${t('home.cta')}</a>
        <a class="btn btn-secondary btn-lg" href="/login" style="background:rgb(255 255 255 / .07);border-color:rgb(255 255 255 / .15);color:#e7e5e4">${t('nav.login')}</a>
      </div>
    </div>
  `.s;
}
