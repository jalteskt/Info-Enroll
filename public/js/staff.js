import { renderTemplate } from './templates.js';
import { api } from './api.js';

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const badge = (text, color = 'neutral') =>
  renderTemplate('badge', { color: color, text: esc(text) });
const stat = (label, value, note) =>
  renderTemplate('stat', { label: label, value: value, note: note });
const two = (n) => String(n).padStart(2, '0');
const ord = (n) => `${n}${['th', 'st', 'nd', 'rd'][n] ?? 'th'}`;
const clock = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}${m ? ':' + two(m) : ''} ${h >= 12 ? 'PM' : 'AM'}`;
};
const when = (s) => `${s.day} · ${clock(s.timeStart)}–${clock(s.timeEnd)}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// Rule 40: submitting a failed or INC last attempt drops the student.
const droppedNote = (dropped = []) =>
  dropped.length
    ? ` ${plural(dropped.length, 'student')} reached the attempt limit and ${dropped.length === 1 ? 'was' : 'were'} dropped: ${dropped.join(', ')}.`
    : '';
const termKey = (s) => `${s.schoolYear}/${s.semester}`;
const termName = (s) => `${ord(s.semester)} semester · AY ${s.schoolYear.replace('-', '–')}`;
// Grades are text ("1.75", "INC"); 3.00 and better passes (rule 33).
const standing = (grade) =>
  !grade
    ? badge('Awaiting grade')
    : grade === 'INC'
      ? badge('Incomplete', 'amber')
      : Number(grade) <= 3
        ? badge('Passed', 'green')
        : badge('Failed', 'amber');

export function renderStaffView(role, icon, view) {
  return role === 'professor' ? professorView(icon) : adminView(icon, view);
}

// Called after a staff member signs in.
export async function loadStaffData(role) {
  if (role === 'professor') await loadProfessor();
  else await loadAdmin();
}

// Returns (a promise of) { rerender, toast, error, modal, closeModal, formError }.
export function handleStaffAction(action, role, value, icon) {
  return role === 'professor'
    ? professorAction(action, value)
    : adminAction(action, value, icon);
}

// ------------------------------------------------------------ professor

const prof = {
  gradeOptions: [],
  sections: [],
  term: null, // "2025-2026/2"
  selectedId: null,
  roster: null, // { section, students }
  draft: new Map(), // studentNo -> grade, edits not yet saved
  reviewing: false,
};

async function loadProfessor(keepSelection = false) {
  const data = await api('/professor/sections');
  prof.gradeOptions = data.gradeOptions;
  prof.sections = data.sections;
  if (!keepSelection || !prof.sections.some((s) => termKey(s) === prof.term)) {
    // Default: the newest term that still has grades to submit, else the newest.
    const pending = prof.sections.find(
      (s) => !s.submittedAt && s.periodStatus === 'CLOSED',
    );
    prof.term = prof.sections.length ? termKey(pending ?? prof.sections[0]) : null;
  }
  const inTerm = termSections();
  if (!inTerm.some((s) => s.id === prof.selectedId))
    prof.selectedId = inTerm[0]?.id ?? null;
  await loadRoster();
}

const termSections = () => prof.sections.filter((s) => termKey(s) === prof.term);

async function loadRoster() {
  prof.draft.clear();
  prof.reviewing = false;
  prof.roster = prof.selectedId
    ? await api(`/professor/sections/${prof.selectedId}`)
    : null;
}

// Grades can be encoded only after enrollment closes, until submitted (rule 31).
const editable = () =>
  prof.roster &&
  prof.roster.section.periodStatus === 'CLOSED' &&
  !prof.roster.section.submittedAt;
const gradeOf = (st) =>
  prof.draft.has(st.studentNo) ? prof.draft.get(st.studentNo) : st.grade ?? '';

