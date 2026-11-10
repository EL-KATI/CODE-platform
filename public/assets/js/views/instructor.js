/* لوحة المدرب: حصص اليوم، الحصص القادمة، ومتعلمو حصصه مع تقدمهم.
   تُبنى من واجهات موجودة (الحصص والحجوزات محصورة في حصص المدرب من جهة الخادم). */
import { html, loading, errorMessage } from '../ui.js';
import { t } from '../i18n.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { shell } from './admin.js';

const iso = (d) => d.toISOString().slice(0, 10);
const hour = (h) => `${String(h).padStart(2, '0')}:00`;
const LIVE = ['pending', 'approved', 'rescheduled'];

export async function instructorHomeView(root) {
  root.innerHTML = loading().s;
  const today = iso(new Date());
  const horizon = iso(new Date(Date.now() + 14 * 86400000));
  let slots, bookings, students;
  try {
    const [s, b, st] = await Promise.all([
      api.get(`/bookings/slots?from=${today}&to=${horizon}`),
      api.get('/bookings'),
      api.get('/admin/students'),
    ]);
    slots = s; bookings = b.bookings ?? b; students = st;
  } catch (err) {
    root.innerHTML = html`<div class="empty"><p>${errorMessage(err)}</p></div>`.s;
    return;
  }

  const loc = document.documentElement.lang === 'fr' ? 'fr-MA' : 'ar-MA';
  const dayLabel = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' });
  const todaySlots = slots.filter((s) => s.slot_date === today);
  const nextSlots = slots.filter((s) => s.slot_date > today);
  const seats = slots.reduce((a, s) => a + s.capacity, 0);
  const booked = slots.reduce((a, s) => a + s.booked, 0);
  const pending = bookings.filter((b) => b.status === 'pending' && b.slot_date >= today).length;

  // متعلمو حصصي: كل من له حجز (غير ملغى/مرفوض) في إحدى حصصي، مع تقدمه — الأضعف أولاً
  const byId = new Map(students.map((s) => [s.id, s]));
  const mine = new Map();
  for (const b of bookings) {
    if (!LIVE.includes(b.status)) continue;
    const s = byId.get(b.student_id);
    if (!s || s.archived) continue;
    const m = mine.get(s.id) || { ...s, sessions: 0, next: null };
    m.sessions += 1;
    if (b.slot_date >= today && (!m.next || b.slot_date < m.next)) m.next = b.slot_date;
    mine.set(s.id, m);
  }
  const myStudents = [...mine.values()].sort((a, b) => (a.progress || 0) - (b.progress || 0));

  const kpi = (icon, label, value, sub) => html`<div class="dash-kpi"><span class="dash-kpi-ic" aria-hidden="true">${icon}</span><span class="muted small">${label}</span><strong>${value}</strong>${sub ? html`<span class="small muted">${sub}</span>` : ''}</div>`;
  const slotRow = (s) => html`<div class="ins-slot">
    <span class="ins-hour">${hour(s.slot_hour)}</span>
    <div class="ins-slot-body">
      ${s.attendees.length
        ? html`<div class="ins-people">${s.attendees.map((a) => html`<span class="pill ${a.status === 'pending' ? 'pill-warning' : 'pill-success'}">${a.name}${a.status === 'pending' ? ` · ${t('ins.pendingShort')}` : ''}</span>`)}</div>`
        : html`<span class="muted small">${t('ins.noBookings')}</span>`}
    </div>
    <span class="ins-seats ${s.booked >= s.capacity ? 'is-full' : ''}">${s.booked}/${s.capacity}</span>
  </div>`;

  const byDay = {};
  for (const s of nextSlots) (byDay[s.slot_date] ||= []).push(s);

  shell(root, '/admin', html`
    <div class="ins">
      <p class="ins-hello">${t('ins.hello', { name: store.user.name })} · <span class="muted">${dayLabel(today)}</span></p>
      <div class="dash-kpis">
        ${kpi('🗓', t('ins.todaySessions'), todaySlots.length, t('ins.todayStudents', { n: todaySlots.reduce((a, s) => a + s.booked, 0) }))}
        ${kpi('💺', t('ins.seats14'), `${booked}/${seats}`, t('ins.slots14', { n: slots.length }))}
        ${kpi('🎓', t('ins.myStudents'), myStudents.length, '')}
        ${kpi('⏳', t('ins.pending'), pending, pending ? t('ins.pendingHelp') : '')}
      </div>

      <div class="grid grid-2" style="margin-top:20px">
        <section class="card">
          <h3 class="dash-h">📍 ${t('ins.today')}</h3>
          ${todaySlots.length ? todaySlots.map(slotRow) : html`<p class="muted small">${t('ins.noToday')}</p>`}
        </section>
        <section class="card">
          <h3 class="dash-h">🗓 ${t('ins.upcoming')}</h3>
          ${Object.keys(byDay).length ? Object.keys(byDay).slice(0, 6).map((d) => html`<div class="ins-day"><div class="small muted">${dayLabel(d)}</div>${byDay[d].map(slotRow)}</div>`)
          : html`<p class="muted small">${t('ins.noUpcoming')}</p>`}
          <p class="small muted" style="margin:12px 0 0">${t('ins.slotsBySchool')} <a href="/admin/bookings">${t('nav.bookings')}</a></p>
        </section>
      </div>

      <section class="card" style="margin-top:20px">
        <h3 class="dash-h">🎓 ${t('ins.myStudents')} <span class="small muted">${t('ins.weakFirst')}</span></h3>
        ${myStudents.length ? myStudents.map((s) => html`<a class="dash-hrow" href="/admin/students/${s.id}">
          <span class="ins-name">${s.name}</span>
          <span class="dash-track"><i style="width:${s.progress || 0}%;background:${(s.progress || 0) >= 70 ? 'var(--success,#16a34a)' : (s.progress || 0) >= 40 ? '#f59e0b' : 'var(--danger,#dc2626)'}"></i></span>
          <strong class="small" style="width:44px;text-align:end">${s.progress || 0}%</strong>
          <span class="small muted ins-meta">${t('ins.examsShort', { p: s.exams_passed, n: s.exams })}${s.next ? ` · ${t('ins.nextShort')} ${s.next.slice(5).replace('-', '/')}` : ''}</span>
        </a>`) : html`<p class="muted small">${t('ins.noStudents')} <a href="/admin/students">${t('admin.students')}</a></p>`}
      </section>
    </div>`);
}
