/**
 * views/exams.js — نظام تتبع امتحانات رخصة السياقة
 *
 * المصدّرات:
 *   schoolExamsView(root)   — صفحة المؤسسة (إدارة الامتحانات)
 *   studentExamView(root)   — صفحة الطالب (عرض مساره)
 */
import { t, getLocale } from '../i18n.js';
import { api } from '../api.js';
import { shell } from './admin.js';

/* ══════════════════════════════════════════════════════════════════════════
   مساعدات مشتركة
   ══════════════════════════════════════════════════════════════════════════ */

/** تنسيق التاريخ بالعربية/الفرنسية */
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(getLocale() === 'fr' ? 'fr-MA' : 'ar-MA', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch { return iso; }
}

/** وسم حالة النتيجة */
function resultBadge(result) {
  if (!result) return `<span class="badge badge-neutral">${t('exam.pending')}</span>`;
  if (result === 'passed') return `<span class="badge badge-success">${t('exam.passed')}</span>`;
  return `<span class="badge badge-error">${t('exam.failed')}</span>`;
}

/** وسم حالة الأرشيف */
function archiveBadge(j) {
  if (j.status !== 'archived') return `<span class="badge badge-info">${t('exam.active')}</span>`;
  if (j.archived_status === 'licensed')
    return `<span class="badge badge-success">🏆 ${t('exam.licensed')}</span>`;
  return `<span class="badge badge-error">❌ ${t('exam.notLicensed')}</span>`;
}