function professorView(icon) {
  if (!prof.sections.length)
    return renderTemplate('professor-empty', { icon: icon('book') });
  const sections = termSections();
  const terms = [...new Map(prof.sections.map((s) => [termKey(s), s])).values()];
  const current = prof.roster?.section;
  const students = prof.roster?.students ?? [];
  const pending = sections.filter((s) => !s.submittedAt).length;
  const enrolled = sections.reduce((n, s) => n + s.students, 0);
  const isOpen = sections[0]?.periodStatus === 'OPEN';

  return renderTemplate('professor-view', {
    stat: stat('Assigned sections', two(sections.length), termName(sections[0])),
    stat2: stat('Students enrolled', two(enrolled), 'Across your sections this term'),
    stat3: stat(
      'Awaiting submission',
      two(pending),
      isOpen
        ? 'Grading starts when enrollment closes'
        : pending
          ? 'Review grades before submitting'
          : 'All sections are complete',
    ),
    terms: terms
      .map((t) => option(termKey(t), termName(t), termKey(t) === prof.term))
      .join(''),
    content: sections
      .map((s) =>
        renderTemplate('professor-view-2', {
          i: s.id,
          content: s.id === prof.selectedId,
          code: esc(s.code),
          content4: s.submittedAt
            ? badge('Submitted', 'green')
            : s.periodStatus === 'OPEN'
              ? badge('Enrollment open')
              : badge(`${s.graded} of ${s.students} graded`, 'amber'),
          title: esc(s.title),
          name: s.name,
          length: plural(s.students, 'student'),
          schedule: when(s),
          content9: s.id === prof.selectedId ? 'Currently viewing' : 'View class list',
          icon: icon('arrow-right'),
        }),
      )
      .join(''),
    code: esc(current?.code ?? ''),
    name: current?.name ?? '',
    content7: !current
      ? 'Class record'
      : current.submittedAt
        ? 'Submitted class record'
        : prof.reviewing
          ? 'Review your grades'
          : 'Class record',
    length: plural(students.length, 'student'),
    schedule: current ? when(current) : '',
    content10: !current
      ? ''
      : current.submittedAt
        ? badge('Grades locked', 'green')
        : current.periodStatus === 'OPEN'
          ? badge('Enrollment open')
          : badge(prof.reviewing ? 'Ready for submission' : 'Draft grades', 'amber'),
    content11: prof.reviewing ? renderTemplate('professor-view-3') : '',
    content12: students.length
      ? students.map((st, i) => gradeRow(st, i, gradeOf(st), editable() && !prof.reviewing, prof.gradeOptions)).join('')
      : renderTemplate('professor-view-10', {
          message: 'No students are enrolled in this section.',
        }),
    content13: !current
      ? ''
      : current.submittedAt
        ? current.submittedByAdminId
          ? 'Submitted by the registrar. This class record is locked.'
          : 'This class record is locked. Contact the administrator for a correction.'
        : current.periodStatus === 'OPEN'
          ? 'Grades can be encoded once the enrollment period is closed.'
          : prof.draft.size
            ? 'You have unsaved changes.'
            : 'Draft grades are saved when you click Save draft.',
    content14:
      !editable() || !students.length
        ? ''
        : prof.reviewing
          ? renderTemplate('professor-view-8')
          : renderTemplate('professor-view-9', { icon: icon('arrow-right') }),
  });
}

// One class-list row; a grade dropdown when the grade can be edited.
function gradeRow(st, i, grade, canEdit, options) {
  const name = esc(
    `${st.lastName}, ${st.firstName}${st.middleName ? ' ' + st.middleName : ''}`,
  );
  return renderTemplate('professor-view-4', {
    content: esc(st.studentNo),
    content2: name,
    content3: canEdit
      ? renderTemplate('professor-view-6', {
          i: i,
          content: name,
          content3: options
            .map((value) =>
              renderTemplate('professor-view-7', {
                value: value,
                content: grade === value ? ' selected' : '',
                value3: value,
              }),
            )
            .join(''),
        })
      : renderTemplate('professor-view-5', { grade: grade || '—' }),
    content4: standing(grade),
  });
}

// Reads the grade dropdowns into a draft map.
function captureInto(students, draft) {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-staff-grade]').forEach((select) => {
    const st = students[Number(select.dataset.staffGrade)];
    if (!st) return;
    if (select.value !== (st.grade ?? '')) draft.set(st.studentNo, select.value || null);
    else draft.delete(st.studentNo);
  });
}
const draftBody = (draft) => ({
  grades: [...draft].map(([studentNo, grade]) => ({ studentNo, grade })),
});

async function saveDraft() {
  if (!prof.draft.size) return;
  prof.roster = await api(`/professor/sections/${prof.selectedId}/grades`, {
    method: 'PUT',
    body: draftBody(prof.draft),
  });
  prof.draft.clear();
}

async function professorAction(action, value) {
  if (editable() && !prof.reviewing) captureInto(prof.roster.students, prof.draft);
  try {
    if (action === 'staff-term') {
      if (editable()) await saveDraft();
      prof.term = value;
      prof.selectedId = termSections()[0]?.id ?? null;
      await loadRoster();
      return { rerender: true };
    }
    if (/^staff-section-\d+$/.test(action)) {
      const id = Number(action.split('-').pop());
      if (id === prof.selectedId) return {};
      const saved = prof.draft.size > 0;
      if (editable()) await saveDraft();
      prof.selectedId = id;
      await loadRoster();
      return { rerender: true, toast: saved ? 'Your draft grades were saved.' : undefined };
    }
    if (action === 'staff-grade-change') return {};
    if (!editable()) return { toast: 'This class record cannot be edited.', error: true };
    if (action === 'staff-save') {
      if (!prof.draft.size) return { toast: 'No changes to save.' };
      await saveDraft();
      await loadProfessor(true);
      return { rerender: true, toast: 'Draft grades saved.' };
    }
    if (action === 'staff-edit') {
      prof.reviewing = false;
      return { rerender: true };
    }
    if (action === 'staff-review') {
      const missing = prof.roster.students.filter((st) => !gradeOf(st)).length;
      if (missing)
        return {
          toast: `Enter a grade for every student first (${missing} missing).`,
          error: true,
        };
      await saveDraft();
      prof.reviewing = true;
      return { rerender: true };
    }
    if (action === 'staff-submit') {
      if (!prof.reviewing)
        return { toast: 'Review the class record before submitting.', error: true };
      const r = await api(`/professor/sections/${prof.selectedId}/submit`, { method: 'POST' });
      await loadProfessor(true);
      return {
        rerender: true,
        toast: 'Grades submitted. This class record is now locked.' + droppedNote(r.dropped),
      };
    }
  } catch (err) {
    // Someone else (e.g. the admin) may have changed the section: reload it.
    try {
      await loadProfessor(true);
    } catch {}
    return { rerender: true, toast: err.message, error: true };
  }
  return {};
}

// ------------------------------------------------------------ admin

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const admin = {
  overview: null,
  periods: [],
  professors: [],
  students: [],
  courses: [],
  incompletes: [],
  gradeOptions: [],
  term: null, // term shown on the Sections page
  sections: [], // sections of that term
  pending: [], // sections of closed periods without submitted grades
  grading: null, // { roster, draft } for the grade sheet dialog
};

function option(value, label, selected = false) {
  return renderTemplate('admin-option', {
    value: esc(value),
    label: esc(label),
    selected: selected ? 'selected' : '',
  });
}
const actionButton = (action, label, kind = '') =>
  renderTemplate('admin-action-button', { action: action, label: label, kind: kind });
const emptyRow = (span, message) =>
  renderTemplate('admin-empty-row', { span: span, message: message });
const profName = (p) => `${p.firstName} ${p.lastName}`;
const openPeriod = () => admin.periods.find((p) => p.status === 'OPEN') ?? null;

async function loadAdmin() {
  const [overview, periods, professors, students, courses, incompletes] = await Promise.all([
    api('/admin/overview'),
    api('/admin/periods'),
    api('/admin/professors'),
    api('/admin/students'),
    api('/admin/courses'),
    api('/admin/incompletes'),
  ]);
  Object.assign(admin, { overview, periods, professors, students, courses, incompletes });
  if (!periods.some((p) => termKey(p) === admin.term))
    admin.term = periods[0] ? termKey(periods[0]) : null;
  await loadAdminSections();
  // Missing grades: closed periods only (grades are encoded after closing).
  const lists = await Promise.all(
    periods
      .filter((p) => p.status === 'CLOSED' && p.sectionsWithoutGrades > 0)
      .map((p) => api(`/admin/sections?schoolYear=${p.schoolYear}&semester=${p.semester}`)),
  );
  admin.pending = lists.flatMap((l) => l.sections).filter((s) => !s.submittedAt);
}