/** خطوة الامتحان القادمة بالنص */
function nextStepLabel(j) {
  const step = j.next_step?.step;
  if (!step || step === 'archive') return '';
  const labels = {
    theory_1: t('exam.step.theory1'),
    theory_2: t('exam.step.theory2'),
    practical_1: t('exam.step.practical1'),
    practical_2: t('exam.step.practical2'),
  };
  return `<span class="next-step-tag">${t('exam.nextStep')}: ${labels[step] || step}</span>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   واجهة بطاقة مسار الامتحان (مشتركة بين كل الصفحات)
   ══════════════════════════════════════════════════════════════════════════ */
function journeyCard(j, { editable = false, onAction } = {}) {
  const steps = [
    { key: 'theory_1',    dateKey: 'theory1_date',     resultKey: 'theory1_result',    label: t('exam.step.theory1') },
    { key: 'theory_2',    dateKey: 'theory2_date',     resultKey: 'theory2_result',    label: t('exam.step.theory2') },
    { key: 'practical_1', dateKey: 'practical1_date',  resultKey: 'practical1_result', label: t('exam.step.practical1') },
    { key: 'practical_2', dateKey: 'practical2_date',  resultKey: 'practical2_result', label: t('exam.step.practical2') },
  ];

  // تحديد الخطوات المرئية بناءً على المسار الفعلي
  const visible = steps.filter(s => {
    // theory_2 تظهر فقط إذا رسب في theory_1
    if (s.key === 'theory_2' && j.theory1_result !== 'failed') return false;
    // practical_1 تظهر إذا نجح في theory_1 أو theory_2
    if (s.key === 'practical_1') {
      const passedTheory = j.theory1_result === 'passed' ||
        (j.theory1_result === 'failed' && j.theory2_result === 'passed');
      if (!passedTheory) return false;
    }
    // practical_2 تظهر فقط إذا رسب في practical_1
    if (s.key === 'practical_2' && j.practical1_result !== 'failed') return false;
    return true;
  });

  const stepsHtml = visible.map(s => {
    const dateVal = j[s.dateKey];
    const resultVal = j[s.resultKey];
    const isNext = j.next_step?.step === s.key;

    return `
      <div class="exam-step ${isNext ? 'exam-step--next' : ''} ${resultVal ? 'exam-step--done' : ''}">
        <div class="exam-step-header">
          <strong>${s.label}</strong>
          ${isNext ? `<span class="badge badge-warning">${t('exam.current')}</span>` : ''}
          ${resultBadge(resultVal)}
        </div>
        <div class="exam-step-date">
          📅 ${fmtDate(dateVal)}
          ${editable && !resultVal ? `
            <button class="btn btn-xs btn-ghost set-date-btn"
              data-exam="${s.key}" data-date="${dateVal || ''}">
              ${dateVal ? t('exam.changeDate') : t('exam.setDate')}
            </button>` : ''}
        </div>
        ${editable && dateVal && !resultVal ? `
          <div class="exam-step-actions">
            <button class="btn btn-xs btn-success enter-result-btn"
              data-exam="${s.key}" data-result="passed">
              ✓ ${t('exam.passed')}
            </button>
            <button class="btn btn-xs btn-error enter-result-btn"
              data-exam="${s.key}" data-result="failed">
              ✗ ${t('exam.failed')}
            </button>
          </div>` : ''}
      </div>`;
  }).join('');

  const card = document.createElement('div');
  card.className = `exam-journey-card ${j.status === 'archived' ? 'exam-journey-card--archived' : ''}`;
  card.dataset.studentId = j.student_id;
  card.innerHTML = `
    <div class="exam-journey-top">
      <div>
        <span class="exam-student-name">${j.name || '—'}</span>
        <small class="exam-student-email text-muted">${j.email || ''}</small>
      </div>
      <div class="exam-journey-status">${archiveBadge(j)}</div>
    </div>
    <div class="exam-steps">${stepsHtml}</div>
    ${j.status === 'archived' && j.note ? `<p class="exam-note">${j.note}</p>` : ''}
    ${editable && j.status === 'active' && !j.theory1_date ? `
      <div class="exam-enroll-hint text-muted">${t('exam.setFirstExamHint')}</div>
    ` : ''}
  `;

  if (editable && onAction) {
    card.querySelectorAll('.set-date-btn').forEach(btn => {
      btn.addEventListener('click', () => onAction('set-date', {
        studentId: j.student_id, examType: btn.dataset.exam, currentDate: btn.dataset.date,
      }));
    });
    card.querySelectorAll('.enter-result-btn').forEach(btn => {
      btn.addEventListener('click', () => onAction('enter-result', {
        studentId: j.student_id, examType: btn.dataset.exam, result: btn.dataset.result,
        studentName: j.name,
      }));
    });
  }

  return card;
}

/* ══════════════════════════════════════════════════════════════════════════
   مودال تعيين موعد الامتحان
   ══════════════════════════════════════════════════════════════════════════ */
function openDateModal(root, { studentId, examType, currentDate, onSave }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const stepLabels = {
    theory_1: t('exam.step.theory1'), theory_2: t('exam.step.theory2'),
    practical_1: t('exam.step.practical1'), practical_2: t('exam.step.practical2'),
  };

  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h3>${t('exam.setDate')}: ${stepLabels[examType] || examType}</h3>
      <label class="field">
        <span>${t('exam.examDate')}</span>
        <input type="date" id="exam-date-input" value="${currentDate || ''}"
               min="${new Date().toISOString().slice(0, 10)}" />
      </label>
      <div class="modal-actions">
        <button class="btn btn-primary" id="save-date-btn">${t('common.save')}</button>
        <button class="btn btn-ghost" id="cancel-date-btn">${t('common.cancel')}</button>
      </div>
      <p id="date-modal-err" class="form-error hidden"></p>
    </div>
  `;

  root.appendChild(overlay);

  const inp = overlay.querySelector('#exam-date-input');
  const errP = overlay.querySelector('#date-modal-err');

  overlay.querySelector('#cancel-date-btn').onclick = () => overlay.remove();
  overlay.querySelector('#save-date-btn').onclick = async () => {
    const dateVal = inp.value.trim();
    if (!dateVal) { errP.textContent = t('exam.dateRequired'); errP.classList.remove('hidden'); return; }
    errP.classList.add('hidden');

    try {
      await api.patch(`/exams/${studentId}/date`, { exam_type: examType, date: dateVal });
      overlay.remove();
      onSave?.();
    } catch (e) {
      errP.textContent = e.message || t('common.error');
      errP.classList.remove('hidden');
    }
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   مودال تأكيد إدخال النتيجة
   ══════════════════════════════════════════════════════════════════════════ */
function openResultConfirmModal(root, { studentId, examType, result, studentName, onSave }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const stepLabels = {
    theory_1: t('exam.step.theory1'), theory_2: t('exam.step.theory2'),
    practical_1: t('exam.step.practical1'), practical_2: t('exam.step.practical2'),
  };

  const resultLabel = result === 'passed'
    ? `<span class="text-success">✓ ${t('exam.passed')}</span>`
    : `<span class="text-error">✗ ${t('exam.failed')}</span>`;

  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h3>${t('exam.confirmResult')}</h3>
      <p>${t('exam.confirmResultMsg', { name: studentName, exam: stepLabels[examType] || examType })}</p>
      <p class="exam-result-confirm-value">${resultLabel}</p>
      <div class="modal-actions">
        <button class="btn btn-primary" id="confirm-result-btn">${t('common.confirm')}</button>
        <button class="btn btn-ghost" id="cancel-result-btn">${t('common.cancel')}</button>
      </div>
      <p id="result-modal-err" class="form-error hidden"></p>
    </div>
  `;

  root.appendChild(overlay);

  const errP = overlay.querySelector('#result-modal-err');
  overlay.querySelector('#cancel-result-btn').onclick = () => overlay.remove();
  overlay.querySelector('#confirm-result-btn').onclick = async () => {
    errP.classList.add('hidden');
    try {
      await api.patch(`/exams/${studentId}/result`, { exam_type: examType, result });
      overlay.remove();
      onSave?.();
    } catch (e) {
      errP.textContent = e.message || t('common.error');
      errP.classList.remove('hidden');
    }
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   مودال إدراج طالب في مسار الامتحانات
   ══════════════════════════════════════════════════════════════════════════ */
async function openEnrollModal(root, { onSave }) {
  // جلب قائمة الطلاب غير المدرجين
  let students = [];
  try {
    const data = await api.get('/admin/students');
    const enrolled = new Set((await api.get('/exams/students')).journeys.map(j => j.student_id));
    const list = Array.isArray(data) ? data : (data.students || []);
    students = list.filter(s => !enrolled.has(s.id));
  } catch (e) { /* تجاهل */ }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h3>${t('exam.enrollStudent')}</h3>
      <label class="field">
        <span>${t('exam.selectStudent')}</span>
        <select id="enroll-student-sel">
          <option value="">${t('common.select')}...</option>
          ${students.map(s => `<option value="${s.id}">${s.name} — ${s.email}</option>`).join('')}
        </select>
      </label>
      <label class="field">
        <span>${t('exam.theory1Date')}</span>
        <input type="date" id="enroll-theory1-date" min="${new Date().toISOString().slice(0, 10)}" />
      </label>
      <div class="modal-actions">
        <button class="btn btn-primary" id="enroll-save-btn">${t('exam.enrollBtn')}</button>
        <button class="btn btn-ghost" id="enroll-cancel-btn">${t('common.cancel')}</button>
      </div>
      <p id="enroll-err" class="form-error hidden"></p>
    </div>
  `;

  root.appendChild(overlay);

  const errP = overlay.querySelector('#enroll-err');
  overlay.querySelector('#enroll-cancel-btn').onclick = () => overlay.remove();
  overlay.querySelector('#enroll-save-btn').onclick = async () => {
    const studentId = overlay.querySelector('#enroll-student-sel').value;
    const theory1Date = overlay.querySelector('#enroll-theory1-date').value;
    if (!studentId || !theory1Date) {
      errP.textContent = t('exam.enrollRequired'); errP.classList.remove('hidden'); return;
    }
    errP.classList.add('hidden');
    try {
      await api.post('/exams/enroll', { student_id: Number(studentId), theory1_date: theory1Date });
      overlay.remove();
      onSave?.();
    } catch (e) {
      errP.textContent = e.message || t('common.error');
      errP.classList.remove('hidden');
    }
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   schoolExamsView — الصفحة الرئيسية للمؤسسة
   ══════════════════════════════════════════════════════════════════════════ */
export async function schoolExamsView(root) {
  // بناء الغلاف الأساسي
  shell(root, '/admin/exams', '');

  // إضافة محتوى الامتحانات داخل الغلاف
  const existing = root.querySelector('.exams-view');
  const container = existing || document.createElement('div');
  if (!existing) {
    container.className = 'exams-view';
    root.appendChild(container);
  }

  container.innerHTML = `
    <div class="page-header">
      <h2>${t('exam.title')}</h2>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="enroll-btn">+ ${t('exam.enrollStudent')}</button>
      </div>
    </div>

    <div class="exam-tabs">
      <button class="tab-btn active" data-tab="today">${t('exam.tabToday')}</button>
      <button class="tab-btn" data-tab="all">${t('exam.tabAll')}</button>
      <button class="tab-btn" data-tab="archive">${t('exam.tabArchive')}</button>
    </div>

    <div id="exam-panel-today" class="exam-panel">
      <div class="loading-spinner">${t('common.loading')}</div>
    </div>
    <div id="exam-panel-all" class="exam-panel hidden">
      <div class="loading-spinner">${t('common.loading')}</div>
    </div>
    <div id="exam-panel-archive" class="exam-panel hidden">
      <div class="loading-spinner">${t('common.loading')}</div>
    </div>
  `;

  // تبويبات
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      container.querySelectorAll('.exam-panel').forEach(p => p.classList.add('hidden'));
      container.querySelector(`#exam-panel-${btn.dataset.tab}`).classList.remove('hidden');
    });
  });

  // زر الإدراج
  container.querySelector('#enroll-btn').addEventListener('click', () => {
    openEnrollModal(root, { onSave: () => reloadAll() });
  });

  function handleAction(action, payload) {
    if (action === 'set-date') {
      openDateModal(root, { ...payload, onSave: () => reloadAll() });
    } else if (action === 'enter-result') {
      openResultConfirmModal(root, { ...payload, onSave: () => reloadAll() });
    }
  }

  async function reloadAll() {
    await Promise.all([loadToday(), loadAll(), loadArchive()]);
  }

  async function loadToday() {
    const panel = container.querySelector('#exam-panel-today');
    panel.innerHTML = `<div class="loading-spinner">${t('common.loading')}</div>`;
    try {
      const data = await api.get('/exams/today');
      if (!data.journeys.length) {
        panel.innerHTML = `<p class="empty">${t('exam.noneToday')}</p>`;
        return;
      }
      panel.innerHTML = `<h3 class="exam-day-title">📋 ${t('exam.todayExams')} — ${fmtDate(data.date)}</h3>`;
      data.journeys.forEach(j => {
        panel.appendChild(journeyCard(j, { editable: true, onAction: handleAction }));
      });
    } catch (e) {
      panel.innerHTML = `<p class="empty">${e.message}</p>`;
    }
  }

  async function loadAll() {
    const panel = container.querySelector('#exam-panel-all');
    panel.innerHTML = `<div class="loading-spinner">${t('common.loading')}</div>`;
    try {
      const data = await api.get('/exams/students');
      const active = data.journeys.filter(j => j.status === 'active');
      if (!active.length) {
        panel.innerHTML = `<p class="empty">${t('exam.noneActive')}</p>`;
        return;
      }
      panel.innerHTML = '';
      active.forEach(j => {
        panel.appendChild(journeyCard(j, { editable: true, onAction: handleAction }));
      });
    } catch (e) {
      panel.innerHTML = `<p class="empty">${e.message}</p>`;
    }
  }

  async function loadArchive() {
    const panel = container.querySelector('#exam-panel-archive');
    panel.innerHTML = `<div class="loading-spinner">${t('common.loading')}</div>`;
    try {
      const data = await api.get('/exams/archive');
      if (!data.archive.length) {
        panel.innerHTML = `<p class="empty">${t('exam.archiveEmpty')}</p>`;
        return;
      }
      const licensed = data.archive.filter(j => j.archived_status === 'licensed');
      const failed = data.archive.filter(j => j.archived_status === 'failed');

      panel.innerHTML = '';
      if (licensed.length) {
        const sec = document.createElement('section');
        sec.innerHTML = `<h3 class="archive-section-title">🏆 ${t('exam.licensedGroup')} (${licensed.length})</h3>`;
        licensed.forEach(j => sec.appendChild(journeyCard(j, { editable: false })));
        panel.appendChild(sec);
      }
      if (failed.length) {
        const sec = document.createElement('section');
        sec.innerHTML = `<h3 class="archive-section-title">❌ ${t('exam.failedGroup')} (${failed.length})</h3>`;
        failed.forEach(j => sec.appendChild(journeyCard(j, { editable: false })));
        panel.appendChild(sec);
      }
    } catch (e) {
      panel.innerHTML = `<p class="empty">${e.message}</p>`;
    }
  }

  reloadAll();
}