async function loadAdminSections() {
  if (!admin.term) {
    admin.sections = [];
    return;
  }
  const [schoolYear, semester] = admin.term.split('/');
  const data = await api(`/admin/sections?schoolYear=${schoolYear}&semester=${semester}`);
  admin.gradeOptions = data.gradeOptions;
  // Keep each lec next to its lab: by subject, then section number.
  const lec = (c) => c.replace(/\.1$/, '');
  admin.sections = data.sections.sort(
    (a, b) =>
      lec(a.code).localeCompare(lec(b.code)) ||
      a.sectionNo - b.sectionNo ||
      a.code.localeCompare(b.code),
  );
}

function adminView(icon, view) {
  if (view === 'admin-sections') return adminSections(icon);
  if (view === 'admin-grades') return adminGrades();
  if (view === 'admin-professors') return adminProfessors(icon);
  if (view === 'admin-students') return adminStudents(icon);
  return adminOverview(icon);
}

function adminOverview(icon) {
  const o = admin.overview;
  const open = o.openPeriod;
  const latest = admin.periods[0];
  const waiting = o.sectionsWithoutGrades;
  return renderTemplate('admin-view', {
    campusPhoto: renderTemplate('campus-art'),
    statusClass: open ? 'badge-green' : 'badge-neutral',
    statusText: open ? 'Enrollment open' : 'Enrollment closed',
    studentsEnrolled: open
      ? `${open.studentsEnrolled}${open.studentsEnlisted ? ` (${open.studentsEnlisted} enlisted)` : ''}`
      : '—',
    sectionCount: open?.sections ?? '—',
    seatsLeft: open?.seatsAvailable ?? '—',
    gradesToFinish: waiting + o.incompletes,
    gradeBreakdown: `${plural(waiting, 'section')} unsubmitted · ${o.incompletes} INC`,
    periodTitle: open
      ? termName(open)
      : latest
        ? termName(latest)
        : 'No enrollment period yet',
    periodText: open
      ? 'Students can enlist subjects and click Enroll to make them final.'
      : 'Enrollment is closed. Professors can encode grades.',
    periodBadge: open ? badge('Enrollment open', 'green') : badge('Enrollment closed'),
    periodHint: open
      ? 'Closing ends enlisting and enrolling. Students who did not click Enroll lose their subjects, and sections with no students are removed.'
      : o.canOpenNextPeriod
        ? 'Every section has submitted grades. You can open the next period.'
        : `${plural(waiting, 'section')} still need submitted grades before the next period can open. See Grades.`,
    periodButtonClass: open ? '' : 'button-primary',
    periodAction: open ? 'staff-period-close' : 'staff-period-next',
    periodDisabled: !open && !o.canOpenNextPeriod ? 'disabled' : '',
    periodIcon: icon(open ? 'lock' : 'calendar'),
    periodButton: open ? 'Close enrollment' : 'Open next period',
    rows: admin.periods.length
      ? admin.periods
          .map((p) =>
            renderTemplate('admin-period-row', {
              term: termName(p),
              status: p.status === 'OPEN' ? badge('Open', 'green') : badge('Closed'),
              sections: p.sections,
              enrollments: p.enrollments,
              grades:
                p.status === 'OPEN'
                  ? badge('After closing')
                  : p.sectionsWithoutGrades
                    ? badge(`${p.sectionsWithoutGrades} missing`, 'amber')
                    : badge('All submitted', 'green'),
            }),
          )
          .join('')
      : emptyRow(5, 'No enrollment periods yet.'),
  });
}

function professorSelect(s, activeProfs) {
  const current = activeProfs.some((p) => p.id === s.professorId)
    ? ''
    : option(s.professorId, s.professor, true);
  return `<select class="input" data-staff-reassign="${s.id}" aria-label="Professor of ${esc(s.code)} ${s.name}">${current}${activeProfs
    .map((p) => option(p.id, profName(p), p.id === s.professorId))
    .join('')}</select>`;
}

function adminSections(icon) {
  const period = admin.periods.find((p) => termKey(p) === admin.term);
  const isOpen = period?.status === 'OPEN';
  const activeProfs = admin.professors.filter((p) => p.active);
  return renderTemplate('admin-sections', {
    title: period ? termName(period) : 'No sections',
    subtitle: isOpen
      ? 'Sections can be added, deleted and reassigned while enrollment is open. A lecture and its laboratory can have different professors.'
      : 'This period is closed. Its sections are final.',
    terms: admin.periods
      .map((p) => option(termKey(p), termName(p), termKey(p) === admin.term))
      .join(''),
    newButton: isOpen
      ? renderTemplate('admin-new-section-button', { icon: icon('plus') })
      : '',
    rows: admin.sections.length
      ? admin.sections
          .map((s) =>
            renderTemplate('admin-section-row', {
              code: esc(s.code),
              title: esc(s.title),
              name: s.name,
              schedule: when(s),
              professor: isOpen ? professorSelect(s, activeProfs) : esc(s.professor),
              students: badge(`${s.students} of 50`, s.students >= 50 ? 'amber' : 'green'),
              grades: s.submittedAt
                ? badge('Submitted', 'green')
                : isOpen
                  ? badge('After closing')
                  : badge(`${s.graded} of ${s.students} graded`, 'amber'),
              actions: isOpen
                ? actionButton(`staff-section-delete-${s.id}`, 'Delete')
                : !s.submittedAt
                  ? actionButton(`staff-grade-open-${s.id}`, 'Encode grades')
                  : '',
            }),
          )
          .join('')
      : emptyRow(7, 'No sections in this term.'),
  });
}

function adminGrades() {
  const finals = admin.gradeOptions.filter((g) => g !== 'INC');
  return renderTemplate('admin-grades', {
    pendingBadge: badge(
      plural(admin.pending.length, 'section'),
      admin.pending.length ? 'amber' : 'green',
    ),
    pendingRows: admin.pending.length
      ? admin.pending
          .map((s) =>
            renderTemplate('admin-pending-row', {
              id: s.id,
              code: esc(s.code),
              name: s.name,
              title: esc(s.title),
              term: termName(s),
              professor: esc(s.professor),
              progress: badge(`${s.graded} of ${s.students} graded`, 'amber'),
            }),
          )
          .join('')
      : emptyRow(5, 'Every section of the closed periods has submitted grades.'),
    incBadge: badge(
      `${admin.incompletes.length} INC`,
      admin.incompletes.length ? 'amber' : 'green',
    ),
    incRows: admin.incompletes.length
      ? admin.incompletes
          .map((i) =>
            renderTemplate('admin-inc-row', {
              student: esc(i.student),
              studentNo: esc(i.studentNo),
              code: esc(i.code),
              title: esc(i.title),
              term: termName(i),
              sectionId: i.sectionId,
              options: finals.map((g) => option(g, g)).join(''),
            }),
          )
          .join('')
      : emptyRow(4, 'No INC grades are waiting.'),
  });
}

function adminProfessors(icon) {
  return renderTemplate('admin-professors', {
    icon: icon('plus'),
    rows: admin.professors
      .map((p) =>
        renderTemplate('admin-prof-row', {
          name: esc(profName(p)),
          username: esc(p.username),
          status: p.active ? badge('Active', 'green') : badge('Inactive'),
          sections: `${p.sectionsOpen} this term · ${p.sectionsEver} in total`,
          actions: [
            p.active
              ? actionButton(`staff-prof-deactivate-${p.id}`, 'Deactivate')
              : actionButton(`staff-prof-activate-${p.id}`, 'Activate'),
            p.sectionsEver ? '' : actionButton(`staff-prof-delete-${p.id}`, 'Delete'),
          ].join(''),
        }),
      )
      .join(''),
  });
}