/* ══════════════════════════════════════════════════════════════════════════
   studentExamView — صفحة الطالب لعرض مساره الخاص
   ══════════════════════════════════════════════════════════════════════════ */
export async function studentExamView(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'exams-view student-exam-view';
  wrap.innerHTML = `<div class="loading-spinner">${t('common.loading')}</div>`;
  root.appendChild(wrap);

  try {
    const data = await api.get('/exams/me');
    if (!data.journey) {
      wrap.innerHTML = `
        <div class="empty-state card">
          <p>🎓 ${t('exam.studentNotEnrolled')}</p>
        </div>`;
      return;
    }

    wrap.innerHTML = `<h2 class="page-title">${t('exam.myJourney')}</h2>`;
    wrap.appendChild(journeyCard(data.journey, { editable: false }));

    // شريط التقدم البصري
    const steps = ['theory_1', 'theory_2', 'practical_1', 'practical_2'];
    const done = steps.filter(k => {
      const rKey = k.replace('_', '') + '_result'; // ex theory1_result
      const fixedKey = k.replace(/(\w+)_(\d)/, '$1$2_result');
      return data.journey[fixedKey] === 'passed';
    }).length;

    if (data.journey.status === 'archived') {
      const statusEl = document.createElement('div');
      statusEl.className = `exam-final-status ${data.journey.archived_status === 'licensed' ? 'licensed' : 'not-licensed'}`;
      statusEl.innerHTML = data.journey.archived_status === 'licensed'
        ? `<span>🏆 ${t('exam.licensed')}</span>`
        : `<span>❌ ${t('exam.notLicensed')}</span>`;
      wrap.appendChild(statusEl);
    }
  } catch (e) {
    wrap.innerHTML = `<p class="error-msg">${e.message}</p>`;
  }
}