function adminStudents(icon) {
  return renderTemplate('admin-students', {
    icon: icon('plus'),
    rows: admin.students.length
      ? admin.students
          .map((s) =>
            renderTemplate('admin-student-row', {
              studentNo: esc(s.studentNo),
              name: esc([s.lastName + ',', s.firstName, s.middleName].filter(Boolean).join(' ')),
              entrance: esc(s.entranceDate ?? '—'),
              year: `${ord(s.yearLevel)} year`,
              status: s.status === 'DROPPED' ? badge('Dropped', 'amber') : badge('Active', 'green'),
              termState:
                s.termState === 'ENROLLED'
                  ? badge('Enrolled', 'green')
                  : s.termState === 'ENLISTED'
                    ? badge('Enlisted', 'amber')
                    : badge('None'),
              actions:
                s.termState === 'ENROLLED'
                  ? actionButton(`staff-student-reopen-${esc(s.studentNo)}`, 'Reopen')
                  : '',
            }),
          )
          .join('')
      : emptyRow(7, 'No students yet.'),
  });
}

// ---- admin dialogs

const confirmDialog = (icon, { eyebrow, title, text, action, confirm }) =>
  renderTemplate('admin-confirm', {
    icon: icon('x'),
    eyebrow: esc(eyebrow),
    title: esc(title),
    text: esc(text),
    action: action,
    confirm: confirm,
  });

function sectionForm(icon) {
  const period = openPeriod();
  const meeting = (prefix, day, start, end) =>
    renderTemplate('admin-meeting-fields', {
      prefix: prefix,
      days: DAYS.map((d) => option(d, d, d === day)).join(''),
      start: start,
      end: end,
    });
  const professors = admin.professors
    .filter((p) => p.active)
    .map((p) => option(p.id, profName(p)))
    .join('');
  return renderTemplate('admin-section-form', {
    icon: icon('x'),
    term: termName(period),
    courses: admin.courses
      .filter((c) => c.semester === period.semester)
      .map((c) =>
        option(
          c.code,
          `${c.code}${c.labCode ? ' + ' + c.labCode : ''} · ${c.title.replace(/ \(lec\)$/, '')} (year ${c.yearLevel})`,
        ),
      )
      .join(''),
    professors,
    labProfessors: professors,
    lecFields: meeting('lec', 'Mon', '08:00', '09:30'),
    labFields: meeting('lab', 'Wed', '08:00', '09:30'),
  });
}

function gradeSheet(icon) {
  const { roster, draft } = admin.grading;
  const s = roster.section;
  const rows = roster.students
    .map((st, i) => {
      const grade = draft.has(st.studentNo) ? draft.get(st.studentNo) : st.grade ?? '';
      return gradeRow(st, i, grade, true, admin.gradeOptions);
    })
    .join('');
  return renderTemplate('admin-grade-sheet', {
    icon: icon('x'),
    term: termName(s),
    code: esc(s.code),
    name: s.name,
    title: esc(s.title),
    professor: esc(s.professor),
    rows: rows || emptyRow(4, 'No students in this section.'),
  });
}

async function saveAdminDraft() {
  const { roster, draft } = admin.grading;
  if (!draft.size) return;
  admin.grading.roster = await api(`/admin/sections/${roster.section.id}/grades`, {
    method: 'PUT',
    body: draftBody(draft),
  });
  draft.clear();
}

const formValues = (form) => Object.fromEntries(new FormData(form));

async function adminAction(action, value, icon) {
  if (admin.grading) captureInto(admin.grading.roster.students, admin.grading.draft);
  const done = async (toast) => {
    await loadAdmin();
    return { rerender: true, closeModal: true, toast };
  };
  let m;
  try {
    // ---- enrollment period
    if (action === 'staff-period-close') {
      const p = await api('/admin/periods/close-preview');
      const warning = p.notEnrolled
        ? ` ${plural(p.notEnrolled, 'student')} did not enroll${p.movedBack ? `, including ${p.movedBack} moved back to enlisted by a section deletion or reopen` : ''}. Their subjects will be removed.`
        : ' Every student with subjects has enrolled.';
      return {
        modal: confirmDialog(icon, {
          eyebrow: termName(openPeriod()),
          title: 'Close enrollment?',
          text: `Students can no longer enlist or enroll.${warning} Sections with no students are deleted, and professors can start encoding grades. This can’t be undone.`,
          action: 'staff-period-close-confirm',
          confirm: 'Close enrollment',
        }),
      };
    }
    if (action === 'staff-period-close-confirm') {
      const r = await api('/admin/periods/close', { method: 'POST' });
      return done(
        `Enrollment closed. Removed ${plural(r.notEnrolledRemoved, 'student')} who did not enroll and ${plural(r.emptySectionsDeleted, 'empty section')}.`,
      );
    }
    if (action === 'staff-period-next')
      return {
        modal: confirmDialog(icon, {
          eyebrow: 'Enrollment period',
          title: 'Open the next period?',
          text: 'The next semester opens for enrollment right away, with 2 sections of every subject. You can change them on the Sections page.',
          action: 'staff-period-next-confirm',
          confirm: 'Open next period',
        }),
      };
    if (action === 'staff-period-next-confirm') {
      const r = await api('/admin/periods/next', { method: 'POST', body: {} });
      admin.term = termKey(r);
      return done(
        `${termName(r)} is now open with ${plural(r.sectionsCreated, 'section')}.${r.sectionsSkipped ? ` ${plural(r.sectionsSkipped, 'section')} could not be created because no professor was free.` : ''}`,
      );
    }

    // ---- sections
    if (action === 'staff-term') {
      admin.term = value;
      await loadAdminSections();
      return { rerender: true };
    }
    if (action === 'staff-section-new') {
      if (!openPeriod()) return { toast: 'Open an enrollment period first.', error: true };
      return { modal: sectionForm(icon) };
    }
    if (action === 'staff-form-section') {
      const v = formValues(value);
      const course = admin.courses.find((c) => c.code === v.code);
      const body = {
        code: v.code,
        professorId: Number(v.professorId),
        lec: { day: v.lecDay, timeStart: v.lecStart, timeEnd: v.lecEnd },
        ...(course?.labCode
          ? {
              labProfessorId: v.labProfessorId ? Number(v.labProfessorId) : null,
              lab: { day: v.labDay, timeStart: v.labStart, timeEnd: v.labEnd },
            }
          : {}),
        ...(v.sectionNo ? { sectionNo: Number(v.sectionNo) } : {}),
      };
      const r = await api('/admin/sections', { method: 'POST', body });
      return done(`${r.name} created: ${r.created.join(' and ')}.`);
    }
    if ((m = /^staff-section-delete-(\d+)$/.exec(action))) {
      const s = admin.sections.find((x) => x.id === Number(m[1]));
      if (!s) return {};
      const isLec = admin.courses.some((c) => c.code === s.code && c.labCode);
      return {
        modal: confirmDialog(icon, {
          eyebrow: `${s.code} / ${s.name}`,
          title: 'Delete this section?',
          text: `${plural(s.students, 'student')} will lose this subject.${s.enrolledStudents ? ` ${plural(s.enrolledStudents, 'enrolled student')} will go back to enlisted and must click Enroll again.` : ''}${isLec ? ' They also lose its laboratory in this enrollment; the laboratory section itself stays.' : ''} This can’t be undone.`,
          action: `staff-section-delete-confirm-${s.id}`,
          confirm: 'Delete section',
        }),
      };
    }
    if ((m = /^staff-section-delete-confirm-(\d+)$/.exec(action))) {
      const r = await api(`/admin/sections/${m[1]}`, { method: 'DELETE' });
      return done(
        `${r.deletedSection} section deleted. ${plural(r.studentsUnenrolled, 'student')} removed from it${r.labsRemoved ? `; ${plural(r.labsRemoved, 'lab enrollment')} removed` : ''}${r.studentsMovedBack ? `; ${r.studentsMovedBack} moved back to enlisted` : ''}.`,
      );
    }
    if (action === 'staff-reassign') {
      const [id, professorId] = value.split(':').map(Number);
      const r = await api(`/admin/sections/${id}/professor`, {
        method: 'PATCH',
        body: { professorId },
      });
      return done(`Professor reassigned for ${r.reassigned.join(' and ')}.`);
    }

    // ---- grades
    if ((m = /^staff-grade-open-(\d+)$/.exec(action))) {
      admin.grading = { roster: await api(`/admin/sections/${m[1]}`), draft: new Map() };
      return { modal: gradeSheet(icon) };
    }
    if (action === 'staff-grade-change') return {};
    if (action === 'staff-grade-save') {
      if (!admin.grading?.draft.size) return { toast: 'No changes to save.' };
      await saveAdminDraft();
      await loadAdmin();
      return { modal: gradeSheet(icon), rerender: true, toast: 'Draft grades saved.' };
    }
    if (action === 'staff-grade-submit') {
      await saveAdminDraft();
      const r = await api(`/admin/sections/${admin.grading.roster.section.id}/submit`, {
        method: 'POST',
      });
      admin.grading = null;
      return done('Grades submitted and locked.' + droppedNote(r.dropped));
    }
    if ((m = /^staff-inc-(\d+)-(.+)$/.exec(action))) {
      const grade = document.querySelector(`#inc-${m[1]}-${m[2]}`)?.value;
      if (!grade) return { toast: 'Choose the final grade first.', error: true };
      await api(`/admin/sections/${m[1]}/complete-inc`, {
        method: 'POST',
        body: { studentNo: m[2], grade },
      });
      return done(`INC of ${m[2]} replaced with ${grade}.`);
    }

    // ---- students
    if (action === 'staff-student-new') {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { modal: renderTemplate('admin-student-form', { icon: icon('x'), today: today }) };
    }
    if ((m = /^staff-student-reopen-confirm-(.+)$/.exec(action))) {
      await api(`/admin/students/${encodeURIComponent(m[1])}/reopen`, { method: 'POST' });
      return done(`Enrollment of ${m[1]} reopened. They must click Enroll again.`);
    }
    if ((m = /^staff-student-reopen-(.+)$/.exec(action)))
      return {
        modal: confirmDialog(icon, {
          eyebrow: `Student ${m[1]}`,
          title: 'Reopen this enrollment?',
          text: 'The student goes back to enlisted and keeps their subjects and seats. They must click Enroll again before the period ends, or their subjects are removed.',
          action: `staff-student-reopen-confirm-${m[1]}`,
          confirm: 'Reopen enrollment',
        }),
      };
    if (action === 'staff-form-student') {
      const r = await api('/admin/students', { method: 'POST', body: formValues(value) });
      return done(`Student added. Their student number is ${r.studentNo}.`);
    }

    // ---- professors
    if (action === 'staff-prof-new')
      return { modal: renderTemplate('admin-prof-form', { icon: icon('x') }) };
    if (action === 'staff-form-professor') {
      await api('/admin/professors', { method: 'POST', body: formValues(value) });
      return done('Professor added.');
    }
    if ((m = /^staff-prof-(activate|deactivate|delete)-(\d+)$/.exec(action))) {
      const p = admin.professors.find((x) => x.id === Number(m[2]));
      if (!p) return {};
      if (m[1] === 'delete')
        return {
          modal: confirmDialog(icon, {
            eyebrow: 'Faculty',
            title: `Delete ${profName(p)}?`,
            text: 'This professor has never had a section, so the account can be deleted.',
            action: `staff-prof-delete-confirm-${p.id}`,
            confirm: 'Delete professor',
          }),
        };
      await api(`/admin/professors/${p.id}/${m[1]}`, { method: 'POST' });
      return done(`${profName(p)} ${m[1] === 'activate' ? 'activated' : 'deactivated'}.`);
    }
    if ((m = /^staff-prof-delete-confirm-(\d+)$/.exec(action))) {
      await api(`/admin/professors/${m[1]}`, { method: 'DELETE' });
      return done('Professor deleted.');
    }
  } catch (err) {
    // The server's reason goes in the open dialog if there is one, else a toast.
    try {
      await loadAdmin();
    } catch {}
    return { rerender: true, formError: err.message, error: true };
  }
  return {};
}
